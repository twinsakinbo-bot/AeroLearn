import { NextResponse } from "next/server"
import { getAdminAuth } from "@/lib/db-admin"
import { Resend } from "resend"

import { MAIL_FROM, emailLayout, emailParagraph, escapeHtml } from "@/lib/email-template"
import { clientIp, rateLimit } from "@/lib/rate-limit"
import { siteUrl } from "@/lib/site"

// NOTE: Resend is instantiated inside the handler to avoid crashing at build
// time when RESEND_API_KEY is not set in the build environment.

/**
 * Public by necessity, so it is rate limited: without a cap, one loop makes
 * AeroLearn send reset mail to any address the caller names, over and over.
 * Firebase's client SDK throttles this itself; this route replaced it and has to.
 */
const RULE = { max: 4, windowMs: 15 * 60 * 1000 }

export async function POST(req: Request) {
  const throttle = rateLimit("reset-password", clientIp(req), RULE)
  if (!throttle.ok) {
    return NextResponse.json(
      { error: "Too many reset requests from this connection. Try again shortly." },
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

    // 1. Ask Supabase for a recovery link for this address
    let rawLink: string
    try {
      rawLink = await getAdminAuth().generatePasswordResetLink(email)
    } catch (linkErr: any) {
      console.error("Could not generate a reset link:", linkErr)
      // Even if user not found, we should return success to prevent email enumeration attacks
      return NextResponse.json({ success: true, message: "If an account exists, a reset link was sent." })
    }

    /* 2. Take the code out of that link. Firebase called it `oobCode`; Supabase's
       verify URL carries the hashed token as `token`. The outgoing query name
       stays `oobCode` so /auth/action needs no change. */
    const url = new URL(rawLink)
    const oobCode = url.searchParams.get("token")

    if (!oobCode) {
      throw new Error("The generated reset link carried no token.")
    }

    // 3. Construct our own action URL, on our own origin
    const customLink = siteUrl(
      `/auth/action?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}`,
    )

    // 4. Send it
    const { error } = await resend.emails.send({
      from: MAIL_FROM.support,
      to: [email],
      subject: "Reset your password for AeroLearn 🚀",
      html: emailLayout({
        preheader: "Set a new AeroLearn password — the link works once.",
        heading: "Reset your password",
        body:
          emailParagraph(
            `Someone asked to reset the password for the AeroLearn account on <strong>${escapeHtml(
              String(email),
            )}</strong>. If that was you, pick a new one here.`,
          ) +
          emailParagraph(
            "The link works once. If it has already expired by the time you click it, ask for a " +
              "new one from the sign-in page.",
          ),
        cta: { label: "Choose a new password", href: customLink },
        footnote:
          "If you did not ask for this, ignore the email. Your password has not changed and your " +
          "account is untouched.",
      }),
    })

    if (error) {
      console.error("Resend Error:", error)
      return NextResponse.json({ error: "Failed to send email." }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Password reset link sent!" })
  } catch (error: any) {
    console.error("Custom Password Reset Error:", error)
    return NextResponse.json({ error: "Internal server error." }, { status: 500 })
  }
}
