import test from "node:test"
import assert from "node:assert/strict"
import {
  bankAvailability,
  canonicalExam,
  canonicalSubject,
  selectMockQuestions,
  publicMockQuestion,
  usableQuestion,
} from "../lib/mock-exams"
import { normalizeRow } from "../lib/question-normalizer"
import { importQuestionRows } from "../lib/question-import"
import draft from "../content/drafts/ss3-waec-mathematics-v1.json"
import type { PracticeQuestion } from "../lib/types/question"
const q = {
  id: "q1",
  exam: "WAEC",
  subject: "Mathematics",
  year: 2026,
  question: "Synthetic: 2+3?",
  options: { A: "3", B: "4", C: "5", D: "6" },
  correctAnswer: "C",
  explanation: "2 + 3 = 5",
} as const
test("availability is board/subject-specific, excludes malformed and draft content", () => {
  assert.equal(canonicalExam(" wace "), "WAEC")
  assert.equal(canonicalSubject(" general mathematics "), "Mathematics")
  assert.deepEqual(
    bankAvailability([
      q,
      { ...q, id: "bad", correctAnswer: undefined },
      { ...q, id: "draft", publicationStatus: "draft" },
      { ...q, id: "empty", question: "" },
    ]),
    [{ subject: "Mathematics", count: 1, withExplanations: 1 }],
  )
  assert.throws(() => selectMockQuestions([q], ["Mathematics", "Economics"], "full"), /Economics/)
  assert.equal(
    selectMockQuestions(
      Array.from({ length: 45 }, (_, i) => ({ ...q, id: String(i) })),
      ["Mathematics"],
      "revision",
    ).length,
    8,
  )
  assert.equal(
    selectMockQuestions(
      Array.from({ length: 45 }, (_, i) => ({ ...q, id: String(i) })),
      ["Mathematics"],
      "full",
    ).length,
    40,
  )
  assert.equal(usableQuestion({ ...q, options: { A: "5", B: "5", C: "5", D: "6" } }), null)
})
test("active question projection omits keys/explanations; normalization preserves draft gate", () => {
  assert.equal("correctAnswer" in publicMockQuestion(usableQuestion(q)!), false)
  assert.equal("explanation" in publicMockQuestion(usableQuestion(q)!), false)
  const row = normalizeRow({ ...q, exam: "wace", subject: "maths", publicationStatus: "draft" }, {}, 0)
  assert.equal(row.exam, "WAEC")
  assert.equal(row.subject, "Mathematics")
  assert.equal(row.publicationStatus, "draft")
  assert.equal(draft.status, "draft")
  assert.equal(draft.teacherApproval, null)
  assert.equal(bankAvailability(draft.questions as PracticeQuestion[]).length, 0)
})
test("failed question replacement preserves original; successful replacement retains ID", async () => {
  let saved: PracticeQuestion = { ...q }
  let shouldFail = true
  const store = {
    list: async () => [{ id: "stable", data: saved }],
    newId: () => "new",
    write: async (id: string, row: PracticeQuestion) => {
      if (shouldFail) throw Error("write failed")
      assert.equal(id, "stable")
      saved = row
    },
  }
  const replacement = { ...q, explanation: "Reviewed replacement" }
  const failed = await importQuestionRows([replacement], "replace", store)
  assert.equal(failed.failed, 1)
  assert.equal(saved.explanation, q.explanation)
  shouldFail = false
  const done = await importQuestionRows([replacement], "replace", store)
  assert.equal(done.replaced, 1)
  assert.equal(saved.id, "stable")
  assert.equal(saved.explanation, "Reviewed replacement")
})
