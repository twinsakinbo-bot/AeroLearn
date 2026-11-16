import { NextResponse } from "next/server"

import { getAdminDb } from "@/lib/db-admin"
import { verifyUnsubscribeToken } from "@/lib/email-unsubscribe"
import { emailLayout, emailParagraph } from "@/lib/email-template"

export const dynamic = "force-dynamic"

const HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; img-src https:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
}

function page(heading: string, body: string, formToken?: string, status = 200) {
  const form = formToken
    ? `<form method="post" action="/api/email/unsubscribe?token=${encodeURIComponent(formToken)}" style="margin:24px 0;">` +
      `<button type="submit" style="background:#1E3A8A;color:white;border:0;border-radius:12px;padding:14px 22px;font-size:16px;font-weight:700;cursor:pointer;">Stop study emails</button>` +
      `</form>`
    : ""
  return new NextResponse(emailLayout({ preheader: heading, heading, body: emailParagraph(body) + form }), {
    status,
    headers: { ...HEADERS, "Content-Type": "text/html; charset=utf-8" },
  })
}

async function userFor(token: string) {
  const uid = token.split(".")[0]
  if (!/^[a-f0-9-]{36}$/.test(uid)) return null
  const ref = getAdminDb().collection("users").doc(uid)
  const snapshot = await ref.get()
  const email = snapshot.data()?.email
  if (!snapshot.exists || typeof email !== "string" || verifyUnsubscribeToken(token, email) !== uid) return null
  return ref
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || ""
  try {
    if (!(await userFor(token))) return page("This link is unavailable", "The unsubscribe link is invalid or no longer works.", undefined, 400)
    return page("Choose your study emails", "Stop study reminders and learning tips? Account, security and plan emails will still arrive.", token)
  } catch (error) {
    console.error("Could not load unsubscribe link:", error)
    return page("Please try again", "We could not load your email preference right now.", undefined, 503)
  }
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || ""
  try {
    const ref = await userFor(token)
    if (!ref) return page("This link is unavailable", "The unsubscribe link is invalid or no longer works.", undefined, 400)
    await ref.update({ studyEmailsEnabled: false, studyEmailsUnsubscribedAt: new Date() })
    return page("Study emails are off", "You will no longer receive study reminders or learning tips. Account, security and plan emails will still arrive. You can turn study emails back on in Settings.")
  } catch (error) {
    console.error("Could not unsubscribe from study emails:", error)
    return page("Please try again", "Your preference could not be saved right now. Please try again.", undefined, 503)
  }
}
