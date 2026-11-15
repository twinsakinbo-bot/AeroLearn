import { NextResponse } from "next/server"

import { requireUser } from "@/lib/api-auth"
import { getAdminDb } from "@/lib/db-admin"
import { isPaidPlan } from "@/lib/plans"

function activePaidPlan(data: Record<string, unknown>): boolean {
  if (!isPaidPlan(data.subscription)) return false
  if (!data.proExpiresAt) return true
  const raw = data.proExpiresAt as { seconds?: number; toDate?: () => Date } | string
  const expiry = typeof raw === "object" && raw.toDate ? raw.toDate()
    : typeof raw === "object" && raw.seconds ? new Date(raw.seconds * 1000)
    : new Date(raw as string)
  return Number.isFinite(expiry.getTime()) && expiry.getTime() > Date.now()
}

/** Grants one 24-hour pass only after a signed-in student submits a receipt. */
export async function POST(request: Request) {
  const gate = await requireUser(request)
  if (!gate.ok) return gate.response
  const body = await request.json().catch(() => null)
  try {
    const db = getAdminDb()
    let requestId = typeof body?.requestId === "string" ? body.requestId.trim() : ""
    if (!requestId) {
      const pending = await db.collection("verificationRequests")
        .where("userId", "==", gate.uid)
        .where("status", "==", "pending")
        .orderBy("createdAt", "desc")
        .limit(1)
        .get()
      requestId = pending.docs[0]?.id ?? ""
    }
    if (!/^[a-zA-Z0-9_-]{10,100}$/.test(requestId)) {
      return NextResponse.json({ error: "A valid pending receipt is required." }, { status: 400 })
    }
    const userRef = db.collection("users").doc(gate.uid)
    const receiptRef = db.collection("verificationRequests").doc(requestId)
    return await db.runTransaction(async (transaction) => {
      const receipt = await transaction.get(receiptRef)
      const row = receipt.data()
      if (!receipt.exists || row?.userId !== gate.uid || row?.status !== "pending" || !row?.receiptUrl) {
        return NextResponse.json({ error: "The pending receipt could not be verified." }, { status: 404 })
      }
      const user = await transaction.get(userRef)
      if (!user.exists) return NextResponse.json({ error: "Your account was not found." }, { status: 404 })
      const profile = user.data() ?? {}
      if (activePaidPlan(profile)) return NextResponse.json({ granted: false, reason: "already-pro" })
      if (profile.subscription === "pro" || profile.trustPassRequestId) {
        return NextResponse.json({ granted: false, reason: "already-used" })
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      transaction.update(userRef, {
        subscription: "pro",
        proExpiresAt: expiresAt,
        trustPassRequestId: requestId,
      })
      return NextResponse.json({ granted: true, expiresAt: expiresAt.toISOString() })
    })
  } catch (error) {
    console.error("Could not grant Trust Pass:", error)
    return NextResponse.json({ error: "The receipt was saved, but the Trust Pass could not start. Contact support." }, { status: 503 })
  }
}
