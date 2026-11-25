type SignupFailure = { message: string; field: "email" | "password" | null }

/** Supabase errors have provider codes, while some versions only return text. */
export function signupFailure(error: unknown): SignupFailure {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code || "").toLowerCase() : ""
  const detail = typeof error === "object" && error !== null && "message" in error
    ? String(error.message || "").toLowerCase() : ""

  if (code.includes("weak_password") || detail.includes("password should contain") || detail.includes("password is too weak")) {
    return { field: "password", message: "Use at least 6 characters with an uppercase letter, a lowercase letter, a number and a special character." }
  }
  if (code.includes("email_address_invalid") || code.includes("invalid_email") || detail.includes("email address") && detail.includes("invalid")) {
    return { field: "email", message: "Use a real email address you can open. Temporary or test addresses may be rejected." }
  }
  if (code.includes("user_already_exists") || code.includes("email_exists") || detail.includes("already registered") || detail.includes("already exists")) {
    return { field: "email", message: "An account already uses this email. Sign in instead, or reset your password." }
  }
  if (code.includes("rate_limit") || detail.includes("too many") || detail.includes("rate limit")) {
    return { field: null, message: "Too many signup attempts. Wait a few minutes before trying again." }
  }
  if (detail.includes("network") || detail.includes("fetch failed")) {
    return { field: null, message: "Connection problem. Check your internet and try again." }
  }
  return { field: null, message: "We couldn't create your account right now. Please try again in a moment." }
}
