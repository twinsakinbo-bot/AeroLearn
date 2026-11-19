import assert from "node:assert/strict"
import { test } from "node:test"
import { calculate, formatCalculatorResult } from "../lib/calculator"

test("expression precedence and right-associative powers", () => {
  assert.equal(calculate("2+3×4"), 14)
  assert.equal(calculate("2^3^2"), 512)
  assert.equal(calculate("-2^2"), -4)
  assert.equal(calculate("(2+3)×4"), 20)
})

test("scientific functions use the chosen angle mode", () => {
  assert.ok(Math.abs(calculate("sin(30)") - 0.5) < 1e-12)
  assert.equal(calculate("sin(pi/2)", false), 1)
  assert.equal(calculate("sqrt(81)+log(100)"), 11)
})

test("invalid or unsafe input fails clearly", () => {
  assert.throws(() => calculate("1/0"), /finite result/)
  assert.throws(() => calculate("sqrt(-1)"), /finite result/)
  assert.throws(() => calculate("process.exit()"), /unsupported symbol|operators/)
  assert.equal(formatCalculatorResult(1 / 3), "0.333333333333")
})
