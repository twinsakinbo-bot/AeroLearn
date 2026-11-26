import type { Lesson } from "./types/lesson"

export type DuplicateAction = "skip" | "replace" | "import-as-new"
type Store = {
  list: () => Promise<Array<{ id: string; data: Lesson }>>
  newId: () => string
  write: (id: string, lesson: Lesson) => Promise<void>
}
const fingerprint = (lesson: Lesson) => `${lesson.subject}|${lesson.classLevel}|${lesson.topicTitle}`.toLowerCase()

/** Replace with one atomic document write, preserving references and the old row on failure. */
export async function importLessonRows(lessons: Lesson[], action: DuplicateAction, store: Store) {
  const existing = new Map((await store.list()).map(row => [fingerprint(row.data), row]))
  const result = { imported: 0, skipped: 0, replaced: 0, failed: 0, failures: [] as string[] }
  async function save(lesson: Lesson) {
    const key = fingerprint(lesson)
    const previous = existing.get(key)
    if (previous && action === "skip") { result.skipped++; return }
    const replacing = previous && action === "replace"
    const id = replacing ? previous.id : store.newId()
    const now = new Date()
    const data: Lesson = {
      id, subject: lesson.subject, classLevel: lesson.classLevel, term: lesson.term,
      topicTitle: lesson.topicTitle, content: lesson.content,
      ...(typeof lesson.chapter === "number" ? { chapter: lesson.chapter } : {}),
      examples: lesson.examples || [], homework: lesson.homework || [], videoUrl: lesson.videoUrl || "",
      createdAt: (replacing ? previous.data.createdAt : lesson.createdAt) || now,
      updatedAt: now,
    }
    try {
      await store.write(id, data)
      existing.set(key, { id, data })
      result.imported++
      if (replacing) result.replaced++
    } catch {
      result.failed++
      result.failures.push(`Could not save lesson: ${lesson.topicTitle.slice(0, 100)}`)
    }
  }
  // Keep the previous importer's bounded parallelism, but serialize duplicates
  // so two replacements of the same lesson cannot finish in the wrong order.
  const grouped = new Map<string, Lesson[]>()
  for (const lesson of lessons) {
    const key = fingerprint(lesson)
    grouped.set(key, [...(grouped.get(key) || []), lesson])
  }
  const groups = [...grouped.values()]
  let next = 0
  await Promise.all(Array.from({ length: Math.min(25, groups.length) }, async () => {
    while (next < groups.length) {
      const group = groups[next++]
      for (const lesson of group) await save(lesson)
    }
  }))
  return result
}
