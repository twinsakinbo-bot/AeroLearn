/**
 * Where Google sign-in lands.
 *
 * Firebase's popup handed the credential straight back to the page that opened
 * it. Supabase's OAuth is a full-page redirect that returns a one-time `code`, so
 * something server-side has to exchange it for a session and set the cookie —
 * that is this route. It then bounces the student to wherever they were headed.
 */
import { NextResponse } from "next/server"

import { getSupabaseServer } from "@/lib/supabase/server"
import { needsLearningSetup } from "@/lib/onboarding"

import { safeNextPath } from "@/lib/safe-redirect"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const next = safeNextPath(url.searchParams.get("next"), url.origin)

  const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error")
  if (oauthError) {
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(oauthError)}`, url.origin),
    )
  }

  if (!code) {
    return NextResponse.redirect(new URL("/auth/login?error=Sign-in%20was%20cancelled.", url.origin))
  }

  const supabase = await getSupabaseServer()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, url.origin),
    )
  }

  // Google hands over no class, department or subjects, so a first-time account
  // still has to pick them. The profile row itself already exists — a trigger on
  // auth.users creates it — and it has no `onboardingCompleted` until the wizard
  // sets it, which is exactly the signal for "this account is new".
  if (data.user) {
    const { data: profile } = await supabase
      .from("users")
      .select("data")
      .eq("id", data.user.id)
      .maybeSingle()

    if (needsLearningSetup(profile?.data)) return NextResponse.redirect(new URL("/onboarding", url.origin))
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
