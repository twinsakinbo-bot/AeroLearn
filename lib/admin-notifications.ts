import { Resend } from "resend"

import { getAdminDb } from "@/lib/db-admin"
import { emailLayout, emailParagraph, escapeHtml, MAIL_FROM } from "@/lib/email-template"

export async function adminNotificationEmails(): Promise<string[]> {
  const configured = process.env.ADMIN_NOTIFICATION_EMAIL?.trim()
  if (configured) return configured.split(",").map((item) => item.trim()).filter(Boolean)
  const users = await getAdminDb().collection("users").where("role", "==", "admin").get()
  return Array.from(new Set(users.docs.map((row) => String(row.data().email || "").trim()).filter(Boolean)))
}

export async function sendAdminNotification(options: {
  subject: string
  heading: string
  paragraphs: string[]
  href: string
  label: string
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim()
  const recipients = await adminNotificationEmails()
  if (!key || !recipients.length) return false
  const mail = new Resend(key)
  const body = options.paragraphs.map((item) => emailParagraph(escapeHtml(item))).join("")
  const result = await mail.emails.send({
    from: MAIL_FROM.hello,
    to: recipients,
    subject: options.subject,
    html: emailLayout({
      preheader: options.subject,
      heading: escapeHtml(options.heading),
      body,
      cta: { label: options.label, href: options.href },
    }),
  })
  if (result.error) throw new Error(`Admin email failed: ${result.error.message}`)
  return true
}
