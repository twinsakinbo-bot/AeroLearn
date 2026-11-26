import assert from "node:assert/strict"
import { test } from "node:test"
import dns from "node:dns/promises"
import http from "node:http"
import { gzipSync } from "node:zlib"
import { safeFetch, FetchRefused } from "../lib/safe-fetch"

// Real local HTTP responses behind a test-only transport shim. Production
// validation still sees a public DNS record; no external network is used.
test("outbound fetch pins validated DNS, caps bodies and bounds slow streams", async (t) => {
  const server = http.createServer((req, res) => {
    if (req.url === "/compressed") { res.writeHead(200, { "content-encoding": "gzip" }); res.end(gzipSync("hello".repeat(10000))); return }
    if (req.url === "/slow") { res.writeHead(200); res.flushHeaders(); return }
    if (req.url === "/redirect") { res.writeHead(302, { location: "http://127.0.0.1/private" }); res.end(); return }
    res.writeHead(200, { "content-type": "text/html" }); res.end("<title>Lesson</title>".repeat(100))
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address() as { port: number }
  const originalRequest = http.request
  let resolutions = 0
  t.mock.method(dns, "lookup", async () => {
    resolutions++
    // A second resolution would rebind to loopback.
    return [{ address: resolutions > 1 ? "127.0.0.1" : "93.184.216.34", family: 4 }]
  })
  t.mock.method(http, "request", (_url: URL, options: any, cb: any) => {
    options.lookup("public.example", { all: true }, (error: unknown, records: unknown) => {
      assert.equal(error, null)
      assert.deepEqual(records, [{ address: "93.184.216.34", family: 4 }])
    })
    return originalRequest(`http://127.0.0.1:${address.port}${_url.pathname}`, { ...options, lookup: undefined }, cb)
  })
  try {
    const result = await safeFetch("http://public.example/body", { maxBytes: 25 })
    assert.equal(resolutions, 1)
    assert.equal(result.bytes.length, 25)
    assert.equal(result.truncated, true)
    assert.equal(result.contentType, "text/html")
    resolutions = 0
    const compressed = await safeFetch("http://public.example/compressed", { maxBytes: 25 })
    assert.equal(new TextDecoder().decode(compressed.bytes), "hello".repeat(5))
    assert.equal(compressed.truncated, true)
    resolutions = 0
    await assert.rejects(safeFetch("http://public.example/redirect"), (e: unknown) => e instanceof FetchRefused && e.status === 400)
    resolutions = 0
    const start = Date.now()
    await assert.rejects(safeFetch("http://public.example/slow", { timeoutMs: 50 }), (e: unknown) => e instanceof FetchRefused && e.status === 504)
    assert.ok(Date.now() - start < 1000, "Response body must not outlive the deadline")
  } finally {
    t.mock.restoreAll()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test("private, mapped, multicast and transition addresses are rejected before connecting", async () => {
  for (const url of ["http://127.0.0.1", "http://2130706433", "http://169.254.169.254", "http://10.0.0.1", "http://[::1]", "http://[::ffff:127.0.0.1]", "http://[ff02::1]", "http://[2002:7f00:1::]", "http://[64:ff9b::7f00:1]", "http://user:pass@example.com", "file:///etc/passwd"]) {
    await assert.rejects(safeFetch(url), FetchRefused, url)
  }
})

test("DNS lookup cannot outlive the overall request deadline", async (t) => {
  t.mock.method(dns, "lookup", () => new Promise(() => {}))
  await assert.rejects(safeFetch("http://never-resolves.example", { timeoutMs: 30 }), (e: unknown) => e instanceof FetchRefused && e.status === 504)
})
