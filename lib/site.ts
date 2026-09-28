/**
 * The public origin, written down once.
 *
 * It used to be hardcoded in about twenty files — `app/layout.tsx`,
 * `app/sitemap.ts`, `app/robots.ts`, the JSON-LD on the marketing home page and
 * every Resend template — and in two different spellings: the metadata and the
 * sitemap said `aerolearn.name.ng`, while all four email routes said
 * `www.aerolearn.name.ng`.
 *
 * Two spellings is not a style question. Google treats them as separate origins,
 * so the OAuth authorized domain, the canonical URL and the links inside
 * verification emails all have to agree or brand verification fails on a name
 * mismatch. Email clients also refuse to follow a redirect for an `<img src>`,
 * so a `www.` logo behind a bare-domain redirect renders as a broken image.
 *
 * Set `NEXT_PUBLIC_SITE_URL` to move the whole app to another domain. It is
 * `NEXT_PUBLIC_` because the PDF footer and the JSON-LD are rendered in the
 * browser; being inlined at build time is fine, since the origin cannot change
 * between requests.
 */

/* Keeps the app working with no env var set, which is how it shipped. */
const FALLBACK = "https://aerolearn.name.ng"

/** Origin with no trailing slash, so `${SITE_URL}/path` never doubles up. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || FALLBACK).replace(/\/+$/, "")

/** Bare host — for display, and for Google's "Authorized domain" box. */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "")

/** Absolute URL for a site-relative path. */
export function siteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`
}

/**
 * The logo for email templates.
 *
 * Every template pointed at `/icon.png`, which does not exist in `public/` — so
 * the welcome, verification and password-reset emails all rendered a broken
 * image.
 *
 * This is `public/aerolearn_logo.svg`, the site logo, transcoded to PNG at 2× the
 * display box. Same artwork, same pixels — that file is not really a vector, it
 * is a 202 KB SVG wrapping one base64 PNG, so nothing is lost. It has to be a
 * PNG because Gmail and Outlook both refuse to render an SVG in an `<img>`, and
 * at 31 KB instead of 202 KB it does not cost a student on mobile data anything
 * to see it.
 */
export const EMAIL_LOGO_URL = siteUrl("/aerolearn-logo-email.png")

/** Intrinsic size of that file, halved — it is a 2× asset. */
export const EMAIL_LOGO_WIDTH = 88
export const EMAIL_LOGO_HEIGHT = 86
