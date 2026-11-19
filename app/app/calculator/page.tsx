"use client"

import { useState } from "react"
import Link from "next/link"
import { Calculator, FlaskConical, Zap, TrendingUp } from "lucide-react"
import { CalculatorPanel } from "@/components/calculator/calculator-panel"
import { PageHeader } from "@/components/ui/page-header"
import { formatCalculatorResult } from "@/lib/calculator"

type Field = { key: string; label: string; unit: string }
type Tool = { id: string; subject: string; name: string; formula: string; fields: Field[]; solve: (values: Record<string, number>) => string }
const field = (key: string, label: string, unit = ""): Field => ({ key, label, unit })
const positive = (value: number, label: string) => { if (value <= 0) throw new Error(`${label} must be greater than zero.`); return value }
const result = (value: number, unit = "") => { if (!Number.isFinite(value)) throw new Error("These values do not give a finite answer."); return `${formatCalculatorResult(value)}${unit ? ` ${unit}` : ""}` }

const TOOLS: Tool[] = [
  { id: "quadratic", subject: "Mathematics", name: "Quadratic roots", formula: "ax² + bx + c = 0", fields: [field("a", "a"), field("b", "b"), field("c", "c")], solve: ({ a, b, c }) => { if (a === 0) throw new Error("a cannot be zero for a quadratic equation."); const d = b * b - 4 * a * c; if (d < 0) return "No real roots (discriminant is negative)."; return `x = ${result((-b + Math.sqrt(d)) / (2 * a))} or ${result((-b - Math.sqrt(d)) / (2 * a))}` } },
  { id: "interest", subject: "Mathematics", name: "Simple interest", formula: "I = P × R × T / 100", fields: [field("p", "Principal"), field("r", "Annual rate", "%"), field("t", "Time", "years")], solve: ({ p, r, t }) => result(p * r * t / 100) },
  { id: "speed", subject: "Physics", name: "Speed", formula: "v = distance / time", fields: [field("distance", "Distance", "m"), field("time", "Time", "s")], solve: ({ distance, time }) => result(distance / positive(time, "Time"), "m/s") },
  { id: "force", subject: "Physics", name: "Force", formula: "F = m × a", fields: [field("mass", "Mass", "kg"), field("acceleration", "Acceleration", "m/s²")], solve: ({ mass, acceleration }) => result(mass * acceleration, "N") },
  { id: "ohm", subject: "Physics", name: "Ohm’s law", formula: "V = I × R", fields: [field("current", "Current", "A"), field("resistance", "Resistance", "Ω")], solve: ({ current, resistance }) => result(current * resistance, "V") },
  { id: "moles", subject: "Chemistry", name: "Amount of substance", formula: "n = mass / molar mass", fields: [field("mass", "Mass", "g"), field("molarMass", "Molar mass", "g/mol")], solve: ({ mass, molarMass }) => result(mass / positive(molarMass, "Molar mass"), "mol") },
  { id: "molarity", subject: "Chemistry", name: "Molar concentration", formula: "c = moles / volume", fields: [field("moles", "Amount", "mol"), field("volume", "Volume", "L")], solve: ({ moles, volume }) => result(moles / positive(volume, "Volume"), "mol/L") },
  { id: "dilution", subject: "Chemistry", name: "Dilution", formula: "C₁V₁ = C₂V₂; solve for V₂", fields: [field("c1", "Initial concentration", "mol/L"), field("v1", "Initial volume", "L"), field("c2", "Final concentration", "mol/L")], solve: ({ c1, v1, c2 }) => result(c1 * v1 / positive(c2, "Final concentration"), "L") },
  { id: "change", subject: "Economics", name: "Percentage change", formula: "(new − old) / old × 100", fields: [field("old", "Old value"), field("current", "New value")], solve: ({ old, current }) => result((current - old) / positive(old, "Old value") * 100, "%") },
  { id: "margin", subject: "Accounting", name: "Profit margin", formula: "(revenue − cost) / revenue × 100", fields: [field("revenue", "Revenue"), field("cost", "Cost")], solve: ({ revenue, cost }) => result((revenue - cost) / positive(revenue, "Revenue") * 100, "%") },
]
const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Economics", "Accounting"] as const
const EXAMS = ["Study", "JAMB", "WAEC", "NECO"] as const

