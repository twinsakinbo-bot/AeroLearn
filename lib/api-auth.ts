/**
 * One place to decide whether an API caller is allowed in.
 *
 * Nine routes shipped with no check at all. The three `migrate-*` ones were the
 * worst: each was a `GET` that rewrote every document in a collection, so any
 * link, `<img>` tag, crawler or browser prefetch could fire a full-database
 * mutation — no CORS rule applies to a plain navigation, and prefetchers hit GET
 * URLs speculatively. `check-*` enumerated collection contents. `ai-quiz` and
 * `ai-tutor` were open proxies onto a paid LLM key.
 *
 * The four routes that did check (`ai-chat`, `ai-flashcards`, `ai-essay-grader`,
 * `ai-timetable`) each inlined their own copy of the same fifteen lines, which is
 * why the other nine were easy to miss. Everything goes through here now.
 *
 * Usage:
 *   const gate = await requireAdmin(request)
 *   if (!gate.ok) return gate.response
 *   // gate.uid is a verified admin
 */
import { NextResponse } from "next/server"

export type Gate = { ok: true; uid: string } | { ok: false; response: NextResponse }

const deny = (message: string, status: number): Gate => ({
  ok: false,
  response: NextResponse.json({ error: message }, { status }),
})

function bearer(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? ""
}

/** Any signed-in account. Use for anything that spends money or reads user data. */
export async function requireUser(request: Request): Promise<Gate> {
  const idToken = bearer(request)
  if (!idToken) return deny("Sign in to continue.", 401)

  try {
    const { getAdminAuth } = await import("@/lib/db-admin")
    const decoded = await getAdminAuth().verifyIdToken(idToken)
    return { ok: true, uid: decoded.uid }
  } catch {
    return deny("Your session has expired. Sign in again.", 401)
  }
}

/** A signed-in account whose `users/{uid}.role` is `"admin"`. */
export async function requireAdmin(request: Request): Promise<Gate> {
  const gate = await requireUser(request)
  if (!gate.ok) return gate

  try {
    const { getAdminDb } = await import("@/lib/db-admin")
    const snap = await getAdminDb().collection("users").doc(gate.uid).get()
    if ((snap.exists ? snap.data()?.role : undefined) !== "admin") {
      return deny("Admin access required.", 403)
    }
    return gate
  } catch {
    return deny("Could not confirm your account.", 503)
  }
}

/**
 * Vercel Cron calls the scheduled routes with `Authorization: Bearer
 * $CRON_SECRET`. `x-cron-secret` is accepted too, because that is the header the
 * drip route was already written to look for.
 *
 * Unset secret means no caller can pass as the scheduler — deliberately. The
 * alternative fails open: an empty comparison would let any anonymous request
 * through.
 */
function isScheduler(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  return header === secret || request.headers.get("x-cron-secret") === secret
}

/**
 * The gate for the two `vercel.json` crons. Both shipped open: each accepted an
 * unauthenticated `GET`, and the drip route's check — `secret !== CRON_SECRET &&
 * authHeader` — was skipped entirely when no `authorization` header was sent, so
 * a bare POST mailed every user in the database.
 *
 * An admin may still run either by hand from the portal, which is why this falls
 * back to `requireAdmin` rather than rejecting outright.
 */
export async function requireSchedulerOrAdmin(request: Request): Promise<Gate> {
  if (isScheduler(request)) return { ok: true, uid: "cron" }
  return requireAdmin(request)
}
