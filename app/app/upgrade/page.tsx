"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { auth, onAuthStateChanged, type User } from "@/lib/auth"
import { addDoc, collection, db, doc, getDoc, serverTimestamp, updateDoc } from "@/lib/db"
import { getDownloadURL, ref, storage, uploadBytes } from "@/lib/storage"
import {
  Ticket,
  Building2,
  Check,
  ClipboardCheck,
  Copy,
  GraduationCap,
  Loader2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react"

import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { cn } from "@/lib/utils"
import { planById, PURCHASABLE_PLANS, type Plan } from "@/lib/plans"
import { isProUser } from "@/lib/subscription"

/**
 * Plan picker, manual bank-transfer checkout, and prepaid-code redemption.
 *
 * The plan cards used to be a second copy of the price list, written out here in
 * full, with three of the eight plans present and five absent. That is a revenue
 * bug before it is a maintenance one: JAMB Sprint, WAEC Final Lap, Both Exams,
 * One Term and Full Year were sellable in the sense that `lib/plans.ts` describes
 * them and the admin can mint codes for them, but nobody could actually buy them
 * from the site, and the terms quoted on the marketing pages did not match what
 * the checkout charged.
 *
 * It now renders straight from `PURCHASABLE_PLANS`. Prices, features and durations
 * exist in exactly one place, so a plan added to that file appears here, is
 * accepted by `isProUser`, and can be approved in the queue without a second edit.
 *
 * Receipt submission leaves an existing paid plan alone. A server route grants
 * a one-time 24-hour Trust Pass to a free account after the receipt is saved.
 *
 * The code panel is the faster of the two money paths and the one that needs no
 * human. A reseller, school or sponsor collects the transfer and hands over a
 * code; redemption is atomic in SQL and switches access on immediately, which is
 * why it sits above the transfer instructions rather than hidden in settings.
 */

const MAX_BYTES = 5 * 1024 * 1024

/** Account the site owner receives transfers into. Kept here, shown in step 2. */
const BANK = [
  { label: "Bank", value: "Opay Digital Services", copyable: false },
  { label: "Account number", value: "9135365485", copyable: true },
  { label: "Account name", value: "Akinbo Adetayo Solomon", copyable: false },
]

const ACCOUNT_NUMBER = "9135365485"

function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-caption font-bold text-accent">
          {n}
        </span>
        <div className="min-w-0">
          <h2 className="text-h4 font-semibold text-foreground">{title}</h2>
          {hint && <p className="mt-0.5 text-caption text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

/** Per-day cost, so a ₦15,000 year reads against a ₦2,500 month honestly. */
function perDay(plan: Plan): string | null {
  if (!plan.days) return null
  return `≈ ₦${(plan.amount / plan.days).toFixed(0)} a day`
}

function PlanCard({
  candidate,
  active,
  onSelect,
}: {
  candidate: Plan
  active: boolean
  onSelect: (id: string) => void
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={active}
        onClick={() => onSelect(candidate.id)}
        className={cn(
          "flex h-full w-full flex-col rounded-xl border bg-surface p-4 text-left transition",
          active ? "border-accent ring-2 ring-accent/25" : "border-hairline hover:border-accent/30",
        )}
      >
        <span className="flex items-center gap-2">
          <span className="text-body-sm font-semibold text-foreground">{candidate.name}</span>
          {candidate.recommended && (
            <span className="badge bg-accent/10 text-accent">
              <Sparkles size={11} aria-hidden="true" />
              Popular
            </span>
          )}
          {candidate.season && (
            <span className="badge bg-warn/10 text-warn">
              <GraduationCap size={11} aria-hidden="true" />
              Exam
            </span>
          )}
          {active && <Check size={15} className="ml-auto shrink-0 text-accent" aria-hidden="true" />}
        </span>

        <span className="mt-2 flex items-baseline gap-1.5">
          <span className="text-h3 font-bold tabular-nums text-foreground">{candidate.price}</span>
          <span className="text-caption text-subtle">
            {candidate.days === null ? "once" : `/ ${candidate.cadence}`}
          </span>
        </span>
        {perDay(candidate) && (
          <span className="text-caption text-subtle tabular-nums">{perDay(candidate)}</span>
        )}
        <span className="mt-1 block text-caption text-muted">{candidate.blurb}</span>

        <ul className="mt-3 space-y-1.5 border-t border-hairline pt-3">
          {candidate.features.map((feature) => (
            <li key={feature} className="flex items-start gap-1.5 text-caption text-muted">
              <Check size={13} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
              {feature}
            </li>
          ))}
        </ul>
      </button>
    </li>
  )
}

export default function UpgradePage() {
  const router = useRouter()

  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [planId, setPlanId] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [trustPassActive, setTrustPassActive] = useState(false)
  const [trustPassError, setTrustPassError] = useState("")
  const [recoveredPass, setRecoveredPass] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState("")

  // Prepaid code: the path that grants access without waiting on a human.
  const [code, setCode] = useState("")
  const [redeeming, setRedeeming] = useState(false)
  const [redeemed, setRedeemed] = useState<{ planName: string; expiresAt: string | null } | null>(
    null,
  )
  const [codeError, setCodeError] = useState("")

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.replace("/auth/login")
        return
      }
      setUser(currentUser)
      setChecking(false)
    })
    return () => unsubscribe()
  }, [router])

  useEffect(() => {
    if (!user) return
    let live = true
    const recoverPendingPass = async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid))
        if (!live || !snap.exists() || !snap.data().pendingPlan || isProUser(snap.data())) return
        const idToken = await user.getIdToken()
        const response = await fetch("/api/subscription/trust-pass", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: "{}",
        })
        if (!response.ok) return
        const result = await response.json()
        if (live && result.granted) setRecoveredPass(true)
      } catch (cause) {
        console.error("Could not recover a pending Trust Pass:", cause)
      }
    }
    void recoverPendingPass()
    return () => { live = false }
  }, [user])

  const { evergreen, seasonal } = useMemo(() => {
    const regular: Plan[] = []
    const exams: Plan[] = []
    for (const candidate of PURCHASABLE_PLANS) {
      (candidate.season ? exams : regular).push(candidate)
    }
    return { evergreen: regular, seasonal: exams }
  }, [])

  const plan = planById(planId)

  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    event.target.value = ""
    if (!selected) return

    if (selected.size > MAX_BYTES) {
      setError("That file is larger than 5MB. Try a screenshot instead of a photo.")
      setFile(null)
      return
    }
    if (!["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(selected.type)) {
      setError("Choose a PNG, JPG, WebP or PDF receipt.")
      setFile(null)
      return
    }
    setError("")
    setFile(selected)
  }

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(ACCOUNT_NUMBER)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setError("Copying isn't available in this browser — type the number instead.")
    }
  }

  const redeem = useCallback(async () => {
    const trimmed = code.trim()
    if (!trimmed || redeeming) return

    const token = await auth.currentUser?.getIdToken()
    if (!token) {
      setCodeError("Sign in again to redeem a code.")
      return
    }

    setRedeeming(true)
    setCodeError("")
    try {
      const res = await fetch("/api/licences/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: trimmed }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || "That code did not work. Check it and try again.")

      // Deliberately no write to `users` here. `redeem_licence_code()` has
      // already applied the grant atomically in SQL, extending rather than
      // shortening, and `guard_user_fields()` in 0002 raises
      // 'role, subscription and proExpiresAt are server-managed' if a student's
      // own session tries to set them. Writing them from this page would fail
      // for every non-admin — that is, for every actual customer.
      //
      // `app/app/layout.tsx` reads the profile once on sign-in and never again,
      // so the new access will not appear through a client-side link. The
      // success screen therefore does a full reload rather than pretending the
      // paywall updated itself.
      const expires = payload?.expiresAt ? new Date(payload.expiresAt) : null

      setRedeemed({
        planName: String(payload?.planName ?? "Pro"),
        expiresAt: expires ? expires.toLocaleDateString(undefined, { dateStyle: "medium" }) : null,
      })
      setCode("")
    } catch (cause) {
      setCodeError(
        cause instanceof Error ? cause.message : "That code did not work. Check it and try again.",
      )
    } finally {
      setRedeeming(false)
    }
  }, [code, redeeming])

  const submit = async () => {
    if (!user || !plan || !file) return
    setUploading(true)
    setError("")
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
      const path = `receipts/${user.uid}/${crypto.randomUUID()}-${safeName}`
      const target = ref(storage, path)
      await uploadBytes(target, file, { contentType: file.type || "application/octet-stream" })
      const receiptUrl = await getDownloadURL(target)

      const receipt = await addDoc(collection(db, "verificationRequests"), {
        userId: user.uid,
        userEmail: user.email ?? "",
        userName: user.displayName ?? "",
        planId: plan.id,
        planName: plan.name,
        amount: plan.price,
        expectedAmount: plan.amount,
        planDays: plan.days,
        receiptUrl,
        receiptPath: path,
        status: "pending",
        createdAt: serverTimestamp(),
      })

      /* `subscription` is deliberately not touched. `pendingPlan` records what is
         waiting to be checked, so a member renewing keeps the access they have
         already paid for while the receipt is reviewed. */
      await updateDoc(doc(db, "users", user.uid), {
        pendingPlan: plan.id,
        pendingSince: serverTimestamp(),
      })

      setTrustPassError("")
      try {
        const idToken = await user.getIdToken()
        const response = await fetch("/api/subscription/trust-pass", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ requestId: receipt.id }),
        })
        const pass = await response.json()
        if (!response.ok) throw new Error(pass.error || "The Trust Pass could not start.")
        setTrustPassActive(pass.granted === true)
      } catch (cause) {
        setTrustPassError(cause instanceof Error ? cause.message : "The Trust Pass could not start.")
      }
      try {
        const idToken = await user.getIdToken()
        await fetch("/api/subscription/notify-receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ requestId: receipt.id }),
        })
      } catch (cause) {
        console.error("The receipt was saved, but the admin email could not be sent:", cause)
      }
      setSubmitted(true)
    } catch (cause) {
      console.error("Failed to submit the receipt:", cause)
      setError(
        cause instanceof Error
          ? `The receipt did not go through: ${cause.message}`
          : "The receipt did not go through. Check your connection and try again.",
      )
    } finally {
      setUploading(false)
    }
  }

  if (checking) {
    return <LoadingState full text="Loading your account…" />
  }

  if (redeemed) {
    return (
      <div className="animate-fade-in mx-auto max-w-lg py-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
          <Ticket size={26} aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-h2 font-bold text-foreground">Code applied</h1>
        <p className="mt-3 text-body text-muted">
          <span className="font-semibold text-foreground">{redeemed.planName}</span> is on your
          account now.{" "}
          {redeemed.expiresAt
            ? `It runs until ${redeemed.expiresAt}.`
            : "It does not expire."}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {/* A plain anchor, not a Next `Link`. The app shell reads the profile
              once, inside `onAuthStateChanged`, and never re-reads it on
              navigation — so a client-side route would show the free-tier limits
              the code has just lifted. A full load re-runs that read. */}
          <a href="/app" className="btn-primary btn-sm">
            Back to the dashboard
          </a>
          <button type="button" onClick={() => setRedeemed(null)} className="btn-secondary btn-sm">
            Redeem another code
          </button>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="animate-fade-in mx-auto max-w-lg py-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
          <ClipboardCheck size={26} aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-h2 font-bold text-foreground">Receipt received</h1>
        <p className="mt-3 text-body text-muted">
          {trustPassActive ? "Your 24-hour Trust Pass is active now. " : ""}
          Someone checks each transfer by hand against the account, usually the same day. Your{" "}
          <span className="font-semibold text-foreground">{plan?.name ?? "chosen"}</span> plan switches on
          when the payment is approved.
        </p>
        {trustPassError && <p role="alert" className="mt-3 text-body-sm text-danger">{trustPassError}</p>}
        <p className="mt-3 text-body-sm text-subtle">
          If the transfer was made from a different name to the one on your account, reply to the receipt email
          so it can be matched.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <a href="/app" className="btn-primary btn-sm">
            Back to the dashboard
          </a>
          <button
            type="button"
            onClick={() => {
              setSubmitted(false)
              setFile(null)
            }}
            className="btn-secondary btn-sm"
          >
            Send another receipt
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Upgrade"
        title="Go Pro"
        subtitle="Have a code? Redeem it below and you are in immediately. Otherwise transfer to the account and send the receipt — access switches on once it is checked."
      />

      <div className="space-y-4">
        {recoveredPass && (
          <p role="status" className="card border-success/30 p-4 text-body-sm text-success">
            Your pending receipt now has a 24-hour Trust Pass. <a href="/app" className="font-semibold underline">Open your dashboard</a> to refresh your access.
          </p>
        )}
        <section className="card border-accent/25 bg-accent/[0.03] p-5 sm:p-6">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Ticket size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-h4 font-semibold text-foreground">Already paid someone?</h2>
              <p className="mt-0.5 text-caption text-muted">
                Paste the code from your reseller, school or sponsor. Access is granted the second
                it is accepted — no receipt, no waiting.
              </p>
            </div>
          </div>

          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault()
              void redeem()
            }}
          >
            <input
              value={code}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase())
                setCodeError("")
              }}
              placeholder="AL-XXXX-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
              aria-label="Licence code"
              aria-invalid={Boolean(codeError)}
              className="input-premium flex-1 font-mono uppercase tracking-wider"
            />
            <button
              type="submit"
              disabled={!code.trim() || redeeming}
              className="btn-primary shrink-0"
            >
              {redeeming ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  Checking…
                </>
              ) : (
                "Redeem code"
              )}
            </button>
          </form>

          {codeError && (
            <p role="alert" className="field-error mt-3">
              {codeError}
            </p>
          )}
          <p className="mt-3 text-caption text-subtle">
            Codes are single-use and tied to the account that redeems them. If one was sold to you
            and it fails, send the code to{" "}
            <Link href="/contact" className="font-medium text-accent hover:underline">
              support
            </Link>{" "}
            and it can be traced to whoever minted it.
          </p>
        </section>

        <Step n={1} title="Choose a plan" hint="You can change plans later; nothing renews automatically.">
          <ul className="grid gap-3 sm:grid-cols-3">
            {evergreen.map((candidate) => (
              <PlanCard
                key={candidate.id}
                candidate={candidate}
                active={candidate.id === planId}
                onSelect={setPlanId}
              />
            ))}
          </ul>

          {seasonal.length > 0 && (
            <>
              <p className="mt-5 mb-3 flex items-center gap-2 text-caption font-semibold uppercase tracking-wide text-subtle">
                <GraduationCap size={13} aria-hidden="true" />
                Exam-season plans
              </p>
              <ul className="grid gap-3 sm:grid-cols-3">
                {seasonal.map((candidate) => (
                  <PlanCard
                    key={candidate.id}
                    candidate={candidate}
                    active={candidate.id === planId}
                    onSelect={setPlanId}
                  />
                ))}
              </ul>
            </>
          )}
        </Step>

        <Step
          n={2}
          title="Make the transfer"
          hint={
            plan
              ? `Send exactly ${plan.price} — the amount is how the transfer is matched to your account.`
              : "Pick a plan above to see the amount to send."
          }
        >
          <dl className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
            {BANK.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 bg-surface-sunken px-4 py-3"
              >
                <dt className="text-caption text-subtle">{row.label}</dt>
                <dd className="flex items-center gap-2 text-body-sm font-semibold text-foreground">
                  <span className={row.copyable ? "tabular-nums tracking-wide" : undefined}>
                    {row.value}
                  </span>
                  {row.copyable && (
                    <button
                      type="button"
                      onClick={() => void copyAccount()}
                      className="btn-ghost btn-sm"
                    >
                      {copied ? (
                        <>
                          <ClipboardCheck size={14} aria-hidden="true" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy size={14} aria-hidden="true" />
                          Copy
                        </>
                      )}
                    </button>
                  )}
                </dd>
              </div>
            ))}
            {plan && (
              <div className="flex items-center justify-between gap-3 bg-accent/[0.06] px-4 py-3">
                <dt className="text-caption font-semibold text-accent">Amount to send</dt>
                <dd className="text-body-sm font-bold tabular-nums text-accent">{plan.price}</dd>
              </div>
            )}
          </dl>
          <p className="mt-3 flex items-start gap-1.5 text-caption text-subtle">
            <Building2 size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            Opay accounts work from any Nigerian bank app. Transfers usually land within a minute.
          </p>
        </Step>

        <Step
          n={3}
          title="Send the receipt"
          hint="A screenshot of the successful transfer is enough. Up to 5MB, image or PDF."
        >
          <label
            htmlFor="receipt"
            className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-hairline bg-surface-sunken p-6 text-center transition hover:border-accent/40"
          >
            <UploadCloud size={22} className="text-subtle" aria-hidden="true" />
            <span className="mt-2 text-body-sm font-semibold text-foreground">
              {file ? "Choose a different file" : "Choose your receipt"}
            </span>
            <span className="mt-0.5 text-caption text-subtle">PNG, JPG or PDF</span>
            <input
              id="receipt"
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={chooseFile}
              className="sr-only"
            />
          </label>
          {file && (
            <p className="mt-3 flex items-center gap-2 rounded-lg border border-success/25 bg-success/[0.06] px-3 py-2 text-caption text-foreground">
              <Check size={14} className="shrink-0 text-success" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
              <span className="shrink-0 tabular-nums text-subtle">
                {(file.size / 1024).toFixed(0)}KB
              </span>
            </p>
          )}

          {error && (
            <p role="alert" className="field-error mt-3">
              {error}
            </p>
          )}

          <p className="mt-4 flex items-start gap-1.5 text-caption text-subtle">
            <ShieldCheck size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            Your receipt is only visible to you and whoever checks payments. Nothing is charged
            automatically and there is no card on file.
          </p>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={!plan || !file || uploading}
            className="btn-primary mt-4 w-full"
          >
            {uploading ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                Sending…
              </>
            ) : (
              `Send receipt${plan ? ` for ${plan.name}` : ""}`
            )}
          </button>

          {!plan && (
            <p className="mt-2 text-center text-caption text-subtle">
              Choose a plan in step 1 first.
            </p>
          )}
        </Step>
      </div>

      <p className="mt-6 text-center text-caption text-subtle">
        Trouble with a transfer?{" "}
        <Link href="/contact" className="font-medium text-accent hover:underline">
          Get in touch
        </Link>
        .
      </p>
    </div>
  )
}
