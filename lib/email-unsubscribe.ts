import { createHmac, timingSafeEqual } from "node:crypto"

import { siteUrl } from "@/lib/site"

function signingKey(): Buffer {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error("Email unsubscribe signing key is not configured")
  return createHmac("sha256", secret).update("aerolearn-study-email-unsubscribe-v1").digest()
}

function signature(uid: string, email: string): Buffer {
  return createHmac("sha256", signingKey())
    .update(`${uid}:${email.trim().toLowerCase()}`)
    .digest()
}

export function unsubscribeToken(uid: string, email: string): string {
  return `${uid}.${signature(uid, email).toString("base64url")}`
}

export function verifyUnsubscribeToken(token: string, email: string): string | null {
  const match = /^([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token)
  if (!match) return null
  const actual = Buffer.from(match[2], "base64url")
  const expected = signature(match[1], email)
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? match[1] : null
}

export function unsubscribeUrl(uid: string, email: string): string {
  const url = new URL(siteUrl("/api/email/unsubscribe"))
  // The bare domain redirects to www in production. Mailbox one-click POSTs
  // should reach the endpoint directly instead of depending on a redirect.
  if (url.hostname === "aerolearn.name.ng") url.hostname = "www.aerolearn.name.ng"
  url.searchParams.set("token", unsubscribeToken(uid, email))
  return url.toString()
}

export function unsubscribeHeaders(url: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }
}

export function studyEmailFootnote(url: string): string {
  return `You receive study and learning-tip emails because you have an AeroLearn account. ` +
    `<a href="${url}" style="color:#1E3A8A;">Unsubscribe from these emails</a> or ` +
    `<a href="${siteUrl("/app/settings")}" style="color:#1E3A8A;">change your preferences</a>.`
}
