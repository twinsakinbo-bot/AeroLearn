import assert from "node:assert/strict"
import { test } from "node:test"

import { verificationEmailHtml } from "../lib/verification-email"

test("confirmation email keeps the action link and escapes the recipient", () => {
  const html = verificationEmailHtml('student+<script>@example.com', 'https://aerolearn.name.ng/auth/action?oobCode=a&kind=email')
  assert.match(html, /Confirm email/)
  assert.match(html, /student\+&lt;script&gt;@example\.com/)
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /oobCode=a&amp;kind=email/)
  assert.match(html, /width="560"/)
})
