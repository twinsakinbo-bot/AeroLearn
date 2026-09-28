"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Download,
  FileJson,
  Loader2,
  UploadCloud,
} from "lucide-react"

import { PageHeader } from "@/components/ui/page-header"
import { CLASS_LEVELS, SUBJECTS } from "@/lib/constants"
import { auth } from "@/lib/auth"
import type { Lesson, LessonExample } from "@/lib/types/lesson"
import { cn } from "@/lib/utils"

/**
 * Bulk lesson import from a JSON file.
 *
 * Four real problems fixed:
 *
 * 1. **It always sent `duplicateAction: "replace"`.** The API deletes the
 *    existing document for any lesson matching subject + class + topic, so an
 *    import that happened to repeat a topic title destroyed the notes, video and
 *    homework already written for it — with nothing in the UI saying so. The
 *    action is now a choice, it defaults to *skip*, and replace is labelled for
 *    what it does.
 * 2. **Validation stopped at the first problem.** One `throw` per missing field
 *    meant a 40-lesson file was fixed one error per upload. Every row is checked
 *    and every problem listed; valid rows can be imported without the rest.
 * 3. **A subject or class the app does not know about imported silently.** The
 *    Learn page queries on exact `subject` and `classLevel` strings, so
 *    "Mathematics " or "SS3" produced a lesson no student could ever reach. Those
 *    are flagged before the write.
 * 4. **The progress line always read "0 / N".** `imported` only arrives with the
 *    response, so the counter could never move. It says what is actually
 *    happening instead.
 *
 * Also: four unused imports (`db`, `collection`, `getDocs`, `Download`) are gone
 * or now used, `window.location.href` is a `Link`, and the whole screen uses the
 * theme tokens — it was hardcoded `bg-white` / `bg-blue-50` / `text-gray-700`,
 * which rendered as white cards on the dark admin background.
 */

type ImportResult = {
  imported?: number
  replaced?: number
  skipped?: number
  failed?: number
  failures?: string[]
}

type Row = {
  index: number
  lesson: Lesson
  errors: string[]
  warnings: string[]
}

type DuplicateAction = "skip" | "replace"

const MAX_BYTES = 5 * 1024 * 1024

