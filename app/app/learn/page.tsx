"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { auth, onAuthStateChanged } from "@/lib/auth"
import { collection, db, doc, getDoc, getDocs, query, where } from "@/lib/db"
import { BookOpen, Check, ChevronRight, Play } from "lucide-react"

import { AI_FALLBACK_LINE } from "@/components/ui/availability"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { ProgressBar } from "@/components/ui/progress-bar"
import { SubjectIcon } from "@/components/ui/subject-icon"
import { CLASS_LEVELS, SUBJECTS } from "@/lib/constants"
import type { Lesson } from "@/lib/types/lesson"
import { termRank } from "@/lib/types/lesson"
import { cn } from "@/lib/utils"

/**
 * Subject picker, then the lesson list for the subject and class chosen.
 *
 * The rainbow is gone: subjects used to be tinted from a five-colour array and
 * lesson rows from a second four-colour one, so the same subject changed colour
 * between the two screens. Both now use the one accent, and the only colour that
 * carries meaning is the green on a lesson you have finished. The sticky headers
 * went with them — they were pinned to hardcoded `top-[140px]` offsets that no
 * longer match the app shell.
 */

/** Firestore always hands back a document id; the shared type has it optional. */
type StoredLesson = Lesson & { id: string }

export default function LearnPage() {
  const router = useRouter()

  const [profile, setProfile] = useState<Record<string, unknown> | null>(null)
  const [subject, setSubject] = useState<string | null>(null)
  const [classLevel, setClassLevel] = useState<string>("SS 3")
  const [lessons, setLessons] = useState<StoredLesson[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingLessons, setLoadingLessons] = useState(false)

  /* `?subject=` lets Practice and Homework link straight into a subject. */
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("subject")
    if (!wanted) return
    const match = SUBJECTS.find((name) => name.toLowerCase() === wanted.toLowerCase())
    if (match) setSubject(match)
  }, [])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth/login")
        return
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid))
        if (snap.exists()) {
          const data = snap.data()
          setProfile(data)
          if (typeof data.classLevel === "string") setClassLevel(data.classLevel)
        }
      } catch (err) {
        console.error("Failed to load your profile:", err)
      } finally {
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [router])

  useEffect(() => {
    if (!subject) return
    let cancelled = false

    const load = async () => {
      setLoadingLessons(true)
      try {
        const snap = await getDocs(
          query(
            collection(db, "lessons"),
            where("subject", "==", subject),
            where("classLevel", "==", classLevel),
          ),
        )
        if (!cancelled) {
          setLessons(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StoredLesson))
        }
      } catch (err) {
        console.error("Failed to load lessons:", err)
      } finally {
        if (!cancelled) setLoadingLessons(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [subject, classLevel])

  const completed = useMemo(
    () =>
      new Set(
        Array.isArray(profile?.completedLessons) ? (profile!.completedLessons as string[]) : [],
      ),
    [profile],
  )

  /** The student's own subjects when they have chosen any, else all of them. */
  const mySubjects = useMemo(() => {
    const chosen = Array.isArray(profile?.subjects) ? (profile!.subjects as string[]) : []
    return chosen.length > 0 ? SUBJECTS.filter((name) => chosen.includes(name)) : [...SUBJECTS]
  }, [profile])

  const terms = useMemo(() => {
    const groups = new Map<string, StoredLesson[]>()
    for (const lesson of lessons) {
      const term = lesson.term || "General"
      const bucket = groups.get(term)
      if (bucket) bucket.push(lesson)
      else groups.set(term, [lesson])
    }
    return [...groups.entries()].sort(([a], [b]) => termRank(a) - termRank(b))
  }, [lessons])

  /* The subject lives in state, so keep the URL honest for a reload or a share. */
  const closeSubject = useCallback(() => {
    setSubject(null)
    setLessons([])
    window.history.replaceState({}, "", "/app/learn")
  }, [])

  if (loading) return <LoadingState full text="Loading your lessons…" />

  if (!subject) {
    return (
      <>
        <PageHeader
          eyebrow="Lessons"
          title="Learn"
          subtitle="Pick a subject to see its lessons, term by term, for your class."
        />

        <ul className="grid animate-fade-in grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {mySubjects.map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => setSubject(name)}
                className="card-interactive flex w-full flex-col items-center p-5 text-center"
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <SubjectIcon subject={name} className="h-6 w-6" />
                </span>
                <span className="mt-3 text-body-sm font-semibold text-foreground">{name}</span>
              </button>
            </li>
          ))}
        </ul>
      </>
    )
  }

  const done = lessons.filter((lesson) => completed.has(lesson.id)).length

  return (
    <>
      <PageHeader
        onBack={closeSubject}
        backLabel="All subjects"
        eyebrow="Lessons"
        title={subject}
        actions={
          <>
            <label htmlFor="learn-class" className="sr-only">
              Class level
            </label>
            <select
              id="learn-class"
              value={classLevel}
              onChange={(event) => setClassLevel(event.target.value)}
              className="select-premium w-auto"
            >
              {CLASS_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </>
        }
      />

      {lessons.length > 0 && (
        <section className="card mb-6 p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-overline uppercase text-subtle">Your progress</h2>
            <p className="text-caption font-semibold tabular-nums text-muted">
              {done} of {lessons.length} done
            </p>
          </div>
          <ProgressBar
            className="mt-3"
            value={done}
            max={lessons.length}
            size="sm"
            tone={done === lessons.length ? "success" : "accent"}
            valueLabel=""
            ariaLabel={`${subject} lessons completed`}
          />
        </section>
      )}

      {loadingLessons ? (
        <LoadingState text={`Loading ${subject} lessons…`} className="py-16" />
      ) : lessons.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No lessons yet"
          description={`No ${subject} lessons have been imported for ${classLevel} yet. ${AI_FALLBACK_LINE}`}
          actionText={`Practise ${subject}`}
          actionHref={`/app/practice?subject=${encodeURIComponent(subject)}`}
        />
      ) : (
        <div className="animate-fade-in space-y-8">
          {terms.map(([term, group]) => (
            <section key={term}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-overline uppercase text-subtle">{term}</h2>
                <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
              </div>

              <ul className="space-y-2">
                {group.map((lesson) => {
                  const isDone = completed.has(lesson.id)

                  return (
                    <li key={lesson.id}>
                      <Link
                        href={`/app/learn/${lesson.id}`}
                        className="card-interactive flex items-center gap-4 p-4"
                      >
                        <span
                          className={cn(
                            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                            isDone
                              ? "border-success/30 bg-success/10 text-success"
                              : "border-hairline bg-surface-sunken text-accent",
                          )}
                        >
                          {isDone ? (
                            <Check size={18} aria-hidden="true" />
                          ) : (
                            <Play size={16} aria-hidden="true" />
                          )}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block text-body-sm font-semibold text-foreground">
                            {lesson.topicTitle}
                          </span>
                          {isDone && (
                            <span className="mt-0.5 block text-caption font-medium text-success">
                              Completed
                            </span>
                          )}
                        </span>

                        <ChevronRight size={16} className="shrink-0 text-subtle" aria-hidden="true" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )


}

