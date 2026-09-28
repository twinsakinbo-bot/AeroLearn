"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  collection,
  db,
  type DocumentData,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  startAfter,
  type Timestamp,
  where,
} from "@/lib/db"
import { AlertTriangle, Flame, Mail, RefreshCw, Search, Users, X, Zap } from "lucide-react"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { cn } from "@/lib/utils"

/**
 * Student directory.
 *
 * Three real problems fixed:
 *
 * 1. **It downloaded every user document on the platform, every visit.** One
 *    `getDocs(collection(db, "users"))` with no limit — every field of every
 *    account, including email addresses, held in the admin's browser. It reads a
 *    page of 25 ordered by join date now, with an explicit "Load more".
 * 2. **"View Profile" was a dead button.** No handler, no admin route behind it.
 *    There is no student-detail page to link to, so the row shows the figures an
 *    admin actually needs — class, plan, XP, streak, join date — instead of a
 *    control that does nothing.
 * 3. **A failed read looked like an empty platform.** The `catch` only wrote to
 *    the console, so a permission error rendered "No students found." Errors are
 *    now shown, with a way to retry.
 *
 * Two things worth knowing. Staff accounts are filtered out in memory, not in
 * the query: Firestore's `!=` skips documents that have no `role` field at all,
 * which is nearly every student, so `where("role", "!=", "admin")` would hide
 * the very people this page is for. A page can therefore show slightly fewer
 * than 25 rows. And the search box filters the rows already loaded — Firestore
 * has no substring search, so finding an account that has not been paged in yet
 * needs a search service (Algolia, Typesense) or an exact-email query.
 */

const PAGE_SIZE = 25

type Student = {
  id: string
  displayName: string
  email: string
  classLevel?: string
  department?: string
  learningMode?: string
  subscription?: string
  xp?: number
  streak?: number
  role?: string
  joined: Date | null
}

const PLAN_CHIP: Record<string, string> = {
  free: "bg-surface-sunken text-subtle",
  pending: "bg-warn/10 text-warn",
  weekly: "bg-accent/10 text-accent",
  monthly: "bg-accent/10 text-accent",
  lifetime: "bg-streak/10 text-streak",
}

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  pending: "Pending",
  weekly: "Weekly",
  monthly: "Monthly",
  lifetime: "Lifetime",
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const date = (value as Timestamp).toDate()
    return Number.isNaN(date.getTime()) ? null : date
  }
  const parsed = new Date(value as string)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function rowFrom(entry: QueryDocumentSnapshot<DocumentData>): Student {
  const data = entry.data()
  return {
    id: entry.id,
    displayName: typeof data.displayName === "string" ? data.displayName : "",
    email: typeof data.email === "string" ? data.email : "",
    classLevel: data.classLevel,
    department: data.department,
    learningMode: data.learningMode,
    subscription: typeof data.subscription === "string" ? data.subscription : "free",
    xp: typeof data.xp === "number" ? data.xp : 0,
    streak: typeof data.streak === "number" ? data.streak : 0,
    role: data.role,
    joined: toDate(data.createdAt),
  }
}

