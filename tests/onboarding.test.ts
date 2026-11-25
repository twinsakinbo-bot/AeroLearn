import assert from "node:assert/strict"
import test from "node:test"
import { needsLearningSetup } from "../lib/onboarding"

test("Google and incomplete profiles must choose a purpose and subjects", () => {
  for (const profile of [null, {}, { classLevel: "SS 1" }, { onboardingCompleted: true },
    { onboardingCompleted: true, learningMode: "school", classLevel: "SS 1", subjects: [] }]) {
    assert.equal(needsLearningSetup(profile), true)
  }
})

test("completed learning setup is preserved for each learning purpose", () => {
  const base = { onboardingCompleted: true, subjects: ["Mathematics"] }
  assert.equal(needsLearningSetup({ ...base, learningMode: "school", classLevel: "SS 1" }), false)
  assert.equal(needsLearningSetup({ ...base, learningMode: "exam", examType: "JAMB" }), false)
  assert.equal(needsLearningSetup({ ...base, learningMode: "self_learning" }), false)
  assert.equal(needsLearningSetup({ role: "admin" }), false)
  assert.equal(needsLearningSetup({ ...base, learningMode: "exam" }), true)
})
