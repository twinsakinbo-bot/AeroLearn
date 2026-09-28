/**
 * Friend requests: send, accept, decline, cancel, unfriend.
 *
 * These used to be client writes from `app/app/community/page.tsx`, and under
 * Firestore's permissive `users` rules they worked. Supabase row-level security
 * is not permissive, and the failure was silent in the worst way:
 *
 *   `users_select` is `using (auth.uid() is not null)` — any signed-in student can
 *   *read* any profile — while `users_update` is `using (id = public.me() or
 *   public.is_admin())`. `doc_patch` found the row, took its UPDATE branch, and
 *   the UPDATE then matched zero rows. A failing `USING` clause raises nothing;
 *   only a `WITH CHECK` violation raises 42501. So the student saw
 *   "Could not update users/<uid>: the write returned no row" and no more.
 *
 * The fix is not to loosen `users_update`. That policy is the only thing stopping
 * one student rewriting another's xp, coins, streak, displayName — or their friend
 * list. Sending a friend request is the one legitimate reason to touch someone
 * else's row, so it happens here instead, with the service role, where exactly two
 * fields can change and the sender's identity comes from a verified token rather
 * than from the request body.
 *
 * Every action is idempotent: sending a request twice is not an error, and a retry
 * after a half-finished write finishes the job. Where two documents change, the
 * *other* student's row is written first and the caller's pending request is
 * cleared last, so an interrupted accept leaves the request still showing rather
 * than vanishing with nothing to show for it.
 */
import { NextResponse } from "next/server"

import { requireUser } from "@/lib/api-auth"
import { FieldValue, getAdminDb } from "@/lib/db-admin"
import { clientIp, rateLimit } from "@/lib/rate-limit"

const ACTIONS = ["request", "accept", "decline", "cancel", "remove"] as const
type Action = (typeof ACTIONS)[number]

/** A Supabase user id is a UUID; anything longer is not one. */
const MAX_ID = 64

/**
 * A ceiling on one student's pending requests. Without it, the one write a
 * stranger is allowed to make is still a write they can make thousands of times
 * into somebody else's document.
 */
const MAX_PENDING = 300

const fail = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status })

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []
}

export async function POST(req: Request) {
  const gate = await requireUser(req)
  if (!gate.ok) return gate.response

  const perIp = rateLimit("friends", clientIp(req), { max: 40, windowMs: 60_000 })
  const perUser = rateLimit("friends-user", gate.uid, { max: 30, windowMs: 60_000 })
  if (!perIp.ok || !perUser.ok) {
    const retryAfter = Math.max(perIp.retryAfter, perUser.retryAfter)
    return NextResponse.json(
      { error: "Slow down a moment, then try again." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    )
  }

  const body = await req.json().catch(() => null)
  const action = String(body?.action ?? "") as Action
  const targetId = String(body?.targetId ?? "").trim()

  if (!ACTIONS.includes(action)) return fail("That is not something you can do here.", 400)
  if (!targetId || targetId.length > MAX_ID) return fail("Which student?", 400)
  if (targetId === gate.uid) return fail("You cannot add yourself.", 400)

  try {
    const db = getAdminDb()
    const users = db.collection("users")
    const meRef = users.doc(gate.uid)
    const themRef = users.doc(targetId)

    const [meSnap, themSnap] = await Promise.all([meRef.get(), themRef.get()])
    if (!meSnap.exists) return fail("Your account could not be found.", 404)
    if (!themSnap.exists) return fail("That student no longer has an account.", 404)

    const me = meSnap.data() ?? {}
    const them = themSnap.data() ?? {}

    const myFriends = ids(me.friends)
    const myRequests = ids(me.friendRequests)
    const theirRequests = ids(them.friendRequests)
    const alreadyFriends = myFriends.includes(targetId) || ids(them.friends).includes(gate.uid)

    /** Both rows gain each other, and any request either way is cleared. */
    const becomeFriends = async () => {
      await themRef.update({
        friends: FieldValue.arrayUnion(gate.uid),
        friendRequests: FieldValue.arrayRemove(gate.uid),
      })
      await meRef.update({
        friends: FieldValue.arrayUnion(targetId),
        friendRequests: FieldValue.arrayRemove(targetId),
      })
    }

    if (action === "request") {
      if (alreadyFriends) return NextResponse.json({ ok: true, status: "friends" })

      /* They asked first. Two people asking each other means they agree. */
      if (myRequests.includes(targetId)) {
        await becomeFriends()
        return NextResponse.json({ ok: true, status: "friends" })
      }

      if (theirRequests.includes(gate.uid)) {
        return NextResponse.json({ ok: true, status: "sent" })
      }
      if (theirRequests.length >= MAX_PENDING) {
        return fail("That student has too many pending requests right now.", 409)
      }

      await themRef.update({ friendRequests: FieldValue.arrayUnion(gate.uid) })
      return NextResponse.json({ ok: true, status: "sent" })
    }

    if (action === "accept") {
      if (alreadyFriends) return NextResponse.json({ ok: true, status: "friends" })
      if (!myRequests.includes(targetId)) {
        return fail("That request is no longer waiting for you.", 409)
      }
      await becomeFriends()
      return NextResponse.json({ ok: true, status: "friends" })
    }

    if (action === "decline") {
      await meRef.update({ friendRequests: FieldValue.arrayRemove(targetId) })
      return NextResponse.json({ ok: true, status: "declined" })
    }

    if (action === "cancel") {
      await themRef.update({ friendRequests: FieldValue.arrayRemove(gate.uid) })
      return NextResponse.json({ ok: true, status: "cancelled" })
    }

    /* remove — unfriend, and drop any request either way with it. */
    await themRef.update({
      friends: FieldValue.arrayRemove(gate.uid),
      friendRequests: FieldValue.arrayRemove(gate.uid),
    })
    await meRef.update({
      friends: FieldValue.arrayRemove(targetId),
      friendRequests: FieldValue.arrayRemove(targetId),
    })
    return NextResponse.json({ ok: true, status: "removed" })
  } catch (error) {
    console.error(`friends: ${action} ${gate.uid} -> ${targetId} failed:`, error)
    return fail("That did not save. Try again in a moment.", 500)
  }
}
