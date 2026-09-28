/**
 * Maintenance: normalise `practiceQuestions.subject` capitalisation and fold the
 * old exam aliases ("WASSCE" → "WAEC", "UTME" → "JAMB") onto the names the app
 * actually filters by.
 *
 * Same defect as `migrate-classes`: an unauthenticated `GET` that rewrote every
 * document in `practiceQuestions`, callable from any link or prefetch, with no
 * caller anywhere in the app. Now POST, admin only, dry run unless you pass
 * `{"apply": true}`.
 *
 * The exam rewrite matters more than it looks: `exam` is an equality filter on
 * every practice query *and* part of the duplicate fingerprint, so a question
 * stored as "WASSCE" is invisible to students and cannot be de-duplicated
 * against. The old version also had a dead branch that "mapped" POST-UTME to
 * itself and set no update flag.
 */
import { NextResponse } from "next/server"

import { requireAdmin } from "@/lib/api-auth"

export const dynamic = "force-dynamic"

const BATCH = 400

const EXAM_ALIASES: Record<string, string> = {
  WASSCE: "WAEC",
  UTME: "JAMB",
}

type Change = { id: string; updates: Record<string, string> }

export async function POST(request: Request) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  let apply = false
  try {
    apply = (await request.json())?.apply === true
  } catch {
    /* No body means a dry run, which is the safe default. */
  }

  try {
    const { getAdminDb } = await import("@/lib/db-admin")
    const db = getAdminDb()
    const snapshot = await db.collection("practiceQuestions").get()

    const changes: Change[] = []
    snapshot.forEach((document) => {
      const data = document.data()
      const updates: Record<string, string> = {}

      const subject = data.subject
      if (typeof subject === "string" && subject.trim() && subject[0] !== subject[0].toUpperCase()) {
        updates.subject = subject[0].toUpperCase() + subject.slice(1)
      }

      const exam = typeof data.exam === "string" ? data.exam.toUpperCase() : ""
      if (EXAM_ALIASES[exam]) updates.exam = EXAM_ALIASES[exam]

      if (Object.keys(updates).length > 0) changes.push({ id: document.id, updates })
    })

    if (apply) {
      for (let index = 0; index < changes.length; index += BATCH) {
        const batch = db.batch()
        changes.slice(index, index + BATCH).forEach((change) => {
          batch.update(db.collection("practiceQuestions").doc(change.id), change.updates)
        })
        await batch.commit()
      }
    }

    return NextResponse.json({
      applied: apply,
      scanned: snapshot.size,
      changed: changes.length,
      sample: changes.slice(0, 25),
    })
  } catch (error) {
    console.error("migrate-data failed:", error)
    return NextResponse.json({ error: "The migration could not run." }, { status: 500 })
  }
}
