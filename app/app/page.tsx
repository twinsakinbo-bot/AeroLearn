"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { auth, onAuthStateChanged } from "@/lib/auth"
import { collection, db, doc, getDoc, getDocs, query, updateDoc, where } from "@/lib/db"
import confetti from "canvas-confetti"
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  MessageCircle,
  Loader2,
  Sparkles,
  Target,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { ProgressBar } from "@/components/ui/progress-bar"
import { SubjectIcon } from "@/components/ui/subject-icon"
import { cn } from "@/lib/utils"

/**
 * The dashboard. First screen after sign-in, so it has to answer one question
 * fast: what do I do next?
 *
 * The old version answered it badly. It opened with two blurred colour blobs, a
 * `font-black` 5xl greeting, a near-black hero card with two more blurred blobs,
 * and framer-motion hover-scale on every tile — then repeated the streak and XP
 * chips that the desktop header already shows. Nine hard-coded hex colours and a
 * per-subject palette of nine gradients meant the page never matched the rest of
 * the app. It is now the shared primitives: `PageHeader`, `StatCard`,
 * `ProgressBar`, `EmptyState`, one accent tone, no framer-motion.
 *
 * Four real bugs fixed:
 *
 * 1. **"Continue learning" recommended lessons you had already finished.** It
 *    queried `lessons` with `limit(1)` on your *first* subject only and never
 *    checked `completedLessons`, so the same finished lesson sat there forever.
 *    It now walks your subjects in order and picks the first lesson you have not
 *    completed — reusing the class-wide fetch the progress bars already needed,
 *    so this is one Firestore read fewer, not one more.
 * 2. **An empty subject list was silently replaced with Mathematics, English and
 *    Physics.** Students who skipped subject selection saw progress bars for
 *    three subjects they never picked. Now an empty list says so and links to
 *    settings.
 * 3. **"Daily Quests" were not daily.** Both meters read lifetime totals (`xp`,
 *    `completedLessons`) against a tier target that grows when you claim, so
 *    they are a cumulative ladder. Nothing resets at midnight. Renamed, and the
 *    copy now says "total".
 * 4. **The "Daily Bonus +50 XP" box was decoration.** No code anywhere awards
 *    it — `/api/gamification/claim` only pays the two quest tiers. Removed
 *    rather than left promising a reward that never arrives.
 *
 * Also: claim and school-name failures were swallowed by `console.error` and the
 * button just stopped spinning; both surface a message now. Confetti checks
 * `prefers-reduced-motion` before firing, which the CSS-level override in
 * globals.css cannot do for a canvas library.
 */

type Banner = { tone: "success" | "error"; text: string }

type LessonRow = { id: string; subject?: string; topicTitle?: string; chapter?: number; term?: string }