export default function CalculatorPage() {
  const [exam, setExam] = useState<(typeof EXAMS)[number]>("Study")
  const [subject, setSubject] = useState<(typeof SUBJECTS)[number]>("Mathematics")
  const [toolId, setToolId] = useState("quadratic")
  const [values, setValues] = useState<Record<string, string>>({})
  const [toolResult, setToolResult] = useState("")
  const [toolError, setToolError] = useState("")
  const tools = TOOLS.filter((tool) => tool.subject === subject)
  const selected = tools.find((tool) => tool.id === toolId) || tools[0]

  const solve = () => {
    try {
      const parsed: Record<string, number> = {}
      for (const item of selected.fields) {
        const raw = values[item.key]?.trim()
        if (!raw) throw new Error(`Enter ${item.label.toLowerCase()}.`)
        const number = Number(raw)
        if (!Number.isFinite(number)) throw new Error(`${item.label} must be a valid number.`)
        parsed[item.key] = number
      }
      setToolResult(selected.solve(parsed))
      setToolError("")
    } catch (cause) {
      setToolResult("")
      setToolError(cause instanceof Error ? cause.message : "Check the values.")
    }
  }

  return <div className="animate-fade-in space-y-6">
    <PageHeader eyebrow="Study tools" title="Calculator lab" subtitle="Work through SS 1–SS 3 maths, science, and business calculations, then practise with the tools available in your exam." actions={<Link href="/app/practice" className="btn-secondary btn-sm">Try a quiz</Link>} />

    <div className="card grid items-center gap-4 p-5 sm:grid-cols-2 sm:p-6">
      <p className="text-body-sm text-muted"><strong className="text-foreground">Senior secondary:</strong> SS 1, SS 2, and SS 3 learners can use these tools.</p>
      <div><label htmlFor="calc-exam" className="field-label">Practice for</label><select id="calc-exam" value={exam} onChange={(event) => setExam(event.target.value as (typeof EXAMS)[number])} className="select-premium">{EXAMS.map((name) => <option key={name}>{name}</option>)}</select></div>
    </div>

    <section className="card p-5 sm:p-6" aria-label="Exam calculator guidance">
      <div className="flex items-start gap-3"><Calculator className="mt-0.5 shrink-0 text-accent" size={20} aria-hidden="true" /><div><h2 className="text-body font-semibold text-foreground">{exam === "JAMB" ? "JAMB CBT calculator" : exam === "Study" ? "Choose the right practice mode" : `${exam} calculator practice`}</h2>
        <p className="mt-1 text-body-sm leading-relaxed text-muted">{exam === "JAMB" ? "JAMB provides a calculator inside its CBT screen. Practise with the basic version below; do not take a physical calculator into the exam hall." : exam === "WAEC" ? "Practise with a silent, non-programmable scientific calculator. A question or paper can prohibit calculator use, so check its instructions." : exam === "NECO" ? "NECO permits scientific calculators and prohibits programmable calculators. Check the instructions for your particular paper." : "JAMB has an on-screen CBT calculator. WAEC and NECO allow eligible scientific calculators, subject to paper instructions."}</p>
        <div className="mt-2 flex flex-wrap gap-3 text-caption text-accent"><a href="https://jamb.gov.ng/PDFs/2026/2026%20TRAINING%20MANUAL%20%20final.pdf" target="_blank" rel="noopener noreferrer" className="underline">JAMB manual</a><a href="https://waecgh.org/wp-content/uploads/2024/07/MATHEMATICS.pdf" target="_blank" rel="noopener noreferrer" className="underline">WAEC mathematics syllabus</a><a href="https://neco.gov.ng/2025%20SSCE%20INTERNAL%20TIMETABLE.pdf" target="_blank" rel="noopener noreferrer" className="underline">NECO exam notes</a></div>
      </div></div>
    </section>

    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <CalculatorPanel key={exam} mode={exam === "JAMB" ? "basic" : "scientific"} />
      <section className="card p-5 sm:p-6">
        <div className="flex items-center gap-2"><FlaskConical size={19} className="text-accent" aria-hidden="true" /><h2 className="text-body font-semibold text-foreground">Subject formula tools</h2></div>
        <p className="mt-1 text-body-sm text-muted">These are study aids for learning formulas; exam calculator rules still apply.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label htmlFor="calc-subject" className="field-label">Subject</label><select id="calc-subject" className="select-premium" value={subject} onChange={(event) => { const next = event.target.value as (typeof SUBJECTS)[number]; setSubject(next); setToolId(TOOLS.find((tool) => tool.subject === next)?.id || ""); setValues({}); setToolResult(""); setToolError("") }}>{SUBJECTS.map((name) => <option key={name}>{name}</option>)}</select></div><div><label htmlFor="calc-tool" className="field-label">Formula</label><select id="calc-tool" className="select-premium" value={selected.id} onChange={(event) => { setToolId(event.target.value); setValues({}); setToolResult(""); setToolError("") }}>{tools.map((tool) => <option key={tool.id} value={tool.id}>{tool.name}</option>)}</select></div></div>
        <p className="mt-4 rounded-lg bg-accent/[0.06] px-3 py-2 text-body-sm font-semibold text-accent">{selected.formula}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{selected.fields.map((item) => <div key={item.key}><label htmlFor={`formula-${item.key}`} className="field-label">{item.label}{item.unit && ` (${item.unit})`}</label><input id={`formula-${item.key}`} type="number" step="any" inputMode="decimal" value={values[item.key] || ""} onChange={(event) => { setValues((before) => ({ ...before, [item.key]: event.target.value })); setToolResult(""); setToolError("") }} className="input-premium" /></div>)}</div>
        <button type="button" onClick={solve} className="btn-primary mt-5">Calculate</button>
        {toolResult && <p role="status" className="mt-4 rounded-lg border border-success/30 bg-success/[0.06] p-3 text-body-sm font-semibold text-foreground">{toolResult}</p>}
        {toolError && <p role="alert" className="mt-4 text-body-sm text-danger">{toolError}</p>}
      </section>
    </div>
    <p className="flex items-center gap-2 text-caption text-muted"><Zap size={15} aria-hidden="true" />Use the calculator for practice; show your working when a question asks for it. <TrendingUp size={15} aria-hidden="true" /></p>
  </div>
}
