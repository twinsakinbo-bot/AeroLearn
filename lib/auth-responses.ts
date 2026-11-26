/** Identical response whether the address exists or delivery fails. */
export const PASSWORD_RESET_SENT = {
  success: true,
  message: "If an account exists, a password reset link will be sent. Check your inbox and spam folder.",
} as const
