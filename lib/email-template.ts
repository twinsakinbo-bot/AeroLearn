/**
 * The one shell every AeroLearn email is built from.
 *
 * There were seven copies of this markup — welcome, verify-email,
 * reset-password and the four drip templates — and each carried its own copy of
 * the origin, the brand colours and a logo `<img>` pointing at `/icon.png`, a
 * file that is not in `public/`. So every one of them rendered a broken image,
 * and fixing that meant finding all seven.
 *
 * Written once, the markup can also be correct in ways the copies were not:
 *
 * - A centred `<table>` rather than `max-width` on a `<div>`. Outlook's Word
 *   rendering engine ignores `max-width`, so the copies ran the full width of a
 *   maximised window there.
 * - An aspect-correct logo box. Every copy forced `80px × 80px` onto artwork
 *   that is 366 × 358, squashing it.
 * - Escaped interpolation. A display name went straight into the HTML, so a
 *   profile name containing markup arrived as markup in someone's inbox.
 * - A preheader, so the inbox preview line is a summary instead of whatever
 *   text happened to come first.
 */

import { EMAIL_LOGO_HEIGHT, EMAIL_LOGO_URL, EMAIL_LOGO_WIDTH, SITE_HOST, siteUrl } from "@/lib/site"

/* The brand, as literals. Email clients strip <style> and custom properties, so
   every colour has to be inline — these are the values from globals.css that the
   old templates had each spelled out by hand. */
const NAVY = "#1E3A8A"
const BODY_TEXT = "#475569"
const MUTED_TEXT = "#94A3B8"
const CANVAS = "#F1F5F9"
const CARD = "#FFFFFF"
const HAIRLINE = "#E2E8F0"

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/**
 * The domain in the `From:` address.
 *
 * Normally the site's own — one env var moves the whole app and its mail
 * together. `RESEND_MAIL_DOMAIN` exists for the case where they differ, and
 * preview deployments are that case: point `NEXT_PUBLIC_SITE_URL` at a
 * `*.vercel.app` preview and the derived sender becomes an address on a domain
 * Resend has not verified, which fails every send with a 403. Set this to the
 * verified domain there.
 */
export const MAIL_DOMAIN = process.env.RESEND_MAIL_DOMAIN || SITE_HOST

/** The three senders, matching the three Resend inboxes already set up. */
export const MAIL_FROM = {
  welcome: `AeroLearn <welcome@${MAIL_DOMAIN}>`,
  support: `AeroLearn <support@${MAIL_DOMAIN}>`,
  hello: `AeroLearn <hello@${MAIL_DOMAIN}>`,
}

/**
 * Makes a value safe to drop into email HTML.
 *
 * Names and addresses come from user input and went into these templates raw.
 * Nothing about a mail client stops it rendering the markup that arrives.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** A body paragraph. `html` is trusted — escape anything user-supplied first. */
export function emailParagraph(html: string, opts?: { small?: boolean }): string {
  const size = opts?.small ? "14px" : "16px"
  const color = opts?.small ? MUTED_TEXT : BODY_TEXT
  return `<p style="margin:0 0 20px;color:${color};font-size:${size};line-height:1.65;">${html}</p>`
}

/** A bulleted list, for the "here's what you get" blocks. */
export function emailList(items: string[]): string {
  const lis = items
    .map((item) => `<li style="margin-bottom:8px;">${item}</li>`)
    .join("")
  return `<ul style="margin:0 0 20px;padding-left:22px;color:${BODY_TEXT};font-size:16px;line-height:1.6;">${lis}</ul>`
}

/**
 * The tinted callout the welcome mail uses for its getting-started list.
 * A flat tint, not a gradient: Outlook drops `linear-gradient` and renders the
 * panel transparent, which left the old welcome email's list floating.
 */
export function emailPanel(html: string): string {
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"`,
    ` style="margin:0 0 28px;background-color:#F8FAFC;border:1px solid ${HAIRLINE};border-radius:12px;">`,
    `<tr><td style="padding:20px 24px;">${html}</td></tr></table>`,
  ].join("")
}

/** A sub-heading inside a panel. */
export function emailSubheading(text: string): string {
  return `<h2 style="margin:0 0 12px;color:${NAVY};font-size:17px;font-weight:800;">${text}</h2>`
}

export type EmailCta = {
  label: string
  /** Site-relative path, or an absolute URL for a one-off action link. */
  href: string
  /** Cyan instead of navy — for the upgrade prompt, so it reads as the offer. */
  tone?: "brand" | "accent"
}

/**
 * The call-to-action button.
 *
 * A `<table>` with `bgcolor`, because Outlook will not paint a background on an
 * `<a>`; and a flat fill, because it drops `linear-gradient` entirely — which is
 * how the old upgrade button rendered as white text on white.
 */
export function emailCta({ label, href, tone = "brand" }: EmailCta): string {
  const url = href.startsWith("http") ? href : siteUrl(href)
  const fill = tone === "accent" ? "#0891B2" : NAVY
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:4px auto 8px;">`,
    `<tr><td align="center" bgcolor="${fill}" style="border-radius:50px;">`,
    `<a href="${url}" style="display:inline-block;padding:15px 34px;font-family:${FONT};`,
    `font-size:16px;font-weight:800;letter-spacing:0.3px;color:#FFFFFF;text-decoration:none;`,
    `border-radius:50px;">${label} &rarr;</a>`,
    `</td></tr></table>`,
  ].join("")
}

export type EmailLayout = {
  /** The inbox preview line. Not shown in the message body. */
  preheader: string
  /** The `<h1>`. Escape anything user-supplied. */
  heading: string
  /** Body HTML — build it from the helpers above. */
  body: string
  cta?: EmailCta
  /** Small print under the card's body, above the sign-off. */
  footnote?: string
}

/** Wraps body HTML in the logo header, white card and sign-off. */
export function emailLayout({ preheader, heading, body, cta, footnote }: EmailLayout): string {
  const logo =
    `<img src="${EMAIL_LOGO_URL}" width="${EMAIL_LOGO_WIDTH}" height="${EMAIL_LOGO_HEIGHT}"` +
    ` alt="AeroLearn" style="display:block;border:0;outline:none;` +
    `width:${EMAIL_LOGO_WIDTH}px;height:${EMAIL_LOGO_HEIGHT}px;" />`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>AeroLearn</title>
</head>
<body style="margin:0;padding:0;background-color:${CANVAS};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CANVAS};">
<tr><td align="center" style="padding:32px 16px 40px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td align="center" style="padding-bottom:26px;">
<a href="${siteUrl("/")}" style="text-decoration:none;">${logo}</a>
</td></tr>
<tr><td style="background-color:${CARD};border:1px solid ${HAIRLINE};border-radius:16px;padding:36px 32px;font-family:${FONT};">
<h1 style="margin:0 0 16px;color:${NAVY};font-size:25px;line-height:1.25;font-weight:900;">${heading}</h1>
${body}${cta ? emailCta(cta) : ""}${
    footnote
      ? `<p style="margin:24px 0 0;color:${MUTED_TEXT};font-size:13px;line-height:1.6;">${footnote}</p>`
      : ""
  }
</td></tr>
<tr><td align="center" style="padding-top:26px;font-family:${FONT};">
<p style="margin:0 0 4px;color:${MUTED_TEXT};font-size:14px;font-weight:600;">Happy learning!</p>
<p style="margin:0 0 14px;color:#64748B;font-size:14px;font-weight:700;">The AeroLearn Team</p>
<a href="${siteUrl("/")}" style="color:${MUTED_TEXT};font-size:13px;text-decoration:none;">${SITE_HOST}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
