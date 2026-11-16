import { NextResponse } from "next/server"

import { requireUser } from "@/lib/api-auth"
import { sendAdminNotification } from "@/lib/admin-notifications"
import { getAdminDb } from "@/lib/db-admin"

export async function POST(request: Request) {
  const gate = await requireUser(request)
  if (!gate.ok) return gate.response
  const body = await request.json().catch(() => null)
  const requestId = typeof body?.requestId === "string" && /^[\w-]{1,128}$/.test(body.requestId) ? body.requestId : ""
  if (!requestId) return NextResponse.json({ error: "Choose a receipt." }, { status: 400 })
  const ref = getAdminDb().collection("verificationRequests").doc(requestId)
  const snap = await ref.get()
  const receipt = snap.data()
  if (!snap.exists || receipt?.userId !== gate.uid || receipt?.status !== "pending") {
    return NextResponse.json({ error: "Pending receipt not found." }, { status: 404 })
  }
  if (receipt.adminNotifiedAt) return NextResponse.json({ sent: false, reason: "Already notified." })
  const sent = await sendAdminNotification({
    subject: "AeroLearn transfer receipt needs approval",
    heading: "A receipt is waiting for you",
    paragraphs: [
      `${String(receipt.userName || "A student").slice(0, 100)} submitted a ${String(receipt.planName || "Pro").slice(0, 100)} transfer receipt.`,
      "Check the actual transfer against your payment account before approving access.",
    ],
    href: "/admin/subscriptions",
    label: "Review receipt",
  })
  if (!sent) return NextResponse.json({ sent: false, reason: "Admin email is not configured. The receipt remains in the admin queue." })
  await ref.update({ adminNotifiedAt: new Date() })
  return NextResponse.json({ sent: true })
}
