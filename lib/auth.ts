/**
 * The Firebase-Auth-shaped client API, backed by Supabase Auth.
 *
 * Same idea as lib/db.ts: 30 files called `onAuthStateChanged(auth, ...)` and
 * read `user.uid`, so this keeps those signatures and maps them onto Supabase
 * sessions. Only the import line changed at each call site.
 *
 * Two behaviours genuinely differ, and call sites were adjusted for them:
 *   - Google sign-in redirects instead of opening a popup, because Supabase's
 *     OAuth flow is a full-page redirect. `signInWithPopup` therefore resolves
 *     with no user and the page navigates away.
 *   - Deleting an account needs the service role, so `deleteUser` posts to
 *     /api/auth/delete-account rather than acting locally.
 */
import type { Session, User as SupabaseUser } from "@supabase/supabase-js"

import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client"

/** The subset of Firebase's `User` the app reads. */
export interface User {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  emailVerified: boolean
  providerData: Array<{ providerId: string }>
  getIdToken(forceRefresh?: boolean): Promise<string>
}

function toUser(raw: SupabaseUser): User {
  const meta = (raw.user_metadata ?? {}) as Record<string, unknown>
  return {
    uid: raw.id,
    email: raw.email ?? null,
    displayName:
      (meta.full_name as string) ?? (meta.name as string) ?? raw.email?.split("@")[0] ?? null,
    photoURL: (meta.avatar_url as string) ?? (meta.picture as string) ?? null,
    emailVerified: Boolean(raw.email_confirmed_at ?? raw.confirmed_at),
    providerData: (raw.identities ?? []).map((i) => ({ providerId: i.provider })),
    async getIdToken() {
      const { data } = await getSupabase().auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error("Not signed in.")
      return token
    },
  }
}

/* --------------------------------------------------------------- session cache */

let cachedUser: User | null = null
let listening = false
/**
 * Whether the first session read has come back. New subscribers must not be
 * told "signed out" before this flips, or every guarded page would bounce to
 * /auth/login on load and only then discover the cookie session. Firebase had
 * the same rule — it waits for its token restore before the first callback.
 */
let resolved = false
const listeners = new Set<(user: User | null) => void>()

function publish(session: Session | null) {
  cachedUser = session?.user ? toUser(session.user) : null
  resolved = true
  for (const listener of listeners) listener(cachedUser)
}

/**
 * `auth.currentUser` is read synchronously in ten places, so the cache has to be
 * warm before those reads. Subscribing is deferred to first use rather than done
 * at import: this module is pulled into pages that Next prerenders, where there
 * is no browser and no session to read.
 */
function startListening() {
  if (listening || typeof window === "undefined" || !isSupabaseConfigured()) return
  listening = true
  const client = getSupabase()
  client.auth.getSession().then(({ data }) => publish(data.session))
  client.auth.onAuthStateChange((_event, session) => publish(session))
}

/** Stand-in for Firebase's `Auth`. `currentUser` stays live via the cache above. */
export const auth = {
  get currentUser(): User | null {
    startListening()
    return cachedUser
  },
  get app() {
    return { name: "aerolearn" }
  },
  /** `auth.signOut()` — the method form, which app/app/settings uses. */
  signOut(): Promise<void> {
    return signOut()
  },
}

export type Auth = typeof auth

/** Firebase took the app; there is nothing to pass here. */
export function getAuth(): typeof auth {
  return auth
}

/* ------------------------------------------------------------------ observers */

export type Unsubscribe = () => void

export function onAuthStateChanged(
  _auth: unknown,
  next: (user: User | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (typeof window === "undefined") return () => {}

  if (!isSupabaseConfigured()) {
    // Nothing configured yet: report "signed out" once so guarded pages render
    // their redirect instead of hanging on a loading spinner forever.
    const timer = setTimeout(() => next(null), 0)
    return () => clearTimeout(timer)
  }

  listeners.add(next)
  startListening()
  if (resolved) {
    const timer = setTimeout(() => next(cachedUser), 0)
    return () => {
      clearTimeout(timer)
      listeners.delete(next)
    }
  }
  void onError
  return () => listeners.delete(next)
}

/* ------------------------------------------------------------------ sign in/out */

function authFail(error: { message: string } | null, fallback: string): never {
  if (error instanceof Error) throw error
  throw new Error(error?.message || fallback)
}

export async function signInWithEmailAndPassword(
  _auth: unknown,
  email: string,
  password: string,
): Promise<{ user: User }> {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password })
  if (error || !data.user) authFail(error, "Could not sign you in.")
  publish(data.session)
  return { user: toUser(data.user!) }
}

export async function createUserWithEmailAndPassword(
  _auth: unknown,
  email: string,
  password: string,
  fullName?: string,
  setup?: Record<string, unknown>,
): Promise<{ user: User; needsEmailConfirmation: boolean }> {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName?.trim() || undefined, aerolearn_setup: setup } },
  })
  if (error || !data.user) authFail(error, "Could not create your account.")
  if (data.session) publish(data.session)
  return { user: toUser(data.user!), needsEmailConfirmation: !data.session }
}

