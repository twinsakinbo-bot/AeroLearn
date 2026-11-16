/** Keep retries inside Vercel's five-minute function limit. */
export const LESSON_RETRY_DELAYS_MS = [2_000, 4_000, 6_000, 8_000, 10_000] as const
export const RATE_LIMIT_DELAYS_MS = [10_000, 20_000, 30_000, 45_000, 60_000] as const
export const LESSON_ATTEMPTS = LESSON_RETRY_DELAYS_MS.length + 1
const ATTEMPT_TIMEOUT_MS = [80_000, 45_000, 30_000, 25_000, 20_000, 15_000] as const

export async function retryLessonAi<T>(
  action: (timeoutMs: number) => Promise<T>,
  deadline: number,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < LESSON_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now() - 5_000
    if (remaining < 5_000) break
    try {
      return await action(Math.min(ATTEMPT_TIMEOUT_MS[attempt], remaining))
    } catch (error) {
      lastError = error
      console.warn(`Lesson AI attempt ${attempt + 1}/${LESSON_ATTEMPTS} failed: ${error instanceof Error ? error.message : String(error)}`)
      if (attempt === LESSON_ATTEMPTS - 1) break
      const message = error instanceof Error ? error.message : String(error)
      const gap = /\(429\)/.test(message) ? RATE_LIMIT_DELAYS_MS[attempt] : LESSON_RETRY_DELAYS_MS[attempt]
      if (deadline - Date.now() - gap < 10_000) break
      await wait(gap)
    }
  }
  const reason = lastError instanceof Error ? lastError.message : "AI did not finish"
  const guidance = /\(402\)/.test(reason)
    ? " Coarena reported payment required (402); check the gateway balance or model access."
    : ""
  throw new Error(`Lesson AI stopped after retries. Saved work is kept for the next run. ${reason}${guidance}`)
}
