/**
 * Distinct `subject` values across the lesson catalogue.
 *
 * See `check-classes` — same admin maintenance probe, same problem: no caller in
 * the app, reachable by anyone, and a full scan of `lessons` per request.
 */
import { NextResponse } from "next/server"

import { requireAdmin } from "@/lib/api-auth"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  try {
    const { getAdminDb } = await import("@/lib/db-admin")
    const snapshot = await getAdminDb().collection("lessons").get()

    const subjects = new Set<string>()
    snapshot.forEach((document) => {
      const value = document.data().subject
      if (typeof value === "string" && value.trim()) subjects.add(value)
    })

    return NextResponse.json({ subjects: Array.from(subjects).sort() })
  } catch (error) {
    console.error("check-subjects failed:", error)
    return NextResponse.json({ error: "Could not read the lesson catalogue." }, { status: 500 })
  }
}
