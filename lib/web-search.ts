export type WebResult = { title: string; url: string; description: string }

/** Bounded web search for the tutor. Never follows result links or sends page HTML to the model. */
export async function searchWeb(query: string): Promise<WebResult[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim()
  if (!key) throw new Error("Web search is not configured. Set BRAVE_SEARCH_API_KEY on the server.")
  const url = new URL("https://api.search.brave.com/res/v1/web/search")
  url.searchParams.set("q", query.trim().slice(0, 180))
  url.searchParams.set("count", "5")
  url.searchParams.set("safesearch", "strict")
  const response = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Web search failed (${response.status}).`)
  const data = await response.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } }
  return (data.web?.results || []).flatMap((item) => {
    try {
      const parsed = new URL(item.url || "")
      if (parsed.protocol !== "https:") return []
      return [{ title: String(item.title || "").slice(0, 160), url: parsed.toString(), description: String(item.description || "").slice(0, 500) }]
    } catch { return [] }
  }).slice(0, 5)
}
