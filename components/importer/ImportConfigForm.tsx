/**
 * ImportConfigForm — the exam, year and subject used for any question in the
 * file that does not carry its own.
 *
 * Three real problems fixed:
 *
 * 1. **The exam list was not the app's.** It offered WACE, SAT, GRE, IGCSE,
 *    A-Level, IB and Cambridge, none of which appear in `EXAM_TYPES`, and the
 *    importer defaulted to "WACE" — a typo for WAEC. `exam` is an equality filter
 *    on every practice query and part of the duplicate fingerprint, so questions
 *    imported under it were unreachable and could not be de-duplicated against.
 *    Both lists now come from `lib/constants`.
 * 2. **"Other (specify in file)" set the value to the literal string "other".**
 *    Which was then written to every row missing that column. Leaving it to the
 *    file means an empty default, which is what this now sends.
 * 3. **It kept its own copy of the state.** `useState(initialConfig)` never
 *    resynced, so "Start over" on the importer left the form showing the previous
 *    file's exam and subject while the page held something else. It is controlled
 *    by its parent now.
 */
"use client"

import { EXAM_TYPES, SUBJECTS } from "@/lib/constants"

export interface ImportConfig {
  exam: string
  year: number
  subject: string
}

export interface ImportConfigFormProps {
  config: ImportConfig
  onChange: (config: ImportConfig) => void
}

const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: THIS_YEAR - 1999 }, (_, index) => THIS_YEAR - index)

export function ImportConfigForm({ config, onChange }: ImportConfigFormProps) {
  const set = <K extends keyof ImportConfig>(field: K, value: ImportConfig[K]) =>
    onChange({ ...config, [field]: value })

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div>
        <label htmlFor="import-exam" className="field-label">
          Exam
        </label>
        <select
          id="import-exam"
          value={config.exam}
          onChange={(event) => set("exam", event.target.value)}
          className="select-premium mt-1.5"
        >
          <option value="">Take it from the file</option>
          {EXAM_TYPES.map((exam) => (
            <option key={exam} value={exam}>
              {exam}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="import-year" className="field-label">
          Year
        </label>
        <select
          id="import-year"
          value={config.year}
          onChange={(event) => set("year", Number(event.target.value))}
          className="select-premium mt-1.5"
        >
          <option value={0}>Take it from the file</option>
          {YEARS.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="import-subject" className="field-label">
          Subject
        </label>
        <select
          id="import-subject"
          value={config.subject}
          onChange={(event) => set("subject", event.target.value)}
          className="select-premium mt-1.5"
        >
          <option value="">Take it from the file</option>
          {SUBJECTS.map((subject) => (
            <option key={subject} value={subject}>
              {subject}
            </option>
          ))}
        </select>
      </div>

      <p className="field-hint sm:col-span-3">
        A row that has its own exam, year or subject column keeps it — these only
        fill the gaps. Rows left with nothing are reported rather than written.
      </p>
    </div>
  )
}
