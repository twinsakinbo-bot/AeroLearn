import { NextResponse } from "next/server"

import { requireUser } from "@/lib/api-auth"
import { FieldValue, getAdminDb } from "@/lib/db-admin"

export async function POST(request: Request) {
  const gate = await requireUser(request)
  if (!gate.ok) return gate.response

  const body = await request.json().catch(() => null)
  const conversationId = body?.conversationId
  if (typeof conversationId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(conversationId)) {
    return NextResponse.json({ error: "Choose a valid chat to leave." }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const ref = db.collection("conversations").doc(conversationId)
    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref)
      if (!snap.exists) return "missing"
      const participants = snap.data()?.participants
      if (!Array.isArray(participants) || !participants.includes(gate.uid)) return "forbidden"

      transaction.update(ref, {
        participants: FieldValue.arrayRemove(gate.uid),
        unreadBy: FieldValue.arrayRemove(gate.uid),
        typing: FieldValue.arrayRemove(gate.uid),
        admins: FieldValue.arrayRemove(gate.uid),
      })
      return "left"
    })

    if (result === "missing") return NextResponse.json({ error: "This chat no longer exists." }, { status: 404 })
    if (result === "forbidden") return NextResponse.json({ error: "You are no longer in this chat." }, { status: 403 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Failed to leave conversation:", error)
    return NextResponse.json({ error: "Could not leave the chat. Try again." }, { status: 500 })
  }
}
