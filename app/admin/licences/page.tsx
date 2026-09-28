"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  Download,
  KeyRound,
  Loader2,
  PartyPopper,
  RefreshCw,
  Scissors,
  Ticket,
  X,
} from "lucide-react"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { auth } from "@/lib/auth"
import { planById, PURCHASABLE_PLANS, type PlanId } from "@/lib/plans"
import { cn } from "@/lib/utils"

/**
 * Prepaid licence codes — mint a batch, hand it to someone else to sell.
 *
 * Bank transfer is the bottleneck in this business, not the price. Every sale
 * needs a person to open a screenshot and press approve, and the only person who
 * can do that is the site owner. A code removes the constraint: a reseller, a
 * school, a class rep or a sponsor collects the transfer and passes on a code,
 * and the student is in immediately. Money moves through whoever sold the code;
 * the only account that needs to exist is the one that minted it.
 *
 * That channel was fully built server-side — `/api/admin/licences` to mint, list
 * and cancel, `/api/licences/redeem` plus an atomic SQL function to grant — and
 * had no page. Nothing could call it, so no code could ever exist. This is that
 * page.
 *
 * THE ONE-PRINT RULE, which shapes the whole design:
 *
 * Only the SHA-256 of a code is stored, so the plaintext exists in exactly one
 * place: the response to the POST that minted it. A stolen database dump then
 * yields nothing usable. The cost is that a batch not saved before this page is
 * closed is permanently gone — it cannot be recovered, only re-minted. So the
 * codes are not shown in a list that can be scrolled past. They arrive as a
 * blocking dialog with the CSV download already prepared and a copy-all button,
 * and closing it says so plainly. The batch list below shows redemption state
 * only, never the codes, which is what makes the two views obviously different.
 */

type Batch = {
  id: string
  planId: string
  planName: string
  quantity: number
  channel: string
  buyerNote: string
  contact: string
  amountDue: number
  settled: boolean
  createdAt: string | null
}

type CodeRow = {
  codeHint: string
  planId: string
  status: string
  redeemedEmail: string
  redeemedAt: string | null
  expiresGranted: string | null
}

type Minted = {
  batchId: string
  planId: string
  planName: string
  quantity: number
  amountDue: number
  codes: string[]
  csv: string
}

const CHANNELS: { value: string; label: string; hint: string }[] = [
  { value: "reseller", label: "Reseller", hint: "Sells on commission, keeps the transfer" },
  { value: "school", label: "School", hint: "Buys a batch for its students" },
  { value: "sponsor", label: "Sponsor", hint: "Pays to give access away" },
  { value: "direct", label: "Direct", hint: "Sold by you, one student at a time" },
  { value: "gift", label: "Gift", hint: "Free, e.g. a competition winner" },
]

async function apiCall<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error("Sign in as an admin to do that.")

  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
  const payload = await res.json().catch(() => null)
  if (!res.ok) throw new Error(payload?.error || "That request did not go through.")
  return payload as T
}

function money(value: number): string {
  return `₦${value.toLocaleString("en-NG")}`
}

function dayLabel(value: string | null): string {
  if (!value) return "unknown"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleDateString(undefined, { dateStyle: "medium" })
}

