/**
 * ValidationSummary — what the file added up to, before anything is written.
 *
 * The four figures reconcile against the total now: every row is exactly one of
 * ready, unusable, a repeat of an earlier row, or blank. It used to show five
 * unrelated numbers in hardcoded `bg-white` panels, and "Valid questions"
 * over-counted, because duplicates were filtered out of that list by position
 * after invalid rows had already been dropped from it.
 */
"use client"

import { Download } from "lucide-react"

import type { ValidationResult } from "@/lib/types/question"
import { cn } from "@/lib/utils"

export interface ValidationSummaryProps {
  result: ValidationResult
  onDownloadErrorReport: () => void
}

export function ValidationSummary({ result, onDownloadErrorReport }: ValidationSummaryProps) {
  const unusable = Object.values(result.errors).filter((entries) =>
    entries.some((entry) => entry.severity === "error"),
  ).length

  const figures = [
    { label: "Ready", value: result.validQuestions.length, tone: "text-success" },
    { label: "Unusable", value: unusable, tone: "text-danger" },
    { label: "Repeats", value: result.duplicates.length, tone: "text-warn" },
    { label: "Blank", value: result.blankRows.length, tone: "text-subtle" },
  ] as const

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h4 font-semibold text-foreground">
            {result.totalRows} row{result.totalRows === 1 ? "" : "s"} read
          </h2>
          <p className="mt-1 text-caption text-muted">
            Nothing has been written yet. Fix or delete what you need to below.
          </p>
        </div>

        {Object.keys(result.errors).length > 0 && (
          <button type="button" onClick={onDownloadErrorReport} className="btn-secondary btn-sm">
            <Download size={14} aria-hidden="true" />
            Error report
          </button>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {figures.map((figure) => (
          <div
            key={figure.label}
            className="rounded-xl border border-hairline bg-surface-sunken p-3 text-center"
          >
            <dd className={cn("text-h3 font-bold tabular-nums", figure.tone)}>{figure.value}</dd>
            <dt className="mt-0.5 text-overline uppercase text-subtle">{figure.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  )
}
