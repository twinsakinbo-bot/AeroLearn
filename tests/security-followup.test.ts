import assert from "node:assert/strict"
import { test } from "node:test"
import { safeNextPath } from "../lib/safe-redirect"
import { createSharedLimiter } from "../lib/shared-rate-limit"

test("OAuth destinations cannot escape the application origin", () => {
  const origin = "https://www.aerolearn.name.ng"
  for (const input of ["//evil.example", "/\\evil.example", "/\n/evil.example", "https://evil.example", "javascript:alert(1)", null]) {
    const result = safeNextPath(input, origin)
    assert.equal(result, "/app")
    assert.equal(new URL(result, origin).origin, origin)
  }
  assert.equal(safeNextPath("/app/learn/lesson?tab=notes#example", origin), "/app/learn/lesson?tab=notes#example")
})

test("independent server instances share limits and store only hashed subjects", async () => {
  let count = 0
  const subjects: string[] = []
  const counter = async (args: { p_uid: string; p_max: number }) => {
    subjects.push(args.p_uid)
    return { data: ++count > args.p_max ? 42 : 0, error: null }
  }
  const firstInstance = createSharedLimiter(counter)
  const secondInstance = createSharedLimiter(counter)
  const rule = { max: 2, windowMs: 60_000 }
  assert.equal(await firstInstance("reset", "student@example.com", rule), null)
  assert.equal(await secondInstance("reset", "student@example.com", rule), null)
  const limited = await firstInstance("reset", "student@example.com", rule)
  assert.equal(limited?.status, 429)
  assert.equal(limited?.headers.get("Retry-After"), "42")
  assert.equal(new Set(subjects).size, 1)
  assert.match(subjects[0], /^[a-f0-9]{64}$/)
})

test("public abuse controls fail closed on database failure or malformed responses", async () => {
  for (const data of [null, undefined, "0", -1, 0.5, NaN]) {
    const limit = createSharedLimiter(async () => ({ data, error: null }))
    assert.equal((await limit("reset", "subject", { max: 2, windowMs: 1000 }))?.status, 503)
  }
  const unavailable = createSharedLimiter(async () => { throw new Error("database offline") })
  assert.equal((await unavailable("reset", "subject", { max: 2, windowMs: 1000 }))?.status, 503)
})

import { passwordResetResult } from "../lib/password-reset"
import { rateLimit } from "../lib/rate-limit"

test("password reset has the same response for existing, missing and failed-delivery accounts", async (t) => {
  t.mock.method(console, "error", () => {})
  const delivered = await passwordResetResult(async () => {})
  const missing = await passwordResetResult(async () => { throw new Error("User not found") })
  const failed = await passwordResetResult(async () => { throw new Error("Provider failure") })
  assert.deepEqual(delivered, missing)
  assert.deepEqual(delivered, failed)
  assert.doesNotMatch(JSON.stringify(failed), /Provider failure|User not found/)
})

test("rejected local-limit requests cannot extend the active window", async (t) => {
  let now = 1000
  t.mock.method(Date, "now", () => now)
  const rule = { max: 1, windowMs: 1000 }
  assert.equal(rateLimit("regression", "ip", rule).ok, true)
  now = 1900
  for (let i = 0; i < 1000; i++) assert.equal(rateLimit("regression", "ip", rule).ok, false)
  now = 2001
  assert.equal(rateLimit("regression", "ip", rule).ok, true)
})

import { welcomeRecipient } from "../lib/welcome-recipient"

test("welcome mail requires a confirmed Auth email and ignores caller-selected recipients", () => {
  assert.equal(welcomeRecipient({ email: "student@example.com", emailVerified: false }), null)
  assert.equal(welcomeRecipient({ emailVerified: true }), null)
  const record = { email: "student@example.com", emailVerified: true, displayName: "Student", to: ["victim@example.com"] }
  assert.deepEqual(welcomeRecipient(record), { email: "student@example.com", name: "Student" })
})
