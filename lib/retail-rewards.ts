import { auth } from "./auth"
export async function retailReward(
  action: "lesson" | "practice" | "purchase",
  payload: Record<string, unknown>,
) {
  const token = await auth.currentUser?.getIdToken()
  const response = await fetch("/api/gamification/reward", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, payload }),
  })
  const result = await response.json()
  if (!response.ok) throw Error(result.error || "Could not save reward")
  return result
}
