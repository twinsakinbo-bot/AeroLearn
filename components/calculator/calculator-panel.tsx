"use client"

import { useState } from "react"
import { calculate, formatCalculatorResult } from "@/lib/calculator"

type Mode = "basic" | "scientific"

const BASIC_KEYS = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ".", "=", "+"]
const SCIENCE_KEYS = ["(", ")", "π", "^", "√", "sin", "cos", "tan", "log", "ln", "e", "Ans"]

export function CalculatorPanel({ mode, className = "" }: { mode: Mode; className?: string }) {
  const [expression, setExpression] = useState("")
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [degrees, setDegrees] = useState(true)

  const evaluate = () => {
    try {
      if (mode === "basic" && !/^[\d\s.+*/()×÷−-]+$/.test(expression)) throw new Error("Use the basic keys in JAMB practice mode.")
      const next = formatCalculatorResult(calculate(expression, degrees))
      setAnswer(next)
      setExpression(next)
      setError("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not calculate that expression.")
    }
  }

  const press = (key: string) => {
    if (key === "=") { evaluate(); return }
    if (key === "AC") { setExpression(""); setAnswer(null); setError(""); return }
    if (key === "DEL") { setExpression((value) => value.slice(0, -1)); setError(""); return }
    const inserted = key === "√" ? "sqrt(" : key === "π" ? "pi" : key === "Ans" ? answer || "" :
      ["sin", "cos", "tan", "log", "ln"].includes(key) ? `${key}(` : key
    setExpression((value) => (value + inserted).slice(0, 160))
    setError("")
  }

  return (
    <div className={`rounded-2xl border border-hairline bg-surface p-4 shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-body font-semibold text-foreground">{mode === "basic" ? "CBT-style calculator" : "Scientific calculator"}</h2>
        {mode === "scientific" && <button type="button" onClick={() => setDegrees((value) => !value)} className="rounded-lg border border-hairline px-2 py-1 text-caption font-semibold text-accent" aria-label={`Angle mode: ${degrees ? "degrees" : "radians"}. Change angle mode`}>{degrees ? "DEG" : "RAD"}</button>}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); evaluate() }} className="mt-3">
        <label htmlFor={`calculator-expression-${mode}`} className="sr-only">Calculation</label>
        <input
          id={`calculator-expression-${mode}`}
          value={expression}
          onChange={(event) => { setExpression(event.target.value.slice(0, 160)); setError("") }}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          className="w-full rounded-xl border border-hairline bg-surface-sunken px-4 py-3 text-right text-h3 tabular-nums text-foreground outline-none focus:border-accent"
        />
      </form>
      <p aria-live="polite" className="mt-2 min-h-5 text-right text-caption text-muted">{answer === null ? "Enter an expression" : `Answer: ${answer}`}</p>
      {error && <p role="alert" className="mt-2 text-caption text-danger">{error}</p>}
      {mode === "scientific" && <div className="mt-3 grid grid-cols-4 gap-2">{SCIENCE_KEYS.map((key) => <button key={key} type="button" onClick={() => press(key)} className="min-h-10 rounded-lg border border-hairline bg-surface-sunken text-body-sm font-semibold text-foreground hover:border-accent/40">{key}</button>)}</div>}
      <div className="mt-3 grid grid-cols-4 gap-2">
        <button type="button" onClick={() => press("AC")} className="col-span-2 min-h-11 rounded-lg bg-danger/[0.08] text-body-sm font-semibold text-danger">AC</button>
        <button type="button" onClick={() => press("DEL")} className="col-span-2 min-h-11 rounded-lg bg-surface-sunken text-body-sm font-semibold text-foreground">Delete</button>
        {BASIC_KEYS.map((key) => <button key={key} type="button" onClick={() => press(key)} className={`min-h-12 rounded-lg text-body font-semibold ${key === "=" ? "bg-accent text-white" : "border border-hairline bg-surface-sunken text-foreground hover:border-accent/40"}`}>{key}</button>)}
      </div>
      <p className="mt-3 text-caption leading-relaxed text-subtle">{mode === "basic" ? "Practice approximation of JAMB’s on-screen tool; its exact keys may differ on exam day." : "For learning and exam preparation. Check the instructions on each paper before using a physical calculator."}</p>
    </div>
  )
}
