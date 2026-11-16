import assert from "node:assert/strict"
import { test } from "node:test"

import { referenceQuery } from "../lib/ai-tutor-reference"

test("tutor lookup requests are parsed without exposing them as answers", () => {
  assert.equal(referenceQuery("[[LOOKUP: photosynthesis light reactions]]"), "photosynthesis light reactions")
  assert.equal(referenceQuery("Here is the answer."), null)
  assert.equal(referenceQuery("[[LOOKUP: x]]"), null)
})
