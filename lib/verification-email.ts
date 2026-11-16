import { Resend } from "resend"

import { MAIL_FROM, escapeHtml } from "@/lib/email-template"
import { EMAIL_LOGO_URL, SITE_HOST, siteUrl } from "@/lib/site"

export function verificationEmailHtml(email: string, link: string): string {
  const safeEmail = escapeHtml(email)
  const safeLink = escapeHtml(link)

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Confirm your AeroLearn account</title></head>
<body style="margin:0;padding:0;background:#f5f7fb;color:#15213b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Confirm your email to start learning with AeroLearn.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f7fb;"><tr><td align="center" style="padding:44px 16px 56px;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;">
<tr><td style="padding:0 4px 28px;"><a href="${siteUrl("/")}" style="display:inline-block;text-decoration:none;"><img src="${EMAIL_LOGO_URL}" width="44" height="43" alt="AeroLearn" style="border:0;display:block;width:44px;height:43px;"></a></td></tr>
<tr><td style="padding:0;background:#ffffff;border:1px solid #e5eaf3;border-radius:24px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td style="padding:42px 44px 0;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="54" height="54" align="center" valign="middle" style="width:54px;height:54px;border-radius:16px;background:#eaf0ff;color:#2146a2;font-size:28px;line-height:54px;font-weight:700;">✓</td></tr></table>
<p style="margin:30px 0 10px;color:#597095;font-size:11px;line-height:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">One last step</p>
<h1 style="margin:0;color:#142342;font-size:34px;line-height:1.16;font-weight:750;letter-spacing:-1.1px;">Make it yours.</h1>
<p style="margin:18px 0 0;color:#52617a;font-size:16px;line-height:1.7;">Confirm <strong style="color:#142342;">${safeEmail}</strong> to activate your AeroLearn account and pick up where you left off.</p>
</td></tr>
<tr><td style="padding:30px 44px 28px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#2346a5" style="border-radius:12px;background:#2346a5;"><a href="${safeLink}" style="display:inline-block;padding:16px 25px;color:#ffffff;text-decoration:none;font-size:15px;line-height:20px;font-weight:700;">Confirm email &nbsp;→</a></td></tr></table>
</td></tr>
<tr><td style="padding:24px 44px 36px;border-top:1px solid #edf0f5;"><p style="margin:0 0 9px;color:#6b7890;font-size:13px;line-height:1.6;">This link works once. If the button does not open, copy this address into your browser:</p><a href="${safeLink}" style="color:#2346a5;font-size:12px;line-height:1.6;word-break:break-all;">${safeLink}</a></td></tr>
</table></td></tr>
<tr><td style="padding:26px 4px 0;color:#8a95a8;font-size:12px;line-height:1.7;">If you did not create an account, you can ignore this message.<br>© AeroLearn · <a href="${siteUrl("/")}" style="color:#6b7890;text-decoration:none;">${SITE_HOST}</a></td></tr>
</table></td></tr></table></body></html>`
}

export async function sendVerificationEmail(email: string, link: string): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error("Email service is not configured.")
  const { error } = await new Resend(key).emails.send({
    from: MAIL_FROM.support,
    to: [email],
    subject: "Confirm your AeroLearn account",
    html: verificationEmailHtml(email, link),
  })
  if (error) throw new Error(error.message)
}
