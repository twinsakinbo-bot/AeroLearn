/** Read the revised curriculum PDFs linked from NERDC's official site. */
export type CurriculumSource = { title: string; url: string; excerpt: string }

const PORTAL = "https://lmis.nerdcportals.com.ng"
const APPROVED_INDEX = "https://nerdc.gov.ng/content_manager"

function plainText(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()
}

function safePortalUrl(raw: string): URL | null {
  try {
    const url = new URL(raw, PORTAL)
    return url.protocol === "https:" && url.origin === PORTAL ? url : null
  } catch { return null }
}

async function readText(url: URL): Promise<string> {
  const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new Error(`NERDC curriculum page did not load (${response.status}).`)
  return response.text()
}

function links(html: string): Array<{ label: string; url: URL }> {
  return Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).flatMap((row) => {
    const cells = Array.from(row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi))
    const href = row[1].match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1]
    const url = href ? safePortalUrl(href) : null
    return cells.length && url ? [{ label: plainText(cells[0][1]), url }] : []
  })
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function subjectNames(subject: string, classLevel: string): string[] {
  const names = [subject]
  if (subject === "Mathematics" && classLevel.startsWith("SS")) names.push("General Mathematics")
  if (subject === "English Language" && classLevel.startsWith("JSS")) names.push("English Studies")
  if (subject === "Physical & Health Education") names.push("Physical and Health Education")
  if (["Yoruba", "Igbo", "Hausa"].includes(subject)) names.push(`${subject} Language`)
  return names.map(normalized)
}

export async function researchCurriculum(subject: string, classLevel: string, topic: string): Promise<CurriculumSource[]> {
  const match = classLevel.match(/^(JSS|SS)\s*([123])$/i)
  if (!match) return []
  const senior = match[1].toUpperCase() === "SS"
  const level = `${senior ? "sss" : "jss"}_${match[2]}`
  const indexPage = `${APPROVED_INDEX}/${senior ? "new_senior_curriculum_home.html" : "new_curriculum_home.html"}`
  const indexHtml = await readText(new URL(indexPage))
  // The official NERDC page links to LMIS. Refuse a portal URL it does not endorse.
  if (!indexHtml.includes(`${PORTAL}/${level}`)) return []

  const classHtml = await readText(new URL(`${PORTAL}/${level}/`))
  const groupPages = senior
    ? links(classHtml).map(({ url }) => url).filter((url) => /^\/s[123]_(core|science|humanities|business)$/.test(url.pathname))
    : []
  const pages = senior ? await Promise.all(groupPages.map(readText)) : [classHtml]
  const names = subjectNames(subject, classLevel)
  const entry = pages.flatMap(links).find(({ label, url }) =>
    names.includes(normalized(label)) && new RegExp(`^/viewer/${level}/[0-9]+$`).test(url.pathname),
  )
  if (!entry) return []

  const viewer = await readText(entry.url)
  const frame = viewer.match(/<iframe\b[^>]*src=["']([^"']+)["']/i)?.[1]
  const frameUrl = frame ? safePortalUrl(frame) : null
  const file = frameUrl?.searchParams.get("file")
  if (!frameUrl || !new RegExp(`^/${level}/necurrdc/viewer\\.html$`).test(frameUrl.pathname) || !file || !/^[0-9]+\.pdf$/.test(file)) return []
  const pdfUrl = new URL(`${PORTAL}/${level}/necurrdc/${file}`)
  const response = await fetch(pdfUrl, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) })
  if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) return []
  if (Number(response.headers.get("content-length") || 0) > 10_000_000) return []
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > 10_000_000) return []
  const pdfParse = (await import("pdf-parse")).default
  const curriculum = (await pdfParse(buffer)).text.replace(/\s+/g, " ")
  const lower = curriculum.toLowerCase()
  const needle = topic.toLowerCase()
  const positions: number[] = []
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + needle.length)) {
    if (at > curriculum.length * 0.15) positions.push(at)
  }
  if (positions.length === 0) return []
  const excerpt = positions.slice(0, 3).map((at) => curriculum.slice(Math.max(0, at - 250), at + 1500)).join("\n\n[…]\n\n")
  return [{
    title: `NERDC revised ${entry.label} curriculum, ${classLevel}`,
    url: pdfUrl.toString(),
    excerpt,
  }]
}
