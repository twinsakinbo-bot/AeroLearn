/**
 * Turns a link pasted into chat into a preview card.
 *
 * This was a server-side request forgery with a friendly name: it fetched
 * whatever URL the query string carried, from inside the server's own network,
 * with no authentication at all — so anyone who found the route could read the
 * cloud metadata service or port-scan the VPC through it, and see the results in
 * the JSON. Outbound requests now go through `safeFetch`, which vets the address
 * and every redirect hop, and the route needs a signed-in account.
 *
 * Three smaller problems went with it:
 *
 *   - `response.text()` on an arbitrary URL will happily read a multi-gigabyte
 *     file into memory. `safeFetch` caps the body at 256 KB, which is far past
 *     where the `<head>` ends.
 *   - the extracted values were passed through raw, so `&amp;` showed up
 *     literally in titles and a page could push unbounded text into a chat card.
 *   - the image URL was returned unchecked, pointing the student's browser at
 *     whatever the page named, `data:` payloads included.
 */
import { NextResponse } from "next/server"

import { requireUser } from "@/lib/api-auth"
import { FetchRefused, safeFetch } from "@/lib/safe-fetch"

const MAX_TITLE = 200
const MAX_DESCRIPTION = 400

/** Only the five that appear in real markup; anything else stays as written. */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
}

function clean(value: string | null, limit: number): string | null {
  if (!value) return null
  const text = decodeEntities(value).replace(/\s+/g, " ").trim()
  return text ? text.slice(0, limit) : null
}

/**
 * `content` can sit on either side of `property`, so both orders are tried.
 * Accepts `name=` as well, which plenty of pages use for Open Graph by mistake.
 */
function meta(html: string, property: string): string | null {
  const key = `(?:property|name)=["']${property}["']`
  const patterns = [
    new RegExp(`<meta[^>]*${key}[^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${key}`, "i"),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

/** Absolute http(s) only — a `data:` or internal URL must not reach the client. */
function imageUrl(raw: string | null, base: string): string | null {
  if (!raw) return null
  try {
    const resolved = new URL(decodeEntities(raw.trim()), base)
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null
    return resolved.toString()
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const gate = await requireUser(request)
  if (!gate.ok) return gate.response

  const url = new URL(request.url).searchParams.get("url")
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
  }

  try {
    const result = await safeFetch(url, { timeoutMs: 6000, maxBytes: 256 * 1024 })
    const hostname = new URL(result.url).hostname

    /* A PDF or an image has no `<head>` to read; the card still wants a name. */
    if (!/text\/html|application\/xhtml/i.test(result.contentType)) {
      return NextResponse.json(
        { title: hostname, description: null, image: null, url: result.url },
        { headers: { "Cache-Control": "public, max-age=3600" } },
      )
    }

    const html = new TextDecoder("utf-8", { fatal: false }).decode(result.bytes)

    return NextResponse.json(
      {
        title:
          clean(meta(html, "og:title"), MAX_TITLE) ??
          clean(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? null, MAX_TITLE) ??
          hostname,
        description:
          clean(meta(html, "og:description"), MAX_DESCRIPTION) ??
          clean(meta(html, "description"), MAX_DESCRIPTION),
        image: imageUrl(meta(html, "og:image"), result.url),
        url: result.url,
      },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    )
  } catch (error) {
    if (error instanceof FetchRefused) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Link preview error:", error)
    return NextResponse.json({ error: "Failed to generate preview" }, { status: 500 })
  }
}
