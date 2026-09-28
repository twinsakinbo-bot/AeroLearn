"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  collection,
  db,
  deleteDoc,
  doc,
  type DocumentData,
  getDocs,
  type QueryDocumentSnapshot,
} from "@/lib/db"
import {
  AlertTriangle,
  BookOpen,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { termRank } from "@/lib/types/lesson"
import { cn } from "@/lib/utils"

/**
 * Curriculum management — every lesson in the bank, with a way into the editor
 * and a way to take one out.
 *
 * Five real bugs fixed:
 *
 * 1. **Lessons were listed in the wrong teaching order.** The sort ended in
 *    `a.term.localeCompare(b.term)`, and "Advanced" precedes "Beginner"
 *    alphabetically, so inside every subject the hardest material came first.
 *    Terms are ranked by `termRank` now, and class levels compare numerically so
 *    "JSS 2" sorts before "JSS 10".
 * 2. **Every term that was not spelled "Beginner" or "Intermediate" rendered as
 *    a red "Advanced" chip.** The colour came from a three-way ternary with no
 *    fallback, so a lesson imported with `term: "First Term"` — which is most of
 *    them, the `TermLevel` union was never enforced on write — was shown in the
 *    colour reserved for the hardest material.
 * 3. **One malformed document blanked the whole page.** `a.subject.localeCompare`
 *    on a lesson saved without a subject throws inside the sort, and the `catch`
 *    only reached the console, so the table rendered "No lessons found." Fields
 *    are normalised as they are read now, and a failed read says so and offers a
 *    retry instead of looking like an empty curriculum.
 * 4. **The delete confirmation did not say what it was deleting.** A native
 *    `confirm("Are you sure you want to delete this lesson?")` on a permanent
 *    delete, with no topic name in it, and an `alert()` if it failed. The step
 *    now names the topic, subject and class, and reports failure in the page.
 * 5. **There was no way to reach the editor from a row.** Delete was the only
 *    control; editing a lesson meant opening `/admin/lesson-editor` and finding
 *    it again in a dropdown of every lesson on the platform. Each row links
 *    straight to it now.
 *
 * Two things worth knowing. This reads the whole `lessons` collection, including
 * each lesson's full markdown body, because the client SDK cannot project fields
 * (`select()` is server-only) and the example/homework counts live in arrays
 * inside the document. That is affordable at the current size; past a few hundred
 * lessons those counts should be denormalised to scalar fields on write so this
 * page can paginate. And deleting a lesson leaves its id in every student's
 * `completedLessons`, so their progress keeps counting a topic that no longer
 * exists — a cleanup this page cannot do from the client.
 */

/* Chip colour follows teaching order, not the literal string, so "First Term",
   "Beginner" and "1st" all read the same. Rank 4 is anything unrecognised. */
const TERM_CHIP: Record<1 | 2 | 3 | 4, string> = {
  1: "bg-success/10 text-success",
  2: "bg-accent/10 text-accent",
  3: "bg-warn/10 text-warn",
  4: "bg-surface-sunken text-subtle",
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })

