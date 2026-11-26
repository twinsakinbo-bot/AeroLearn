import { NextResponse } from "next/server"

import { CLASS_LEVELS, DEPARTMENTS, EXAM_TYPES, SUBJECTS } from "@/lib/constants"
import { firstUnmetPasswordRule } from "@/lib/password-rules"
import { clientIp } from "@/lib/rate-limit"
import { enforceSharedRateLimit } from "@/lib/shared-rate-limit"
import { getSubjectLimit } from "@/lib/subscription"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { siteUrl } from "@/lib/site"
import { sendVerificationEmail } from "@/lib/verification-email"
import { signupFailure } from "@/lib/signup-errors"

export async function POST(request: Request) {
  const limited = await enforceSharedRateLimit("email-signup-ip", clientIp(request), { max: 5, windowMs: 15 * 60_000 })
  if (limited) return limited

  const body = await request.json().catch(() => null)
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body?.password === "string" ? body.password : ""
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim().slice(0, 100) : ""
  const rawSetup = body?.setup

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address you can open.", field: "email" }, { status: 400 })
  }
  const emailLimited = await enforceSharedRateLimit("email-signup-address", email, { max: 3, windowMs: 15 * 60_000 })
  if (emailLimited) return emailLimited
  if (!fullName) return NextResponse.json({ error: "Enter your name.", field: "name" }, { status: 400 })
  const unmet = firstUnmetPasswordRule(password)
  if (unmet) return NextResponse.json({ error: `Your password still needs ${unmet.toLowerCase()}.`, field: "password" }, { status: 400 })
  if (!rawSetup || typeof rawSetup !== "object" || !Array.isArray(rawSetup.subjects) || rawSetup.subjects.length === 0) {
    return NextResponse.json({ error: "Pick at least one subject.", field: "setup" }, { status: 400 })
  }
  const mode = ["school", "exam", "self_learning"].includes(rawSetup.learningMode) ? rawSetup.learningMode : null
  const subjects = rawSetup.subjects.filter((item: unknown) => typeof item === "string" && SUBJECTS.includes(item as typeof SUBJECTS[number]))
  if (!mode || !subjects.length || subjects.length > getSubjectLimit(null)) {
    return NextResponse.json({ error: "Check your goal and subject choices.", field: "setup" }, { status: 400 })
  }
  const setup = {
    learningMode: mode,
    schoolName: typeof rawSetup.schoolName === "string" ? rawSetup.schoolName.trim().slice(0, 100) : "",
    classLevel: CLASS_LEVELS.find((level) => level === rawSetup.classLevel) ?? "",
    department: DEPARTMENTS.find((item) => item === rawSetup.department) ?? "",
    examType: EXAM_TYPES.find((item) => item === rawSetup.examType) ?? "",
    subjects: [...new Set(subjects)],
    studyEmailsEnabled: rawSetup.studyEmailsEnabled !== false,
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email service is unavailable. Try again later." }, { status: 503 })
  }

  try {
    // generateLink creates the unconfirmed account and its one-time signup token
    // without dispatching Supabase's default email. Resend sends the sole message.
    const { data, error } = await getSupabaseAdmin().auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: { data: { full_name: fullName, aerolearn_setup: setup } },
    })
    if (error || !data.properties?.hashed_token) {
      const code = error?.code?.toLowerCase() ?? ""
      const detail = error?.message.toLowerCase() ?? ""
      if (code.includes("rate_limit") || error?.status === 429 || detail.includes("rate limit")) {
        return NextResponse.json({ error: signupFailure({ code: "rate_limit" }).message }, { status: 429, headers: { "Retry-After": "60" } })
      }
      if (detail.includes("already") || detail.includes("registered") || detail.includes("exists")) {
        return NextResponse.json({ error: "An account already uses this email. Sign in instead, or reset your password.", field: "email" }, { status: 409 })
      }
      if (code.includes("email_address_invalid") || detail.includes("email address") && detail.includes("invalid")) {
        return NextResponse.json({ error: "Use a real email address you can open. Temporary or test addresses may be rejected.", field: "email" }, { status: 400 })
      }
      if (detail.includes("password")) {
        return NextResponse.json({ error: "Use at least 6 characters with uppercase and lowercase letters, a number, and a special character.", field: "password" }, { status: 400 })
      }
      console.error("Signup link generation failed:", error)
      return NextResponse.json({ error: "Could not create your account. Please try again." }, { status: 500 })
    }

    const link = siteUrl(`/auth/action?mode=verifyEmail&kind=email&oobCode=${encodeURIComponent(data.properties.hashed_token)}`)
    try {
      await sendVerificationEmail(email, link)
      return NextResponse.json({ confirmationSent: true })
    } catch (mailError) {
      console.error("Signup confirmation email failed:", mailError)
      // The account exists. Let the student request another link rather than
      // retrying account creation and receiving an "already registered" error.
      return NextResponse.json({ confirmationSent: false })
    }
  } catch (error) {
    console.error("Signup failed:", error)
    return NextResponse.json({ error: "Could not create your account. Please try again." }, { status: 500 })
  }
}
