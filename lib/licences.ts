/**
 * Prepaid licence codes: how AeroLearn gets sold without a payment processor.
 *
 * The problem this solves is specific. Pro is paid for by bank transfer and
 * checked by hand, which caps how many sales are possible — every one of them
 * routes through a person opening a screenshot. It also means the only seller is
 * the site owner.
 *
 * A code removes both constraints. Codes are minted here, handed to a reseller,
 * a school, a class rep or a sponsor, and *they* collect the transfer and pass on
 * the code. Redemption credits access immediately, with no receipt, no waiting
 * and no verification queue. Money moves through whoever sold the code; the only
 * party that needs a bank account is the one who minted it.
 *
 * Design decisions worth knowing:
 *
 * - **Codes are random, not derived.** A tempting alternative is a signed
 *   self-validating code, so nothing has to be stored. That cannot be revoked,
 *   cannot be marked used without a shared state anyway, and leaks the plan
 *   format. So the code is entropy from `crypto.randomBytes`, and the row is the
 *   source of truth. `AL-XXXX-XXXX-XXXX` reads as 36 bits of alphabet space but
 *   is 12 characters from a 32-symbol set — about 2^60 — so guessing one is not
 *   a threat worth designing around.
 *
 * - **Redemption is atomic in SQL, not in application code.** `redeemLicenceCode`
 *   is an `UPDATE ... WHERE status = 'available' ... RETURNING` inside a
 *   function. Two students submitting the same code at once cannot both get
 *   access, which a read-then-write would allow. That is the one place a race
 *   here actually costs money.
 *
 * - **The redeeming uid is recorded on the code.** A reseller who is cheated can
 *   be shown exactly who used their code and when. It also lets a code be
 *   re-issued to the same account without a refund fight.
 *
 * - **Expiry extends, never shortens.** Same rule the manual queue follows: a
 *   student redeeming a second term while 20 days remain gets those 20 days plus
 *   the new term, not a reset.
 *
 * - **Codes never appear in a URL or a log line.** One lookup by exact code, one
 *   response shape, and the admin list is the only place they are shown in full.
 */
import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { planById, type PlanId } from "@/lib/plans"

/**
 * Crockford-style alphabet: no I, L, O or U, so a code read aloud over the phone
 * or copied from a WhatsApp screenshot cannot be mis-transcribed into a dead
 * code. Students type these by hand far more often than you would expect.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

const GROUPS = 3
const GROUP_SIZE = 4
const PREFIX = "AL"

/** One lookup per attempt, per account. Redeeming is a 6-second action, not a loop. */
export const REDEEM_WINDOW_MS = 15 * 60 * 1000
export const REDEEM_MAX_ATTEMPTS = 8

export interface LicenceCode {
  code: string
  planId: PlanId
  /** Uppercase, dash-stripped — what the lookup indexes on. */
  key: string
}

/**
 * A code's stored identity is its SHA-256 hash, never the code itself. The table
 * can be read in full by anyone who gets a database dump and still yield not one
 * working code — which matters more here than usual, because codes *are* money
 * and a student support workflow needs to look them up by text. Lookup is by
 * exact id, computed the same way in `redeem_licence_code`, so a reseller can
 * hand over a code and be told who redeemed it without the plaintext being kept.
 */
export function codeId(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex")
}

/** Strip spaces and dashes, upper-case. Accepts whatever a student pasted in. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

/** `AL12345678JKMN` -> `AL-1234-5678-JKMN`, for display only. */
export function formatCode(code: string): string {
  const body = normalizeCode(code).replace(new RegExp(`^${PREFIX}`), "")
  const chunks = body.match(/.{1,4}/g) ?? []
  return [PREFIX, ...chunks].join("-")
}

/** Is this even shaped like a code? Cheap pre-check so obvious garbage never reaches the database. */
export function looksLikeCode(raw: string): boolean {
  return new RegExp(`^${PREFIX}[0-9A-HJKMNP-TV-Z]{${GROUPS * GROUP_SIZE}}$`).test(normalizeCode(raw))
}

