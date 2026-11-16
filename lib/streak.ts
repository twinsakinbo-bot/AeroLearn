const lagosClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
})

/** Calendar days follow the student's Nigeria day, not UTC or the browser clock. */
export function lagosDayKey(now: Date = new Date()): string {
  const parts = Object.fromEntries(lagosClock.formatToParts(now).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function dayGap(earlier: unknown, later: string): number | null {
  if (typeof earlier !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(earlier)) return null
  const first = Date.parse(`${earlier}T00:00:00Z`)
  const second = Date.parse(`${later}T00:00:00Z`)
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null
  return Math.round((second - first) / 86_400_000)
}

type StreakProfile = {
  lastActiveDate?: unknown
  lastLoginDate?: unknown
  streak?: unknown
  longestStreak?: unknown
  coins?: unknown
  inventory?: unknown
}

function lastDay(profile: StreakProfile): string | null {
  const days = [profile.lastActiveDate, profile.lastLoginDate]
    .filter((value): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
  return days.sort().at(-1) || null
}

export function nextLoginStreak(profile: StreakProfile, today: string) {
  const last = lastDay(profile)
  const gap = dayGap(last, today)
  const previous = Math.max(0, Number(profile.streak) || 0)
  const inventory = Array.isArray(profile.inventory) ? profile.inventory.filter((item): item is string => typeof item === "string") : []
  if (gap !== null && gap <= 0) return { updated: false, streak: previous, longestStreak: Number(profile.longestStreak) || previous, coins: Number(profile.coins) || 0, lastActiveDate: last, inventory }

  let usedFreeze = false
  let streak = 1
  if (gap === 1 && previous > 0) streak = previous + 1
  if (gap === 2 && previous > 0 && inventory.includes("streak_freeze")) {
    usedFreeze = true
    streak = previous + 1
    inventory.splice(inventory.indexOf("streak_freeze"), 1)
  }
  return {
    updated: true,
    streak,
    longestStreak: Math.max(Number(profile.longestStreak) || 0, streak),
    coins: (Number(profile.coins) || 0) + 10,
    lastActiveDate: today,
    inventory,
    usedFreeze,
  }
}

/** A missed day is lost automatically, even if the student has not returned. */
export function dormantStreak(profile: StreakProfile, today: string): number {
  const gap = dayGap(lastDay(profile), today)
  const current = Math.max(0, Number(profile.streak) || 0)
  const hasFreeze = Array.isArray(profile.inventory) && profile.inventory.includes("streak_freeze")
  return gap !== null && (gap > 2 || (gap === 2 && !hasFreeze)) ? 0 : current
}

export function streakWarningDue(profile: StreakProfile, today: string): boolean {
  return dayGap(lastDay(profile), today) === 1 && Math.max(0, Number(profile.streak) || 0) > 0 &&
    !(Array.isArray(profile.inventory) && profile.inventory.includes("streak_freeze"))
}
