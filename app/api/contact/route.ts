import { NextResponse } from "next/server"
import { Resend } from "resend"

import { MAIL_DOMAIN } from "@/lib/email-template"
import { clientIp } from "@/lib/rate-limit"
import { enforceSharedRateLimit } from "@/lib/shared-rate-limit"

const resend = new Resend(process.env.RESEND_API_KEY || "re_dummy")

/* Both derived: Resend only sends from a domain it has verified, so if the site
   moves and these do not, every contact form submission fails with a 403. */
const INBOX = `support@${MAIL_DOMAIN}`
const FROM = `AeroLearn Contact <contact@${MAIL_DOMAIN}>`

const LIMITS = { name: 120, email: 200, subject: 160, message: 4000 } as const

/**
 * This endpoint is public by necessity — a visitor has no account yet. It is
 * therefore rate limited per IP and carries a honeypot field. The counter moved
 * to `lib/rate-limit`, shared with the two auth-email routes that had none at
 * all; the database counter is shared across server instances.
 */
const RULE = { max: 5, windowMs: 10 * 60 * 1000 }

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

export async function POST(req: Request) {
  try {
    const limited = await enforceSharedRateLimit("contact", clientIp(req), RULE)
    if (limited) return limited

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
    }

    // Bots fill every field they find; a real visitor never sees this one.
    if (clean((body as Record<string, unknown>).company, 50)) {
      return NextResponse.json({ ok: true })
    }

    const name = clean((body as Record<string, unknown>).name, LIMITS.name)
    const email = clean((body as Record<string, unknown>).email, LIMITS.email)
    const subject = clean((body as Record<string, unknown>).subject, LIMITS.subject)
    const message = clean((body as Record<string, unknown>).message, LIMITS.message)

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Name, email and message are all required." },
        { status: 400 },
      )
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 })
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "The contact form isn't configured yet. Please email us directly." },
        { status: 503 },
      )
    }

    const { error } = await resend.emails.send({
      from: FROM,
      to: [INBOX],
      replyTo: email,
      subject: subject ? `Contact: ${subject}` : `Contact form message from ${name}`,
      // Plain text only — nothing the sender typed is interpolated into HTML.
      text: [
        `Name:    ${name}`,
        `Email:   ${email}`,
        `Subject: ${subject || "(none)"}`,
        "",
        message,
      ].join("\n"),
    })

    if (error) {
      console.error("[contact] resend error", error)
      return NextResponse.json({ error: "We couldn't send that. Please try again." }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[contact] unexpected error", err)
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 })
  }
}
