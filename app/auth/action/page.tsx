"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { applyActionCode, auth, confirmPasswordReset, verifyPasswordResetCode } from "@/lib/auth"
import { ArrowRight, Check, CheckCircle2, Eye, EyeOff, Loader2, Lock, XCircle } from "lucide-react"

import { AuthShell } from "@/components/auth/auth-shell"
import { cn } from "@/lib/utils"
import { PASSWORD_RULES, firstUnmetPasswordRule } from "@/lib/password-rules"

function codeOf(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code?: unknown }).code)
    : ""
}

function messageForCode(code: string) {
  switch (code) {
    case "auth/expired-action-code":
      return "This link has expired. Ask for a new one from the sign-in page."
    case "auth/invalid-action-code":
      return "This link is no longer valid — it may already have been used."
    case "auth/user-disabled":
      return "This account has been disabled."
    case "auth/user-not-found":
      return "We couldn't find the account this link belongs to."
    case "auth/weak-password":
      return "That password is too weak. Try a longer one."
    default:
      return "Something went wrong. The link may have expired — ask for a new one."
  }
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden="true" />
      <span className="sr-only">Checking your link</span>
    </div>
  )
}

function AuthAction() {
  const params = useSearchParams()
  // Firebase sends `mode` as resetPassword, verifyEmail or recoverEmail.
  const mode = params.get("mode")
  const actionCode = params.get("oobCode")

  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState("")
  const [done, setDone] = useState(false)
  /** A dead link — nothing on this page can recover from it. */
  const [fatal, setFatal] = useState("")
  /** A problem with what was just submitted, shown above the form. */
  const [error, setError] = useState("")

  const [newPassword, setNewPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!mode || !actionCode) {
      setFatal("This link is missing information. Open it again from your email.")
      setChecking(false)
      return
    }

    let active = true
    const run = async () => {
      try {
        if (mode === "resetPassword") {
          // Checks the code only; the new password is collected below.
          const address = await verifyPasswordResetCode(auth, actionCode)
          if (active) setEmail(address)
        } else if (mode === "verifyEmail") {
          await applyActionCode(auth, actionCode)
          if (active) setDone(true)
        } else if (active) {
          setFatal("We don't know how to handle this kind of link.")
        }
      } catch (err) {
        if (active) setFatal(messageForCode(codeOf(err)))
      } finally {
        if (active) setChecking(false)
      }
    }
    run()

    return () => {
      active = false
    }
  }, [mode, actionCode])

  const unmetRule = firstUnmetPasswordRule(newPassword)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!actionCode) return
    if (unmetRule) {
      setError(`Your new password still needs ${unmetRule.toLowerCase()}.`)
      return
    }
    setError("")
    setSaving(true)
    try {
      await confirmPasswordReset(auth, actionCode, newPassword)
      setDone(true)
    } catch (err) {
      setError(messageForCode(codeOf(err)))
    } finally {
      setSaving(false)
    }
  }

  if (checking) return <Spinner />

  if (fatal) {
    return (
      <AuthShell title="This link didn't work" lede={fatal}>
        <XCircle className="mx-auto h-10 w-10 text-danger" aria-hidden="true" />
        <Link href="/auth/login" className="btn-secondary btn-lg btn-block mt-7">
          Back to sign in
        </Link>
      </AuthShell>
    )
  }

  if (done) {
    return (
      <AuthShell
        title={mode === "resetPassword" ? "Password changed" : "Email verified"}
        lede={
          mode === "resetPassword"
            ? "Sign in with your new password — the old one no longer works."
            : "Your address is confirmed. Everything on your account is available now."
        }
      >
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden="true" />
        <Link href="/auth/login" className="btn-primary btn-lg btn-block mt-7">
          Continue to sign in
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Choose a new password"
      lede={
        email ? (
          <>
            You are resetting the password for <strong className="text-foreground">{email}</strong>.
          </>
        ) : (
          "Pick something you haven't used on another site."
        )
      }
    >
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-danger/35 bg-danger/10 px-4 py-3 text-body-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      <form onSubmit={handleSave} className="space-y-5" noValidate>
        <div>
          <label htmlFor="newPassword" className="field-label">
            New password
          </label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
              aria-hidden="true"
            />
            <input
              id="newPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              placeholder="Your new password"
              className="input-premium pl-10 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-subtle transition-colors hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <Eye className="h-4 w-4" aria-hidden="true" />
              ) : (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <ul className="space-y-1.5">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(newPassword)
            return (
              <li key={rule.label} className="flex items-center gap-2 text-caption">
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    met ? "border-success/40 bg-success/15 text-success" : "border-hairline",
                  )}
                >
                  {met && <Check className="h-2.5 w-2.5" aria-hidden="true" />}
                </span>
                <span className={met ? "font-medium text-success" : "text-muted"}>{rule.label}</span>
              </li>
            )
          })}
        </ul>

        <button type="submit" disabled={saving} className="btn-primary btn-lg btn-block">
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {saving ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthShell>
  )
}

export default function AuthActionPage() {
  // The link parameters are read on the client, so the page needs a boundary.
  return (
    <Suspense fallback={<Spinner />}>
      <AuthAction />
    </Suspense>
  )
}