export async function signOut(_auth?: unknown): Promise<void> {
  const { error } = await getSupabase().auth.signOut()
  if (error) authFail(error, "Could not sign you out.")
  publish(null)
}

/* --------------------------------------------------------------------- google */

export class GoogleAuthProvider {
  static readonly PROVIDER_ID = "google"
  readonly providerId = "google"
  private scopes: string[] = []
  addScope(scope: string): this {
    this.scopes.push(scope)
    return this
  }
  setCustomParameters(): this {
    return this
  }
}

/**
 * Supabase's OAuth is a full-page redirect, so this navigates away rather than
 * returning a signed-in user. Call sites treat the resolved value as "the
 * browser is leaving now" and stop.
 */
export async function signInWithPopup(
  _auth: unknown,
  _provider: GoogleAuthProvider,
): Promise<{ user: User | null }> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
  if (error) authFail(error, "Could not start Google sign-in.")
  return { user: null }
}

export const signInWithRedirect = signInWithPopup

/** The redirect lands on /auth/callback, which completes the exchange itself. */
export async function getRedirectResult(_auth?: unknown): Promise<{ user: User | null } | null> {
  const { data } = await getSupabase().auth.getSession()
  return data.session?.user ? { user: toUser(data.session.user) } : null
}

/* -------------------------------------------------------------------- profile */

export async function updateProfile(
  _user: User,
  profile: { displayName?: string | null; photoURL?: string | null },
): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (profile.displayName !== undefined) patch.full_name = profile.displayName
  if (profile.photoURL !== undefined) patch.avatar_url = profile.photoURL

  const { data, error } = await getSupabase().auth.updateUser({ data: patch })
  if (error) authFail(error, "Could not save your profile.")
  if (data.user) cachedUser = toUser(data.user)
}

/* ---------------------------------------------------- reauthenticate & delete */

/** `EmailAuthProvider.credential(email, password)` — just the pair, as Supabase wants it. */
export class EmailAuthProvider {
  static credential(email: string, password: string) {
    return { providerId: "password", email, password }
  }
}

/**
 * Firebase re-checked the password in place. Supabase has no "verify only" call,
 * so this signs in again with the same credentials — which refreshes the session
 * rather than replacing it, since it is the same account.
 */
export async function reauthenticateWithCredential(
  _user: User,
  credential: { email: string; password: string },
): Promise<{ user: User }> {
  return signInWithEmailAndPassword(null, credential.email, credential.password)
}

/**
 * Removing an account needs the service role, which cannot be shipped to the
 * browser, so this posts to a route that holds it. The route also deletes the
 * profile row — under Firebase, `delete-data` wiped the document and left the
 * login working.
 */
export async function deleteUser(user: User): Promise<void> {
  const token = await user.getIdToken()
  const response = await fetch("/api/auth/delete-account", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || "Could not delete your account.")
  }
  await getSupabase().auth.signOut()
  publish(null)
}

/* ------------------------------------------------------------- password reset */

export async function sendPasswordResetEmail(_auth: unknown, email: string): Promise<void> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/action?mode=resetPassword`,
  })
  if (error) authFail(error, "Could not send the reset email.")
}

/**
 * Firebase handed out an `oobCode` to verify before showing the new-password
 * form. Supabase's recovery link carries a token hash that, once verified,
 * *establishes a session* — so verifying is what authorises the password change
 * that `confirmPasswordReset` then makes.
 */
export async function verifyPasswordResetCode(_auth: unknown, code: string): Promise<string> {
  const { data, error } = await getSupabase().auth.verifyOtp({
    token_hash: code,
    type: "recovery",
  })
  if (error || !data.user) authFail(error, "This reset link is no longer valid.")
  publish(data.session)
  return data.user!.email ?? ""
}

export async function confirmPasswordReset(
  _auth: unknown,
  _code: string,
  newPassword: string,
): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password: newPassword })
  if (error) authFail(error, "Could not set your new password.")
}

/**
 * Email-address confirmation links.
 *
 * /api/auth/verify-email issues these as magic links, because Supabase's
 * `signup` link type needs the password and the server does not have it. Older
 * links — and anything Supabase's own confirmation mail sent — verify as
 * `email`, so that is tried second rather than reported as a dead link.
 */
export async function applyActionCode(_auth: unknown, code: string): Promise<void> {
  const client = getSupabase()
  const first = await client.auth.verifyOtp({ token_hash: code, type: "magiclink" })
  if (!first.error) {
    publish(first.data.session)
    return
  }
  const { data, error } = await client.auth.verifyOtp({ token_hash: code, type: "email" })
  if (error) authFail(first.error, "This confirmation link is no longer valid.")
  publish(data.session)
}

export async function sendEmailVerification(_user?: User): Promise<void> {
  const email = cachedUser?.email
  if (!email) throw new Error("Not signed in.")
  const { error } = await getSupabase().auth.resend({ type: "signup", email })
  if (error) authFail(error, "Could not resend the confirmation email.")
}



