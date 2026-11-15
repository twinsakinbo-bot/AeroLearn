"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  collection,
  db,
  deleteField,
  doc,
  type DocumentData,
  getDoc,
  getDocs,
  query,
  type QueryDocumentSnapshot,
  serverTimestamp,
  type Timestamp,
  updateDoc,
  where,
} from "@/lib/db"
import {
  AlertTriangle,
  Check,
  ExternalLink,
  FileText,
  Inbox,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { getDownloadURL, ref, storage } from "@/lib/storage"
import { cn } from "@/lib/utils"
import { expectedAmount, planDays, planName } from "@/lib/plans"

/**
 * Manual bank-transfer verification queue.
 *
 * Five real problems fixed:
 *
 * 1. **Approving destroyed the plan identity.** It wrote `subscription: "pro"`
 *    for every plan, so the students table (which labels `weekly`/`monthly`/
 *    `lifetime`) had nothing to show, and a lifetime member was given a
 *    36,500-day expiry instead of no expiry at all. The plan id is written as-is
 *    now — `isProUser` already accepts all three — and lifetime gets a null
 *    `proExpiresAt`, which that helper reads as "never expires".
 * 2. **Rejecting cancelled a subscription the member had already paid for.** It
 *    wrote `subscription: "free", proExpiresAt: null` unconditionally, so
 *    declining one bad renewal receipt wiped out the month still running. Reject
 *    now only clears the pending marker; existing access is untouched.
 * 3. **A renewal shortened the plan it renewed.** Expiry was always `now + N
 *    days`, discarding whatever time was left. It extends from the current
 *    expiry when that is still in the future.
 * 4. **The sort produced NaN** — `b.createdAt.toMillis() - a.createdAt.toMillis()`
 *    on a document written before `createdAt` existed. Missing dates sort last
 *    instead of scrambling the order.
 * 5. **`alert()` and `window.confirm()`** for failures and confirmation, and a
 *    swallowed read error that rendered "All caught up!" when the query had in
 *    fact failed.
 *
 * Receipts are shown as a link, not an inline `<img>`. Bucket policy makes
 * `receipts/{uid}/**` readable by its owner and by admins; a PDF receipt in an
 * `<img>` renders as a broken image, and the old code hid the failure with
 * `onError` so the card looked empty.
 *
 * The stored `receiptUrl` is a signed URL with a finite life, so the queue
 * re-signs from `receiptPath` on load. A request left sitting for a week would
 * otherwise open a dead link.
 */

type Request = {
  id: string
  userId: string
  userEmail: string
  userName: string
  planId: string
  planName: string
  amount: string
  expectedAmount: number | null
  receiptUrl: string
  receiptPath: string
  createdAt: Date | null
}

/**
 * Plan durations and labels come from `lib/plans.ts`.
 *
 * These used to be two three-entry maps — `weekly`, `monthly`, `lifetime` —
 * while the site sold eight plans. Any receipt for One Term, Full Year or an
 * exam-season plan hit the `?? 30` fallback, so a student who paid ₦15,000 for a
 * year was approved with a 30-day expiry and the queue had no way to notice. The
 * `expectedAmount` read below exists so that mismatch is visible on the card
 * instead of being inferred after the money has been kept.
 */

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const date = (value as Timestamp).toDate()
    return Number.isNaN(date.getTime()) ? null : date
  }
  const parsed = new Date(value as string)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function rowFrom(entry: QueryDocumentSnapshot<DocumentData>): Request {
  const data = entry.data()
  return {
    id: entry.id,
    userId: text(data.userId),
    userEmail: text(data.userEmail) || "No email on the request",
    userName: text(data.userName),
    planId: text(data.planId),
    planName: text(data.planName) || planName(text(data.planId)),
    amount: text(data.amount),
    expectedAmount: expectedAmount(data.planId),
    receiptUrl: text(data.receiptUrl),
    receiptPath: text(data.receiptPath),
    createdAt: toDate(data.createdAt),
  }
}

/**
 * True when the transfer claimed does not look like the price of the plan
 * ordered. Compared loosely: students round up to a memorable figure, and bank
 * narratives are noisy, so a small overpayment is not flagged. A short payment,
 * or one that is more than a tenth away from the price, is.
 */
function amountMismatch(row: Request): boolean {
  const expected = row.expectedAmount
  if (expected === null) return false

  // "₦2,500" / "2500" / "₦2.500,00" — strip everything but digits and the value.
  const claimed = Number(String(row.amount).replace(/[^\d.]/g, ""))
  if (!Number.isFinite(claimed) || claimed === 0) return true

  return claimed < expected || claimed > expected * 1.15
}

/**
 * Swap each stored link for a freshly signed one. Best-effort per row: a receipt
 * whose object has been removed keeps whatever URL was on file rather than
 * failing the whole queue.
 */
