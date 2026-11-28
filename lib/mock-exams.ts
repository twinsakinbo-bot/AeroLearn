import { SUBJECTS } from "./constants"
import { correctLetterOf, optionsOf, shuffled, type StoredQuestion, type OptionLetter } from "./questions"
export type MockMode = "full" | "revision" | "draft_review"
export type MockQuestion = StoredQuestion & {
  id: string
  question: string
  options: Record<OptionLetter, string>
  correctAnswer: OptionLetter
}
export interface BankAvailability {
  subject: string
  count: number
  withExplanations: number
}
export const canonicalExam = (value: string) =>
  ["WACE", "WASSCE"].includes(value.trim().toUpperCase()) ? "WAEC" : value.trim().toUpperCase()
export function canonicalSubject(value: string): string {
  const key = value.trim().replace(/\s+/g, " ").toLowerCase()
  if (["math", "maths", "general mathematics"].includes(key)) return "Mathematics"
  return SUBJECTS.find((s) => s.toLowerCase() === key) ?? value.trim().replace(/\s+/g, " ")
}
export function usableQuestion(row: StoredQuestion, allowDraft = false): MockQuestion | null {
  const options = optionsOf(row),
    correct = correctLetterOf(row),
    question = row.question || row.text
  if (
    (row.publicationStatus === "draft" && !allowDraft) ||
    !row.id ||
    !question?.trim() ||
    options.length !== 4 ||
    new Set(options.map((o) => o.letter)).size !== 4 ||
    !correct ||
    new Set(options.map((o) => o.text.trim())).size !== 4
  )
    return null
  return {
    ...row,
    id: row.id,
    question: question.trim(),
    subject: canonicalSubject(row.subject || ""),
    exam: canonicalExam(row.exam || ""),
    options: Object.fromEntries(options.map((o) => [o.letter, o.text])) as Record<OptionLetter, string>,
    correctAnswer: correct,
  }
}
export function bankAvailability(rows: StoredQuestion[]): BankAvailability[] {
  const groups = new Map<string, BankAvailability>()
  for (const row of rows) {
    const q = usableQuestion(row)
    if (!q || !q.subject) continue
    const group = groups.get(q.subject) ?? { subject: q.subject, count: 0, withExplanations: 0 }
    group.count++
    if (q.explanation?.trim()) group.withExplanations++
    groups.set(q.subject, group)
  }
  return [...groups.values()]
}
export function selectMockQuestions(
  rows: StoredQuestion[],
  subjects: string[],
  mode: Exclude<MockMode, "draft_review">,
): MockQuestion[] {
  const output: MockQuestion[] = []
  for (const subject of subjects) {
    const pool = rows
      .map((row) => usableQuestion(row))
      .filter((q): q is MockQuestion => !!q && q.subject === subject)
    if (pool.length === 0)
      throw new Error(`No usable questions are available for ${subject}. Choose another available subject.`)
    output.push(...shuffled(pool).slice(0, mode === "revision" ? 8 : 40))
  }
  return output
}
export function publicMockQuestion(q: MockQuestion): StoredQuestion {
  return {
    id: q.id,
    question: q.question,
    options: q.options,
    subject: q.subject,
    exam: q.exam,
    year: q.year,
    source: q.source,
  }
}
export interface MockResult {
  attemptId: string
  source: "mock_verified" | "mock_preview"
  mode: MockMode
  exam: string
  subjects: string[]
  score: number
  totalQuestions: number
  questions: MockQuestion[]
  answers: Record<string, OptionLetter>
  durationSeconds: number
  elapsedSeconds: number
}
