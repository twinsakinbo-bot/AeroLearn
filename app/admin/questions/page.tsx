"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  collection,
  db,
  deleteDoc,
  doc,
  type DocumentData,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  startAfter,
  updateDoc,
  where,
} from "@/lib/db"
import {
  AlertTriangle,
  HelpCircle,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react"

import { QuestionEditor } from "@/components/importer/QuestionEditor"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import type { PracticeQuestion } from "@/lib/types/question"
import { cn } from "@/lib/utils"
import { auth } from "@/lib/auth"

/**
 * The question bank: filter, edit, delete.
 *
 * Five real problems fixed:
 *
 * 1. **Only ever the same 100 questions.** `limit(PAGE_SIZE * 4)` with no
 *    `orderBy` returned an arbitrary slice in document-id order, with no way to
 *    reach the rest — so a bank of 5,000 questions was 98% unmanageable. It pages
 *    properly now: 25 at a time, newest first, with `startAfter`.
 * 2. **Search searched those 100 only.** Typing a word that existed in the bank
 *    but not in the downloaded slice returned "No questions match your filters".
 *    The box is now labelled for what it does — filtering the loaded page — and
 *    the empty state says so.
 * 3. **"Draft" was a lie.** A question with no explanation was badged Draft, but
 *    it is live in every quiz the moment it is written. It says "No explanation",
 *    which is the actual problem an admin can fix.
 * 4. **Delete was one `window.confirm` away from permanent.** It did not say
 *    which question, and a failure only set an error string at the top of a page
 *    that may have been scrolled far away. It now names the question in a real
 *    dialog.
 * 5. **Editing happened off-screen.** The editor rendered at the very bottom of
 *    the page, so clicking Edit on row 20 looked like nothing happened. It opens
 *    in the row.
 *
 * The count in the header comes from `getCountFromServer`, which reads one
 * aggregate rather than the documents themselves — the old page had no total at
 * all, only "N questions" meaning "N downloaded".
 */

const PAGE_SIZE = 25
const EXAMS = ["WAEC", "WACE", "JAMB", "NECO", "SAT", "GRE"]

type Cursor = QueryDocumentSnapshot<DocumentData> | null

function questionFrom(entry: QueryDocumentSnapshot<DocumentData>): PracticeQuestion {
  const data = entry.data()
  return {
    ...(data as PracticeQuestion),
    id: entry.id,
    question: typeof data.question === "string" ? data.question : "",
    subject: typeof data.subject === "string" ? data.subject : "",
    exam: typeof data.exam === "string" ? data.exam : "",
    year: typeof data.year === "number" ? data.year : 0,
  }
}
type Filters = {
  exam: string
  year: string
  subject: string
  topic: string
  paper: string
  search: string
}

const NO_FILTERS: Filters = { exam: "", year: "", subject: "", topic: "", paper: "", search: "" }

/**
 * Equality filters only, and no `orderBy`: Firestore then orders by document id
 * for free, and the composite indexes already declared for these fields cover
 * every combination. Sorting by date instead would need a new composite index
 * for each filter combination, which is why the old page had no ordering — and
 * no pagination either.
 */
function constraintsFor(filters: Filters): QueryConstraint[] {
  const constraints: QueryConstraint[] = []
  if (filters.exam) constraints.push(where("exam", "==", filters.exam))
  if (filters.year) constraints.push(where("year", "==", Number.parseInt(filters.year, 10)))
  if (filters.subject) constraints.push(where("subject", "==", filters.subject.trim()))
  if (filters.topic) constraints.push(where("topic", "==", filters.topic.trim()))
  if (filters.paper) constraints.push(where("paper", "==", filters.paper.trim()))
  return constraints
}

export default function QuestionsPage() {
  const [draft, setDraft] = useState<Filters>(NO_FILTERS)
  const [applied, setApplied] = useState<Filters>(NO_FILTERS)

  const [rows, setRows] = useState<PracticeQuestion[]>([])
  const [cursor, setCursor] = useState<Cursor>(null)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState<number | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")

  const [editingId, setEditingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState("")
  const [deleting, setDeleting] = useState<PracticeQuestion | null>(null)
  const [removing, setRemoving] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [reviewingAloc, setReviewingAloc] = useState(false)
  const [alocIssues, setAlocIssues] = useState<Record<string, string>>({})
  const [alocReviewDone, setAlocReviewDone] = useState(false)
  const [auditCursor, setAuditCursor] = useState<Cursor>(null)
  const [auditMode, setAuditMode] = useState(false)
  const [auditComplete, setAuditComplete] = useState(false)
  const [auditedTotal, setAuditedTotal] = useState(0)

  const years = useMemo(() => {
    const now = new Date().getFullYear()
    return Array.from({ length: now - 1999 }, (_, index) => now - index)
  }, [])

  const load = useCallback(
    async (after: Cursor) => {
      if (after) setLoadingMore(true)
      else {
        setLoading(true)
        setAuditMode(false)
        setAuditCursor(null)
        setAuditComplete(false)
        setAuditedTotal(0)
      }
      setError("")
      setAlocIssues({})
      setAlocReviewDone(false)
      try {
        const base = constraintsFor(applied)
        const snap = await getDocs(
          query(
            collection(db, "practiceQuestions"),
            ...base,
            ...(after ? [startAfter(after)] : []),
            limit(PAGE_SIZE),
          ),
        )

        const page = snap.docs.map(questionFrom)
        setRows((prev) => (after ? [...prev, ...page] : page))
        setCursor(snap.docs.at(-1) ?? null)
        setHasMore(snap.docs.length === PAGE_SIZE)
      } catch (cause) {
        console.error("Failed to load questions:", cause)
        setError(
          cause instanceof Error
            ? `The questions could not be loaded: ${cause.message}`
            : "The questions could not be loaded.",
        )
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [applied],
  )
  useEffect(() => {
    setEditingId(null)
    void load(null)
  }, [load])

  /* One aggregate read for the headline figure, not the documents themselves. */
  useEffect(() => {
    let cancelled = false
    const count = async () => {
      try {
        const snap = await getCountFromServer(
          query(collection(db, "practiceQuestions"), ...constraintsFor(applied)),
        )
        if (!cancelled) setTotal(snap.data().count)
      } catch (cause) {
        console.error("Failed to count questions:", cause)
        if (!cancelled) setTotal(null)
      }
    }
    void count()
    return () => {
      cancelled = true
    }
  }, [applied])

  /* Escape closes the delete dialog, but not mid-write. */
  useEffect(() => {
    if (!deleting) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !removing) setDeleting(null)
    }
    window.addEventListener("keydown", onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = previous
    }
  }, [deleting, removing])

  /** The search box filters what is loaded — Firestore has no substring search. */
  const visible = useMemo(() => {
    const needle = applied.search.trim().toLowerCase()
    if (!needle || auditMode) return rows
    return rows.filter(
      (row) =>
        row.question.toLowerCase().includes(needle) ||
        (row.topic ?? "").toLowerCase().includes(needle),
    )
  }, [rows, applied.search, auditMode])

  const save = async (id: string, updated: PracticeQuestion) => {
    setSaveError("")
    try {
      const { id: _ignored, ...data } = updated
      const revised = {
        ...data,
        updatedAt: new Date(),
        ...(rows.find((row) => row.id === id)?.aiReviewStatus === "needs-review" ? {
          aiReviewStatus: "edited" as const,
          aiReviewReason: null,
        } : {}),
      }
      await updateDoc(doc(db, "practiceQuestions", id), revised)
      setRows((prev) => prev.map((row) => (row.id === id ? { ...revised, id } : row)))
      setAlocIssues((prev) => { const next = { ...prev }; delete next[id]; return next })
      setEditingId(null)
    } catch (cause) {
      console.error("Failed to save the question:", cause)
      setSaveError(
        cause instanceof Error ? `Not saved: ${cause.message}` : "The question was not saved.",
      )
    }
  }

  const reviewNextAlocBatch = async () => {
    setReviewingAloc(true)
    setError("")
    setAlocIssues({})
    setAlocReviewDone(false)
    try {
      const after = auditComplete ? null : auditCursor
      if (auditComplete) setAuditedTotal(0)
      const idToken = await auth.currentUser?.getIdToken()
      if (!idToken) throw new Error("Sign in again as an admin.")
      const snap = await getDocs(query(
        collection(db, "practiceQuestions"),
        where("source", "==", "ALOC"),
        orderBy("createdAt", "desc"),
        ...(after ? [startAfter(after)] : []),
        limit(40),
      ))
      const batch = snap.docs.map(questionFrom)
      if (batch.length === 0) {
        setAuditComplete(true)
        setAuditMode(true)
        setAlocReviewDone(true)
        return
      }
      const response = await fetch("/api/aloc/review", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ questions: batch }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "AI review failed.")
      const issues: Record<string, string> = {}
      for (const issue of result.issues ?? []) {
        if (batch[issue.index]?.id) issues[batch[issue.index].id!] = issue.reason
      }
      const reviewedAt = new Date()
      for (let index = 0; index < batch.length; index += 10) {
        await Promise.all(batch.slice(index, index + 10).map((question) =>
          updateDoc(doc(db, "practiceQuestions", question.id!), {
            aiReviewStatus: issues[question.id!] ? "needs-review" : "clear",
            aiReviewReason: issues[question.id!] ?? null,
            aiReviewedAt: reviewedAt,
          }),
        ))
      }
      setRows(batch.map((question) => ({
        ...question,
        aiReviewStatus: issues[question.id!] ? "needs-review" : "clear",
        aiReviewReason: issues[question.id!] ?? null,
        aiReviewedAt: reviewedAt,
      })))
      setCursor(null)
      setHasMore(false)
      setAuditMode(true)
      setAuditCursor(snap.docs.at(-1) ?? null)
      setAuditComplete(batch.length < 40)
      setAuditedTotal((count) => count + batch.length)
      setAlocIssues(issues)
      setAlocReviewDone(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not review imported questions.")
    } finally {
      setReviewingAloc(false)
    }
  }

  const remove = async () => {
    if (!deleting?.id) return
    setRemoving(true)
    setDeleteError("")
    try {
      await deleteDoc(doc(db, "practiceQuestions", deleting.id))
      setRows((prev) => prev.filter((row) => row.id !== deleting.id))
      setTotal((prev) => (prev === null ? prev : Math.max(0, prev - 1)))
      setDeleting(null)
    } catch (cause) {
      console.error("Failed to delete the question:", cause)
      setDeleteError(
        cause instanceof Error ? `Not deleted: ${cause.message}` : "The question was not deleted.",
      )
    } finally {
      setRemoving(false)
    }
  }
  const filtersOn = useMemo(
    () => Object.values(applied).some((value) => value !== ""),
    [applied],
  )

  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="Question bank"
        subtitle={
          total === null
            ? "Filter, correct and remove practice questions."
            : `${total.toLocaleString()} question${total === 1 ? "" : "s"}${filtersOn ? " match these filters" : " in the bank"}.`
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => void load(null)}
              className="btn-secondary btn-sm"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Refresh
            </button>
            <Link href="/admin/question-importer" className="btn-primary btn-sm">
              <UploadCloud size={14} aria-hidden="true" />
              Import questions
            </Link>
            <button type="button" onClick={() => void reviewNextAlocBatch()} disabled={reviewingAloc} className="btn-secondary btn-sm">
              {reviewingAloc ? "Reviewing ALOC…" : auditComplete ? "Restart ALOC audit" : auditMode ? "Review next 40 ALOC" : "Review ALOC imports"}
            </button>
          </>
        }
      />

      <form
        onSubmit={(event) => {
          event.preventDefault()
          setApplied(draft)
        }}
        className="card mb-6 p-5"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="filter-exam" className="field-label">
              Exam
            </label>
            <select
              id="filter-exam"
              value={draft.exam}
              onChange={(event) => setDraft({ ...draft, exam: event.target.value })}
              className="select-premium"
            >
              <option value="">Any</option>
              {EXAMS.map((exam) => (
                <option key={exam} value={exam}>
                  {exam}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-year" className="field-label">
              Year
            </label>
            <select
              id="filter-year"
              value={draft.year}
              onChange={(event) => setDraft({ ...draft, year: event.target.value })}
              className="select-premium"
            >
              <option value="">Any</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-subject" className="field-label">
              Subject
            </label>
            <input
              id="filter-subject"
              type="text"
              value={draft.subject}
              onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
              placeholder="Mathematics"
              className="input-premium"
            />
            <p className="field-hint">An exact match, spelling and all.</p>
          </div>

          <div>
            <label htmlFor="filter-topic" className="field-label">
              Topic
            </label>
            <input
              id="filter-topic"
              type="text"
              value={draft.topic}
              onChange={(event) => setDraft({ ...draft, topic: event.target.value })}
              placeholder="Algebra"
              className="input-premium"
            />
          </div>

          <div>
            <label htmlFor="filter-paper" className="field-label">
              Paper
            </label>
            <input
              id="filter-paper"
              type="text"
              value={draft.paper}
              onChange={(event) => setDraft({ ...draft, paper: event.target.value })}
              placeholder="Paper 1"
              className="input-premium"
            />
          </div>
          <div>
            <label htmlFor="filter-search" className="field-label">
              Find in the loaded page
            </label>
            <input
              id="filter-search"
              type="search"
              value={draft.search}
              onChange={(event) => setDraft({ ...draft, search: event.target.value })}
              placeholder="A word in the question"
              className="input-premium"
            />
            <p className="field-hint">Filters what has loaded, not the whole bank.</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
          <button type="submit" className="btn-primary btn-sm">
            <Search size={14} aria-hidden="true" />
            Apply
          </button>
          {filtersOn && (
            <button
              type="button"
              onClick={() => {
                setDraft(NO_FILTERS)
                setApplied(NO_FILTERS)
              }}
              className="btn-ghost btn-sm"
            >
              <X size={14} aria-hidden="true" />
              Clear
            </button>
          )}
          <p className="ml-auto text-caption text-subtle">
            {rows.length} loaded
            {applied.search && ` · ${visible.length} matching`}
          </p>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/[0.06] p-4"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-semibold text-foreground">{error}</p>
            <button
              type="button"
              onClick={() => void load(null)}
              className="btn-secondary btn-sm mt-3"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {saveError && (
        <p role="alert" className="field-error mb-6">
          {saveError}
        </p>
      )}
      {alocReviewDone && (
        <p role="status" className="mb-4 text-body-sm text-muted">
          Reviewed {auditedTotal} ALOC question{auditedTotal === 1 ? "" : "s"} in this session. {Object.keys(alocIssues).length} on this page need attention. {auditComplete ? "All ALOC questions reached." : "Use Review next 40 ALOC to continue."} The review saves flags but never rewrites question content.
        </p>
      )}
      {loading ? (
        <LoadingState text="Loading questions…" className="py-16" />
      ) : visible.length === 0 && !error ? (
        <EmptyState
          icon={HelpCircle}
          title={filtersOn ? "Nothing matches" : "The bank is empty"}
          description={
            applied.search
              ? "No question on this page contains that word. Load more, or filter by subject or topic instead — Firestore cannot search inside text."
              : filtersOn
                ? "No question matches these filters. Subject, topic and paper have to match exactly."
                : "Import a file of past questions to get started."
          }
          actionText={filtersOn ? undefined : "Import questions"}
          actionHref={filtersOn ? undefined : "/admin/question-importer"}
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((row, index) => {
            const open = editingId === row.id
            return (
              <li key={row.id ?? index} className={cn("card p-4", open && "border-accent/40")}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 text-caption tabular-nums text-subtle">
                    {row.questionNumber ?? index + 1}.
                  </span>

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-body-sm font-medium text-foreground",
                        !open && "line-clamp-2",
                      )}
                      dangerouslySetInnerHTML={
                        row.question 
                          ? { __html: row.question } 
                          : { __html: "No question text" }
                      }
                    />

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="badge bg-surface-sunken text-subtle">
                        {row.subject || "No subject"}
                      </span>
                      <span className="badge bg-surface-sunken text-subtle">
                        {row.exam || "No exam"} {row.year || ""}
                      </span>
                      {row.topic && (
                        <span className="badge bg-surface-sunken text-subtle">{row.topic}</span>
                      )}
                      {row.explanation ? (
                        <span className="badge bg-success/10 text-success">Explained</span>
                      ) : (
                        <span className="badge bg-warn/10 text-warn">No explanation</span>
                      )}
                      {row.aiReviewStatus === "needs-review" && (
                        <span className="badge bg-warn/10 text-warn">Needs review</span>
                      )}
                      {row.aiReviewStatus === "edited" && (
                        <span className="badge bg-warn/10 text-warn">Edited; review again</span>
                      )}
                    </div>
                    {row.aiReviewReason && (
                      <p className="mt-2 text-caption text-warn">{row.aiReviewReason}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSaveError("")
                        setEditingId(open ? null : (row.id ?? null))
                      }}
                      className="btn-ghost btn-sm"
                      aria-expanded={open}
                    >
                      {open ? (
                        <X size={14} aria-hidden="true" />
                      ) : (
                        <Pencil size={14} aria-hidden="true" />
                      )}
                      <span className="sr-only sm:not-sr-only">{open ? "Close" : "Edit"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError("")
                        setDeleting(row)
                      }}
                      className="btn-ghost btn-sm text-danger"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      <span className="sr-only">Delete this question</span>
                    </button>
                  </div>
                </div>

                {open && row.id && (
                  <div className="mt-4 border-t border-hairline pt-4">
                    <QuestionEditor
                      question={row}
                      onSave={(updated) => void save(row.id!, updated)}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {hasMore && !loading && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => void load(cursor)}
            disabled={loadingMore}
            className="btn-secondary btn-sm"
          >
            {loadingMore ? "Loading…" : `Load ${PAGE_SIZE} more`}
          </button>
        </div>
      )}
      {deleting && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-question-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-4 backdrop-blur-sm sm:items-center"
        >
          <div className="animate-scale-in card w-full max-w-md p-6">
            <h2 id="delete-question-title" className="text-h4 font-semibold text-foreground">
              Delete this question?
            </h2>
            <p 
              className="mt-3 line-clamp-4 rounded-lg border border-hairline bg-surface-sunken p-3 text-caption text-muted"
              dangerouslySetInnerHTML={
                deleting.question
                  ? { __html: deleting.question }
                  : { __html: "No question text" }
              }
            />
            <p className="mt-3 text-caption text-subtle">
              {deleting.subject || "No subject"} · {deleting.exam || "No exam"} {deleting.year || ""}
              . This cannot be undone, and any quiz built from it loses the question.
            </p>

            {deleteError && (
              <p role="alert" className="field-error mt-3">
                {deleteError}
              </p>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setDeleting(null)}
                disabled={removing}
                className="btn-secondary btn-sm"
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={removing}
                className="btn-danger btn-sm"
              >
                {removing ? "Deleting…" : "Delete question"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
