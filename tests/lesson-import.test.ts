import assert from "node:assert/strict"
import { test } from "node:test"
import { importLessonRows } from "../lib/lesson-import"
import type { Lesson } from "../lib/types/lesson"
const original: Lesson = { id: "saved-lesson", subject: "Maths", classLevel: "SS 1", term: "Beginner", topicTitle: "Sequences", content: "Original notes", createdAt: new Date("2026-01-01") }
const updated = { ...original, content: "Corrected notes" }
function fixture(fail = false) {
  const rows = new Map([["saved-lesson", original]])
  return { rows, store: {
    list: async () => [...rows].map(([id, data]) => ({ id, data })),
    newId: () => "new-lesson",
    write: async (id: string, lesson: Lesson) => { if (fail) throw new Error("Database unavailable"); rows.set(id, lesson) },
  } }
}
test("replacement retains the lesson ID, references and creation date", async () => {
  const { rows, store } = fixture()
  const result = await importLessonRows([updated], "replace", store)
  assert.equal(result.replaced, 1)
  assert.equal(rows.size, 1)
  assert.equal(rows.get("saved-lesson")?.content, "Corrected notes")
  assert.equal(rows.get("saved-lesson")?.createdAt, original.createdAt)
})
test("a failed replacement leaves the original lesson intact", async () => {
  const { rows, store } = fixture(true)
  const result = await importLessonRows([updated], "replace", store)
  assert.equal(result.failed, 1)
  assert.equal(result.replaced, 0)
  assert.equal(result.imported, 0)
  assert.deepEqual(rows.get("saved-lesson"), original)
})
test("skip and import-as-new preserve existing lesson content", async () => {
  const { rows, store } = fixture()
  assert.equal((await importLessonRows([updated], "skip", store)).skipped, 1)
  assert.equal(rows.size, 1)
  assert.equal((await importLessonRows([updated], "import-as-new", store)).imported, 1)
  assert.equal(rows.size, 2)
  assert.equal(rows.get("saved-lesson")?.content, "Original notes")
  assert.equal(rows.get("new-lesson")?.content, "Corrected notes")
})

test("imports use bounded concurrency while repeated replacements keep input order", async () => {
  const { rows, store } = fixture()
  let active = 0
  let peak = 0
  let serial = 0
  const originalWrite = store.write
  store.newId = () => `new-${++serial}`
  store.write = async (id, data) => {
    active++; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, data.content === "first" ? 10 : 1))
    await originalWrite(id, data)
    active--
  }
  const others = Array.from({ length: 30 }, (_, i) => ({ ...original, topicTitle: `Topic ${i}` }))
  const result = await importLessonRows([{ ...updated, content: "first" }, ...others, { ...updated, content: "last" }], "replace", store)
  assert.equal(result.imported, 32)
  assert.equal(rows.get("saved-lesson")?.content, "last")
  assert.ok(peak > 1 && peak <= 25)
})
