/**
 * Distinct `term` values across the lesson catalogue.
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

    const terms = new Set<string>()
    snapshot.forEach((document) => {
      const value = document.data().term
      if (typeof value === "string" && value.trim()) terms.add(value)
    })

    return NextResponse.json({ terms: Array.from(terms).sort() })
  } catch (error) {
    console.error("check-terms failed:", error)
    return NextResponse.json({ error: "Could not read the lesson catalogue." }, { status: 500 })
  }
}
