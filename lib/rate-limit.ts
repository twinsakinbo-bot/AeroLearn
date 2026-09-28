/**
 * A per-IP counter for the few routes that have to stay public.
 *
 * Three of them send email: the contact form, the password-reset link and the
 * email-verification link. None can require a token — a visitor with no account
 * is exactly who uses them — and the last two had no limit of any kind, so one
 * loop could make AeroLearn mail-bomb any address the caller named, burn the
 * Resend quota and take the sending domain's reputation with it. Firebase's own
 * client SDK throttles these; a custom route replacing it has to do the same.
 *
 * Scope, stated plainly: the counter lives in module scope, so it is per-instance
 * and resets on every deploy. It stops a script, not a distributed flood. If that
 * matters, put a WAF rule or a shared store in front of it.
 */

interface Rule {
  max: number
  windowMs: number
}

const hits = new Map<string, number[]>()

/** Keeps the map from growing without bound on a long-lived instance. */
const MAX_KEYS = 5000

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}

/**
 * Records one attempt. `bucket` separates routes so a visitor who used the
 * contact form can still ask for a password reset.
 */
export function rateLimit(bucket: string, ip: string, rule: Rule): { ok: boolean; retryAfter: number } {
  const key = `${bucket}:${ip}`
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((at) => now - at < rule.windowMs)
  recent.push(now)

  if (hits.size > MAX_KEYS) hits.clear()
  hits.set(key, recent)

  if (recent.length <= rule.max) return { ok: true, retryAfter: 0 }

  const oldest = recent[0] ?? now
  return { ok: false, retryAfter: Math.ceil((rule.windowMs - (now - oldest)) / 1000) }
}
