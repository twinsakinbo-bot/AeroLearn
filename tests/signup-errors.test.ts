import assert from "node:assert/strict"
import test from "node:test"
import { firstUnmetPasswordRule } from "../lib/password-rules"
import { signupFailure } from "../lib/signup-errors"

test("password guidance matches the hosted policy", () => {
  assert.equal(firstUnmetPasswordRule("lowercase1!"), "One uppercase letter")
  assert.equal(firstUnmetPasswordRule("GoodPass1!"), null)
})

test("Supabase signup errors identify the field and useful next step", () => {
  assert.deepEqual(signupFailure(new Error("Password should contain at least one character of each: lowercase, uppercase, numbers, symbols")), {
    field: "password",
    message: "Use at least 6 characters with an uppercase letter, a lowercase letter, a number and a special character.",
  })
  assert.equal(signupFailure(new Error('Email address "chat@test.com" is invalid')).field, "email")
  assert.match(signupFailure(new Error("User already registered")).message, /Sign in instead/)
})
