import { PASSWORD_RESET_SENT } from "./auth-responses"

/** Neither account lookup nor provider failure may change the public response. */
export async function passwordResetResult(send: () => Promise<void>) {
  try {
    await send()
  } catch (error) {
    console.error("Password reset delivery failed:", error)
  }
  return PASSWORD_RESET_SENT
}
