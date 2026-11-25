import assert from "node:assert/strict"
import test from "node:test"

import { isCorrectAnswer, scoreAnswers, type StoredQuestion } from "../lib/questions"

test("CBT scores normalized option letters and leaves unanswered items at zero", () => {
  const questions: StoredQuestion[] = [
    { id: "one", options: { A: "One", B: "Two" }, correctAnswer: "B" },
    { id: "two", options: [{ id: "C", text: "Three" }, { id: "A", text: "One" }], correctAnswer: "Three" },
    { id: "three", options: { A: "Yes", B: "No" }, correctAnswer: "A" },
  ]
  assert.equal(scoreAnswers(questions, { one: "B", two: "C" }), 2)
  assert.equal(scoreAnswers(questions, { one: "A", two: "C", three: null }), 1)
})

test("CBT never credits a blank response or a missing answer key", () => {
  const missingKey: StoredQuestion = { id: "broken", options: { A: "Yes", B: "No" } }
  assert.equal(isCorrectAnswer(missingKey, null), false)
  assert.equal(isCorrectAnswer(missingKey, "A"), false)
  assert.equal(scoreAnswers([missingKey], { broken: null }), 0)
})
