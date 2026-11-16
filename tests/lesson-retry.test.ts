import assert from "node:assert/strict"
import { test } from "node:test"

import { LESSON_RETRY_DELAYS_MS, RATE_LIMIT_DELAYS_MS, retryLessonAi } from "../lib/lesson-retry"

test("lesson AI retries five times with increasing gaps", async () => {
  let calls = 0
  const gaps: number[] = []
  const result = await retryLessonAi(async () => {
    calls++
    if (calls < 6) throw new Error("temporary gateway error")
    return "saved"
  }, Date.now() + 300_000, async (ms) => { gaps.push(ms) })
  assert.equal(result, "saved")
  assert.equal(calls, 6)
  assert.deepEqual(gaps, [...LESSON_RETRY_DELAYS_MS])
})

test("lesson AI reports exhaustion after the sixth failure", async () => {
  let calls = 0
  await assert.rejects(
    retryLessonAi(async () => { calls++; throw new Error("gateway unavailable") }, Date.now() + 300_000, async () => {}),
    /after retries.*gateway unavailable/,
  )
  assert.equal(calls, 6)
})

test("rate limits wait longer before each retry", async () => {
  let calls = 0
  const gaps: number[] = []
  await assert.rejects(
    retryLessonAi(async () => { calls++; throw new Error("gateway failed (429)") }, Date.now() + 300_000, async (ms) => { gaps.push(ms) }),
    /after retries/,
  )
  assert.equal(calls, 6)
  assert.deepEqual(gaps, [...RATE_LIMIT_DELAYS_MS])
})
