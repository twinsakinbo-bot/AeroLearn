/**
 * Maintenance: fold the subject names an AI content run invented onto the 28 the
 * app actually offers, so those lessons become reachable.
 *
 * Same defect as its two siblings: an unauthenticated `GET` rewriting every
 * lesson document, with no caller in the app. Now POST, admin only, dry run
 * unless you pass `{"apply": true}`.
 *
 * Two entries were removed from the mapping table because running it would have
 * destroyed data rather than tidied it:
 *
 *   "arabic"          → "English Language"   Arabic is not English. Every Arabic
 *                                            lesson would have been relabelled
 *                                            and mixed into the English catalogue,
 *                                            with no record of what it had been.
 *   "islamic studies" → "CRS / IRK"          Defensible, since the app carries one
 *                                            combined subject — but it is a
 *                                            one-way merge with "christian
 *                                            religious studies", so the two can
 *                                            never be separated again. Left out
 *                                            for a human to decide.
 *
 * Every target below is checked against `SUBJECTS` at request time, so a typo in
 * this table is reported instead of being written.
 */
import { NextResponse } from "next/server"

import { requireAdmin } from "@/lib/api-auth"
import { SUBJECTS } from "@/lib/constants"

export const dynamic = "force-dynamic"

const BATCH = 400

const SUBJECT_ALIASES: Record<string, string> = {
  english: "English Language",
  "english studies": "English Language",
  science: "Basic Science",
  "basic science and technology": "Basic Science",
  math: "Mathematics",
  maths: "Mathematics",
  "general mathematics": "Mathematics",
  "christian religious studies": "CRS / IRK",
  "literature in english": "Literature-in-English",
  "physical education": "Physical & Health Education",
  "health education": "Physical & Health Education",
  french: "French Language",
  "visual arts": "Fine Art",
  "cultural and creative arts": "Creative Arts",
  "nigerian history": "History",
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

  const known = SUBJECTS as readonly string[]
  const badTargets = Object.entries(SUBJECT_ALIASES)
    .filter(([, target]) => !known.includes(target))
    .map(([from, target]) => `${from} → ${target}`)

  if (badTargets.length > 0) {
    return NextResponse.json(
      { error: `These targets are not real subjects: ${badTargets.join(", ")}` },
      { status: 500 },
    )
  }

  try {
    const { getAdminDb } = await import("@/lib/db-admin")
    const db = getAdminDb()
    const snapshot = await db.collection("lessons").get()

    const changes: { id: string; from: string; to: string }[] = []
    /* Reported so an admin can see what is in the catalogue but unmapped — the
       old route returned every distinct subject, mapped or not, which buried it. */
    const unmapped = new Set<string>()

    snapshot.forEach((document) => {
      const from = document.data().subject
      if (typeof from !== "string" || !from.trim()) return

      const to = SUBJECT_ALIASES[from.trim().toLowerCase()]
      if (to && to !== from) changes.push({ id: document.id, from, to })
      else if (!to && !known.includes(from)) unmapped.add(from)
    })

    if (apply) {
      for (let index = 0; index < changes.length; index += BATCH) {
        const batch = db.batch()
        changes.slice(index, index + BATCH).forEach((change) => {
          batch.update(db.collection("lessons").doc(change.id), { subject: change.to })
        })
        await batch.commit()
      }
    }

    return NextResponse.json({
      applied: apply,
      scanned: snapshot.size,
      changed: changes.length,
      sample: changes.slice(0, 25),
      needsAttention: Array.from(unmapped).sort(),
    })
  } catch (error) {
    console.error("migrate-lessons failed:", error)
    return NextResponse.json({ error: "The migration could not run." }, { status: 500 })
  }
}

