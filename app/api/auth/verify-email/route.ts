import { NextResponse } from "next/server"

import { getAdminAuth } from "@/lib/db-admin"
import { clientIp, rateLimit } from "@/lib/rate-limit"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { siteUrl } from "@/lib/site"
import { sendVerificationEmail } from "@/lib/verification-email"

const RULE = { max: 4, windowMs: 15 * 60_000 }
const SENT = { success: true, message: "If this address has an unconfirmed account, a new link is on its way." }

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  }

  const perIp = rateLimit("verify-email-ip", clientIp(request), RULE)
  const perEmail = rateLimit("verify-email-address", email, RULE)
  if (!perIp.ok || !perEmail.ok) {
    return NextResponse.json({ error: "Too many requests. Wait a few minutes before trying again." }, { status: 429 })
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email service is unavailable. Try again later." }, { status: 503 })
  }

  try {
    // Only send to a real, unconfirmed account. A magic link generated for an
    // unknown address can create a user, and a confirmed account needs no link.
    const admin = getSupabaseAdmin()
    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("id")
      .eq("data->>email", email)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile) return NextResponse.json(SENT)

    const { data: account, error: accountError } = await admin.auth.admin.getUserById(profile.id)
    if (accountError) throw accountError
    if (!account.user || account.user.email_confirmed_at) return NextResponse.json(SENT)

    const rawLink = await getAdminAuth().generateEmailVerificationLink(email)
    const code = new URL(rawLink).searchParams.get("token")
    if (!code) throw new Error("No confirmation token was returned.")

    await sendVerificationEmail(email, siteUrl(`/auth/action?mode=verifyEmail&kind=magiclink&oobCode=${encodeURIComponent(code)}`))
    return NextResponse.json(SENT)
  } catch (error) {
    console.error("Could not resend confirmation:", error)
    return NextResponse.json({ error: "Could not send a new link. Try again later." }, { status: 503 })
  }
}
