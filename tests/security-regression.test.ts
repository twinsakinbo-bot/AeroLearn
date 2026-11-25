import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import vm from "node:vm"

import { scoreChallengeQuestions } from "../lib/challenge-scoring"
import type { StoredQuestion } from "../lib/questions"

const first = { subject: "Mathematics", options: { A: "2", B: "4", C: "6", D: "8" }, correctAnswer: "B" } as StoredQuestion
const second = { subject: "Mathematics", options: { A: "1", B: "3", C: "5", D: "7" }, correctAnswer: "C" } as StoredQuestion

test("challenge scoring uses stored answers and counts unanswered questions", () => {
  assert.equal(scoreChallengeQuestions([first, second], ["q1", "q2"], { q1: "B", q2: null }, "Mathematics"), 1)
  assert.equal(scoreChallengeQuestions([first, second], ["q1", "q2"], { q1: "A", q2: "C" }, "Mathematics"), 1)
})

test("challenge scoring rejects foreign, missing, and invalid question data", () => {
  assert.equal(scoreChallengeQuestions([first, second], ["q1", "q2"], { q1: "B", q2: "C" }, "Physics"), null)
  assert.equal(scoreChallengeQuestions([first, undefined], ["q1", "q2"], { q1: "B", q2: "C" }, "Mathematics"), null)
  assert.equal(scoreChallengeQuestions([first, second], ["q1", "q2"], { q1: "B", q2: "E" }, "Mathematics"), null)
  assert.equal(scoreChallengeQuestions([first, second], ["q1", "q1"], { q1: "B" }, "Mathematics"), null)
})

test("new service worker activation removes old private response caches", async () => {
  const original = ["apis", "pages", "pages-rsc", "start-url", "aerolearn-static-v2"]
  const removed: string[] = []
  let activation: Promise<unknown> | undefined
  const context = {
    self: { addEventListener: (event: string, listener: (event: { waitUntil: (promise: Promise<unknown>) => void }) => void) => {
      assert.equal(event, "activate")
      listener({ waitUntil: (promise) => { activation = promise } })
    } },
    caches: { keys: async () => original, delete: async (name: string) => { removed.push(name); return true } },
  }
  vm.runInNewContext(readFileSync(join(process.cwd(), "worker/index.js"), "utf8"), context)
  await activation
  assert.deepEqual(removed.sort(), ["apis", "pages", "pages-rsc", "start-url"].sort())
})