const SAMPLE = [
  {
    subject: "Mathematics",
    classLevel: "SS 3",
    term: "First Term",
    topicTitle: "Quadratic equations",
    content:
      "## What a quadratic is\n\nAn equation where the highest power of the unknown is 2.\n\n### Solving by factorising\n\nSplit the middle term so the two brackets multiply back to the original.",
    videoUrl: "https://www.youtube.com/watch?v=EXAMPLE",
    examples: [{ title: "Factorising", content: "Solve x² − 5x + 6 = 0 by factorising." }],
    homework: [
      {
        exam: "WAEC",
        year: 2023,
        subject: "Mathematics",
        question: "Solve x² − 4 = 0.",
        options: { A: "±2", B: "±4", C: "2 only", D: "4 only" },
        correctAnswer: "A",
        explanation: "x² = 4, so x is either 2 or −2.",
      },
    ],
  },
]

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function size(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

/** Strip the markdown so the preview line reads as a sentence. */
function plain(value: unknown): string {
  return text(value).replace(/[#*`_[\]()>]/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * The lesson page renders `example.title` and `example.content`, so a file that
 * wrote its examples as plain strings displayed an empty card. Strings are
 * accepted and wrapped; anything with no content at all is dropped.
 */
function toExamples(value: unknown): { examples: LessonExample[]; dropped: number } {
  if (!Array.isArray(value)) return { examples: [], dropped: 0 }

  const examples: LessonExample[] = []
  let dropped = 0

  for (const entry of value) {
    if (typeof entry === "string") {
      const content = entry.trim()
      if (content) examples.push({ content })
      else dropped += 1
      continue
    }
    if (entry && typeof entry === "object") {
      const source = entry as Record<string, unknown>
      const content = text(source.content) || text(source.body) || text(source.text)
      const title = text(source.title)
      if (content) examples.push(title ? { title, content } : { content })
      else dropped += 1
      continue
    }
    dropped += 1
  }

  return { examples, dropped }
}
/**
 * Every problem in one pass. Errors block a row from being written; warnings let
 * it through but say what will be odd about it once it is in the database.
 */
function check(entry: unknown, index: number, seen: Map<string, number>): Row {
  const source = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>
  const errors: string[] = []
  const warnings: string[] = []

  const subject = text(source.subject)
  const classLevel = text(source.classLevel)
  const topicTitle = text(source.topicTitle)
  const content = text(source.content)
  const term = text(source.term)

  if (!subject) errors.push("No subject.")
  if (!classLevel) errors.push("No class level.")
  if (!topicTitle) errors.push("No topic title.")
  if (!content) errors.push("No notes — content is empty.")

  if (subject && !(SUBJECTS as readonly string[]).includes(subject)) {
    warnings.push(
      `"${subject}" is not one of the app's subjects, so the lesson will not show on the Learn page.`,
    )
  }
  if (classLevel && !(CLASS_LEVELS as readonly string[]).includes(classLevel)) {
    warnings.push(`"${classLevel}" is not one of the app's class levels — check the spacing.`)
  }
  if (!term) warnings.push("No term, so it will be grouped under General.")

  const { examples, dropped } = toExamples(source.examples)
  if (dropped > 0) {
    warnings.push(
      `${dropped} example${dropped === 1 ? " has" : "s have"} no content and will not be imported.`,
    )
  }

  const fingerprint = `${subject}|${classLevel}|${topicTitle}`.toLowerCase()
  const first = seen.get(fingerprint)
  if (subject && classLevel && topicTitle) {
    if (first !== undefined) warnings.push(`Same subject, class and topic as lesson ${first + 1}.`)
    else seen.set(fingerprint, index)
  }

  return {
    index,
    errors,
    warnings,
    lesson: {
      subject,
      classLevel,
      topicTitle,
      content,
      term: term as Lesson["term"],
      videoUrl: text(source.videoUrl),
      examples,
      homework: Array.isArray(source.homework) ? (source.homework as Lesson["homework"]) : [],
    },
  }
}
function downloadSample() {
  const blob = new Blob([JSON.stringify(SAMPLE, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = "lesson-template.json"
  link.click()
  URL.revokeObjectURL(url)
}

export default function LessonImporterPage() {
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "complete">("upload")
  const [fileName, setFileName] = useState("")
  const [rows, setRows] = useState<Row[]>([])
  const [duplicates, setDuplicates] = useState<DuplicateAction>("skip")
  const [error, setError] = useState("")
  const [reading, setReading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const valid = useMemo(() => rows.filter((row) => row.errors.length === 0), [rows])
  const broken = useMemo(() => rows.filter((row) => row.errors.length > 0), [rows])
  const flagged = useMemo(() => valid.filter((row) => row.warnings.length > 0).length, [valid])

  const reset = () => {
    setStep("upload")
    setRows([])
    setFileName("")
    setResult(null)
    setError("")
  }

  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    if (file.size > MAX_BYTES) {
      setError("That file is over 5MB. Split it into smaller batches.")
      return
    }

    setReading(true)
    setError("")
    setFileName(file.name)
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const list = Array.isArray(parsed) ? parsed : [parsed]
      if (list.length === 0) throw new Error("The file has no lessons in it.")

      const seen = new Map<string, number>()
      const checked = list.map((entry, index) => check(entry, index, seen))
      setRows(checked)
      setStep("preview")
    } catch (cause) {
      setRows([])
      setError(
        cause instanceof SyntaxError
          ? "That is not valid JSON. Open it in an editor and check for a missing comma or bracket."
          : cause instanceof Error
            ? cause.message
            : "The file could not be read.",
      )
    } finally {
      setReading(false)
    }
  }
  const startImport = async () => {
    if (!auth.currentUser) {
      setError("Your session has expired. Sign in again before importing.")
      return
    }
    if (valid.length === 0) return

    setStep("importing")
    setError("")
    try {
      const token = await auth.currentUser.getIdToken()
      const response = await fetch("/api/import-lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          lessons: valid.map((row) => row.lesson),
          duplicateAction: duplicates,
        }),
      })

      const data = (await response.json()) as ImportResult & { error?: string }
      if (!response.ok) throw new Error(data.error || `The import failed (${response.status}).`)

      setResult(data)
      setStep("complete")
    } catch (cause) {
      console.error("Failed to import lessons:", cause)
      setError(cause instanceof Error ? cause.message : "The import failed.")
      setStep("preview")
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="Import lessons"
        subtitle="A JSON file of topics, notes and homework, written straight into the curriculum."
        actions={
          <>
            <button type="button" onClick={downloadSample} className="btn-secondary btn-sm">
              <Download size={14} aria-hidden="true" />
              Template file
            </button>
            <Link href="/admin/curriculum" className="btn-ghost btn-sm">
              Curriculum
            </Link>
          </>
        }
      />

      {error && (
        <p role="alert" className="field-error mb-6">
          {error}
        </p>
      )}
      {step === "upload" && (
        <div className="animate-fade-in space-y-4">
          <label
            htmlFor="lesson-file"
            className="card flex cursor-pointer flex-col items-center p-8 text-center transition hover:border-accent/40 sm:p-12"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
              {reading ? (
                <Loader2 size={24} className="animate-spin" aria-hidden="true" />
              ) : (
                <UploadCloud size={24} aria-hidden="true" />
              )}
            </span>
            <span className="mt-4 text-h4 font-semibold text-foreground">
              {reading ? "Reading the file…" : "Choose a JSON file"}
            </span>
            <span className="mt-2 max-w-md text-body-sm text-muted">
              Lessons are JSON only — the notes, examples and homework nest too deeply for a
              spreadsheet. Nothing is written until you have seen the preview.
            </span>
            <input
              id="lesson-file"
              type="file"
              accept=".json,application/json"
              disabled={reading}
              onChange={(event) => void chooseFile(event)}
              className="sr-only"
            />
          </label>

          <section className="card p-5">
            <h2 className="text-body-sm font-semibold text-foreground">What a lesson needs</h2>
            <ul className="mt-3 grid gap-1.5 text-caption text-muted sm:grid-cols-2">
              <li className="flex items-start gap-1.5">
                <Check size={13} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                <code className="font-mono">subject</code>, <code className="font-mono">classLevel</code>,{" "}
                <code className="font-mono">topicTitle</code>, <code className="font-mono">content</code>{" "}
                — required
              </li>
              <li className="flex items-start gap-1.5">
                <Check size={13} className="mt-0.5 shrink-0 text-subtle" aria-hidden="true" />
                <code className="font-mono">term</code>, <code className="font-mono">videoUrl</code>,{" "}
                <code className="font-mono">examples</code>, <code className="font-mono">homework</code>{" "}
                — optional
              </li>
            </ul>
            <p className="mt-3 text-caption text-subtle">
              <code className="font-mono">content</code> is markdown. Subject and class names must
              match the app's own exactly, or the lesson will not appear for students.
            </p>
          </section>
        </div>
      )}
      {step === "preview" && (
        <div className="animate-fade-in space-y-4">
          <section className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-h4 font-semibold text-foreground">
                  <FileJson size={16} className="shrink-0 text-subtle" aria-hidden="true" />
                  <span className="truncate">{fileName}</span>
                </h2>
                <p className="mt-1 text-caption text-muted">
                  {valid.length} ready to import
                  {broken.length > 0 && ` · ${broken.length} cannot be imported`}
                  {flagged > 0 && ` · ${flagged} with something to check`}
                </p>
              </div>
              <button type="button" onClick={reset} className="btn-ghost btn-sm">
                Choose another file
              </button>
            </div>
          </section>

          <fieldset className="card p-5">
            <legend className="field-label mb-3">
              If a topic already exists for that subject and class
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    id: "skip" as const,
                    title: "Leave the existing one alone",
                    hint: "The lesson in the file is not written. Nothing already in the curriculum changes.",
                  },
                  {
                    id: "replace" as const,
                    title: "Replace it",
                    hint: "Deletes the existing lesson — its notes, video and homework — and writes this one instead.",
                  },
                ] satisfies { id: DuplicateAction; title: string; hint: string }[]
              ).map((option) => (
                <label
                  key={option.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xl border p-3 transition",
                    duplicates === option.id
                      ? "border-accent ring-2 ring-accent/25"
                      : "border-hairline hover:border-accent/30",
                  )}
                >
                  <input
                    type="radio"
                    name="duplicates"
                    checked={duplicates === option.id}
                    onChange={() => setDuplicates(option.id)}
                    className="mt-0.5 accent-accent"
                  />
                  <span className="min-w-0">
                    <span className="block text-body-sm font-semibold text-foreground">
                      {option.title}
                    </span>
                    <span className="mt-0.5 block text-caption text-muted">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <ul className="space-y-2">
            {rows.map((row) => {
              const bad = row.errors.length > 0
              return (
                <li
                  key={row.index}
                  className={cn(
                    "card p-4",
                    bad && "border-danger/30 bg-danger/[0.04]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        bad ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent",
                      )}
                    >
                      {bad ? (
                        <AlertTriangle size={16} aria-hidden="true" />
                      ) : (
                        <BookOpen size={16} aria-hidden="true" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-caption tabular-nums text-subtle">
                          {row.index + 1}.
                        </span>
                        <h3 className="text-body-sm font-semibold text-foreground">
                          {row.lesson.topicTitle || "Untitled topic"}
                        </h3>
                      </div>

                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <span className="badge bg-surface-sunken text-subtle">
                          {row.lesson.subject || "No subject"}
                        </span>
                        <span className="badge bg-surface-sunken text-subtle">
                          {row.lesson.classLevel || "No class"}
                        </span>
                        {row.lesson.term && (
                          <span className="badge bg-surface-sunken text-subtle">
                            {row.lesson.term}
                          </span>
                        )}
                      </div>

                      {row.lesson.content && (
                        <p className="mt-2 line-clamp-2 text-caption text-muted">
                          {plain(row.lesson.content)}
                        </p>
                      )}
                      <p className="mt-2 flex flex-wrap gap-x-3 text-caption tabular-nums text-subtle">
                        <span>{size(row.lesson.examples)} examples</span>
                        <span>{size(row.lesson.homework)} homework</span>
                        {row.lesson.videoUrl && <span>Has a video</span>}
                      </p>

                      {row.errors.length > 0 && (
                        <ul role="alert" className="mt-2 space-y-0.5">
                          {row.errors.map((message) => (
                            <li key={message} className="text-caption font-medium text-danger">
                              {message}
                            </li>
                          ))}
                        </ul>
                      )}

                      {row.warnings.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {row.warnings.map((message) => (
                            <li key={message} className="text-caption text-warn">
                              {message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="card sticky bottom-4 flex flex-wrap items-center gap-3 border-hairline bg-surface/85 p-4 backdrop-blur-xl">
            <p className="min-w-0 flex-1 text-caption text-muted">
              {valid.length === 0
                ? "Nothing in this file can be imported yet."
                : `${valid.length} lesson${valid.length === 1 ? "" : "s"} will be written. ${
                    broken.length > 0 ? `${broken.length} will be left out.` : ""
                  }`}
            </p>
            <button type="button" onClick={reset} className="btn-secondary btn-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void startImport()}
              disabled={valid.length === 0}
              className="btn-primary btn-sm"
            >
              Import {valid.length || ""}
            </button>
          </div>
        </div>
      )}
      {step === "importing" && (
        <div className="card animate-fade-in p-8 text-center sm:p-12">
          <Loader2 size={28} className="mx-auto animate-spin text-accent" aria-hidden="true" />
          <h2 className="mt-4 text-h4 font-semibold text-foreground">
            Writing {valid.length} lesson{valid.length === 1 ? "" : "s"}
          </h2>
          <p className="mt-2 text-body-sm text-muted">
            Firestore writes these in batches. Leave the page open until it finishes.
          </p>
        </div>
      )}

      {step === "complete" && result && (
        <div className="animate-fade-in space-y-4">
          <section className="card p-8 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 size={26} aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-h3 font-bold text-foreground">Import finished</h2>
            <p className="mt-2 text-body-sm text-muted">
              {result.imported ?? 0} lesson{(result.imported ?? 0) === 1 ? "" : "s"} written from{" "}
              {fileName}.
            </p>

            <dl className="mx-auto mt-6 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  { label: "Written", value: result.imported ?? 0, tone: "text-success" },
                  { label: "Replaced", value: result.replaced ?? 0, tone: "text-warn" },
                  { label: "Skipped", value: result.skipped ?? 0, tone: "text-subtle" },
                  { label: "Failed", value: result.failed ?? 0, tone: "text-danger" },
                ] as const
              ).map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-hairline bg-surface-sunken p-3"
                >
                  <dd className={cn("text-h3 font-bold tabular-nums", stat.tone)}>{stat.value}</dd>
                  <dt className="mt-0.5 text-overline uppercase text-subtle">{stat.label}</dt>
                </div>
              ))}
            </dl>

            <div className="mt-7 flex flex-wrap justify-center gap-2">
              <Link href="/admin/curriculum" className="btn-primary btn-sm">
                See the curriculum
              </Link>
              <button type="button" onClick={reset} className="btn-secondary btn-sm">
                Import another file
              </button>
            </div>
          </section>

          {result.failures && result.failures.length > 0 && (
            <section className="card border-danger/30 p-5">
              <h3 className="text-body-sm font-semibold text-danger">What failed</h3>
              <ul className="mt-2 space-y-1">
                {result.failures.map((failure) => (
                  <li key={failure} className="text-caption text-muted">
                    {failure}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  )
}
