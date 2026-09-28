"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  CloudDownload,
  Key,
  Loader2,
  ShieldCheck,
  SkipForward,
} from "lucide-react"

import {
  QuestionPreviewTable,
  type QuestionPreviewRow,
} from "@/components/importer/QuestionPreviewTable"
import { PageHeader } from "@/components/ui/page-header"
import { auth } from "@/lib/auth"
import type { PracticeQuestion } from "@/lib/types/question"
import { cn } from "@/lib/utils"

/**
 * Sync past questions from ALOC (questions.aloc.com.ng).
 *
 * Four real problems fixed:
 *
 * 1. **Every imported question was stamped with the wrong year.** ALOC v2 returns
 *    `examyear` and `examtype`, all lowercase. This page read `q.examYear` and
 *    `q.examType`, which are always `undefined`, so the year fell back to the box
 *    in the form — or, with that box left blank as the hint suggested, to
 *    `new Date().getFullYear()`. A 2026 label on a 2011 question makes practising
 *    "JAMB 2011 Chemistry" meaningless, and the wrong year is in the fingerprint,
 *    so re-importing could not correct it either.
 * 2. **An unreadable answer key silently became `"A"`.** The old ternary ended
 *    `: "A"`, which writes a wrong answer into the bank and marks it correct.
 *    Rows ALOC gives no usable key for are dropped now, each with its reason.
 * 3. **The ALOC token sat in `localStorage` and was sent from the browser.** A
 *    third-party credential any script on the page could read, in a request ALOC
 *    sends no CORS headers for — so it was liable to be blocked before it ever
 *    arrived. It goes through /api/aloc now, which is admin-gated and prefers
 *    `ALOC_ACCESS_TOKEN` from the server environment.
 * 4. **Fetch and write were one button.** Nothing was ever previewed: whatever
 *    ALOC returned went straight into the question bank with `duplicateAction`
 *    hardcoded to skip. The questions are now listed and editable first.
 *
 * Also: `q.solution` became the literal string "No explanation provided." when
 * ALOC had none, which the question bank then displayed as though it were an
 * explanation; the subject was `subject.charAt(0).toUpperCase() + subject.slice(1)`,
 * giving "English" and "Crk" rather than the names every other query in the app
 * uses; and the screen was hardcoded `bg-blue-50` / `text-blue-900` / `bg-white`,
 * which renders as white cards on the dark admin background.
 */

type Step = "setup" | "preview" | "importing" | "complete"
type DuplicateAction = "skip" | "replace"

type Skipped = { question: string; reason: string }

type FetchResponse = {
  subject?: string
  exam?: string
  year?: number | null
  returned?: number
  questions?: PracticeQuestion[]
  skipped?: Skipped[]
  error?: string
}

type ImportResponse = {
  imported?: number
  replaced?: number
  skipped?: number
  failed?: number
  failures?: string[]
  error?: string
}

/** The slug ALOC expects, with the name /api/aloc maps it to. */
const SUBJECTS = [
  { slug: "mathematics", label: "Mathematics" },
  { slug: "english", label: "English Language" },
  { slug: "biology", label: "Biology" },
  { slug: "chemistry", label: "Chemistry" },
  { slug: "physics", label: "Physics" },
  { slug: "economics", label: "Economics" },
  { slug: "commerce", label: "Commerce" },
  { slug: "accounting", label: "Accounting" },
  { slug: "government", label: "Government" },
  { slug: "history", label: "History" },
  { slug: "geography", label: "Geography" },
  { slug: "literature", label: "Literature-in-English" },
  { slug: "crk", label: "Christian Religious Studies" },
  { slug: "irk", label: "Islamic Religious Studies" },
  { slug: "civiceducation", label: "Civic Education" },
] as const

const EXAMS = [
  { slug: "utme", label: "JAMB (UTME)" },
  { slug: "wassce", label: "WAEC (WASSCE)" },
  { slug: "post-utme", label: "Post-UTME" },
] as const

const THIS_YEAR = new Date().getFullYear()

