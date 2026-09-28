/**
 * ErrorReport — the rows that need attention, worst first.
 *
 * Two things were wrong beyond the hardcoded `bg-red-50` / `bg-white` panels
 * that rendered as a white block on the dark admin background:
 *
 * 1. **Everything was styled and worded as an error.** Blank rows and duplicates
 *    carry `severity: "warning"` — they are skipped, not rejected — but they were
 *    listed under "Validation Errors" in red with a "(warning)" suffix, so an
 *    admin whose only finding was a trailing empty line saw a red error panel.
 *    Rows that genuinely cannot be imported are now separated from rows that are
 *    merely being skipped.
 * 2. **`Missing/invalid: ${e.field}`** printed raw field keys such as `optionC`
 *    and `correctAnswer` in front of a message that already said what was wrong,
 *    giving lines like "Missing/invalid: optionC — Missing option C".
 */
"use client"

import { AlertTriangle, XCircle } from "lucide-react"

import type { ValidationError, ValidationResult } from "@/lib/types/question"

export interface ErrorReportProps {
  result: ValidationResult
}

/** `optionC` → "Option C", `correctAnswer` → "Correct answer". */
function fieldLabel(field: string): string {
  if (field === "__blank") return "Row"
  if (field === "__duplicate") return "Duplicate"
  const spaced = field.replace(/([A-Z])/g, " $1").trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

type Group = { row: number; entries: ValidationError[] }

function group(result: ValidationResult, severity: ValidationError["severity"]): Group[] {
  return Object.entries(result.errors)
    .map(([row, entries]) => ({
      row: Number(row),
      entries: entries.filter((entry) => entry.severity === severity),
    }))
    .filter((entry) => entry.entries.length > 0)
    .sort((a, b) => a.row - b.row)
}

export function ErrorReport({ result }: ErrorReportProps) {
  const blocking = group(result, "error")
  const skipping = group(result, "warning")

  if (blocking.length === 0 && skipping.length === 0) return null

  return (
    <div className="space-y-4">
      {blocking.length > 0 && (
        <section className="card border-danger/25 bg-danger/[0.04] p-5">
          <h3 className="flex items-center gap-2 text-h4 font-semibold text-foreground">
            <XCircle size={18} className="text-danger" aria-hidden="true" />
            {blocking.length} row{blocking.length === 1 ? "" : "s"} cannot be imported
          </h3>
          <p className="mt-1 text-caption text-muted">
            These are left out of the import entirely. Fix them in the file and upload
            it again, or import the rest without them.
          </p>

          <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
            {blocking.map((entry) => (
              <li
                key={entry.row}
                className="rounded-xl border border-hairline bg-surface p-3"
              >
                <p className="text-body-sm font-semibold text-foreground">Row {entry.row}</p>
                <ul className="mt-1 space-y-0.5">
                  {entry.entries.map((error, index) => (
                    <li key={index} className="text-caption text-danger">
                      <span className="font-medium text-foreground">{fieldLabel(error.field)}</span>
                      {" — "}
                      {error.message}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {skipping.length > 0 && (
        <section className="card border-warn/25 bg-warn/[0.04] p-5">
          <h3 className="flex items-center gap-2 text-h4 font-semibold text-foreground">
            <AlertTriangle size={18} className="text-warn" aria-hidden="true" />
            {skipping.length} row{skipping.length === 1 ? "" : "s"} will be skipped
          </h3>
          <p className="mt-1 text-caption text-muted">
            Blank lines and repeats of a question already in the file. Nothing to fix
            unless one of these is a mistake.
          </p>

          <ul className="mt-4 max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {skipping.map((entry) => (
              <li key={entry.row} className="text-caption text-muted">
                <span className="font-semibold text-foreground">Row {entry.row}</span>
                {" — "}
                {entry.entries.map((error) => error.message).join("; ")}
              </li>
            ))}
          </ul>
        </section>
      )}

    </div>
  )
}