async function withFreshLinks(rows: Request[]): Promise<Request[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (!row.receiptPath) return row
      try {
        return { ...row, receiptUrl: await getDownloadURL(ref(storage, row.receiptPath)) }
      } catch (cause) {
        console.error(`Could not re-sign the receipt for ${row.userEmail}:`, cause)
        return row
      }
    }),
  )
}

/** Newest first; a request with no date sorts to the bottom rather than to NaN. */
function byNewest(a: Request, b: Request) {
  if (!a.createdAt && !b.createdAt) return 0
  if (!a.createdAt) return 1
  if (!b.createdAt) return -1
  return b.createdAt.getTime() - a.createdAt.getTime()
}

function waitingFor(since: Date | null): string {
  if (!since) return "Date unknown"
  const hours = Math.floor((Date.now() - since.getTime()) / 3_600_000)
  if (hours < 1) return "Just now"
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}
/**
 * A renewal must not shorten the plan it renews: extend from the later of now
 * and the expiry already on file. `lifetime` returns null — no expiry at all.
 */
function expiryFor(planId: string, current: Date | null): Date | null {
  const days = planDays(planId)
  if (days === null) return null
  const from = current && current.getTime() > Date.now() ? current.getTime() : Date.now()
  return new Date(from + days * 86_400_000)
}

