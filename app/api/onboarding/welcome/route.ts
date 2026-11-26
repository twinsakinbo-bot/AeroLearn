import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { requireUser } from "@/lib/api-auth"
import { enforceSharedRateLimit } from "@/lib/shared-rate-limit"
import { welcomeRecipient } from "@/lib/welcome-recipient"
import { getAdminAuth } from "@/lib/db-admin"

import {
  MAIL_FROM,
  emailLayout,
  emailList,
  emailPanel,
  emailParagraph,
  emailSubheading,
  escapeHtml,
} from "@/lib/email-template"

const resend = new Resend(process.env.RESEND_API_KEY || "re_dummy")

export async function POST(req: Request) {
  const gate = await requireUser(req)
  if (!gate.ok) return gate.response
  const limited = await enforceSharedRateLimit("welcome-email", gate.uid, { max: 1, windowMs: 24 * 60 * 60_000 })
  if (limited) return limited
  try {
    // Recipient identity comes only from Auth, never the request body/profile JSON.
    const recipient = welcomeRecipient(await getAdminAuth().getUser(gate.uid))
    if (!recipient) return NextResponse.json({ error: "Confirm your email first." }, { status: 403 })
    const { email, name } = recipient

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email service is not configured." },
        { status: 503 }
      )
    }

    if (!email || !name) {
      return NextResponse.json(
        { error: "Email and name are required." },
        { status: 400 }
      )
    }

    const safeName = escapeHtml(String(name))

    const { data, error } = await resend.emails.send({
      from: MAIL_FROM.welcome,
      to: [email],
      subject: 'Welcome to AeroLearn! 🚀',
      html: emailLayout({
        preheader: `Your account is ready, ${safeName} — here are the first three things to do.`,
        heading: `Welcome to AeroLearn, ${safeName}! 🚀`,
        body:
          emailParagraph(
            "Glad to have you. AeroLearn is built to do one thing well: get you to the point " +
              "where an exam paper holds no surprises.",
          ) +
          emailPanel(
            emailSubheading("Three things to do first") +
              emailList([
                "Set your class and subjects in <strong>Settings</strong>, so nothing on your screen is irrelevant",
                "Generate a <strong>practice quiz</strong> on any topic — it is instant, and every answer comes with a worked explanation",
                "Ask the <strong>AI tutor</strong> about whatever you got wrong",
              ]),
          ) +
          emailParagraph(
            "Then build a <strong>timetable</strong> you will actually keep, and let the streak do the rest.",
          ),
        cta: { label: "Go to your dashboard", href: "/app" },
      }),
    })

    if (error) {
      console.error("Resend Error:", error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error("Welcome Email Error:", error)
    return NextResponse.json(
      { error: "Failed to send welcome email." },
      { status: 500 }
    )
  }
}
