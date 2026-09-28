/**
 * Question importer — turn a spreadsheet, JSON export or exam PDF into practice
 * questions, with a full review pass before anything is written.
 *
 * Eleven real defects fixed here, several of them expensive:
 *
 * 1. **The duplicate check issued one full-partition query per row.** For each of
 *    the file's questions it ran `where(exam) + where(subject)` and read *every*
 *    matching document. A 500-row single-subject file therefore ran the same query
 *    500 times — 500 × the whole partition in billed reads. It now runs once per
 *    distinct `exam|subject`, which for a normal file is once.
 * 2. **The workbook was parsed twice.** `getXlsxSheetNames` reads and inflates the
 *    entire workbook, and `parseXlsx` then did it again. `parseXlsx` already
 *    returns `sheetNames`, so one call does both.
 * 3. **The worksheet step was unreachable.** `setStep("worksheet")` was followed by
 *    `processRows`, which ended in `setStep("preview")` — so a multi-sheet workbook
 *    silently imported sheet 1 and no other sheet could be reached. The sheet
 *    picker now sits on the review screen, beside the data it controls.
 * 4. **Validation was computed once and never again.** Editing or deleting a row in
 *    the preview left the summary figures and every row's error list showing the
 *    state of the file as uploaded, so a fixed row still read as broken and the
 *    "Ready" count never moved. It is derived from the current rows now.
 * 5. **The error CSV had a 4-column header and 3-column rows** (`field` was never
 *    written), so every value sat under the wrong heading.
 * 6. **The step rail had two entries keyed `"preview"`** and picked the current one
 *    with a `reduce` that kept the last match, so "Validate" never lit up.
 * 7. **Progress was fake.** It was set to 0 before a single request and to the final
 *    numbers after it returned, so the bar sat at 0% and then vanished. The write is
 *    one batched round-trip with no per-row signal, so it now says so.
 * 8. **`skipped` was counted twice** — once on the client, which then removed those
 *    rows from the payload, and again from the server's own count.
 * 9. **In-file duplicates and blank rows were imported.** The payload was every row
 *    without a hard error; blank rows carry only a warning, and the server dedupes
 *    against Firestore but not within the payload, so a question repeated in the
 *    file was written twice.
 * 10. **`/api/parse-file` was called with no credentials** (and was itself open —
 *     both ends are fixed).
 * 11. **Parser warnings were discarded**, so a malformed row that PapaParse or the
 *     JSON reader rejected disappeared without a word.
 *
 * The default exam/year/subject were `"WACE"` (a typo for WAEC, and not in
 * `EXAM_TYPES`) and the current year. Because `exam` is an equality filter on every
 * practice query and part of the duplicate fingerprint, a wrong guess makes the
 * imported questions unreachable *and* undedupable, so nothing is guessed now.
 */
"use client"

import { useCallback, useMemo, useState } from "react"
import { auth } from "@/lib/auth"
import { collection, db, getDocs, query, where } from "@/lib/db"
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Upload,
  UploadCloud,
} from "lucide-react"

import { DuplicateAction, DuplicateWarning } from "@/components/importer/DuplicateWarning"
import { ErrorReport } from "@/components/importer/ErrorReport"
import { FileUploader } from "@/components/importer/FileUploader"
import { ImportConfig, ImportConfigForm } from "@/components/importer/ImportConfigForm"
import { ImportProgress } from "@/components/importer/ImportProgress"
import { ImportSummary } from "@/components/importer/ImportSummary"
import { QuestionPreviewTable } from "@/components/importer/QuestionPreviewTable"
import { ValidationSummary } from "@/components/importer/ValidationSummary"
import { WorksheetSelector } from "@/components/importer/WorksheetSelector"
import { PageHeader } from "@/components/ui/page-header"
import { parseCsv } from "@/lib/parsers/csv-parser"
import { parseXlsx } from "@/lib/parsers/excel-parser"
import { parseJson } from "@/lib/parsers/json-parser"
import { parseTextToRows } from "@/lib/parsers/text-parser"
import { normalizeRow } from "@/lib/question-normalizer"
import { validateQuestions } from "@/lib/question-validator"
import type { PracticeQuestion, RawRow, ValidationResult } from "@/lib/types/question"
import { generateFingerprint } from "@/lib/utils/fingerprint"
import { cn } from "@/lib/utils"

