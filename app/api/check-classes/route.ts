/**
 * Distinct `classLevel` values across the lesson catalogue.
 *
 * An admin maintenance probe with no caller in the app. It was reachable by
 * anyone who guessed the URL, and it reads the whole `lessons` collection on
 * every request — so it enumerated the catalogue and billed a full-collection
 * scan to whoever asked. Admin only now.
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

    const classes = new Set<string>()
    snapshot.forEach((document) => {
      const value = document.data().classLevel
      if (typeof value === "string" && value.trim()) classes.add(value)
    })

    return NextResponse.json({ classes: Array.from(classes).sort() })
  } catch (error) {
    console.error("check-classes failed:", error)
    return NextResponse.json({ error: "Could not read the lesson catalogue." }, { status: 500 })
  }
}