function greetingFor(hour: number) {
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

/* Canvas confetti sits outside CSS, so the reduced-motion override in
   globals.css cannot reach it. Check the preference directly. */
function celebrate(options: confetti.Options) {
  if (typeof window === "undefined") return
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
  confetti(options)
}

const CONFETTI_COLORS = ["#0E7490", "#06B6D4", "#10B981", "#F59E0B"]

export default function DashboardPage() {
  const router = useRouter()

  const [profile, setProfile] = useState<any>(null)
  const [nextLesson, setNextLesson] = useState<LessonRow | null>(null)
  const [subjectProgress, setSubjectProgress] = useState<Record<string, number>>({})
  const [publishedSubjects, setPublishedSubjects] = useState<string[]>([])
  const [totalLessons, setTotalLessons] = useState(0)
  const [greeting, setGreeting] = useState("Hello")
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [claiming, setClaiming] = useState<"xp" | "lessons" | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth/login")
        return
      }

      setGreeting(greetingFor(new Date().getHours()))

      try {
        const snap = await getDoc(doc(db, "users", user.uid))
        if (!snap.exists()) return
        const data = snap.data()
        setProfile(data)

        /* Daily login streak. The server owns the arithmetic so a student
           cannot mint coins by reloading. */
        const today = new Date().toISOString().split("T")[0]
        if (data.lastLoginDate !== today) {
          try {
            const idToken = await user.getIdToken()
            const res = await fetch("/api/gamification/login", {
              method: "POST",
              headers: { Authorization: `Bearer ${idToken}` },
            })
            const login = await res.json()
            if (login.updated) {
              setProfile((prev: any) => ({
                ...prev,
                streak: login.streak,
                coins: login.coins,
                lastLoginDate: login.lastLoginDate,
              }))
              setTimeout(
                () =>
                  celebrate({
                    particleCount: 120,
                    spread: 90,
                    origin: { y: 0.4 },
                    colors: CONFETTI_COLORS,
                  }),
                400,
              )
            }
          } catch (error) {
            console.error("Login streak update failed:", error)
          }
        }

        const classLevel: string = data.classLevel || "SS3"
        const subjects: string[] = Array.isArray(data.subjects) ? data.subjects : []
        const completed: string[] = data.completedLessons || []

        try {
          /* One equality filter, so no composite index. Everything else —
             grouping by subject, ordering by chapter — happens here. */
          const lessonSnap = await getDocs(
            query(collection(db, "lessons"), where("classLevel", "==", classLevel)),
          )

          const bySubject: Record<string, LessonRow[]> = {}
          lessonSnap.docs.forEach((entry) => {
            const row = { id: entry.id, ...(entry.data() as Omit<LessonRow, "id">) }
            if (!row.subject) return
            if (!bySubject[row.subject]) bySubject[row.subject] = []
            bySubject[row.subject].push(row)
          })
          const allSubjects = Array.from(new Set([...subjects, ...Object.keys(bySubject)]))
          setPublishedSubjects(Object.keys(bySubject))

          const progress: Record<string, number> = {}
          let count = 0
          let upNext: LessonRow | null = null

          allSubjects.forEach((subject) => {
            const list = [...(bySubject[subject] ?? [])].sort(
              (a, b) => (a.chapter ?? 0) - (b.chapter ?? 0),
            )
            count += list.length
            const done = list.filter((lesson) => completed.includes(lesson.id)).length
            progress[subject] = list.length > 0 ? Math.round((done / list.length) * 100) : 0
            if (!upNext) {
              upNext = list.find((lesson) => !completed.includes(lesson.id)) ?? null
            }
          })

          setSubjectProgress(progress)
          setTotalLessons(count)
          setNextLesson(upNext)
        } catch (error) {
          console.error("Failed to load the curriculum:", error)
        }
      } catch (error) {
        console.error("Failed to load your profile:", error)
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [router])

  const startLearning = async () => {
    if (!auth.currentUser) return
    setStarting(true)
    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), {
        lastActiveDate: new Date().toISOString().split("T")[0],
      })
    } catch (error) {
      /* Not worth blocking navigation over — the date is only used for streaks,
         and the server recomputes those on the next login ping. */
      console.error("Failed to stamp the active date:", error)
    }
    router.push(nextLesson ? `/app/learn/${nextLesson.id}` : "/app/learn")
  }

  const claimQuest = async (type: "xp" | "lessons") => {
    if (!auth.currentUser) return
    setClaiming(type)
    setBanner(null)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch("/api/gamification/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ type }),
      })
      const result = await res.json()
      if (!result.success) {
        setBanner({ tone: "error", text: result.error || "That reward could not be claimed yet." })
        return
      }
      setProfile((prev: any) => ({ ...prev, quests: result.quests, coins: result.coins }))
      celebrate({ particleCount: 90, spread: 70, origin: { y: 0.8 }, colors: CONFETTI_COLORS })
    } catch (error) {
      console.error("Claim failed:", error)
      setBanner({ tone: "error", text: "Something went wrong. Try again in a moment." })
    } finally {
      setClaiming(null)
    }
  }

  if (loading) return <LoadingState full text="Loading your dashboard…" />

  const name = profile?.displayName?.split(" ")[0] || "Student"
  const classLevel: string = profile?.classLevel || "SS3"
  const subjects: string[] = Array.from(new Set([...(Array.isArray(profile?.subjects) ? profile.subjects as string[] : []), ...publishedSubjects]))
  const xp: number = profile?.xp ?? 0
  const completedCount: number = profile?.completedLessons?.length ?? 0

  const quests = profile?.quests ?? { xpTier: 1, lessonsTier: 1 }
  const xpTarget = (quests.xpTier || 1) * 50
  const lessonsTarget = (quests.lessonsTier || 1) * 5
  const xpClaimable = xp >= xpTarget
  const lessonsClaimable = completedCount >= lessonsTarget

  return (
    <div className="animate-fade-in space-y-8">
      <PageHeader
        eyebrow={profile?.schoolName ? `${classLevel} · ${profile.schoolName}` : `${classLevel} student`}
        title={`${greeting}, ${name}.`}
        subtitle="Pick up a lesson or choose how you want to study."
      />

      {banner && (
        <p
          role={banner.tone === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2.5 rounded-lg border px-4 py-3 text-body-sm",
            banner.tone === "error"
              ? "border-danger/30 bg-danger/[0.06] text-danger"
              : "border-success/30 bg-success/[0.06] text-success",
          )}
        >
          {banner.text}
        </p>
      )}

      {subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Choose your subjects"
          description="Your dashboard tracks progress per subject. Pick the ones you are studying and your curriculum appears here."
          actionText="Choose subjects"
          actionHref="/app/settings"
        />
      ) : (
        <section className="rounded-xl border border-hairline bg-surface p-6 sm:p-8">
          <p className="eyebrow">
            {nextLesson ? "Up next" : totalLessons > 0 ? "All caught up" : "Curriculum"}
          </p>
          <h2 className="mt-2 max-w-2xl text-h2 text-foreground">
            {nextLesson
              ? nextLesson.topicTitle || "Untitled lesson"
              : totalLessons > 0
                ? `You have finished every ${classLevel} lesson we have`
                : `No ${classLevel} lessons published yet`}
          </h2>
          <p className="mt-2 text-body text-muted">
            {nextLesson
              ? `${nextLesson.subject} · ${nextLesson.term || "Lesson notes"}`
              : totalLessons > 0
                ? "Keep the streak alive with a practice set or a timed mock exam."
                : "We are still writing this class. Practice questions are already available."}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {nextLesson ? (
              <button
                type="button"
                onClick={() => void startLearning()}
                disabled={starting}
                className="btn-primary"
              >
                {starting ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  <>
                    Start lesson
                    <ChevronRight size={16} aria-hidden="true" />
                  </>
                )}
              </button>
            ) : (
              <Link href="/app/practice" className="btn-primary">
                Practice questions
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            )}
            {totalLessons > 0 && <Link href="/app/learn" className="btn-secondary">
              Browse all lessons
            </Link>}
          </div>
        </section>
      )}

      <section aria-labelledby="study-shortcuts-title">
        <h2 id="study-shortcuts-title" className="mb-4 text-h3 text-foreground">Study now</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/app/practice" className="card-interactive flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent"><Target size={21} aria-hidden="true" /></span>
            <span><span className="block text-body font-semibold text-foreground">Practice questions</span><span className="text-caption text-muted">Try a short set for your subjects</span></span>
            <ChevronRight size={17} className="ml-auto text-subtle" aria-hidden="true" />
          </Link>
          <Link href="/app/messages" className="card-interactive flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent"><MessageCircle size={21} aria-hidden="true" /></span>
            <span><span className="block text-body font-semibold text-foreground">Ask the AI tutor</span><span className="text-caption text-muted">Get help with a question</span></span>
            <ChevronRight size={17} className="ml-auto text-subtle" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {(totalLessons > 0 || xp > 0 || completedCount > 0) && <div className="grid gap-8 lg:grid-cols-3">
        {totalLessons > 0 && (
        <section className={xp > 0 || completedCount > 0 ? "lg:col-span-2" : "lg:col-span-3"}>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-h3 text-foreground">Your subjects</h2>
              <p className="mt-1 text-body-sm text-muted">
                Progress is the share of published lessons you have completed.
              </p>
            </div>
            <Link
              href="/app/learn"
              className="shrink-0 text-body-sm font-semibold text-accent transition-colors hover:text-accent-600"
            >
              View all
            </Link>
          </div>

          {subjects.length === 0 ? (
            <p className="rounded-xl border border-dashed border-hairline bg-surface-sunken/50 px-5 py-8 text-center text-body-sm text-muted">
              No subjects selected yet.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">

              {publishedSubjects.map((subject) => {
                const progress = subjectProgress[subject] ?? 0
                const done = progress === 100
                return (
                  <li key={subject}>
                    <Link
                      href={`/app/learn?subject=${encodeURIComponent(subject)}`}
                      className="card-interactive flex h-full items-start gap-4 p-5"
                    >
                      <span
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                          done ? "bg-success/10 text-success" : "bg-accent/10 text-accent",
                        )}
                      >
                        <SubjectIcon subject={subject} className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="truncate text-body font-semibold text-foreground">
                            {subject}
                          </h3>
                          {done && (
                            <CheckCircle2
                              size={16}
                              className="mt-0.5 shrink-0 text-success"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                        <ProgressBar
                          className="mt-3"
                          value={progress}
                          tone={done ? "success" : "accent"}
                          size="sm"
                          ariaLabel={`${subject} progress`}
                        />
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
        )}

        {(xp > 0 || completedCount > 0) && <aside className={totalLessons > 0 ? "lg:col-span-1" : "lg:col-span-3 max-w-xl"}>
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-h4 text-foreground">Quests</h2>
                <p className="mt-1 text-body-sm text-muted">
                  Lifetime milestones. Claim one and the next tier unlocks.
                </p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Target size={18} strokeWidth={2.2} aria-hidden="true" />
              </span>
            </div>

            <div className="mt-6 space-y-4">
              <QuestCard
                label={`Earn ${xpTarget} XP in total`}
                icon={xpClaimable ? Sparkles : Zap}
                value={Math.min(xp, xpTarget)}
                target={xpTarget}
                claimable={xpClaimable}
                busy={claiming === "xp"}
                reward={(quests.xpTier || 1) * 20}
                onClaim={() => void claimQuest("xp")}
              />
              <QuestCard
                label={`Complete ${lessonsTarget} lessons in total`}
                icon={lessonsClaimable ? Trophy : BookOpen}
                value={Math.min(completedCount, lessonsTarget)}
                target={lessonsTarget}
                claimable={lessonsClaimable}
                busy={claiming === "lessons"}
                reward={(quests.lessonsTier || 1) * 30}
                onClaim={() => void claimQuest("lessons")}
              />
            </div>
          </div>
        </aside>}
      </div>}
    </div>
  )
}

function QuestCard({
  label,
  icon: Icon,
  value,
  target,
  claimable,
  busy,
  reward,
  onClaim,
}: {
  label: string
  icon: LucideIcon
  value: number
  target: number
  claimable: boolean
  busy: boolean
  reward: number
  onClaim: () => void
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-sunken p-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            claimable ? "bg-success/10 text-success" : "bg-accent/10 text-accent",
          )}
        >
          <Icon size={16} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <p className="min-w-0 flex-1 text-body-sm font-medium text-foreground">{label}</p>
      </div>

      <ProgressBar
        className="mt-3"
        value={value}
        max={target}
        tone={claimable ? "success" : "accent"}
        size="sm"
        valueLabel={`${value} / ${target}`}
        ariaLabel={label}
      />

      {claimable && (
        <button type="button" onClick={onClaim} disabled={busy} className="btn-primary btn-sm mt-3 w-full">
          {busy ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <>
              <Award size={14} aria-hidden="true" />
              Claim {reward} coins
            </>
          )}
        </button>
      )}
    </div>
  )
}
