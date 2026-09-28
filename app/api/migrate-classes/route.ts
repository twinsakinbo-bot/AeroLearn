/**
 * Maintenance: normalise `lessons.classLevel` to the app's spacing ("SS2" → "SS 2").
 *
 * This was a `GET` with no authentication that rewrote every lesson document in
 * the database. A GET is fired by links, `<img src>`, crawlers and browser
 * prefetch — no CORS rule applies to a plain navigation — so a full-catalogue
 * mutation was one guessed URL away, and nothing in the app has ever called it.
 *
 * It is now POST, admin only, and defaults to a dry run: you have to pass
 * `{"apply": true}` to actually write. There is no undo on a bulk rewrite, so
 * seeing the count first is the difference between a migration and an accident.
 */
import { NextResponse } from "next/server"

import { requireAdmin } from "@/lib/api-auth"

export const dynamic = "force-dynamic"

const BATCH = 400

/** "ss2" → "SS 2", "JSS1" → "JSS 1". Returns null when already correct. */
function normalise(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  const fixed = value
    .trim()
    .replace(/^(SS|JSS)\s*(\d)$/i, (_, stage: string, number: string) => `${stage.toUpperCase()} ${number}`)
    .toUpperCase()
  return fixed === value ? null : fixed
}

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
    const snapshot = await db.collection("lessons").get()

    const changes: { id: string; from: string; to: string }[] = []
    snapshot.forEach((document) => {
      const from = document.data().classLevel
      const to = normalise(from)
      if (to) changes.push({ id: document.id, from: String(from), to })
    })

    if (apply) {
      for (let index = 0; index < changes.length; index += BATCH) {
        const batch = db.batch()
        changes.slice(index, index + BATCH).forEach((change) => {
          batch.update(db.collection("lessons").doc(change.id), { classLevel: change.to })
        })
        await batch.commit()
      }
    }

    return NextResponse.json({
      applied: apply,
      scanned: snapshot.size,
      changed: changes.length,
      /* Capped: the response is for a human deciding whether to run it. */
      sample: changes.slice(0, 25),
    })
  } catch (error) {
    console.error("migrate-classes failed:", error)
    return NextResponse.json({ error: "The migration could not run." }, { status: 500 })
  }
}
