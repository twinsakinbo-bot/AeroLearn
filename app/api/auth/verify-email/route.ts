import { NextResponse } from "next/server"
import { getAdminAuth } from "@/lib/db-admin"
import { Resend } from "resend"

import { MAIL_FROM, emailLayout, emailParagraph, escapeHtml } from "@/lib/email-template"
import { clientIp, rateLimit } from "@/lib/rate-limit"
import { siteUrl } from "@/lib/site"

/**
 * `new Resend(undefined)` throws, and this ran at module scope — the very crash
 * its sibling `reset-password` carries a comment about avoiding. Built without
 * RESEND_API_KEY in the environment, importing this route failed the build. The
 * client is created per request now, after the key has been checked.
 *
 * Rate limited for the same reason as the reset route: with no cap, one loop
 * makes AeroLearn mail any address the caller names, repeatedly.
 */
const RULE = { max: 4, windowMs: 15 * 60 * 1000 }

export async function POST(req: Request) {
  const throttle = rateLimit("verify-email", clientIp(req), RULE)
  if (!throttle.ok) {
    return NextResponse.json(
      { error: "Too many verification requests from this connection. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfter) } },
    )
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.error("RESEND_API_KEY is not set")
    return NextResponse.json({ error: "Email service not configured." }, { status: 503 })
  }
  const resend = new Resend(resendKey)

  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    // 1. Ask Supabase for a confirmation link for this address
    let rawLink: string
    try {
      rawLink = await getAdminAuth().generateEmailVerificationLink(email)
    } catch (linkErr: any) {
      console.error("Could not generate a verification link:", linkErr)
      return NextResponse.json({ success: true, message: "If an account exists, a verification link was sent." })
    }

    /* 2. Take the code out of that link — `token` on Supabase's verify URL, where
       Firebase used `oobCode`. The outgoing query name stays `oobCode`, so
       /auth/action reads it exactly as before. */
    const url = new URL(rawLink)
    const oobCode = url.searchParams.get("token")

    if (!oobCode) {
      throw new Error("The generated verification link carried no token.")
    }

    // 3. Construct our own action URL, on our own origin
    const customLink = siteUrl(
      `/auth/action?mode=verifyEmail&oobCode=${encodeURIComponent(oobCode)}`,
    )

    // 4. Send it
    const { error } = await resend.emails.send({
      from: MAIL_FROM.support,
      to: [email],
      subject: "Verify your email address for AeroLearn 🚀",
      html: emailLayout({
        preheader: "One click and your AeroLearn account is active.",
        heading: "Verify your email address",
        body:
          emailParagraph(
            `You are one step from your account being active. Confirm that <strong>${escapeHtml(
              String(email),
            )}</strong> is yours and you are in.`,
          ) +
          emailParagraph(
            "The link works once. If it has already expired by the time you click it, ask for a " +
              "new one from the sign-in page.",
          ),
        cta: { label: "Verify my email", href: customLink },
        footnote:
          "If you did not create an AeroLearn account, ignore this email — nothing was set up in your name.",
      }),
    })

    if (error) {
      console.error("Resend Error:", error)
      return NextResponse.json({ error: "Failed to send verification email." }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Verification email sent!" })
  } catch (error: any) {
    console.error("Custom Email Verification Error:", error)
    return NextResponse.json({ error: "Internal server error." }, { status: 500 })
  }
}
