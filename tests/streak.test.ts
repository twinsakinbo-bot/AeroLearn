import assert from "node:assert/strict"
import test from "node:test"
import { dayGap, dormantStreak, lagosDayKey, nextLoginStreak, streakWarningDue } from "../lib/streak"

test("Nigeria calendar day changes at midnight Lagos, not midnight UTC", () => {
  assert.equal(lagosDayKey(new Date("2026-11-16T22:59:59Z")), "2026-11-16")
  assert.equal(lagosDayKey(new Date("2026-11-16T23:00:00Z")), "2026-11-17")
  assert.equal(dayGap("2026-11-16", "2026-11-17"), 1)
})

test("one visit per day awards one day and one login reward", () => {
  const first = nextLoginStreak({ streak: 4, lastActiveDate: "2026-11-15", coins: 20 }, "2026-11-16")
  assert.equal(first.streak, 5)
  assert.equal(first.coins, 30)
  assert.equal(nextLoginStreak({ ...first, lastLoginDate: "2026-11-16" }, "2026-11-16").updated, false)
})

test("missed days reset the streak; one freeze covers exactly one missed day", () => {
  const profile = { streak: 8, longestStreak: 12, lastActiveDate: "2026-11-14" }
  assert.equal(nextLoginStreak(profile, "2026-11-16").streak, 1)
  const frozen = nextLoginStreak({ ...profile, inventory: ["streak_freeze", "gold_frame"] }, "2026-11-16")
  assert.equal(frozen.streak, 9)
  assert.deepEqual(frozen.inventory, ["gold_frame"])
  assert.equal(nextLoginStreak({ ...profile, inventory: ["streak_freeze"] }, "2026-11-17").streak, 1)
})

test("inactive streaks become zero without login and warn on the last day", () => {
  const profile = { streak: 5, lastActiveDate: "2026-11-15" }
  assert.equal(streakWarningDue(profile, "2026-11-16"), true)
  assert.equal(dormantStreak(profile, "2026-11-16"), 5)
  assert.equal(dormantStreak(profile, "2026-11-17"), 0)
  assert.equal(streakWarningDue({ ...profile, inventory: ["streak_freeze"] }, "2026-11-16"), false)
  assert.equal(dormantStreak({ ...profile, inventory: ["streak_freeze"] }, "2026-11-17"), 5)
  assert.equal(dormantStreak({ ...profile, inventory: ["streak_freeze"] }, "2026-11-18"), 0)
})