type Row = {
  id: string
  topicTitle: string
  subject: string
  classLevel: string
  term: string
  examples: number
  homework: number
  hasVideo: boolean
  words: number
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function size(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function rowFrom(entry: QueryDocumentSnapshot<DocumentData>): Row {
  const data = entry.data()
  const body = text(data.content)
  return {
    id: entry.id,
    topicTitle: text(data.topicTitle) || "Untitled topic",
    subject: text(data.subject) || "No subject",
    classLevel: text(data.classLevel) || "No class",
    term: text(data.term),
    examples: size(data.examples),
    homework: size(data.homework),
    hasVideo: text(data.videoUrl).length > 0,
    words: body ? body.split(/\s+/).length : 0,
  }
}

function compare(a: Row, b: Row) {
  return (
    collator.compare(a.subject, b.subject) ||
    collator.compare(a.classLevel, b.classLevel) ||
    termRank(a.term) - termRank(b.term) ||
    collator.compare(a.topicTitle, b.topicTitle)
  )
}

export default function AdminCurriculumPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [needle, setNeedle] = useState("")
  const [classFilter, setClassFilter] = useState("all")
  const [pending, setPending] = useState<Row | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const snap = await getDocs(collection(db, "lessons"))
      setRows(snap.docs.map(rowFrom).sort(compare))
    } catch (cause) {
      console.error("Failed to read the lesson bank:", cause)
      setError(cause instanceof Error ? cause.message : "The database did not respond.")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /* Escape closes the confirm step, but not while the delete is in flight. */
  useEffect(() => {
    if (!pending) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) setPending(null)
    }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [pending, deleting])

  const remove = async () => {
    if (!pending) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteDoc(doc(db, "lessons", pending.id))
      setRows((prev) => prev.filter((row) => row.id !== pending.id))
      setPending(null)
    } catch (cause) {
      console.error("Failed to delete the lesson:", cause)
      setDeleteError(cause instanceof Error ? cause.message : "The lesson could not be deleted.")
    } finally {
      setDeleting(false)
    }
  }

  const classes = useMemo(
    () => Array.from(new Set(rows.map((row) => row.classLevel))).sort(collator.compare),
    [rows],
  )

  const filtered = useMemo(() => {
    const query = needle.trim().toLowerCase()
    return rows.filter((row) => {
      if (classFilter !== "all" && row.classLevel !== classFilter) return false
      if (!query) return true
      return (
        row.topicTitle.toLowerCase().includes(query) ||
        row.subject.toLowerCase().includes(query) ||
        row.classLevel.toLowerCase().includes(query) ||
        row.term.toLowerCase().includes(query)
      )
    })
  }, [rows, needle, classFilter])

  const narrowed = classFilter !== "all" || needle.trim().length > 0

  const totals = useMemo(
    () => ({
      subjects: new Set(filtered.map((row) => row.subject)).size,
      homework: filtered.reduce((sum, row) => sum + row.homework, 0),
      empty: filtered.filter((row) => row.words === 0).length,
    }),
    [filtered],
  )

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Content"
        title="Curriculum"
        subtitle="Every lesson in the bank, by subject, class and term."
        actions={
          <>
            <button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary btn-sm">
              <RefreshCw size={15} className={cn(loading && "animate-spin")} aria-hidden="true" />
              {loading ? "Loading…" : "Refresh"}
            </button>
            <Link href="/admin/lesson-importer" className="btn-primary btn-sm">
              <Upload size={15} aria-hidden="true" />
              Import lessons
            </Link>
          </>
        }
      />

      {error && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/[0.06] p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-semibold text-foreground">Could not read the lesson bank</p>
            <p className="mt-0.5 break-words text-caption text-muted">{error}</p>
          </div>
          <button type="button" onClick={() => void load()} className="btn-secondary btn-sm shrink-0">
            Try again
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-sm sm:flex-1">
          <label htmlFor="lesson-search" className="sr-only">
            Search the lesson bank
          </label>
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle"
            aria-hidden="true"
          />
          <input
            id="lesson-search"
            type="search"
            value={needle}
            onChange={(event) => setNeedle(event.target.value)}
            placeholder="Topic, subject, class or term…"
            className="input-premium pl-10 pr-10"
          />
          {needle && (
            <button
              type="button"
              onClick={() => setNeedle("")}
              className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <X size={14} aria-hidden="true" />
              <span className="sr-only">Clear the search</span>
            </button>
          )}
        </div>

        <div className="sm:w-48">
          <label htmlFor="class-filter" className="sr-only">
            Filter by class
          </label>
          <select
            id="class-filter"
            value={classFilter}
            onChange={(event) => setClassFilter(event.target.value)}
            className="select-premium"
          >
            <option value="all">All classes</option>
            {classes.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>

        <p className="text-caption text-subtle sm:ml-auto" role="status">
          {narrowed
            ? `${filtered.length} of ${rows.length} lesson${rows.length === 1 ? "" : "s"}`
            : `${rows.length} lesson${rows.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {loading ? (
        <div className="card p-12">
          <LoadingState text="Reading the lesson bank…" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={narrowed ? "Nothing matches that" : "No lessons yet"}
          description={
            narrowed
              ? "Try a different topic, subject or class — or clear the filters to see the whole bank."
              : "Import a syllabus file to fill the curriculum, then attach videos and homework in the editor."
          }
          actionText={narrowed ? undefined : "Import lessons"}
          actionHref={narrowed ? undefined : "/admin/lesson-importer"}
        />
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <caption className="sr-only">Lessons in the curriculum, by subject, class and term</caption>
              <thead className="border-b border-hairline bg-surface-sunken">
                <tr className="text-overline uppercase text-subtle">
                  <th scope="col" className="px-5 py-3 font-bold">Topic</th>
                  <th scope="col" className="hidden px-5 py-3 font-bold md:table-cell">Subject</th>
                  <th scope="col" className="hidden px-5 py-3 font-bold sm:table-cell">Class</th>
                  <th scope="col" className="px-5 py-3 font-bold">Term</th>
                  <th scope="col" className="hidden px-5 py-3 font-bold lg:table-cell">Content</th>
                  <th scope="col" className="px-5 py-3 text-right font-bold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {filtered.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-surface-hover">
                    <th scope="row" className="px-5 py-4 font-normal">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                          <BookOpen size={16} aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-body-sm font-semibold text-foreground">
                            {row.topicTitle}
                          </span>
                          <span className="block truncate text-caption text-muted md:hidden">
                            {row.subject}
                            <span className="sm:hidden"> · {row.classLevel}</span>
                          </span>
                        </span>
                      </div>
                    </th>

                    <td className="hidden px-5 py-4 text-body-sm text-muted md:table-cell">{row.subject}</td>

                    <td className="hidden whitespace-nowrap px-5 py-4 text-body-sm text-muted sm:table-cell">
                      {row.classLevel}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-caption font-semibold",
                          TERM_CHIP[termRank(row.term)],
                        )}
                      >
                        {row.term || "No term"}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-5 py-4 lg:table-cell">
                      <span className="flex items-center gap-3 text-caption tabular-nums text-muted">
                        {row.words > 0 ? (
                          <span>{row.words.toLocaleString()} words</span>
                        ) : (
                          <span className="font-semibold text-warn">No notes</span>
                        )}
                        <span className="text-subtle">
                          {row.examples} example{row.examples === 1 ? "" : "s"}
                        </span>
                        <span className="text-subtle">
                          {row.homework} homework
                        </span>
                        {row.hasVideo && (
                          <Video size={14} className="text-accent" aria-label="Has a video" />
                        )}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-right">
                      <span className="inline-flex items-center gap-1">
                        <Link
                          href={`/admin/lesson-editor?lesson=${row.id}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-sunken hover:text-accent"
                        >
                          <Pencil size={15} aria-hidden="true" />
                          <span className="sr-only">Edit {row.topicTitle}</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null)
                            setPending(row)
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-subtle transition-colors hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                          <span className="sr-only">Delete {row.topicTitle}</span>
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline bg-surface-sunken px-5 py-3">
            <p className="text-caption text-subtle">
              {filtered.length.toLocaleString()} lesson{filtered.length === 1 ? "" : "s"} across{" "}
              {totals.subjects} subject{totals.subjects === 1 ? "" : "s"} ·{" "}
              {totals.homework.toLocaleString()} homework question{totals.homework === 1 ? "" : "s"}
            </p>
            {totals.empty > 0 && (
              <p className="text-caption font-semibold text-warn">
                {totals.empty} with no notes written yet
              </p>
            )}
          </div>
        </div>
      )}

      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => {
            if (!deleting) setPending(null)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-lesson-title"
            className="card animate-scale-in w-full max-w-md p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger/10 text-danger">
              <Trash2 size={20} aria-hidden="true" />
            </span>
            <h2 id="delete-lesson-title" className="mt-4 text-h4 font-semibold text-foreground">
              Delete this lesson?
            </h2>
            <p className="mt-2 text-body-sm text-muted">
              <span className="font-semibold text-foreground">{pending.topicTitle}</span> — {pending.subject},{" "}
              {pending.classLevel}
              {pending.term ? `, ${pending.term}` : ""}.
            </p>
            <p className="mt-2 text-caption text-subtle">
              This removes the notes, {pending.examples} example{pending.examples === 1 ? "" : "s"} and{" "}
              {pending.homework} homework question{pending.homework === 1 ? "" : "s"} for good. Students who have
              already finished it keep it in their progress count.
            </p>

            {deleteError && (
              <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/[0.06] p-3 text-caption text-danger">
                {deleteError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setPending(null)}
                disabled={deleting}
                className="btn-secondary btn-sm"
              >
                Keep it
              </button>
              <button type="button" onClick={() => void remove()} disabled={deleting} className="btn-danger btn-sm">
                {deleting ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" aria-hidden="true" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 size={15} aria-hidden="true" />
                    Delete lesson
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
