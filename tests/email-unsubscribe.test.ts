import assert from "node:assert/strict"
import { test } from "node:test"

import {
  studyEmailFootnote,
  unsubscribeHeaders,
  unsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from "../lib/email-unsubscribe"

const uid = "123e4567-e89b-12d3-a456-426614174000"

test("unsubscribe token belongs to one account and email address", () => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-only-signing-key"
  const token = unsubscribeToken(uid, "Student@Example.com")
  assert.equal(verifyUnsubscribeToken(token, "student@example.com"), uid)
  assert.equal(verifyUnsubscribeToken(token, "someone@example.com"), null)
  assert.equal(verifyUnsubscribeToken(`${uid}.invalid`, "student@example.com"), null)
})

test("study emails include a direct link and one-click mailbox headers", () => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-only-signing-key"
  const url = unsubscribeUrl(uid, "student@example.com")
  assert.match(url, /^https:\/\/aerolearn\.name\.ng\/api\/email\/unsubscribe\?token=/)
  assert.deepEqual(unsubscribeHeaders(url), {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  })
  assert.match(studyEmailFootnote(url), /Unsubscribe from these emails/)
  assert.match(studyEmailFootnote(url), /change your preferences/)
})
