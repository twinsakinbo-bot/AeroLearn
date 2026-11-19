/** Small expression evaluator for the study calculator. No eval or executable input. */
export function calculate(expression: string, degrees = true): number {
  if (!expression.trim() || expression.length > 160) throw new Error("Enter a calculation (up to 160 characters).")
  const input = expression.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/π/g, "pi")
  const tokens = input.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[a-zA-Z]+|[()+*/^%-]/g) || []
  if (tokens.join("") !== input.replace(/\s+/g, "")) throw new Error("This calculation contains an unsupported symbol.")
  let at = 0
  const peek = () => tokens[at]
  const take = () => tokens[at++]
  const expect = (value: string) => { if (take() !== value) throw new Error("Check the brackets in your calculation.") }

  function atom(): number {
    const token = take()
    if (token === "(") { const value = sum(); expect(")"); return value }
    if (token === "pi") return Math.PI
    if (token === "e") return Math.E
    if (["sqrt", "sin", "cos", "tan", "log", "ln", "abs"].includes(token)) {
      expect("(")
      const value = sum()
      expect(")")
      const angle = degrees ? value * Math.PI / 180 : value
      if (token === "sqrt") return Math.sqrt(value)
      if (token === "sin") return Math.sin(angle)
      if (token === "cos") return Math.cos(angle)
      if (token === "tan") return Math.tan(angle)
      if (token === "log") return Math.log10(value)
      if (token === "ln") return Math.log(value)
      return Math.abs(value)
    }
    if (token && /^(?:\d|\.)/.test(token)) return Number(token)
    throw new Error("Check the numbers and operators in your calculation.")
  }
  function power(): number {
    const value = atom()
    return peek() === "^" ? (take(), value ** signed()) : value
  }
  function signed(): number {
    if (peek() === "+") { take(); return signed() }
    if (peek() === "-") { take(); return -signed() }
    return power()
  }
  function product(): number {
    let value = signed()
    while (["*", "/", "%"].includes(peek())) {
      const op = take()
      const right = signed()
      value = op === "*" ? value * right : op === "/" ? value / right : value % right
    }
    return value
  }
  function sum(): number {
    let value = product()
    while (["+", "-"].includes(peek())) value += take() === "+" ? product() : -product()
    return value
  }
  const result = sum()
  if (at !== tokens.length) throw new Error("Check the numbers and operators in your calculation.")
  if (!Number.isFinite(result)) throw new Error("This calculation has no finite result. Check for division by zero or an invalid root.")
  return Math.abs(result) < 1e-12 ? 0 : result
}

export function formatCalculatorResult(value: number): string {
  return Number(value.toPrecision(12)).toString()
}
