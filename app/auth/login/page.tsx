"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  auth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  type User,
} from "@/lib/auth"
import { db, doc, getDoc, setDoc } from "@/lib/db"
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react"

import { AuthDivider, AuthShell, GoogleMark } from "@/components/auth/auth-shell"

type SavedAccount = { email: string; displayName: string; photoURL?: string | null }

/** Starting state for a profile created by a first Google sign-in. */
const NEW_PROFILE = {
  favoriteSubjects: [],
  studyStats: { questionsAttempted: 0, questionsCorrect: 0, subjectsStudied: [] },
  subscription: "free",
  onboardingCompleted: false,
  xp: 0,
  streak: 0,
  longestStreak: 0,
  completedLessons: [],
  completedTopics: [],
  completedQuizzes: [],
  homeworkCompleted: 0,
  badges: [],
}

async function ensureProfile(user: User) {
  const ref = doc(db, "users", user.uid)
  if (!(await getDoc(ref)).exists()) {
    await setDoc(ref, {
      email: user.email,
      displayName: user.displayName,
      createdAt: new Date(),
      ...NEW_PROFILE,
    })
  }
}

async function needsOnboarding(uid: string) {
  const snap = await getDoc(doc(db, "users", uid))
  return snap.exists() && !snap.data()?.onboardingCompleted
}

function codeOf(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code?: unknown }).code)
    : ""
}

function textOf(err: unknown) {
  return err instanceof Error ? err.message : ""
}

function messageForCode(code: string) {
  switch (code) {
    case "auth/invalid-email":
      return "That doesn't look like a valid email address."
    case "auth/user-disabled":
      return "This account has been disabled."
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Wrong email or password. Please try again."
    case "auth/too-many-requests":
      return "Too many failed attempts. Wait a few minutes, or reset your password."
    default:
      return "Couldn't sign you in. Please try again."
  }
}

