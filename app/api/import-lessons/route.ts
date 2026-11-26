import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import { importLessonRows, type DuplicateAction } from "@/lib/lesson-import"
import type { Lesson } from "@/lib/types/lesson"

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response
  const body = await request.json().catch(() => null)
  const lessons = body?.lessons
  const action = body?.duplicateAction
  if (!Array.isArray(lessons) || !lessons.length || !["skip", "replace", "import-as-new"].includes(action)
    || lessons.some(row => !row || ["subject", "classLevel", "term", "topicTitle", "content"].some(key => typeof row[key] !== "string" || !row[key].trim()))) {
    return NextResponse.json({ error: "Provide valid lessons and choose how to handle duplicates." }, { status: 400 })
  }
  try {
    const { getAdminDb } = await import("@/lib/db-admin")
    const collection = getAdminDb().collection("lessons")
    const result = await importLessonRows(lessons, action as DuplicateAction, {
      list: async () => (await collection.get()).docs.map(doc => ({ id: doc.id, data: doc.data() as Lesson })),
      newId: () => collection.doc().id,
      write: async (id, lesson) => { await collection.doc(id).set(lesson as unknown as Record<string, unknown>) },
    })
    return NextResponse.json({ success: result.failed === 0, ...result, duplicateAction: action })
  } catch (error) {
    console.error("Lesson import failed:", error)
    return NextResponse.json({ error: "Could not import lessons. Please try again." }, { status: 500 })
  }
}
