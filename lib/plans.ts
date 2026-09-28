/**
 * The single source of truth for what can be sold and what it unlocks.
 *
 * This file exists because the list of paid plans used to be written out three
 * times — `isProUser` in lib/subscription.ts, `PRO_PLANS` in
 * app/api/ai-essay-grader/route.ts, and the `PLAN_DAYS` map in the admin queue —
 * with no type connecting them. That is a silent-money bug, not a cosmetic one:
 * you can add a plan to the upgrade page, a student pays for it, `isProUser`
 * does not recognise the id, and they get nothing while the money is kept. The
 * essay-grader check would have disagreed with the rest of the app on the same
 * account.
 *
 * So every plan id lives here once, and:
 *   - the upgrade page builds its cards from `PLANS`
 *   - `isProUser` and `PRO_PLANS` both derive from `isPaidPlan`
 *   - licence codes and the admin queue both read `planById`
 *   - expiry is computed from `days`, so nothing can invent its own duration
 *
 * `days: null` means "never expires", which is written as a null
 * `proExpiresAt` — the form `isProUser` already reads as permanent access.
 *
 * Prices are display strings, not numbers. Transfers are matched by eye against
 * the amount the student claims to have sent, and `PLAN_PRICE` keeps the naira
 * amount in one place for that comparison.
 */

export type PlanId =
  | "weekly"
  | "monthly"
  | "term"
  | "annual"
  | "jamb_sprint"
  | "waec_final"
  | "jamb_waec"
  | "lifetime"

export interface Plan {
  id: PlanId
  name: string
  /** Display price, e.g. "₦5,000". */
  price: string
  /** Naira amount, for matching a claimed transfer. */
  amount: number
  /**
   * Days of access granted per payment. Renewals extend from the later of now
   * and the expiry already on file, so a plan bought early is never shortened.
   * `null` = never expires.
   */
  days: number | null
  /** Suffix shown under the price, e.g. "per month". */
  cadence: string
  blurb: string
  features: string[]
  /** Exam-window plans get a tighter, more urgent framing on the upgrade page. */
  season?: "jamb" | "waec" | "neco" | "jamb_waec"
  /** Whether this plan appears on /app/upgrade. Lifetime and the annual tier are shown; nothing here is hidden by accident. */
  purchasable: boolean
  recommended?: boolean
}

export const PLANS: Plan[] = [
  {
    id: "weekly",
    name: "Weekly",
    price: "₦800",
    amount: 800,
    days: 7,
    cadence: "1 week",
    blurb: "For a short burst of revision before a test.",
    features: ["Every subject", "Unlimited past questions", "1 AI tutor session a day"],
    purchasable: true,
  },
  {
    id: "monthly",
    name: "Monthly",
    price: "₦2,500",
    amount: 2500,
    days: 30,
    cadence: "1 month",
    blurb: "The steady option if you prefer to pay as you go.",
    features: [
      "Every subject, JSS1 to SS3",
      "Unlimited WAEC, NECO and JAMB practice",
      "Unlimited timed mock exams",
      "AI tutor and essay grading",
    ],
    purchasable: true,
  },
  {
    id: "term",
    name: "One Term",
    price: "₦4,000",
    amount: 4000,
    days: 90,
    cadence: "one term",
    blurb: "A whole school term. Saves ₦3,500 over three months, paid once.",
    features: [
      "Everything in Monthly",
      "Three months of access in one transfer",
      "No renewal to remember mid-term",
    ],
    recommended: true,
    purchasable: true,
  },
  {
    id: "annual",
    name: "Full Year",
    price: "₦15,000",
    amount: 15000,
    days: 365,
    cadence: "one year",
    blurb: "₦15,000 against ₦30,000 for twelve months of Monthly.",
    features: ["Everything in One Term", "Twelve months in one payment", "Covers two exam seasons"],
    purchasable: true,
  },
  {
    id: "jamb_sprint",
    name: "JAMB Sprint",
    price: "₦5,000",
    amount: 5000,
    days: 42,
    cadence: "6 weeks",
    season: "jamb",
    blurb: "Six weeks of CBT-conditioned practice in the run-up to JAMB.",
    features: [
      "Everything in Monthly",
      "JAMB-format mocks on the clock",
      "Daily target built from your weak topics",
    ],
    purchasable: true,
  },
  {
    id: "waec_final",
    name: "WAEC Final Lap",
    price: "₦6,000",
    amount: 6000,
    days: 70,
    cadence: "10 weeks",
    season: "waec",
    blurb: "Ten weeks of SS3 revision through to the last WAEC paper.",
    features: [
      "Everything in Monthly",
      "WAEC and NECO papers with worked solutions",
      "Essay grading for every subject you sit",
    ],
    purchasable: true,
  },
  {
    id: "jamb_waec",
    name: "Both Exams",
    price: "₦9,000",
    amount: 9000,
    days: 210,
    cadence: "7 months",
    season: "jamb_waec",
    blurb: "JAMB and WAEC in one payment — ₦2,000 less than buying both separately.",
    features: [
      "Everything in Monthly",
      "Covers the JAMB window and the WAEC window",
      "One transfer, no renewal between the two",
    ],
    purchasable: true,
  },
  {
    id: "lifetime",
    name: "Lifetime",
    price: "₦25,000",
    amount: 25000,
    days: null,
    cadence: "one payment",
    blurb: "Pay once. Everything shipped from here is included.",
    features: ["Everything in Monthly", "No renewals, ever", "New subjects and features as they land"],
    purchasable: true,
  },
]

/** Lookup by id. Returns null rather than throwing — an unknown id is data, not a crash. */
export function planById(id: unknown): Plan | null {
  if (typeof id !== "string") return null
  return PLANS.find((plan) => plan.id === id) ?? null
}

export const PLAN_IDS: PlanId[] = PLANS.map((plan) => plan.id)

const PAID = new Set<string>(PLAN_IDS)

/**
 * Plans that unlock Pro. Includes `"pro"`, which is what the old approve button
 * wrote for every plan — those accounts exist in production and must keep the
 * access they paid for.
 */
export function isPaidPlan(id: unknown): boolean {
  return typeof id === "string" && (id === "pro" || PAID.has(id))
}

/** Days of access a plan grants. `null` = never expires. Unknown plans default to a month. */
export function planDays(id: unknown): number | null {
  const plan = planById(id)
  if (plan) return plan.days
  // `"pro"` was written without a duration, so treat it as the monthly plan it
  // replaced rather than expiring it or making it permanent.
  return id === "lifetime" ? null : 30
}

export function planName(id: unknown): string {
  return planById(id)?.name ?? (id === "pro" ? "Pro" : String(id ?? "Unknown plan"))
}

/** Plans the upgrade page offers, in the order they should be shown. */
export const PURCHASABLE_PLANS = PLANS.filter((plan) => plan.purchasable)

/**
 * Human-readable price for a claimed transfer, used by the verification queue to
 * flag a receipt that does not match the plan. Compared loosely — students
 * sometimes send a little more, and bank narratives are noisy.
 */
export function expectedAmount(id: unknown): number | null {
  return planById(id)?.amount ?? null
}