const DUPLICATE_CHOICES = [
  {
    id: "skip" as const,
    title: "Leave the one already there",
    hint: "ALOC repeats the same past questions across years, so this is usually what you want.",
  },
  {
    id: "replace" as const,
    title: "Replace it with ALOC's",
    hint: "Deletes the stored question — including any explanation written by hand — and writes ALOC's instead.",
  },
] satisfies { id: DuplicateAction; title: string; hint: string }[]

export default function AlocSyncPage() {
  const [step, setStep] = useState<Step>("setup")

  const [subject, setSubject] = useState<string>("chemistry")
  const [examType, setExamType] = useState<string>("utme")
  const [year, setYear] = useState("")
  const [count, setCount] = useState(40)
  /* State only. The old page persisted this to `localStorage`, where any script
     on the page could read it; ALOC_ACCESS_TOKEN on the server is the real fix. */
  const [token, setToken] = useState("")

  const [questions, setQuestions] = useState<PracticeQuestion[]>([])
  const [skipped, setSkipped] = useState<Skipped[]>([])
  const [source, setSource] = useState<{ subject: string; exam: string; year: number | null }>({
    subject: "",
    exam: "",
    year: null,
  })

  const [duplicates, setDuplicates] = useState<DuplicateAction>("skip")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<ImportResponse | null>(null)

  const rows = useMemo<QuestionPreviewRow[]>(
    () => questions.map((question) => ({ question })),
    [questions],
  )

  const reset = () => {
    setStep("setup")
    setQuestions([])
    setSkipped([])
    setResult(null)
    setError("")
  }

  const load = async () => {
    if (!auth.currentUser) {
      setError("Your session has expired. Sign in again.")
      return
    }

    setBusy(true)
    setError("")
    try {
      const idToken = await auth.currentUser.getIdToken()
      const response = await fetch("/api/aloc", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          subject,
          examType,
          year: year || undefined,
          limit: count,
          /* Sent only when the environment variable is not set, and never stored. */
          accessToken: token || undefined,
        }),
      })

      const data = (await response.json()) as FetchResponse
      if (!response.ok) throw new Error(data.error || `ALOC could not be reached (${response.status}).`)

      const fetched = data.questions ?? []
      setQuestions(fetched)
      setSkipped(data.skipped ?? [])
      setSource({
        subject: data.subject ?? "",
        exam: data.exam ?? "",
        year: data.year ?? null,
      })

      if (fetched.length === 0) {
        setError(
          "Nothing in that batch could be used. Every question ALOC returned is listed below with the reason.",
        )
      }
      setStep("preview")
    } catch (cause) {
      console.error("Failed to fetch from ALOC:", cause)
      setError(cause instanceof Error ? cause.message : "ALOC could not be reached.")
    } finally {
      setBusy(false)
    }
  }

  const startImport = async () => {
    if (!auth.currentUser) {
      setError("Your session has expired. Sign in again before importing.")
      return
    }
    if (questions.length === 0) return

    setStep("importing")
    setError("")
    try {
      const idToken = await auth.currentUser.getIdToken()
      const response = await fetch("/api/import-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ questions, duplicateAction: duplicates }),
      })

      const data = (await response.json()) as ImportResponse
      if (!response.ok) throw new Error(data.error || `The import failed (${response.status}).`)

      setResult(data)
      setStep("complete")
    } catch (cause) {
      console.error("Failed to import ALOC questions:", cause)
      setError(cause instanceof Error ? cause.message : "The import failed.")
      setStep("preview")
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="Sync with ALOC"
        subtitle="Pull a batch of past questions from questions.aloc.com.ng, check them, then add them to the bank."
        actions={
          <Link href="/admin/questions" className="btn-ghost btn-sm">
            Question bank
          </Link>
        }
      />

      {error && (
        <p role="alert" className="field-error mb-6">
          {error}
        </p>
      )}

      {step === "setup" && (
        <div className="animate-fade-in space-y-4">
          <section className="card p-5 sm:p-6">
            <h2 className="text-h4 font-semibold text-foreground">What to pull</h2>
            <p className="mt-1 text-caption text-muted">
              ALOC serves up to 40 questions per call. Nothing is written until you have seen them.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="aloc-subject" className="field-label">
                  Subject
                </label>
                <select
                  id="aloc-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className="select-premium mt-1.5"
                >
                  {SUBJECTS.map((entry) => (
                    <option key={entry.slug} value={entry.slug}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="aloc-exam" className="field-label">
                  Exam
                </label>
                <select
                  id="aloc-exam"
                  value={examType}
                  onChange={(event) => setExamType(event.target.value)}
                  className="select-premium mt-1.5"
                >
                  {EXAMS.map((entry) => (
                    <option key={entry.slug} value={entry.slug}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="aloc-year" className="field-label">
                  Year
                </label>
                <input
                  id="aloc-year"
                  type="number"
                  inputMode="numeric"
                  min={1970}
                  max={THIS_YEAR}
                  placeholder="Any"
                  value={year}
                  onChange={(event) => setYear(event.target.value)}
                  className="input-premium mt-1.5"
                />
                <p className="field-hint">
                  Leave it blank to take whichever years ALOC sends. Each question keeps the year
                  ALOC gives it either way.
                </p>
              </div>

              <div>
                <label htmlFor="aloc-count" className="field-label">
                  How many
                </label>
                <input
                  id="aloc-count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={40}
                  value={count}
                  onChange={(event) =>
                    setCount(Math.min(40, Math.max(1, Number(event.target.value) || 1)))
                  }
                  className="input-premium mt-1.5"
                />
                <p className="field-hint">40 is ALOC's ceiling for one call.</p>
              </div>
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-h4 font-semibold text-foreground">
              <Key size={16} className="shrink-0 text-subtle" aria-hidden="true" />
              Access token
            </h2>
            <p className="mt-1 text-caption text-muted">
              Set <code className="font-mono text-foreground">ALOC_ACCESS_TOKEN</code> in the
              server environment and this can stay empty — that is the durable way to do it, and the
              token never reaches a browser. Get one from{" "}
              <a
                href="https://questions.aloc.com.ng"
                target="_blank"
                rel="noreferrer noopener"
                className="font-semibold text-accent underline"
              >
                questions.aloc.com.ng
              </a>
              .
            </p>

            <label htmlFor="aloc-token" className="field-label mt-4 block">
              Or paste one for this request
            </label>
            <input
              id="aloc-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Used once, then forgotten"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="input-premium mt-1.5 font-mono"
            />
            <p className="field-hint flex items-start gap-1.5">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
              Held in this page's memory only. It is sent to our own server, which calls ALOC, and
              it is not saved anywhere — refreshing the page clears it.
            </p>
          </section>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void load()}
              disabled={busy}
              className="btn-primary"
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  Asking ALOC…
                </>
              ) : (
                <>
                  <CloudDownload size={16} aria-hidden="true" />
                  Fetch {count} question{count === 1 ? "" : "s"}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="animate-fade-in space-y-4">
          <section className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-h4 font-semibold text-foreground">
                  {questions.length} usable question{questions.length === 1 ? "" : "s"}
                </h2>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {source.exam && <span className="badge bg-surface-sunken text-subtle">{source.exam}</span>}
                  {source.subject && (
                    <span className="badge bg-surface-sunken text-subtle">{source.subject}</span>
                  )}
                  <span className="badge bg-surface-sunken text-subtle">
                    {source.year ? source.year : "Whatever years ALOC sent"}
                  </span>
                  {skipped.length > 0 && (
                    <span className="badge bg-warn/10 text-warn">{skipped.length} left out</span>
                  )}
                </p>
              </div>
              <button type="button" onClick={reset} className="btn-ghost btn-sm">
                Fetch a different batch
              </button>
            </div>
          </section>

          {skipped.length > 0 && (
            <section className="card border-warn/30 p-5">
              <h3 className="flex items-center gap-2 text-body-sm font-semibold text-foreground">
                <SkipForward size={15} className="shrink-0 text-warn" aria-hidden="true" />
                {skipped.length} question{skipped.length === 1 ? "" : "s"} ALOC sent that cannot be
                imported
              </h3>
              <p className="mt-1 text-caption text-muted">
                These are reported rather than patched up. The old page guessed a year and an answer
                key for cases like these, which is how wrong answers got into the bank.
              </p>
              <ul className="mt-3 space-y-2">
                {skipped.map((entry, index) => (
                  <li key={index} className="border-l-2 border-warn/40 pl-3">
                    <p className="line-clamp-2 text-caption text-foreground">{entry.question}</p>
                    <p className="mt-0.5 text-caption text-warn">{entry.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {questions.length > 0 && (
            <fieldset className="card p-5">
              <legend className="field-label mb-3">
                If the bank already has one of these questions
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {DUPLICATE_CHOICES.map((choice) => (
                  <label
                    key={choice.id}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-xl border p-3 transition",
                      duplicates === choice.id
                        ? "border-accent ring-2 ring-accent/25"
                        : "border-hairline hover:border-accent/30",
                    )}
                  >
                    <input
                      type="radio"
                      name="duplicates"
                      checked={duplicates === choice.id}
                      onChange={() => setDuplicates(choice.id)}
                      className="mt-0.5 accent-accent"
                    />
                    <span className="min-w-0">
                      <span className="block text-body-sm font-semibold text-foreground">
                        {choice.title}
                      </span>
                      <span className="mt-0.5 block text-caption text-muted">{choice.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <QuestionPreviewTable
            questions={rows}
            onUpdateQuestion={(index, updated) =>
              setQuestions((previous) =>
                previous.map((question, position) => (position === index ? updated : question)),
              )
            }
            onRemoveQuestion={(index) =>
              setQuestions((previous) => previous.filter((_, position) => position !== index))
            }
          />

          <div className="card sticky bottom-4 flex flex-wrap items-center gap-3 border-hairline bg-surface/85 p-4 backdrop-blur-xl">
            <p className="min-w-0 flex-1 text-caption text-muted">
              {questions.length === 0
                ? "Nothing in this batch can be imported."
                : `${questions.length} question${questions.length === 1 ? "" : "s"} will be added to the bank.`}
            </p>
            <button type="button" onClick={reset} className="btn-secondary btn-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void startImport()}
              disabled={questions.length === 0}
              className="btn-primary btn-sm"
            >
              Import {questions.length || ""}
            </button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="card animate-fade-in p-8 text-center sm:p-12">
          <Loader2 size={28} className="mx-auto animate-spin text-accent" aria-hidden="true" />
          <h2 className="mt-4 text-h4 font-semibold text-foreground">
            Writing {questions.length} question{questions.length === 1 ? "" : "s"}
          </h2>
          <p className="mt-2 text-body-sm text-muted">
            Each one is checked against the bank first. Leave the page open until it finishes.
          </p>
        </div>
      )}

      {step === "complete" && result && (
        <div className="animate-fade-in space-y-4">
          <section className="card p-8 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 size={26} aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-h3 font-bold text-foreground">Sync finished</h2>
            <p className="mt-2 text-body-sm text-muted">
              {result.imported ?? 0} question{(result.imported ?? 0) === 1 ? "" : "s"} added from{" "}
              {source.exam || "ALOC"} {source.subject}
              {source.year ? ` ${source.year}` : ""}.
            </p>

            <dl className="mx-auto mt-6 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  { label: "Added", value: result.imported ?? 0, tone: "text-success" },
                  { label: "Replaced", value: result.replaced ?? 0, tone: "text-warn" },
                  { label: "Already there", value: result.skipped ?? 0, tone: "text-subtle" },
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
              <Link href="/admin/questions" className="btn-primary btn-sm">
                See the question bank
              </Link>
              <button type="button" onClick={reset} className="btn-secondary btn-sm">
                Sync another batch
              </button>
            </div>
          </section>

          {result.failures && result.failures.length > 0 && (
            <section className="card border-danger/30 p-5">
              <h3 className="flex items-center gap-2 text-body-sm font-semibold text-danger">
                <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
                What failed
              </h3>
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
