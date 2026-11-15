import { isPaidPlan } from "@/lib/plans"

type Profile = { subscription?: unknown; proExpiresAt?: unknown; trustPassRequestId?: unknown }

function expiryDate(raw: unknown): Date | null {
  if (raw == null) return null
  if (raw instanceof Date) return raw
  if (typeof raw === "object" && "toDate" in raw && typeof raw.toDate === "function") {
    return raw.toDate() as Date
  }
  if (typeof raw === "object" && "seconds" in raw && typeof raw.seconds === "number") {
    return new Date(raw.seconds * 1000)
  }
  return new Date(raw as string)
}

/** Only Lifetime or a valid, unexpired paid grant unlocks Pro. */
export function isProUser(profile: Profile | null | undefined, now = Date.now()): boolean {
  if (!profile || !isPaidPlan(profile.subscription)) return false
  if (profile.subscription === "lifetime") return true
  if (profile.proExpiresAt == null) return true // legacy permanent Pro grants
  const expiry = expiryDate(profile.proExpiresAt)
  return Boolean(expiry && Number.isFinite(expiry.getTime()) && expiry.getTime() > now)
}

/** A finite code must never replace permanent paid access. */
export function hasPermanentPaidAccess(profile: Profile | null | undefined): boolean {
  return Boolean(profile && isPaidPlan(profile.subscription) &&
    (profile.subscription === "lifetime" || profile.proExpiresAt == null))
}

export type TrustPassDecision = "grant" | "invalid-receipt" | "already-pro" | "already-used"

export function trustPassDecision(
  profile: Profile,
  receipt: { userId?: unknown; status?: unknown; receiptUrl?: unknown } | null | undefined,
  uid: string,
  now = Date.now(),
): TrustPassDecision {
  if (!receipt || receipt.userId !== uid || receipt.status !== "pending" || !receipt.receiptUrl) {
    return "invalid-receipt"
  }
  if (isProUser(profile, now)) return "already-pro"
  if (profile.subscription === "pro" || profile.trustPassRequestId) return "already-used"
  return "grant"
}