/** Download the minted batch as a CSV file, named for the plan and the day. */
function downloadCsv(batch: Minted) {
  const blob = new Blob([batch.csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `aerolearn-${batch.planId}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function MintResult({ batch, onDone }: { batch: Minted; onDone: () => void }) {
  const [copied, setCopied] = useState(false)

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(batch.codes.join("\n"))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mint-title"
        className="card my-auto w-full max-w-xl p-6"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
            <PartyPopper size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="mint-title" className="text-h4 font-semibold text-foreground">
              {batch.quantity} {batch.planName} {batch.quantity === 1 ? "code" : "codes"} minted
            </h2>
            <p className="mt-1 text-caption text-muted">
              {batch.amountDue > 0 ? `Ask for ${money(batch.amountDue)} before you hand these over.` : "No payment expected for this batch."}
            </p>
          </div>
        </div>

        <div
          role="alert"
          className="mt-5 flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/[0.06] p-3.5"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-caption text-foreground">
            <span className="font-semibold">Save these now.</span> They are shown once and cannot be
            recovered — only the code&rsquo;s hash is stored. Close this and the batch is gone for good.
          </p>
        </div>

        <ol className="mt-4 max-h-72 space-y-1 overflow-y-auto rounded-xl border border-hairline bg-surface-sunken p-3">
          {batch.codes.map((code, index) => (
            <li key={code} className="flex items-center gap-2 text-caption">
              <span className="w-7 shrink-0 tabular-nums text-subtle">{index + 1}.</span>
              <code className="min-w-0 flex-1 truncate font-mono tracking-wide text-foreground">
                {code}
              </code>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void copyAll()} className="btn-secondary btn-sm">
            {copied ? (
              <>
                <Check size={14} aria-hidden="true" />
                Copied all
              </>
            ) : (
              <>
                <Scissors size={14} aria-hidden="true" />
                Copy all
              </>
            )}
          </button>
          <button type="button" onClick={() => downloadCsv(batch)} className="btn-secondary btn-sm">
            <Download size={14} aria-hidden="true" />
            Download CSV
          </button>
          <button type="button" onClick={onDone} className="btn-primary btn-sm ml-auto">
            I&rsquo;ve saved them
          </button>
        </div>
      </div>
    </div>
  )
}

function BatchDetail({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const [codes, setCodes] = useState<CodeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    apiCall<{ codes: CodeRow[] }>(`/api/admin/licences?batchId=${encodeURIComponent(batchId)}`)
      .then((payload) => {
        if (active) setCodes(payload.codes ?? [])
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "That batch failed to load.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [batchId])

  const counts = useMemo(() => {
    const out = { available: 0, redeemed: 0, cancelled: 0 }
    for (const row of codes) {
      if (row.status === "redeemed") out.redeemed += 1
      else if (row.status === "cancelled") out.cancelled += 1
      else out.available += 1
    }
    return out
  }, [codes])

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-foreground/40 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Batch codes"
        className="card my-auto w-full max-w-lg p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-h4 font-semibold text-foreground">Batch activity</h2>
            <p className="mt-1 text-caption text-muted">
              {counts.redeemed} redeemed · {counts.available} unused · {counts.cancelled} cancelled
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm" aria-label="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <p className="mt-3 text-caption text-subtle">
          Codes are identified by their first eight characters of a hash. The plaintext was shown once,
          when the batch was minted.
        </p>

        {loading ? (
          <LoadingState text="Loading…" className="py-10" />
        ) : error ? (
          <p role="alert" className="field-error mt-4">
            {error}
          </p>
        ) : codes.length === 0 ? (
          <EmptyState title="No codes" description="This batch has no rows." className="py-10" />
        ) : (
          <ul className="mt-4 max-h-80 space-y-1.5 overflow-y-auto">
            {codes.map((row) => (
              <li
                key={row.codeHint + row.redeemedEmail}
                className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-sunken px-3 py-2"
              >
                <code className="shrink-0 font-mono text-caption text-muted">{row.codeHint}…</code>
                <span
                  className={cn(
                    "badge shrink-0",
                    row.status === "redeemed"
                      ? "bg-success/10 text-success"
                      : row.status === "cancelled"
                        ? "bg-danger/10 text-danger"
                        : "bg-warn/10 text-warn",
                  )}
                >
                  {row.status}
                </span>
                <span className="min-w-0 flex-1 truncate text-right text-caption text-foreground">
                  {row.status === "redeemed"
                    ? `${row.redeemedEmail || "unknown"} · ${dayLabel(row.redeemedAt)}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function AdminLicencesPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [actionError, setActionError] = useState("")
  const [notice, setNotice] = useState("")

  // Mint form.
  const [planId, setPlanId] = useState<PlanId>(PURCHASABLE_PLANS[0]?.id ?? "monthly")
  const [quantity, setQuantity] = useState("10")
  const [channel, setChannel] = useState("reseller")
  const [contact, setContact] = useState("")
  const [buyerNote, setBuyerNote] = useState("")
  const [minting, setMinting] = useState(false)
  const [minted, setMinted] = useState<Minted | null>(null)

  const [detail, setDetail] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError("")
    try {
      const payload = await apiCall<{ batches: Batch[] }>("/api/admin/licences")
      setBatches(payload.batches ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The batches could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const chosen = PURCHASABLE_PLANS.find((plan) => plan.id === planId) ?? null
  const count = Math.max(0, Math.min(500, Number(quantity) || 0))
  const planTotal = chosen ? chosen.amount * count : 0

  const mint = async () => {
    if (count < 1 || !chosen) return
    setMinting(true)
    setActionError("")
    setNotice("")
    try {
      const payload = await apiCall<Minted>("/api/admin/licences", {
        method: "POST",
        body: JSON.stringify({ planId, quantity: count, channel, contact, buyerNote }),
      })
      setMinted(payload)
      setContact("")
      setBuyerNote("")
      await load()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The codes could not be minted.")
    } finally {
      setMinting(false)
    }
  }

  const settle = async (batch: Batch) => {
    setActionError("")
    try {
      await apiCall("/api/admin/licences", {
        method: "PATCH",
        body: JSON.stringify({ batchId: batch.id, settled: !batch.settled }),
      })
      setNotice(`${batch.planName} batch of ${batch.quantity} marked ${batch.settled ? "unsettled" : "paid"}.`)
      await load()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The batch could not be updated.")
    }
  }

  const outstanding = useMemo(
    () => batches.filter((batch) => !batch.settled).reduce((sum, batch) => sum + batch.amountDue, 0),
    [batches],
  )
  const redeemedCount = useMemo(
    () => batches.filter((batch) => batch.settled).reduce((sum, batch) => sum + batch.quantity, 0),
    [batches],
  )

  return (
    <>
      <PageHeader
        eyebrow="Revenue"
        title="Licence codes"
        subtitle="Sell access without touching a bank. Mint a batch, hand it to a reseller or a school, and they collect the transfer. Redemption switches Pro on instantly, with no queue."
        actions={
          <button type="button" onClick={() => void load()} className="btn-secondary btn-sm">
            <RefreshCw size={14} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-caption text-subtle">Expected from unsettled batches</p>
          <p className="mt-1 text-h3 font-bold tabular-nums text-foreground">{money(outstanding)}</p>
        </div>
        <div className="card p-4">
          <p className="text-caption text-subtle">Batches issued</p>
          <p className="mt-1 text-h3 font-bold tabular-nums text-foreground">{batches.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-caption text-subtle">Codes in settled batches</p>
          <p className="mt-1 text-h3 font-bold tabular-nums text-foreground">{redeemedCount}</p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/[0.06] p-4"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-semibold text-foreground">{error}</p>
            <button type="button" onClick={() => void load()} className="btn-secondary btn-sm mt-3">
              Try again
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <section className="card h-fit p-5">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound size={16} className="text-accent" aria-hidden="true" />
            <h2 className="text-h4 font-semibold text-foreground">Mint a batch</h2>
          </div>

          <label className="block text-caption font-medium text-muted" htmlFor="plan">
            Plan
          </label>
          <select
            id="plan"
            value={planId}
            onChange={(event) => {
              // Narrowed through `planById` so an unexpected value cannot widen
              // the state out of the PlanId union.
              const next = planById(event.target.value)
              if (next) setPlanId(next.id)
            }}
            className="input-premium mt-1"
          >
            {PURCHASABLE_PLANS.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} — {plan.price}
                {plan.days === null ? " (no expiry)" : ` (${plan.days}d)`}
              </option>
            ))}
          </select>

          <label className="mt-4 block text-caption font-medium text-muted" htmlFor="quantity">
            How many codes
          </label>
          <input
            id="quantity"
            type="number"
            min={1}
            max={500}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="input-premium mt-1"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[1, 5, 10, 25, 50, 100].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setQuantity(String(preset))}
                className={cn(
                  "rounded-lg border px-2 py-1 text-caption transition",
                  Number(quantity) === preset
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-hairline text-muted hover:border-accent/30",
                )}
              >
                {preset}
              </button>
            ))}
          </div>

          <label className="mt-4 block text-caption font-medium text-muted" htmlFor="channel">
            Who is selling it
          </label>
          <select
            id="channel"
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            className="input-premium mt-1"
          >
            {CHANNELS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-caption text-subtle">
            {CHANNELS.find((entry) => entry.value === channel)?.hint}
          </p>

          <label className="mt-4 block text-caption font-medium text-muted" htmlFor="contact">
            Contact <span className="text-subtle">(optional)</span>
          </label>
          <input
            id="contact"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder="WhatsApp number or email"
            className="input-premium mt-1"
          />

          <label className="mt-4 block text-caption font-medium text-muted" htmlFor="note">
            Note <span className="text-subtle">(optional)</span>
          </label>
          <textarea
            id="note"
            value={buyerNote}
            onChange={(event) => setBuyerNote(event.target.value)}
            rows={2}
            placeholder="e.g. 30 students at Bright Future College, termly"
            className="input-premium mt-1 resize-none"
          />

          <div className="mt-4 rounded-xl border border-hairline bg-surface-sunken p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-caption text-subtle">Ask them for</span>
              <span className="text-body-sm font-bold tabular-nums text-accent">
                {money(planTotal)}
              </span>
            </div>
            <p className="mt-1 text-caption text-subtle">
              {count} × {chosen?.price ?? "—"} at list price. Discount it yourself if the channel
              earns one — the amount is recorded on the batch, not enforced.
            </p>
          </div>

          {actionError && (
            <p role="alert" className="field-error mt-3">
              {actionError}
            </p>
          )}

          <button
            type="button"
            onClick={() => void mint()}
            disabled={count < 1 || minting}
            className="btn-primary mt-4 w-full"
          >
            {minting ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                Minting…
              </>
            ) : (
              `Mint ${count || 0} ${count === 1 ? "code" : "codes"}`
            )}
          </button>
          <p className="mt-2 text-caption text-subtle">
            Codes are unguessable and single-use, and expire access the way the plan does — an
            early renewal extends rather than shortens.
          </p>
        </section>

        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-h4 font-semibold text-foreground">Batches</h2>
            {notice && (
              <p role="status" className="truncate text-caption text-success">
                {notice}
              </p>
            )}
          </div>

          {loading ? (
            <LoadingState text="Loading batches…" className="py-16" />
          ) : batches.length === 0 ? (
            <EmptyState
              icon={Ticket}
              title="No codes minted yet"
              description="Mint a batch on the left and hand it to whoever will sell it. This is the fastest way to grow revenue without being the one checking every receipt — see the guide on reselling if you need wording."
            />
          ) : (
            <ul className="space-y-3">
              {batches.map((batch) => (
                <li key={batch.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-body-sm font-semibold text-foreground">
                        {batch.planName}
                        <span className="badge bg-surface-sunken text-subtle">
                          {batch.channel}
                        </span>
                        {batch.settled && (
                          <span className="badge bg-success/10 text-success">
                            <BadgeCheck size={11} aria-hidden="true" />
                            paid
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-caption text-muted">
                        {batch.quantity} codes · {dayLabel(batch.createdAt)}
                        {batch.contact ? ` · ${batch.contact}` : ""}
                      </p>
                      {batch.buyerNote && (
                        <p className="mt-1 text-caption text-subtle">{batch.buyerNote}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-body-sm font-bold tabular-nums text-foreground">
                        {money(batch.amountDue)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDetail(batch.id)}
                        className="btn-secondary btn-sm"
                      >
                        Activity
                      </button>
                      <button
                        type="button"
                        onClick={() => void settle(batch)}
                        className={cn(batch.settled ? "btn-ghost btn-sm" : "btn-primary btn-sm")}
                      >
                        {batch.settled ? "Unmark" : "Mark paid"}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-5 text-caption text-subtle">
            Students redeem at{" "}
            <Link href="/app/upgrade" className="font-medium text-accent hover:underline">
              /app/upgrade
            </Link>
            . A redeemed code cannot be revoked from here — cancel only touches unused ones.
          </p>
        </section>
      </div>

      {minted && <MintResult batch={minted} onDone={() => setMinted(null)} />}
      {detail && <BatchDetail batchId={detail} onClose={() => setDetail(null)} />}
    </>
  )
}
