/**
 * Server-side fetch of a URL that arrived in a request.
 *
 * Two routes do this: `link-preview` unfurls a link pasted into chat, and
 * `ai-chat` downloads a voice note before transcribing it. Both passed the raw
 * value to `fetch()`, which is server-side request forgery — the server will
 * fetch anything reachable from *its* network position and hand the result back.
 * On a cloud host that includes the instance metadata service (169.254.169.254,
 * which serves credentials as plain text over HTTP with no auth), anything bound
 * to localhost, and every private address in the VPC.
 *
 * What is checked here:
 *
 *   - only `http:` and `https:`, only ports 80 and 443, no `user:pass@` prefix
 *   - the hostname is resolved and *every* address it resolves to is tested
 *     against the private, loopback, link-local and reserved ranges, so
 *     `evil.test → 127.0.0.1` is refused as well as the bare literal
 *   - redirects are followed by hand and every hop is re-validated; without this
 *     a public host only has to answer `302 → 169.254.169.254`
 *   - the body is read through a byte cap, because `response.text()` on a
 *     multi-gigabyte file takes the process down with it
 *   - one wall-clock deadline covers every hop, so a chain of slow redirects
 *     cannot hold a request open indefinitely
 *
 * The transport pins DNS to the vetted addresses. The deadline remains active
 * through DNS resolution, redirects and reading the response body.
 */
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import { Readable, pipeline } from "node:stream"
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib"

/** Raised for anything we decline to fetch. `status` is what the route returns. */
export class FetchRefused extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "FetchRefused"
    this.status = status
  }
}

export interface SafeFetchOptions {
  /** Budget for every hop combined, not per hop. */
  timeoutMs?: number
  maxRedirects?: number
  maxBytes?: number
  headers?: Record<string, string>
}

export interface SafeFetchResult {
  /** The final URL after redirects — not the one that was asked for. */
  url: string
  status: number
  contentType: string
  bytes: Uint8Array
  /** True when the body hit `maxBytes` and was cut short. */
  truncated: boolean
}

const AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

/**
 * Everything an outbound request must never reach. RFC 1918 private space plus
 * loopback, link-local (the metadata service lives at 169.254.169.254), carrier
 * NAT, the documentation and benchmarking blocks, multicast and reserved space.
 */
const V4_BLOCKS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
]

/** Hosts that are internal by convention even when DNS says otherwise. */
const BLOCKED_SUFFIXES = ["localhost", ".localhost", ".internal", ".local", ".home.arpa"]

function v4ToInt(address: string): number | null {
  const parts = address.split(".")
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    /* `Number("01")` is 1 and `Number("1e2")` is 100, so the digits are checked
       before the conversion rather than after. */
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

const BLOCKED_V4 = V4_BLOCKS.map((block) => {
  const [base, bits] = block.split("/")
  const size = Number(bits)
  const mask = size === 0 ? 0 : (0xffffffff << (32 - size)) >>> 0
  return { network: ((v4ToInt(base) ?? 0) & mask) >>> 0, mask }
})

/** Unparseable counts as blocked: we only fetch what we could verify. */
function isBlockedV4(address: string): boolean {
  const value = v4ToInt(address)
  if (value === null) return true
  return BLOCKED_V4.some(({ network, mask }) => ((value & mask) >>> 0) === network)
}

function isBlockedV6(address: string): boolean {
  const value = address.toLowerCase().split("%")[0]
  if (value === "::" || value === "::1") return true
  // Only global unicast; reject multicast, site-local and transition ranges.
  if (!/^[23][0-9a-f]{3}:/.test(value)) return true
  if (/^(2001:(0|db8):|2002:)/.test(value)) return true

  /* An IPv4 address wearing an IPv6 hat. `::ffff:127.0.0.1` is loopback, and so
     is `::ffff:7f00:1` — the second form is not worth decoding, so any mapped
     address that is not a readable dotted quad is refused outright. */
  if (value.startsWith("::ffff:")) {
    const dotted = value.slice(7)
    return /^\d+\.\d+\.\d+\.\d+$/.test(dotted) ? isBlockedV4(dotted) : true
  }

  /* NAT64 translates 64:ff9b::/96 to arbitrary IPv4, private space included. */
  if (value.startsWith("64:ff9b:") || value.startsWith("64:ff9b::")) return true

  const head = parseInt(value.split(":")[0] || "0", 16)
  if (!Number.isFinite(head)) return true
  if ((head & 0xfe00) === 0xfc00) return true // fc00::/7  unique local
  if ((head & 0xffc0) === 0xfe80) return true // fe80::/10 link local
  return false
}

function isBlockedAddress(address: string): boolean {
  return isIP(address) === 6 ? isBlockedV6(address) : isBlockedV4(address)
}

async function addressesOf(host: string): Promise<string[]> {
  if (isIP(host)) return [host]
  try {
    const records = await lookup(host, { all: true, verbatim: true })
    if (records.length > 0) return records.map((record) => record.address)
  } catch {
    /* Falls through to the same message — a host that will not resolve and one
       that does not exist are the same thing to the student. */
  }
  throw new FetchRefused("That link's host could not be found.")
}

/** Throws unless this exact URL is safe to request. Returns it normalised. */
async function vet(rawUrl: string): Promise<{ url: string; addresses: string[] }> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new FetchRefused("That does not look like a link.")
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new FetchRefused("Only http and https links can be opened.")
  }
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
    throw new FetchRefused("Only the standard web ports are allowed.")
  }
  /* `http://metadata@evil.test/` — some clients read the host from the wrong
     side of the @, and there is no reason a preview needs credentials. */
  if (parsed.username || parsed.password) {
    throw new FetchRefused("Links with a username or password in them are not allowed.")
  }

  const host = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase()
  if (!host) throw new FetchRefused("That link has no host.")
  if (BLOCKED_SUFFIXES.some((suffix) => host === suffix || host.endsWith(suffix))) {
    throw new FetchRefused("That link points inside the server's own network.")
  }

  const addresses = await addressesOf(host)
  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new FetchRefused("That link points inside the server's own network.")
    }
  }

  return { url: parsed.toString(), addresses }
}

