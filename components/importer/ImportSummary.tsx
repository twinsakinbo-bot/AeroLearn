/**
 * ImportSummary — what actually landed in the question bank.
 *
 * Fixed here: it imported `useEffect` and never used it (with a comment promising
 * an animation that was never written); "Replaced" was hidden whenever the count
 * was 0, so the grid silently changed from four figures to three and the columns
 * reflowed; and the whole panel was hardcoded `bg-white` / `bg-green-100` /
 * `bg-blue-600` on a dark admin background. The failure list was also unbounded —
 * a bad file could print a thousand lines with no way to scroll past them.
 */
"use client"

import Link from "next/link"
import { CheckCircle2, RotateCcw } from "lucide-react"

import { cn } from "@/lib/utils"

export interface ImportSummaryProps {
  result: {
    imported: number
    skipped: number
    replaced: number
    failed: number
    failures: string[]
    exam: string
    subject: string
    year: number
  }
  onImportAnother: () => void
  /** Where "View questions" goes. The old page assigned to `window.location`. */
  questionsHref?: string
}

export function ImportSummary({
  result,
  onImportAnother,
  questionsHref = "/admin/questions",
}: ImportSummaryProps) {
  const figures = [
    { label: "Added", value: result.imported, tone: "text-success" },
    { label: "Replaced", value: result.replaced, tone: "text-accent" },
    { label: "Already there", value: result.skipped, tone: "text-warn" },
    { label: "Failed", value: result.failed, tone: "text-danger" },
  ] as const

  const shown = result.failures.slice(0, 25)
  const hidden = result.failures.length - shown.length

  return (
    <div className="mx-auto max-w-xl space-y-5 text-center">
      <div className="animate-scale-in">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 size={32} aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-h2 font-bold text-foreground">Import finished</h2>
        <p className="mt-1 text-body-sm text-muted">
          {result.imported === 0
            ? "Nothing new was written."
            : `${result.imported} question${result.imported === 1 ? "" : "s"} ${
                result.imported === 1 ? "is" : "are"
              } now live for students.`}
        </p>
      </div>

      <section className="card p-5 text-left">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {figures.map((figure) => (
            <div
              key={figure.label}
              className="rounded-xl border border-hairline bg-surface-sunken p-3 text-center"
            >
              <dd className={cn("text-h3 font-bold tabular-nums", figure.tone)}>
                {figure.value}
              </dd>
              <dt className="mt-0.5 text-overline uppercase text-subtle">{figure.label}</dt>
            </div>
          ))}
        </dl>

        <dl className="mt-4 grid gap-1.5 border-t border-hairline pt-4 text-caption sm:grid-cols-3">
          <div>
            <dt className="text-subtle">Exam</dt>
            <dd className="font-medium text-foreground">{result.exam || "from the file"}</dd>
          </div>
          <div>
            <dt className="text-subtle">Subject</dt>
            <dd className="font-medium text-foreground">{result.subject || "from the file"}</dd>
          </div>
          <div>
            <dt className="text-subtle">Year</dt>
            <dd className="font-medium text-foreground tabular-nums">
              {result.year || "from the file"}
            </dd>
          </div>
        </dl>
      </section>

      {result.failures.length > 0 && (
        <section className="card border-danger/25 bg-danger/[0.04] p-5 text-left">
          <h3 className="text-body-sm font-semibold text-foreground">
            {result.failed} row{result.failed === 1 ? "" : "s"} could not be written
          </h3>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
            {shown.map((failure, index) => (
              <li key={index} className="text-caption text-danger">
                {failure}
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <p className="mt-2 text-caption text-muted">…and {hidden} more.</p>
          )}
        </section>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onImportAnother} className="btn-secondary">
          <RotateCcw size={16} aria-hidden="true" />
          Import another file
        </button>
        <Link href={questionsHref} className="btn-primary">
          View questions
        </Link>
      </div>


    </div>
  )
}