export default function LoginPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [signingIn, setSigningIn] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([])
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const raw = localStorage.getItem("saved-accounts")
      const parsed: SavedAccount[] = raw ? JSON.parse(raw) : []
      if (parsed?.length) {
        setSavedAccounts(parsed)
        setShowSaved(true)
      }
    } catch {
      // Unreadable storage is not worth reporting — the form still works.
    }

    // Google sign-in comes back through /auth/callback, which sets the session
    // cookie before this page loads; the profile row is created by a trigger, so
    // ensureProfile is only a safety net for accounts made before it existed.
    const finishRedirect = async () => {
      try {
        const result = await getRedirectResult(auth)
        if (!result?.user) return
        setSigningIn(true)
        await ensureProfile(result.user)
        router.replace((await needsOnboarding(result.user.uid)) ? "/onboarding" : "/app")
      } catch (err) {
        setError(`Couldn't finish the Google sign-in. ${textOf(err)}`.trim())
      } finally {
        setSigningIn(false)
      }
    }
    finishRedirect()
  }, [router])

  useEffect(() => {
    let active = true

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user || !active) return

      // The auth event can win the race with getRedirectResult after Google
      // returns. Check the profile here too instead of always bypassing setup.
      try {
        await ensureProfile(user)
        if (active) router.replace((await needsOnboarding(user.uid)) ? "/onboarding" : "/app")
      } catch (err) {
        console.error("Failed to route signed-in user", err)
      }
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [router])

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSigningIn(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      const user = auth.currentUser
      if (user) {
        // A full navigation, so the signed-in shell mounts with a clean tree.
        window.location.href = (await needsOnboarding(user.uid)) ? "/onboarding" : "/app"
      }
    } catch (err) {
      setError(messageForCode(codeOf(err)))
    } finally {
      setSigningIn(false)
    }
  }

  /**
   * One path for every device now. Supabase's OAuth is a full-page redirect, so
   * the popup-versus-redirect branching this used to do — and the
   * `auth/popup-blocked` fallback under it — no longer has anything to choose
   * between: the browser leaves for Google and comes back to /auth/callback.
   */
  const handleGoogleSignIn = async () => {
    setError("")
    try {
      setSigningIn(true)
      await signInWithRedirect(auth, new GoogleAuthProvider())
    } catch (err) {
      setError(`Couldn't sign in with Google. ${textOf(err)}`.trim())
      setSigningIn(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Enter your email address first, then tap Forgot password.")
      return
    }
    setResetting(true)
    setError("")
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to send the reset email.")
      setResetSent(true)
    } catch (err) {
      setError(textOf(err) || "Couldn't send the reset email. Please try again.")
    } finally {
      setResetting(false)
    }
  }

  // Nothing renders until mount: the saved-account list comes from
  // localStorage, and rendering it on the server would flash the wrong panel.
  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden="true" />
        <span className="sr-only">Loading</span>
      </div>
    )
  }

  const pickingAccount = showSaved && savedAccounts.length > 0

  return (
    <AuthShell
      title={pickingAccount ? "Choose an account" : "Welcome back"}
      lede={
        pickingAccount
          ? "Carry on where you left off, or sign in with a different account."
          : "Sign in to keep your streak, your progress and your weak-topic list."
      }
      footer={
        <>
          New to AeroLearn?{" "}
          <Link href="/auth/signup" className="link-inline inline-flex items-center gap-1">
            Create an account
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </>
      }
    >
      {pickingAccount ? (
        <div className="space-y-2">
          {savedAccounts.map((account, i) => (
            <button
              key={`${account.email}-${i}`}
              type="button"
              onClick={() => {
                setEmail(account.email)
                setShowSaved(false)
              }}
              className="group flex w-full items-center gap-4 rounded-lg border border-hairline bg-surface p-3 text-left transition-colors hover:border-accent/45 hover:bg-surface-hover"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-hairline bg-surface-sunken">
                {account.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={account.photoURL} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="font-display text-body-sm font-semibold text-accent">
                    {account.displayName.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm font-semibold text-foreground">
                  {account.displayName}
                </span>
                <span className="block truncate text-caption text-muted">{account.email}</span>
              </span>
              <ArrowRight
                className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-accent"
                aria-hidden="true"
              />
            </button>
          ))}

          <AuthDivider />

          <button
            type="button"
            onClick={() => {
              setEmail("")
              setShowSaved(false)
            }}
            className="btn-secondary btn-block"
          >
            Sign in to another account
          </button>
        </div>
      ) : (
        <>
          {error && (
            <p
              role="alert"
              className="mb-5 flex items-start gap-2 rounded-lg border border-danger/35 bg-danger/10 px-4 py-3 text-body-sm font-medium text-danger"
            >
              {error}
            </p>
          )}

          {resetSent && (
            <p
              role="status"
              className="mb-5 flex items-start gap-2 rounded-lg border border-success/35 bg-success/10 px-4 py-3 text-body-sm font-medium text-success"
            >
              Reset email sent. Check your inbox — and your spam folder.
            </p>
          )}

          <form onSubmit={handleEmailSignIn} className="space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="field-label">
                Email address
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
                  aria-hidden="true"
                />
                <input
                  id="email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="name@example.com"
                  className="input-premium pl-10"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <label htmlFor="password" className="field-label mb-0">
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetting}
                  className="link-quiet text-caption font-semibold disabled:opacity-50"
                >
                  {resetting ? "Sending…" : "Forgot password?"}
                </button>
              </div>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
                  aria-hidden="true"
                />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Your password"
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

            <button type="submit" disabled={signingIn} className="btn-primary btn-lg btn-block">
              {signingIn && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {signingIn ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <AuthDivider label="or continue with" />

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={signingIn}
            className="btn-secondary btn-lg btn-block"
          >
            <GoogleMark className="h-4 w-4" />
            Google
          </button>
        </>
      )}
    </AuthShell>
  )
}