/** Reads at most `maxBytes`, then hangs up on the rest. */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = response.body?.getReader()
  if (!reader) return { bytes: new Uint8Array(0), truncated: false }

  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      chunks.push(value)
      total += value.byteLength
    }
    truncated = total >= maxBytes
  } finally {
    await reader.cancel().catch(() => {})
  }

  const size = Math.min(total, maxBytes)
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    if (offset >= size) break
    const slice = chunk.subarray(0, size - offset)
    bytes.set(slice, offset)
    offset += slice.byteLength
  }
  return { bytes, truncated }
}

/** A one-shot connection whose DNS lookup cannot change after validation. */
function pinnedRequest(target: { url: string; addresses: string[] }, headers: Record<string, string>, signal: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(target.url)
    const request = parsed.protocol === "https:" ? httpsRequest : httpRequest
    const records = target.addresses.map(address => ({ address, family: isIP(address) }))
    const req = request(parsed, {
      method: "GET",
      agent: false,
      signal,
      headers: { "User-Agent": AGENT, ...headers, "Accept-Encoding": "identity" },
      // Keep the original URL for Host and TLS certificate validation, but
      // connect only to an address returned by the single vetted DNS lookup.
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, records)
        else callback(null, records[0].address, records[0].family)
      },
    }, (incoming) => {
      const responseHeaders = new Headers()
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) responseHeaders.set(key, Array.isArray(value) ? value.join(", ") : value)
      }
      const status = incoming.statusCode || 502
      const noBody = [204, 205, 304].includes(status)
      if (noBody) incoming.resume()
      const encoding = incoming.headers["content-encoding"]?.toLowerCase()
      const decoder = !noBody && (encoding === "gzip" ? createGunzip() : encoding === "deflate" ? createInflate() : encoding === "br" ? createBrotliDecompress() : null)
      // Some hosts compress even when identity was requested. Limit decoded
      // bytes, and couple stream cleanup to the socket on errors/cancellation.
      const body = decoder ? pipeline(incoming, decoder, () => {}) : incoming
      resolve(new Response(noBody ? null : Readable.toWeb(body) as ReadableStream<Uint8Array>, {
        status, headers: responseHeaders,
      }))
    })
    req.once("error", reject)
    req.end()
  })
}

/** Resolve or reject even if DNS (which cannot be cancelled) is still pending. */
function withinDeadline<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new FetchRefused("That link took too long to answer.", 504))
    if (signal.aborted) { abort(); return }
    signal.addEventListener("abort", abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort))
  })
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const { timeoutMs = 6000, maxRedirects = 3, maxBytes = 512 * 1024, headers = {} } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let target = await withinDeadline(vet(rawUrl), controller.signal)
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const response = await withinDeadline(pinnedRequest(target, headers, controller.signal), controller.signal)
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => {})
        const location = response.headers.get("location")
        if (!location) throw new FetchRefused("That link redirects nowhere.", 502)
        target = await withinDeadline(vet(new URL(location, target.url).toString()), controller.signal)
        continue
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        throw new FetchRefused("That link did not load.", 502)
      }
      const { bytes, truncated } = await withinDeadline(readCapped(response, maxBytes), controller.signal)
      return { url: target.url, status: response.status, contentType: response.headers.get("content-type") ?? "", bytes, truncated }
    }
    throw new FetchRefused("That link redirects too many times.", 502)
  } catch (error) {
    if (controller.signal.aborted) throw new FetchRefused("That link took too long to answer.", 504)
    if (error instanceof FetchRefused) throw error
    throw new FetchRefused("That link could not be reached.", 502)
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}
