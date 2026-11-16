import { NextRequest, NextResponse } from "next/server"

import { requireSchedulerOrAdmin } from "@/lib/api-auth"
import { getAdminDb } from "@/lib/db-admin"
import { POST as fetchAloc } from "@/app/api/aloc/route"
import { POST as reviewAloc } from "@/app/api/aloc/review/route"
import { POST as importQuestions } from "@/app/api/import-questions/route"

export const maxDuration = 300

// Rotate a bounded batch each day. ALOC supplies at most 40 questions per call.
const SUBJECTS = [
  "mathematics", "english", "biology", "chemistry", "physics", "economics",
  "commerce", "accounting", "government", "history", "geography",
  "literature", "crk", "irk", "civiceducation",
]
const EXAMS = ["utme", "wassce"]
const YEARS = [2024, 2023, 2022]

async function execute(request: Request) {
  const gate = await requireSchedulerOrAdmin(request)
  if (!gate.ok) return gate.response
  if (!process.env.ALOC_ACCESS_TOKEN) {
    return NextResponse.json({ error: "Set ALOC_ACCESS_TOKEN on the server to enable automatic sync." }, { status: 503 })
  }
  const db = getAdminDb()
  const stateRef = db.collection("settings").doc("automation-aloc")
  const state = (await stateRef.get()).data() || {}
  const cursor = Number.isInteger(state.cursor) ? state.cursor : 0
  const total = SUBJECTS.length * EXAMS.length * YEARS.length
  const index = cursor % total
  const subject = SUBJECTS[index % SUBJECTS.length]
  const examType = EXAMS[Math.floor(index / SUBJECTS.length) % EXAMS.length]
  const year = YEARS[Math.floor(index / (SUBJECTS.length * EXAMS.length)) % YEARS.length]
  const headers = new Headers({ authorization: request.headers.get("authorization") || "", "content-type": "application/json" })
  const post = (url: string, body: unknown) => new NextRequest(url, { method: "POST", headers, body: JSON.stringify(body) })
  const outcome: Record<string, unknown> = { subject, examType, year, at: new Date().toISOString() }

  try {
    const fetched = await fetchAloc(post("https://aerolearn.local/api/aloc", { subject, examType, year, limit: 40 }))
    const batch = await fetched.json()
    if (!fetched.ok) throw new Error(batch.error || `ALOC fetch failed (${fetched.status})`)
    const questions = Array.isArray(batch.questions) ? batch.questions : []
    outcome.fetched = questions.length
    outcome.skippedAtSource = Array.isArray(batch.skipped) ? batch.skipped.length : 0
    if (!questions.length) throw new Error("ALOC returned no usable questions.")

    const reviewed = await reviewAloc(post("https://aerolearn.local/api/aloc/review", { questions }))
    const verdict = await reviewed.json()
    if (!reviewed.ok || !Array.isArray(verdict.issues)) throw new Error(verdict.error || "AI question review failed")
    const blocked = new Set<number>(verdict.issues.map((issue: { index: number }) => issue.index))
    const safeQuestions = questions.filter((_: unknown, i: number) => !blocked.has(i))
    outcome.removedByReview = blocked.size
    if (safeQuestions.length) {
      const imported = await importQuestions(post("https://aerolearn.local/api/import-questions", {
        questions: safeQuestions, duplicateAction: "skip",
      }))
      const saved = await imported.json()
      if (!imported.ok || saved.failed) throw new Error(saved.error || `Question import failed (${saved.failed || imported.status})`)
      outcome.imported = saved.imported
      outcome.duplicates = saved.skipped
    } else {
      outcome.imported = 0
    }
    outcome.status = "done"
  } catch (error) {
    outcome.status = "failed"
    outcome.error = error instanceof Error ? error.message.slice(0, 400) : "ALOC sync failed"
  }

  // Advance even on failure so one unavailable ALOC year cannot block the queue.
  await stateRef.set({ cursor: (index + 1) % total, lastResult: outcome, updatedAt: new Date() }, { merge: true })
  return NextResponse.json({ outcome }, { status: outcome.status === "done" ? 200 : 502 })
}

export const GET = execute
export const POST = execute
