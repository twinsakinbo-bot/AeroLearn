/** Search official Nigerian curriculum sites before drafting a lesson. */
export type CurriculumSource = { title: string; url: string; excerpt: string }

function officialUrl(raw: string): URL | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:") return null
    if (url.hostname === "nerdc.gov.ng" || url.hostname.endsWith(".nerdc.gov.ng") || url.hostname === "education.gov.ng" || url.hostname.endsWith(".education.gov.ng")) return url
  } catch {}
  return null
}

function plainText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

export async function researchCurriculum(subject: string, classLevel: string, topic: string): Promise<CurriculumSource[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim()
  if (!key) throw new Error("BRAVE_SEARCH_API_KEY is not configured")
  const query = `site:nerdc.gov.ng OR site:education.gov.ng ${subject} ${classLevel} curriculum ${topic}`
  const endpoint = new URL("https://api.search.brave.com/res/v1/web/search")
  endpoint.searchParams.set("q", query)
  endpoint.searchParams.set("count", "8")
  const response = await fetch(endpoint, {
    headers: { "X-Subscription-Token": key, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`Curriculum search failed (${response.status})`)
  const data = await response.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } }
  const candidates = (data.web?.results || [])
    .map((item) => ({ item, url: officialUrl(item.url || "") }))
    .filter((entry): entry is { item: { title?: string; url?: string; description?: string }; url: URL } => entry.url !== null)
    .slice(0, 3)

  const checked = await Promise.all(candidates.map(async ({ item, url }) => {
    try {
      const page = await fetch(url, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      })
      if (!page.ok) return null
      const size = Number(page.headers.get("content-length") || 0)
      const type = page.headers.get("content-type") || ""
      if (size > 2_000_000) return null
      let content = ""
      if (type.includes("text/html") || type.includes("text/plain")) {
        content = plainText((await page.text()).slice(0, 250_000))
      } else if (type.includes("application/pdf")) {
        const buffer = Buffer.from(await page.arrayBuffer())
        if (buffer.length > 2_000_000) return null
        const pdfParse = (await import("pdf-parse")).default
        content = plainText((await pdfParse(buffer)).text)
      }
      if (content.length < 250) return null
      const lowered = content.toLowerCase()
      if (!lowered.includes(topic.toLowerCase())) return null
      const position = Math.max(0, lowered.indexOf(topic.toLowerCase()) - 400)
      return { title: plainText(item.title || url.hostname).slice(0, 150), url: url.toString(), excerpt: content.slice(position, position + 4500) }
    } catch {
      return null
    }
  }))
  return checked.filter((source): source is CurriculumSource => source !== null)
}
