/** Use a server-verified Auth record, never editable profile data or request fields. */
export function welcomeRecipient(account: { email?: string; emailVerified: boolean; displayName?: string }) {
  if (!account.emailVerified || !account.email) return null
  return { email: account.email, name: (account.displayName || "Student").slice(0, 100) }
}
