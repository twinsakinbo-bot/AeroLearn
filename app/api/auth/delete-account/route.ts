/**
 * Deleting an account for good.
 *
 * `deleteUser()` in lib/auth.ts posts here because removing an auth user needs
 * the service role, which cannot go to the browser. Under Firebase the client
 * deleted its own auth record and a separate "delete my data" path wiped the
 * profile document — so a half-finished deletion left either an account with no
 * profile or, worse, a working login whose data was gone. Here one call removes
 * the auth user and the `after delete on auth.users` trigger clears the profile
 * row, so the two cannot come apart.
 */
import { NextResponse } from "next/server"

import { requireUser } from "@/lib/api-auth"
import { getAdminAuth } from "@/lib/db-admin"

export async function POST(request: Request) {
  const gate = await requireUser(request)
  if (!gate.ok) return gate.response

  // The uid comes from the verified token, never from the body — a student can
  // only ever delete the account they are signed in to.
  try {
    await getAdminAuth().deleteUser(gate.uid)
  } catch (error) {
    console.error("delete-account:", error)
    return NextResponse.json({ error: "Could not delete your account." }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