type Step = "upload" | "text" | "preview" | "importing" | "complete"

interface ImportResultData {
  imported: number
  skipped: number
  replaced: number
  failed: number
  failures: string[]
  exam: string
  subject: string
  year: number
}

/** One entry per rail position. `keys` is why "Review" covers the text screen. */
const RAIL = [
  { keys: ["upload"], label: "Upload", icon: UploadCloud },
  { keys: ["text", "preview"], label: "Review", icon: ClipboardCheck },
  { keys: ["importing"], label: "Write", icon: Upload },
  { keys: ["complete"], label: "Done", icon: CheckCircle2 },
] satisfies { keys: Step[]; label: string; icon: React.ElementType }[]

/** A parsed row plus the line of the file it came from, which survives deletions. */
interface PreviewRow {
  question: PracticeQuestion
  fileRow: number
}

const fingerprintOf = (question: PracticeQuestion) =>
  generateFingerprint({
    exam: question.exam,
    year: question.year,
    subject: question.subject,
    question: question.question,
  })

export default function QuestionImporterPage() {
  const [step, setStep] = useState<Step>("upload")
  const [config, setConfig] = useState<ImportConfig>({ exam: "", year: 0, subject: "" })

  const [file, setFile] = useState<File | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [sheet, setSheet] = useState("")
  const [extractedText, setExtractedText] = useState("")

  const [rows, setRows] = useState<PreviewRow[]>([])
  const [existing, setExisting] = useState<Set<string>>(new Set())
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>("skip")

  const [result, setResult] = useState<ImportResultData | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  /* Derived, not stored: an inline edit or a deletion has to change the figures.
     Storing the result of the first validation was the reason a row an admin had
     just fixed went on reading as broken. */
  const validation: ValidationResult = useMemo(
    () => validateQuestions(rows.map((row) => row.question)),
    [rows],
  )

  /* `validateQuestions` numbers rows by position (+2 for the header), which stops
     matching the file as soon as a row is deleted. The preview keeps positions;
     anything shown to the admin gets the real line number. */
  const forDisplay: ValidationResult = useMemo(() => {
    const lineOf = (position: number) => rows[position - 2]?.fileRow ?? position
    const errors: ValidationResult["errors"] = {}
    Object.entries(validation.errors).forEach(([key, entries]) => {
      const line = lineOf(Number(key))
      errors[line] = entries.map((entry) => ({
        ...entry,
        row: line,
        /* "Duplicate of row 7" is a position too, and would point at the wrong
           line the moment an earlier row is deleted. */
        message: entry.message.replace(
          /row (\d+)/,
          (_, position: string) => `row ${lineOf(Number(position))}`,
        ),
      }))
    })
    return { ...validation, errors }
  }, [validation, rows])

  const previewRows = useMemo(
    () =>
      rows.map((row, index) => ({
        question: row.question,
        errors: validation.errors[index + 2],
        isDuplicate:
          validation.duplicates.includes(index) || existing.has(fingerprintOf(row.question)),
        isBlank: validation.blankRows.includes(index),
      })),
    [rows, validation, existing],
  )

  const alreadyInBank = useMemo(
    () => rows.filter((row) => existing.has(fingerprintOf(row.question))).length,
    [rows, existing],
  )

  const ready = validation.validQuestions.length

  const reset = () => {
    setStep("upload")
    setFile(null)
    setSheetNames([])
    setSheet("")
    setExtractedText("")
    setRows([])
    setExisting(new Set())
    setResult(null)
    setNotes([])
    setError("")
  }

  /**
   * One query per distinct `exam|subject`, not one per row.
   *
   * This is display-only: it drives the count and the choice shown in the review,
   * and `/api/import-questions` re-checks against fresh data at write time, so a
   * question added by someone else in between is still handled correctly.
   */
  const findExisting = useCallback(async (questions: PracticeQuestion[]) => {
    const pairs = new Map<string, { exam: string; subject: string }>()
    questions.forEach((question) => {
      if (!question.exam || !question.subject) return
      pairs.set(`${question.exam}|${question.subject}`, {
        exam: question.exam,
        subject: question.subject,
      })
    })

    const found = new Set<string>()
    try {
      for (const pair of pairs.values()) {
        const snapshot = await getDocs(
          query(
            collection(db, "practiceQuestions"),
            where("exam", "==", pair.exam),
            where("subject", "==", pair.subject),
          ),
        )
        snapshot.forEach((document) => {
          const data = document.data()
          found.add(
            data.fingerprint ||
              generateFingerprint({
                exam: data.exam,
                year: data.year,
                subject: data.subject,
                question: data.question,
              }),
          )
        })
      }
      setExisting(found)
    } catch {
      /* Not fatal — the server checks again before writing. Say so rather than
         letting the review imply the bank has no matches. */
      setNotes((previous) => [
        ...previous,
        "Could not check the existing question bank from here. Duplicates will still be handled when you import.",
      ])
    }
  }, [])

  const ingest = useCallback(
    async (raw: RawRow[], parserErrors: string[]) => {
      const questions = raw.map((row, index) =>
        normalizeRow(row, { exam: config.exam, year: config.year, subject: config.subject }, index),
      )
      setRows(questions.map((question, index) => ({ question, fileRow: index + 2 })))
      setNotes(parserErrors.slice(0, 10))
      await findExisting(questions)
    },
    [config, findExisting],
  )

  /**
   * Word and PDF go to the server, which can only give back text. If question
   * shapes are found in it we go straight to the review; if not, the text itself
   * is shown so the admin can see what the file actually contained instead of a
   * bare "no questions found".
   *
   * The ID token is new. This route used to be called with no credentials at all,
   * and accepted that — it now requires an admin.
   */
  const handleDocument = useCallback(
    async (chosen: File) => {
      const user = auth.currentUser
      if (!user) throw new Error("Your session has expired. Sign in again.")

      const body = new FormData()
      body.append("file", chosen)

      const response = await fetch("/api/parse-file", {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        body,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "That file could not be read.")

      const text: string = data.rawText || ""
      setExtractedText(text)

      if (!text.trim()) {
        setNotes(
          data.errors?.length
            ? data.errors.slice(0, 10)
            : ["No text could be extracted. The file is probably a scan — it needs OCR first."],
        )
        setStep("text")
        return
      }

      const detected = parseTextToRows(text)
      if (detected.length === 0) {
        setNotes(["The text came through, but no question numbering could be found in it."])
        setStep("text")
        return
      }

      await ingest(detected, data.errors ?? [])
      setStep("preview")
    },
    [ingest],
  )

  const handleFile = useCallback(
    async (chosen: File) => {
      setError("")
      setNotes([])
      setBusy(true)
      setFile(chosen)
      const name = chosen.name.toLowerCase()

      try {
        if (name.endsWith(".csv")) {
          const parsed = await parseCsv(chosen)
          await ingest(parsed.rows, parsed.errors)
          setStep("preview")
        } else if (/\.(xlsx|xls|xlsb)$/.test(name)) {
          /* One read of the workbook, not two — `parseXlsx` returns the sheet
             names it already inflated. */
          const parsed = await parseXlsx(chosen)
          setSheetNames(parsed.sheetNames)
          setSheet(parsed.sheetNames[0] ?? "")
          await ingest(parsed.rows, parsed.errors)
          setStep("preview")
        } else if (name.endsWith(".json")) {
          const parsed = await parseJson(chosen)
          await ingest(parsed.rows, parsed.errors)
          setStep("preview")
        } else if (/\.(docx|doc|pdf)$/.test(name)) {
          await handleDocument(chosen)
        } else {
          throw new Error("Use a CSV, Excel, JSON, Word or PDF file.")
        }
      } catch (thrown) {
        setError(thrown instanceof Error ? thrown.message : "That file could not be read.")
        setStep("upload")
      } finally {
        setBusy(false)
      }
    },
    [handleDocument, ingest],
  )

  const switchSheet = useCallback(
    async (name: string) => {
      if (!file) return
      setError("")
      setBusy(true)
      setSheet(name)
      try {
        const parsed = await parseXlsx(file, { sheetName: name })
        await ingest(parsed.rows, parsed.errors)
      } catch (thrown) {
        setError(thrown instanceof Error ? thrown.message : `Sheet "${name}" could not be read.`)
      } finally {
        setBusy(false)
      }
    },
    [file, ingest],
  )

  const updateRow = useCallback((index: number, updated: PracticeQuestion) => {
    setRows((previous) =>
      previous.map((row, position) => (position === index ? { ...row, question: updated } : row)),
    )
  }, [])

  const removeRow = useCallback((index: number) => {
    setRows((previous) => previous.filter((_, position) => position !== index))
  }, [])

  /** Four columns, matching the header. `field` used never to be written. */
  const downloadErrorReport = useCallback(() => {
    const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
    const lines = ["row,field,message,severity"]
    Object.entries(forDisplay.errors).forEach(([row, entries]) => {
      entries.forEach((entry) => {
        lines.push([row, cell(entry.field), cell(entry.message), entry.severity].join(","))
      })
    })

    const url = URL.createObjectURL(
      new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" }),
    )
    const link = document.createElement("a")
    link.href = url
    link.download = `import-errors-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [forDisplay])

  /**
   * `validation.validQuestions` is exactly the set the review calls "Ready": no
   * hard errors, not blank, and not a repeat of an earlier row in the same file.
   * The old version sent every row without a hard error, which let blank rows
   * (warning only) and in-file repeats through — the server dedupes against
   * Firestore but not within the payload, so a question written twice in the file
   * was written twice to the bank.
   */
  const startImport = useCallback(async () => {
    const user = auth.currentUser
    if (!user) {
      setError("Your session has expired. Sign in again.")
      return
    }

    const payload = validation.validQuestions
    if (payload.length === 0) {
      setError("Nothing in this file can be imported yet. Fix the rows listed above.")
      return
    }

    setError("")
    setStep("importing")

    try {
      const response = await fetch("/api/import-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ questions: payload, duplicateAction }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "The import failed.")

      /* `skipped` comes from the server alone. The old page counted its own
         client-side skips and then added the server's count on top, having
         already removed those rows from the payload. */
      setResult({
        imported: data.imported ?? 0,
        skipped: data.skipped ?? 0,
        replaced: data.replaced ?? 0,
        failed: data.failed ?? 0,
        failures: data.failures ?? [],
        exam: config.exam,
        subject: config.subject,
        year: config.year,
      })
      setStep("complete")
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "The import failed.")
      setStep("preview")
    }
  }, [validation, duplicateAction, config])

  const railIndex = RAIL.findIndex((entry) => (entry.keys as Step[]).includes(step))

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Content"
        title="Import questions"
        subtitle="Read past-paper questions out of a file and add them to the practice bank. Nothing is written until you have seen it."
      />

      <ol className="card flex items-center justify-between p-4 sm:p-5">
        {RAIL.map((entry, index) => {
          const Icon = entry.icon
          const done = index < railIndex
          const current = index === railIndex
          return (
            <li key={entry.label} className="flex flex-1 items-center last:flex-none">
              <span className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border transition",
                    current
                      ? "border-accent bg-accent text-white"
                      : done
                        ? "border-accent/40 bg-accent/10 text-accent"
                        : "border-hairline bg-surface-sunken text-subtle",
                  )}
                >
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span
                  className={cn(
                    "text-caption font-medium",
                    current ? "text-foreground" : "text-subtle",
                  )}
                >
                  {entry.label}
                </span>
                {current && <span className="sr-only">(current step)</span>}
              </span>
              {index < RAIL.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "mx-2 mb-5 h-0.5 flex-1 rounded-full transition",
                    done ? "bg-accent/40" : "bg-hairline",
                  )}
                />
              )}
            </li>
          )
        })}
      </ol>

      {error && (
        <p role="alert" className="card flex items-start gap-2 border-danger/25 bg-danger/[0.04] p-4 text-body-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {step === "upload" && (
        <section className="card space-y-6 p-5 sm:p-6">
          <div>
            <h2 className="text-h4 font-semibold text-foreground">What is in this file?</h2>
            <p className="mt-1 text-caption text-muted">
              These fill any column the file is missing. Nothing is assumed — a row
              that ends up with no exam, year or subject is reported, not written.
            </p>
          </div>

          <ImportConfigForm config={config} onChange={setConfig} />

          <FileUploader onFileSelected={handleFile} disabled={busy} />

          <p className="text-caption text-subtle">
            This reads questions out of a file. It does not write any.
          </p>
        </section>
      )}

      {step === "text" && (
        <section className="card space-y-4 p-5 sm:p-6">
          <div>
            <h2 className="text-h4 font-semibold text-foreground">
              No questions found in {file?.name ?? "that file"}
            </h2>
            <p className="mt-1 text-caption text-muted">
              This is everything the server could read out of it. Questions are
              detected by their numbering — <code>1.</code>, <code>2.</code> and so on —
              so a file that numbers them differently has to be converted to a
              spreadsheet first.
            </p>
          </div>

          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-hairline bg-surface-sunken p-4 text-caption text-muted">
            {extractedText || "(nothing was extracted)"}
          </pre>

          <div className="flex justify-center">
            <button type="button" onClick={reset} className="btn-secondary">
              Try a different file
            </button>
          </div>
        </section>
      )}

      {step === "preview" && (
        <div className="space-y-5">
          {sheetNames.length > 1 && (
            <div className="card p-5">
              {/* On the review screen rather than a step of its own: the old page
                  pushed a "worksheet" step and then immediately replaced it with
                  the preview, so no sheet but the first was ever reachable. */}
              <WorksheetSelector
                sheetNames={sheetNames}
                selected={sheet}
                onSelect={switchSheet}
                busy={busy}
              />
            </div>
          )}

          <ValidationSummary result={forDisplay} onDownloadErrorReport={downloadErrorReport} />

          {notes.length > 0 && (
            <div className="card border-warn/25 bg-warn/[0.04] p-4">
              <h3 className="text-body-sm font-semibold text-foreground">
                While reading the file
              </h3>
              <ul className="mt-1.5 space-y-1">
                {notes.map((note, index) => (
                  <li key={index} className="text-caption text-warn">
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ErrorReport result={forDisplay} />

          <DuplicateWarning
            duplicateCount={alreadyInBank}
            selected={duplicateAction}
            onSelect={setDuplicateAction}
          />

          {extractedText && (
            <details className="card p-4">
              <summary className="cursor-pointer text-body-sm font-medium text-foreground">
                Text this was read from
              </summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-hairline bg-surface-sunken p-3 text-caption text-muted">
                {extractedText}
              </pre>
            </details>
          )}

          <QuestionPreviewTable
            questions={previewRows}
            onUpdateQuestion={updateRow}
            onRemoveQuestion={removeRow}
          />

          <div className="sticky bottom-4 z-10 card flex flex-wrap items-center justify-between gap-3 p-4 shadow-lg">
            <p className="text-caption text-muted">
              {ready === 0 ? (
                "Nothing here can be imported yet."
              ) : (
                <>
                  <span className="font-semibold text-foreground tabular-nums">{ready}</span> of{" "}
                  <span className="tabular-nums">{rows.length}</span> row
                  {rows.length === 1 ? "" : "s"} will be written
                  {alreadyInBank > 0 && duplicateAction === "skip" && (
                    <>, minus any of the {alreadyInBank} already in the bank</>
                  )}
                  .
                </>
              )}
            </p>

            <div className="flex gap-2">
              <button type="button" onClick={reset} className="btn-secondary btn-sm">
                Start over
              </button>
              <button
                type="button"
                onClick={startImport}
                disabled={ready === 0 || busy}
                className="btn-primary btn-sm"
              >
                {busy ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Upload size={14} aria-hidden="true" />
                )}
                Import {ready} question{ready === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "importing" && (
        <section className="card p-6 sm:p-8">
          <div className="mx-auto max-w-md text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Loader2 size={24} className="animate-spin" aria-hidden="true" />
            </span>
            <h2 className="mt-3 text-h4 font-semibold text-foreground">Writing to the bank</h2>
            <p className="mt-1 text-caption text-muted">
              Sent in batches of 500. Leave this page open.
            </p>

            <div className="mt-6 text-left">
              {/* Honest: the write is a single batched request, so there is no
                  per-row signal to report. The old bar sat at 0% throughout. */}
              <ImportProgress
                imported={0}
                failed={0}
                total={validation.validQuestions.length}
                indeterminate
              />
            </div>
          </div>
        </section>
      )}

      {step === "complete" && result && (
        <ImportSummary result={result} onImportAnother={reset} />
      )}
    </div>
  )
}


