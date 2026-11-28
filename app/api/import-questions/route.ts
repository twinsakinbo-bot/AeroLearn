/** Canonical, validated question imports. No deletion before replacement. */
import { NextRequest, NextResponse } from "next/server"
import { requireSchedulerOrAdmin } from "@/lib/api-auth"
import { normalizeRow } from "@/lib/question-normalizer"
import { validateQuestions } from "@/lib/question-validator"
import { importQuestionRows, type QuestionImportAction } from "@/lib/question-import"
import type { AdminDocumentSnapshot } from "@/lib/db-admin"
import type { PracticeQuestion, RawRow } from "@/lib/types/question"
export async function POST(request: NextRequest) {
  const gate = await requireSchedulerOrAdmin(request)
  if (!gate.ok) return gate.response
  try {
    const body = await request.json()
    if (
      !Array.isArray(body.questions) ||
      body.questions.length === 0 ||
      body.questions.length > 5000 ||
      !["skip", "replace", "import-as-new"].includes(body.duplicateAction)
    )
      return NextResponse.json({ error: "Provide 1–5000 questions and a duplicate action." }, { status: 400 })
    if (
      body.questions.some(
        (q: RawRow) => !q || typeof q !== "object" || q.publicationStatus === "draft" || q.status === "draft",
      )
    )
      return NextResponse.json(
        {
          error:
            "Draft questions cannot be published. Obtain teacher approval and complete the content review first.",
        },
        { status: 400 },
      )
    const questions = body.questions.map((row: RawRow, index: number) => normalizeRow(row, {}, index))
    const checked = validateQuestions(questions)
    if (Object.values(checked.errors).some((errors) => errors.some((e) => e.severity === "error")))
      return NextResponse.json(
        { error: "Question validation failed.", validation: checked.errors },
        { status: 400 },
      )
    const { getAdminDb } = await import("@/lib/db-admin")
    const collection = getAdminDb().collection("practiceQuestions")
    const result = await importQuestionRows(
      checked.validQuestions,
      body.duplicateAction as QuestionImportAction,
      {
        list: async () => {
          const rows: { id: string; data: PracticeQuestion }[] = []
          let last: AdminDocumentSnapshot | null = null
          for (;;) {
            let q = collection.limit(500)
            if (last) q = q.startAfter(last)
            const page = await q.get()
            rows.push(...page.docs.map((row) => ({ id: row.id, data: row.data() as PracticeQuestion })))
            if (page.size < 500) break
            last = page.docs[page.docs.length - 1]
          }
          return rows
        },
        newId: () => collection.doc().id,
        write: async (id, data) => {
          await collection.doc(id).set({ ...data })
        },
      },
    )
    return NextResponse.json({
      ...result,
      success: result.failed === 0,
      duplicateAction: body.duplicateAction,
    })
  } catch {
    return NextResponse.json(
      { error: "Import failed. Existing questions have not been deleted." },
      { status: 500 },
    )
  }
}
