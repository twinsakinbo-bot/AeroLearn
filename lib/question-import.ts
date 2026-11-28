import type { PracticeQuestion } from "./types/question"
import { generateFingerprint } from "./utils/fingerprint"
export type QuestionImportAction = "skip" | "replace" | "import-as-new"
export async function importQuestionRows(
  questions: PracticeQuestion[],
  action: QuestionImportAction,
  store: {
    list: () => Promise<{ id: string; data: PracticeQuestion }[]>
    newId: () => string
    write: (id: string, data: PracticeQuestion) => Promise<void>
  },
) {
  const previous = new Map((await store.list()).map((row) => [generateFingerprint(row.data), row]))
  const result = { imported: 0, skipped: 0, replaced: 0, failed: 0, failures: [] as string[] }
  for (const question of questions) {
    const key = generateFingerprint(question),
      old = previous.get(key)
    if (old && action === "skip") {
      result.skipped++
      continue
    }
    const replacing = old && action === "replace",
      id = replacing ? old.id : store.newId()
    const data = {
      ...question,
      id,
      questionId: id,
      createdAt: old?.data.createdAt || question.createdAt || new Date(),
      updatedAt: new Date(),
    }
    try {
      await store.write(id, data)
      previous.set(key, { id, data })
      result.imported++
      if (replacing) result.replaced++
    } catch {
      result.failed++
      result.failures.push(
        `Question ${result.imported + result.failed + result.skipped}: write failed; existing content retained.`,
      )
    }
  }
  return result
}