function randomChars(count: number): string {
  // Rejection-free: 32 symbols, so one byte per character wastes nothing.
  const bytes = randomBytes(count)
  let out = ""
  for (let i = 0; i < count; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

/**
 * Mint one code for a plan. Unknown plan ids throw — a code that grants nothing
 * is worse than a failed batch, because it is discovered by a paying customer.
 */
export function generateCode(planId: PlanId | string): LicenceCode {
  if (!planById(planId)) {
    throw new Error(`"${String(planId)}" is not a sellable plan.`)
  }
  const body = Array.from({ length: GROUPS }, () => randomChars(GROUP_SIZE)).join("")
  const code = `${PREFIX}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`
  return { code, planId: planId as PlanId, key: normalizeCode(code) }
}

/**
 * Mint a batch, skipping any code that collides with the alphabet's birthday
 * problem (it will not happen at any realistic volume, but a duplicate code in a
 * printed batch is a support ticket you cannot resolve).
 */
export function generateCodes(planId: PlanId | string, quantity: number): LicenceCode[] {
  const count = Math.max(1, Math.min(500, Math.floor(quantity)))
  const seen = new Set<string>()
  const out: LicenceCode[] = []
  let guard = 0
  while (out.length < count && guard < count * 20) {
    guard++
    const entry = generateCode(planId)
    if (seen.has(entry.key)) continue
    seen.add(entry.key)
    out.push(entry)
  }
  return out
}

/**
 * Days of access to grant, extending from the later of now and the expiry
 * already on file. Shared by the redeem route and the manual queue so the two
 * cannot disagree about what a renewal means.
 */
export function expiryFrom(planId: string, current: Date | null): Date | null {
  const plan = planById(planId)
  const days = plan ? plan.days : planId === "lifetime" ? null : 30
  if (days === null) return null
  const from = current && current.getTime() > Date.now() ? current.getTime() : Date.now()
  return new Date(from + days * 86_400_000)
}

/** What the redeem route returns. Deliberately narrow — see the response contract below. */
export type RedeemResult =
  | { ok: true; planId: PlanId; planName: string; expiresAt: string | null; extendedFrom: string | null }
  | { ok: false; reason: RedeemFailure; message: string }

export type RedeemFailure =
  | "not_found"
  | "used"
  | "cancelled"
  | "malformed"
  | "throttled"
  | "unauthenticated"
  | "storage"
  | "server"

/**
 * The one user-facing place a code is turned into access.
 *
 * Response contract, stated because it is a security boundary: the caller is
 * authenticated, so telling them "this code was already redeemed" is not a
 * disclosure risk the way it would be on a public form — but it *is* still
 * information a student fishing for codes can use to tell a real-but-used code
 * from a never-existed one. That trade is made deliberately, because the
 * alternative hurts the honest case: a student whose reseller sold them a
 * recycled code needs to be told that, and "code not found" would send them back
 * to the reseller with no proof. The alphabet size makes guessing an unused code
 * impractical regardless, so the enumeration value is near zero.
 */
export async function redeemLicenceCode(rawCode: string, uid: string): Promise<RedeemResult> {
  if (!looksLikeCode(rawCode)) {
    return {
      ok: false,
      reason: "malformed",
      message: "That does not look like an AeroLearn code. Codes start with AL- and have twelve characters.",
    }
  }

  const { getSupabaseAdmin, isSupabaseAdminConfigured } = await import("@/lib/supabase/admin")
  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false,
      reason: "storage",
      message: "Code redemption is not available right now. Try again shortly.",
    }
  }

  const supabase = getSupabaseAdmin()
  const key = normalizeCode(rawCode)

  const { data, error } = await supabase.rpc("redeem_licence_code", {
    p_key: key,
    p_uid: uid,
  })

  if (error) {
    console.error("redeem_licence_code failed:", error.message)
    return {
      ok: false,
      reason: "server",
      message: "We could not check that code just now. If you have already used it, your access may already be active.",
    }
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
  if (!row) {
    return { ok: false, reason: "not_found", message: "No code matches that. Check for a mistyped character." }
  }

  const status = String(row.status ?? "")
  if (status === "used") {
    return {
      ok: false,
      reason: "used",
      message: "This code has already been redeemed. If someone sold it to you twice, tell us who and we will sort it out.",
    }
  }
  if (status === "cancelled") {
    return { ok: false, reason: "cancelled", message: "This code was cancelled and no longer works." }
  }
  if (status !== "ok") {
    return { ok: false, reason: "server", message: "Something went wrong applying that code. Nothing was lost — try once more." }
  }

  return {
    ok: true,
    planId: String(row.plan_id) as PlanId,
    planName: planById(String(row.plan_id))?.name ?? "Pro",
    expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null,
    extendedFrom: row.extended_from ? new Date(String(row.extended_from)).toISOString() : null,
  }
}

/**
 * CSV for printing or sending in a WhatsApp batch. Plain text, no BOM, no quotes
 * needed — plan ids and codes never contain a comma.
 */
export function codesToCsv(
  rows: Array<{ code: string; planId: string; createdAt: string }>,
): string {
  const header = "code,plan,created"
  const body = rows.map((r) => `${r.code},${planById(r.planId)?.name ?? r.planId},${r.createdAt}`)
  return [header, ...body].join("\r\n")
}
