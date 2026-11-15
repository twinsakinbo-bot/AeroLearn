/** Read the revised curriculum PDFs linked from NERDC's official site. */
export type CurriculumSource = { title: string; url: string; excerpt: string }
export type CurriculumDocument = { title: string; url: string; text: string }

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

async function curriculumEntries(classLevel: string): Promise<Array<{ label: string; url: URL }>> {
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
  return pages.flatMap(links).filter(({ url }) => new RegExp(`^/viewer/${level}/[0-9]+$`).test(url.pathname))
}

export async function listCurriculumSubjects(classLevel: string): Promise<string[]> {
  return Array.from(new Set((await curriculumEntries(classLevel)).map(({ label }) => label)))
}

export async function getCurriculumDocument(subject: string, classLevel: string): Promise<CurriculumDocument | null> {
  const match = classLevel.match(/^(JSS|SS)\s*([123])$/i)
  if (!match) return null
  const level = `${match[1].toUpperCase() === "SS" ? "sss" : "jss"}_${match[2]}`
  const names = subjectNames(subject, classLevel)
  const entry = (await curriculumEntries(classLevel)).find(({ label }) => names.includes(normalized(label)))
  if (!entry) return null

  const viewer = await readText(entry.url)
  const frame = viewer.match(/<iframe\b[^>]*src=["']([^"']+)["']/i)?.[1]
  const frameUrl = frame ? safePortalUrl(frame) : null
  const file = frameUrl?.searchParams.get("file")
  if (!frameUrl || !new RegExp(`^/${level}/necurrdc/viewer\\.html$`).test(frameUrl.pathname) || !file || !/^[0-9]+\.pdf$/.test(file)) return null
  const pdfUrl = new URL(`${PORTAL}/${level}/necurrdc/${file}`)
  const response = await fetch(pdfUrl, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) })
  if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) return null
  if (Number(response.headers.get("content-length") || 0) > 10_000_000) return null
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > 10_000_000) return null
  const pdfParse = (await import("pdf-parse")).default
  const curriculum = (await pdfParse(buffer)).text.replace(/\s+/g, " ")
  return { title: `NERDC revised ${entry.label} curriculum, ${classLevel}`, url: pdfUrl.toString(), text: curriculum }
}

export async function researchCurriculum(subject: string, classLevel: string, topic: string): Promise<CurriculumSource[]> {
  const document = await getCurriculumDocument(subject, classLevel)
  if (!document) return []
  const curriculum = document.text
  const lower = curriculum.toLowerCase()
  const needle = topic.toLowerCase()
  const positions: number[] = []
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + needle.length)) {
    if (at > curriculum.length * 0.15) positions.push(at)
  }
  if (positions.length === 0) return []
  const excerpt = positions.slice(0, 3).map((at) => curriculum.slice(Math.max(0, at - 250), at + 1500)).join("\n\n[…]\n\n")
  return [{
    title: document.title,
    url: document.url,
    excerpt,
  }]
}
