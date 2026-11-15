import assert from "node:assert/strict"
import { test } from "node:test"

import { hasPermanentPaidAccess, isProUser, trustPassDecision } from "../lib/plan-access"
import { planDays, PURCHASABLE_PLANS } from "../lib/plans"

const now = Date.parse("2026-11-15T12:00:00Z")
const pendingReceipt = { userId: "student-1", status: "pending", receiptUrl: "https://example.com/receipt" }

test("every purchasable plan unlocks access for its duration", () => {
  for (const plan of PURCHASABLE_PLANS) {
    assert.equal(isProUser({ subscription: plan.id, proExpiresAt: plan.days === null ? null : new Date(now + plan.days * 86_400_000) }, now), true, plan.id)
    assert.equal(planDays(plan.id), plan.days)
  }
})

test("expired and malformed grants do not unlock paid features", () => {
  assert.equal(isProUser({ subscription: "monthly", proExpiresAt: new Date(now - 1) }, now), false)
  assert.equal(isProUser({ subscription: "monthly", proExpiresAt: "invalid date" }, now), false)
  assert.equal(isProUser({ subscription: "free" }, now), false)
  assert.equal(isProUser({ subscription: "lifetime", proExpiresAt: new Date(now - 1) }, now), true)
})

test("a pending receipt grants a pass only to its owner when they need it", () => {
  assert.equal(trustPassDecision({ subscription: "free" }, pendingReceipt, "student-1", now), "grant")
  assert.equal(trustPassDecision({ subscription: "free" }, pendingReceipt, "student-2", now), "invalid-receipt")
  assert.equal(trustPassDecision({ subscription: "free" }, { ...pendingReceipt, status: "rejected" }, "student-1", now), "invalid-receipt")
  assert.equal(trustPassDecision({ subscription: "lifetime" }, pendingReceipt, "student-1", now), "already-pro")
  assert.equal(trustPassDecision({ subscription: "pro", proExpiresAt: new Date(now - 1) }, pendingReceipt, "student-1", now), "already-used")
})

test("redeeming a finite code cannot replace permanent access", () => {
  assert.equal(hasPermanentPaidAccess({ subscription: "lifetime", proExpiresAt: null }), true)
  assert.equal(hasPermanentPaidAccess({ subscription: "pro", proExpiresAt: null }), true)
  assert.equal(hasPermanentPaidAccess({ subscription: "monthly", proExpiresAt: new Date(now + 86_400_000) }), false)
})