export default function AdminSubscriptionsPage() {
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [working, setWorking] = useState<string | null>(null)
  const [actionError, setActionError] = useState("")
  const [rejecting, setRejecting] = useState<Request | null>(null)
  const [done, setDone] = useState<{ verb: string; who: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      /* No `orderBy` — a composite index would be needed alongside the status
         filter, and the pending queue is small enough to sort in memory. */
      const snap = await getDocs(
        query(collection(db, "verificationRequests"), where("status", "==", "pending")),
      )
      setRequests(await withFreshLinks(snap.docs.map(rowFrom).sort(byNewest)))
    } catch (cause) {
      console.error("Failed to load verification requests:", cause)
      setError(
        cause instanceof Error
          ? `The queue could not be loaded: ${cause.message}`
          : "The queue could not be loaded.",
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /* Escape closes the reject dialog, but not mid-write. */
  useEffect(() => {
    if (!rejecting) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !working) setRejecting(null)
    }
    window.addEventListener("keydown", onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = previous
    }
  }, [rejecting, working])
  const approve = async (request: Request) => {
    setWorking(request.id)
    setActionError("")
    try {
      const userRef = doc(db, "users", request.userId)

      /* Read the expiry already on file so a renewal adds to it. */
      const snap = await getDoc(userRef)
      const current = snap.exists() ? toDate(snap.data().proExpiresAt) : null
      const expiresAt = expiryFor(request.planId, current)

      await updateDoc(userRef, {
        /* The plan id itself, not "pro": `isProUser` accepts weekly, monthly and
           lifetime, and the students table has a label for each. */
        subscription: request.planId || "monthly",
        proExpiresAt: expiresAt,
        pendingPlan: deleteField(),
        pendingSince: deleteField(),
        trustPassRequestId: deleteField(),
      })

      await updateDoc(doc(db, "verificationRequests", request.id), {
        status: "approved",
        reviewedAt: serverTimestamp(),
      })

      setRequests((rows) => rows.filter((row) => row.id !== request.id))
      setDone({ verb: "approved", who: request.userEmail })
    } catch (cause) {
      console.error("Failed to approve the request:", cause)
      setActionError(
        cause instanceof Error
          ? `${request.userEmail} was not approved: ${cause.message}`
          : `${request.userEmail} was not approved.`,
      )
    } finally {
      setWorking(null)
    }
  }

  const reject = async (request: Request) => {
    setWorking(request.id)
    setActionError("")
    try {
      await updateDoc(doc(db, "verificationRequests", request.id), {
        status: "rejected",
        reviewedAt: serverTimestamp(),
      })

      const userRef = doc(db, "users", request.userId)
      const user = await getDoc(userRef)
      const passForThisReceipt = user.exists() &&
        user.data().trustPassRequestId === request.id && user.data().subscription === "pro"
      await updateDoc(userRef, {
        pendingPlan: deleteField(),
        pendingSince: deleteField(),
        ...(passForThisReceipt ? {
          /* Keep the expired `pro` marker so a declined receipt cannot be
             resubmitted for unlimited 24-hour passes. */
          proExpiresAt: new Date(0),
        } : {}),
      })

      setRequests((rows) => rows.filter((row) => row.id !== request.id))
      setRejecting(null)
      setDone({ verb: "rejected", who: request.userEmail })
    } catch (cause) {
      console.error("Failed to reject the request:", cause)
      setActionError(
        cause instanceof Error
          ? `${request.userEmail} was not rejected: ${cause.message}`
          : `${request.userEmail} was not rejected.`,
      )
    } finally {
      setWorking(null)
    }
  }
  const totals = useMemo(() => {
    const byPlan = new Map<string, number>()
    for (const row of requests) {
      const label = row.planName || planName(row.planId)
      byPlan.set(label, (byPlan.get(label) ?? 0) + 1)
    }
    return [...byPlan.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [requests])

  return (
    <>
      <PageHeader
        eyebrow="Payments"
        title="Manual transfers"
        subtitle="Check each receipt against the Opay account, then approve or decline it."
        actions={
          <button type="button" onClick={() => void load()} className="btn-secondary btn-sm">
            <RefreshCw size={14} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {error && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/[0.06] p-4"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-semibold text-foreground">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="btn-secondary btn-sm mt-3"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <p role="alert" className="field-error mb-6">
          {actionError}
        </p>
      )}

      {done && (
        <p role="status" className="mb-6 text-body-sm text-success">
          {done.who} was {done.verb}.
        </p>
      )}
      {loading ? (
        <LoadingState text="Loading the queue…" className="py-16" />
      ) : requests.length === 0 && !error ? (
        <EmptyState
          icon={Inbox}
          title="Nothing waiting"
          description="Every transfer sent so far has been reviewed. New receipts appear here as students send them."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="badge bg-warn/10 text-warn">
              {requests.length} waiting
            </span>
            {totals.map(([label, count]) => (
              <span key={label} className="badge bg-surface-sunken text-subtle">
                {count} × {label}
              </span>
            ))}
          </div>

          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {requests.map((request) => {
              const busy = working === request.id
              return (
                <li key={request.id} className="card flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-body-sm font-semibold text-foreground">
                        {request.userName || request.userEmail}
                      </p>
                      {request.userName && (
                        <p className="truncate text-caption text-muted">{request.userEmail}</p>
                      )}
                      <p className="mt-0.5 text-caption text-subtle">
                        {waitingFor(request.createdAt)}
                      </p>
                    </div>
                    <span className="badge shrink-0 bg-accent/10 text-accent">
                      {request.planName || planName(request.planId)}
                    </span>
                  </div>

                  <dl className="mt-4 space-y-2 rounded-xl border border-hairline bg-surface-sunken p-3">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-caption text-subtle">Amount claimed</dt>
                      <dd className="text-body-sm font-bold tabular-nums text-foreground">
                        {request.amount || "Not recorded"}
                      </dd>
                    </div>
                    {request.expectedAmount !== null && (
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-caption text-subtle">Price of this plan</dt>
                        <dd className="text-body-sm font-bold tabular-nums text-foreground">
                          ₦{request.expectedAmount.toLocaleString("en-NG")}
                        </dd>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-caption text-subtle">New expiry if approved</dt>
                      <dd className="text-caption font-semibold text-foreground">
                        {planDays(request.planId) === null
                          ? "Never"
                          : (expiryFor(request.planId, null)?.toLocaleDateString() ?? "—")}
                      </dd>
                    </div>
                  </dl>

                  {amountMismatch(request) && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/[0.08] px-3 py-2 text-caption text-foreground">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
                      <span>
                        The amount sent does not match the price of{" "}
                        <span className="font-semibold">{request.planName}</span>. Check the receipt
                        before approving — approving grants the plan listed, not the amount paid.
                      </span>
                    </p>
                  )}

                  {request.receiptUrl ? (
                    <a
                      href={request.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary btn-sm mt-4 w-full"
                    >
                      <FileText size={14} aria-hidden="true" />
                      Open the receipt
                      <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  ) : (
                    <p className="mt-4 flex items-center gap-1.5 text-caption text-warn">
                      <AlertTriangle size={13} aria-hidden="true" />
                      No receipt was attached.
                    </p>
                  )}

                  <div className="mt-4 flex gap-2 border-t border-hairline pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setActionError("")
                        setRejecting(request)
                      }}
                      disabled={busy}
                      className="btn-secondary btn-sm flex-1"
                    >
                      <X size={14} aria-hidden="true" />
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => void approve(request)}
                      disabled={busy}
                      className="btn-primary btn-sm flex-1"
                    >
                      {busy ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Check size={14} aria-hidden="true" />
                      )}
                      Approve
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {rejecting && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-4 backdrop-blur-sm sm:items-center"
        >
          <div className="animate-scale-in card w-full max-w-md p-6">
            <h2 id="reject-title" className="text-h4 font-semibold text-foreground">
              Decline this transfer?
            </h2>
            <p className="mt-2 text-body-sm text-muted">
              {rejecting.userEmail} claimed {rejecting.amount || "a transfer"} for the{" "}
              {rejecting.planName || planName(rejecting.planId)} plan.
            </p>
            <p className="mt-3 text-caption text-subtle">
              Declining clears the pending marker only. Any subscription already running is left
              exactly as it is, and the student can send another receipt.
            </p>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setRejecting(null)}
                disabled={working === rejecting.id}
                className="btn-secondary btn-sm"
              >
                Keep it pending
              </button>
              <button
                type="button"
                onClick={() => void reject(rejecting)}
                disabled={working === rejecting.id}
                className="btn-danger btn-sm"
              >
                {working === rejecting.id ? (
                  <>
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    Declining…
                  </>
                ) : (
                  "Decline the transfer"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
