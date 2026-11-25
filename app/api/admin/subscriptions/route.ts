import { NextResponse } from "next/server"
import { Resend } from "resend"

import { requireAdmin } from "@/lib/api-auth"
import { getAdminDb } from "@/lib/db-admin"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { emailLayout, emailParagraph, escapeHtml, MAIL_FROM } from "@/lib/email-template"
import { isProUser } from "@/lib/plan-access"
import { planById, planName } from "@/lib/plans"

function dateOf(value: unknown): Date | null {
  if (!value) return null
  const date = typeof value === "object" && value !== null && "toDate" in value
    ? (value as { toDate: () => Date }).toDate()
    : new Date(value as string)
  return Number.isFinite(date.getTime()) ? date : null
}

export async function GET(request: Request) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response
  const users = await getAdminDb().collection("users").get()
  return NextResponse.json({ active: users.docs.flatMap((entry) => {
    const user = entry.data()
    if (!isProUser(user) || user.role === "admin") return []
    return [{ id: entry.id, name: user.displayName || "Student", email: user.email || "", plan: user.subscription, expiresAt: dateOf(user.proExpiresAt)?.toISOString() || null }]
  }) })
}

export async function POST(request: Request) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response
  const body = await request.json().catch(() => null)
  const action = body?.action
  const userId = typeof body?.userId === "string" ? body.userId : ""
  if (!userId || !["approve", "revoke"].includes(action)) return NextResponse.json({ error: "Invalid plan action." }, { status: 400 })

  const db = getAdminDb()
  const userRef = db.collection("users").doc(userId)
  const userSnap = await userRef.get()
  if (!userSnap.exists || userSnap.data()?.role === "admin") return NextResponse.json({ error: "Student not found." }, { status: 404 })
  const user = userSnap.data()!

  if (action === "revoke") {
    if (!isProUser(user)) return NextResponse.json({ error: "This student has no active plan." }, { status: 409 })
    await userRef.update({ subscription: "free", proExpiresAt: null, planRevokedAt: new Date() })
    return NextResponse.json({ ok: true })
  }

  const requestId = typeof body?.requestId === "string" ? body.requestId : ""
  if (!requestId) return NextResponse.json({ error: "Choose a pending transfer." }, { status: 400 })
  const receiptRef = db.collection("verificationRequests").doc(requestId)
  const receiptSnap = await receiptRef.get()
  const receipt = receiptSnap.data()
  if (!receiptSnap.exists || receipt?.status !== "pending" || receipt.userId !== userId) {
    return NextResponse.json({ error: "That transfer is no longer pending for this student." }, { status: 409 })
  }
  const plan = planById(receipt.planId)
  if (!plan) return NextResponse.json({ error: "Unknown plan on this transfer." }, { status: 422 })
  if (user.subscription === "lifetime" && plan.id !== "lifetime") {
    return NextResponse.json({ error: "This student already has lifetime access. Do not replace it with a shorter plan." }, { status: 409 })
  }
  const { data: grantedExpiry, error: approvalError } = await getSupabaseAdmin().rpc("approve_pending_receipt", {
    p_request_id: requestId,
    p_user_id: userId,
    p_reviewer_id: gate.uid,
  })
  if (approvalError) {
    console.error("Payment approval transaction failed:", approvalError)
    return NextResponse.json({ error: "That transfer could not be approved. Refresh the queue and try again." }, { status: 409 })
  }
  const expiresAt = grantedExpiry ? new Date(grantedExpiry as string) : null

  let emailSent = false
  if (process.env.RESEND_API_KEY && user.email) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const name = escapeHtml(String(user.displayName || "Student"))
      const result = await resend.emails.send({
        from: MAIL_FROM.welcome,
        to: user.email,
        subject: `Your ${planName(plan.id)} Pro access is ready`,
        html: emailLayout({
          preheader: "Your AeroLearn Pro plan is active.",
          heading: `Welcome to Pro, ${name}!`,
          body: emailParagraph(`Your ${escapeHtml(planName(plan.id))} plan is active${expiresAt ? ` until ${escapeHtml(expiresAt.toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "long" }))}` : " with no expiry"}. Your access will end automatically on that date unless you make another transfer. Nothing renews automatically.`),
          cta: { label: "Start learning", href: "/app" },
        }),
      })
      emailSent = !result.error
      if (result.error) console.error("Subscription welcome email failed:", result.error)
    } catch (error) { console.error("Subscription welcome email failed:", error) }
  }
  return NextResponse.json({ ok: true, expiresAt: expiresAt?.toISOString() || null, emailSent })
}