export default function AdminStudentsPage() {
  const [rows, setRows] = useState<Student[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [term, setTerm] = useState("")

  const readPage = useCallback(async (after: QueryDocumentSnapshot<DocumentData> | null) => {
    const snap = await getDocs(
      after
        ? query(collection(db, "users"), orderBy("createdAt", "desc"), startAfter(after), limit(PAGE_SIZE))
        : query(collection(db, "users"), orderBy("createdAt", "desc"), limit(PAGE_SIZE)),
    )
    return {
      students: snap.docs.map(rowFrom).filter((student) => student.role !== "admin"),
      last: snap.docs[snap.docs.length - 1] ?? null,
      exhausted: snap.size < PAGE_SIZE,
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      /* Two aggregate counts instead of a full read: the headline figure should
         not cost one document read per student on the platform. */
      const [all, staff, first] = await Promise.all([
        getCountFromServer(collection(db, "users")),
        getCountFromServer(query(collection(db, "users"), where("role", "==", "admin"))),
        readPage(null),
      ])
      setTotal(Math.max(all.data().count - staff.data().count, 0))
      setRows(first.students)
      setCursor(first.last)
      setDone(first.exhausted)
    } catch (cause) {
      console.error("Failed to read the student directory:", cause)
      setError(cause instanceof Error ? cause.message : "The database did not respond.")
      setRows([])
      setTotal(null)
      setCursor(null)
      setDone(true)
    } finally {
      setLoading(false)
    }
  }, [readPage])

  useEffect(() => {
    void load()
  }, [load])

  const loadMore = async () => {
    if (!cursor || loadingMore || done) return
    setLoadingMore(true)
    try {
      const next = await readPage(cursor)
      setRows((prev) => [...prev, ...next.students])
      setCursor(next.last)
      setDone(next.exhausted)
    } catch (cause) {
      console.error("Failed to read the next page:", cause)
      setError(cause instanceof Error ? cause.message : "The next page did not load.")
    } finally {
      setLoadingMore(false)
    }
  }

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (student) =>
        student.displayName.toLowerCase().includes(needle) ||
        student.email.toLowerCase().includes(needle) ||
        (student.classLevel ?? "").toLowerCase().includes(needle),
    )
  }, [rows, term])

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="People"
        title="Students"
        subtitle={
          total === null
            ? "Registered accounts, newest first."
            : `${total.toLocaleString()} registered account${total === 1 ? "" : "s"}, newest first.`
        }
        actions={
          <button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary btn-sm">
            <RefreshCw size={15} className={cn(loading && "animate-spin")} aria-hidden="true" />
            {loading ? "Loading…" : "Refresh"}
          </button>
        }
      />

      {error && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/[0.06] p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-semibold text-foreground">Could not read the directory</p>
            <p className="mt-0.5 break-words text-caption text-muted">{error}</p>
          </div>
          <button type="button" onClick={() => void load()} className="btn-secondary btn-sm shrink-0">
            Try again
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-sm sm:flex-1">
          <label htmlFor="student-search" className="sr-only">
            Filter the accounts loaded below
          </label>
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle"
            aria-hidden="true"
          />
          <input
            id="student-search"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Name, email or class…"
            className="input-premium pl-10 pr-10"
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm("")}
              className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <X size={14} aria-hidden="true" />
              <span className="sr-only">Clear the filter</span>
            </button>
          )}
        </div>
        <p className="text-caption text-subtle" role="status">
          {term
            ? `${filtered.length} of ${rows.length} loaded account${rows.length === 1 ? "" : "s"} match`
            : `${rows.length} account${rows.length === 1 ? "" : "s"} loaded`}
        </p>
      </div>

      {loading ? (
        <div className="card p-12">
          <LoadingState text="Reading accounts…" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={term ? "No match on this page" : "No student accounts yet"}
          description={
            term
              ? "Only the accounts already loaded are searched. Load more pages, or search by the exact email address once that lookup exists."
              : "Accounts appear here as soon as students sign up."
          }
        />
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <caption className="sr-only">
                Registered student accounts, newest first
              </caption>
              <thead className="border-b border-hairline bg-surface-sunken">
                <tr className="text-overline uppercase text-subtle">
                  <th scope="col" className="px-5 py-3 font-bold">Student</th>
                  <th scope="col" className="hidden px-5 py-3 font-bold sm:table-cell">Email</th>
                  <th scope="col" className="hidden px-5 py-3 font-bold md:table-cell">Class</th>
                  <th scope="col" className="px-5 py-3 font-bold">Plan</th>
                  <th scope="col" className="hidden px-5 py-3 text-right font-bold lg:table-cell">Progress</th>
                  <th scope="col" className="hidden px-5 py-3 text-right font-bold xl:table-cell">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {filtered.map((student) => {
                  const plan = student.subscription ?? "free"
                  const name = student.displayName || "Unnamed account"
                  return (
                    <tr key={student.id} className="transition-colors hover:bg-surface-hover">
                      <th scope="row" className="px-5 py-4 font-normal">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-body-sm font-bold text-accent">
                            {student.displayName ? (
                              student.displayName.charAt(0).toUpperCase()
                            ) : (
                              <Users size={15} aria-hidden="true" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-body-sm font-semibold text-foreground">{name}</span>
                            <span className="block truncate text-caption text-muted sm:hidden">
                              {student.email || "No email on file"}
                            </span>
                            <span className="block truncate text-caption text-subtle max-sm:hidden md:hidden">
                              {student.classLevel || student.learningMode || "Class not set"}
                            </span>
                          </span>
                        </div>
                      </th>

                      <td className="hidden max-w-[15rem] px-5 py-4 sm:table-cell">
                        {student.email ? (
                          <a
                            href={`mailto:${student.email}`}
                            className="flex items-center gap-2 text-body-sm text-muted transition-colors hover:text-accent"
                          >
                            <Mail size={14} className="shrink-0" aria-hidden="true" />
                            <span className="truncate">{student.email}</span>
                          </a>
                        ) : (
                          <span className="text-body-sm text-subtle">—</span>
                        )}
                      </td>

                      <td className="hidden whitespace-nowrap px-5 py-4 md:table-cell">
                        <span className="text-body-sm text-muted">
                          {student.classLevel || student.learningMode || "Not set"}
                        </span>
                        {student.department && (
                          <span className="block text-caption text-subtle">{student.department}</span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={cn(
                            "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-caption font-semibold",
                            PLAN_CHIP[plan] ?? PLAN_CHIP.free,
                          )}
                        >
                          {PLAN_LABEL[plan] ?? plan}
                        </span>
                      </td>

                      <td className="hidden whitespace-nowrap px-5 py-4 text-right lg:table-cell">
                        <span className="inline-flex items-center gap-3 text-body-sm tabular-nums text-muted">
                          <span className="inline-flex items-center gap-1">
                            <Zap size={14} className="text-accent" aria-hidden="true" />
                            {(student.xp ?? 0).toLocaleString()}
                            <span className="sr-only"> XP</span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Flame size={14} className="text-streak" aria-hidden="true" />
                            {student.streak ?? 0}
                            <span className="sr-only"> day streak</span>
                          </span>
                        </span>
                      </td>

                      <td className="hidden whitespace-nowrap px-5 py-4 text-right text-body-sm tabular-nums text-muted xl:table-cell">
                        {student.joined ? (
                          <time dateTime={student.joined.toISOString()}>
                            {student.joined.toLocaleDateString(undefined, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </time>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline bg-surface-sunken px-5 py-3">
            <p className="text-caption text-subtle">
              {done
                ? "Every account is loaded."
                : `Showing the ${rows.length} most recent account${rows.length === 1 ? "" : "s"}.`}
            </p>
            {!done && (
              <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="btn-secondary btn-sm">
                {loadingMore ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" aria-hidden="true" />
                    Loading…
                  </>
                ) : (
                  `Load ${PAGE_SIZE} more`
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
