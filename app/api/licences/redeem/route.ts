/**
 * POST /api/licences/redeem — turn a prepaid code into Pro access.
 *
 * The whole grant happens inside `redeem_licence_code()` in
 * supabase/migrations/0002_licence_codes.sql, as one atomic UPDATE with a
 * status guard. This route therefore does NOT read-then-write: it validates the
 * shape, authenticates, calls the function once, and translates the result. That
 * ordering is the point — if the route claimed the code and then updated the user
 * in two steps, a concurrent redemption of the same code could be granted twice.
 *
 * Rate limited per account, not per IP: behind Vercel every browser can share an
 * address, and the meaningful budget is "one student should not be guessing". The
 * per-instance caveat in lib/rate-limit applies — it stops a script, not a
 * distributed attempt, which is the right level for an endpoint where a
 * successful guess still has to be redeemed by its guesser's own account.
 */
import { NextResponse } from "next/server"
import { requireUser } from "@/lib/api-auth"
import { clientIp, rateLimit } from "@/lib/rate-limit"
import { getAdminDb } from "@/lib/db-admin"
import { hasPermanentPaidAccess } from "@/lib/plan-access"
import {
  looksLikeCode,
  normalizeCode,
  redeemLicenceCode,
  REDEEM_MAX_ATTEMPTS,
  REDEEM_WINDOW_MS,
  type RedeemResult,
} from "@/lib/licences"

const RULE = { max: REDEEM_MAX_ATTEMPTS, windowMs: REDEEM_WINDOW_MS }

export async function POST(request: Request) {
  const gate = await requireUser(request)
  if (!gate.ok) return gate.response

  const throttle = rateLimit("licence-redeem", `${gate.uid}:${clientIp(request)}`, RULE)
  if (!throttle.ok) {
    return NextResponse.json(
      {
        error: "Too many attempts. Check the code you were given, or ask whoever sold it to you.",
      },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } },
    )
  }

  const body = await request.json().catch(() => null)
  const raw = (body as { code?: unknown } | null)?.code
  if (typeof raw !== "string" || !raw.trim()) {
    return NextResponse.json({ error: "Enter a licence code first." }, { status: 400 })
  }

  // Reject obvious garbage before it reaches the database, so a mistyped prefix
  // gives a helpful message rather than "not found".
  if (!looksLikeCode(raw)) {
    return NextResponse.json(
      {
        error:
          "That does not look like an AeroLearn code. They start with AL- and have twelve letters and numbers.",
        reason: "malformed",
      },
      { status: 400 },
    )
  }

  try {
    const profile = await getAdminDb().collection("users").doc(gate.uid).get()
    if (hasPermanentPaidAccess(profile.data())) {
      return NextResponse.json({
        error: "Your account already has permanent Pro access. Keep this code or give it to someone else; it has not been used.",
        reason: "already_permanent",
      }, { status: 409 })
    }
  } catch (error) {
    console.error("Could not check account before redemption:", error)
    return NextResponse.json({ error: "Could not check your current plan. Try again shortly." }, { status: 503 })
  }

  let result: RedeemResult
  try {
    result = await redeemLicenceCode(normalizeCode(raw), gate.uid, request.headers.get("authorization")!.replace(/^Bearer\s+/i, "").trim())
  } catch (error) {
    // Never echo a database message to a student mid-payment — it can name a
    // table or a function, and the useful part ("try again") is the same either
    // way. The detail goes to the server log.
    console.error("Licence redemption failed:", error)
    return NextResponse.json(
      { error: "We could not apply that code just now. Nothing has been lost — try once more." },
      { status: 503 },
    )
  }

  if (!result.ok) {
    const status = result.reason === "used" || result.reason === "cancelled" ? 409 : 404
    return NextResponse.json({ error: result.message, reason: result.reason }, { status })
  }

  return NextResponse.json({
    ok: true,
    planId: result.planId,
    planName: result.planName,
    expiresAt: result.expiresAt,
    extendedFrom: result.extendedFrom,
  })
}
