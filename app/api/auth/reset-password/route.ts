import { NextResponse } from "next/server"
import { getAdminAuth } from "@/lib/db-admin"
import { Resend } from "resend"

import { MAIL_FROM, emailLayout, emailParagraph, escapeHtml } from "@/lib/email-template"
import { clientIp } from "@/lib/rate-limit"
import { enforceSharedRateLimit } from "@/lib/shared-rate-limit"
import { passwordResetResult } from "@/lib/password-reset"
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
  const limited = await enforceSharedRateLimit("reset-password-ip", clientIp(req), RULE)
  if (limited) return limited
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  }
  const emailLimited = await enforceSharedRateLimit("reset-password-address", email, RULE)
  if (emailLimited) return emailLimited

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.error("RESEND_API_KEY is not set")
    return NextResponse.json({ error: "Email service not configured." }, { status: 503 })
  }
  const resend = new Resend(resendKey)

  const result = await passwordResetResult(async () => {
    const rawLink = await getAdminAuth().generatePasswordResetLink(email)

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

    if (error) throw error
  })
  return NextResponse.json(result)
}
