"use client"

import { useEffect, useMemo, useState } from "react"
import { auth, onAuthStateChanged } from "@/lib/auth"
import { db, doc, getDoc, updateDoc } from "@/lib/db"
import { CalendarDays, CheckCircle2, Clock, Loader2, Wand2 } from "lucide-react"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { cn } from "@/lib/utils"

/**
 * The weekly study rota.
 *
 * `/api/ai-timetable` spreads the student's subjects evenly over the hours they
 * say they have — it is a round-robin, not a model, and the copy here says so.
 * Promising an AI plan and delivering a rota is the sort of thing a student
 * notices.
 *
 * Only the hours that actually contain a session are drawn. The old grid always
 * rendered 6am–9pm across seven days, which meant ~90 empty cells surrounding
 * the real schedule.
 */

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/**
 * Palette for subject blocks. Six in-palette tints, assigned by the subject's
 * position in the student's own subject list so a colour never moves between
 * visits and the legend always agrees with the grid.
 */
const SLOT_TONES = [
  "border-accent/30 bg-accent/10 text-accent",
  "border-brand/30 bg-brand/10 text-brand",
  "border-success/30 bg-success/10 text-success",
  "border-warn/30 bg-warn/10 text-warn",
  "border-streak/30 bg-streak/10 text-streak",
  "border-hairline bg-surface-sunken text-muted",
]

const DOT_TONES = ["bg-accent", "bg-brand", "bg-success", "bg-warn", "bg-streak", "bg-subtle"]

type TimetableSlot = { subject: string; day: string; time: string; duration: number }

/** "3:00 PM" → minutes past midnight, so rows sort chronologically. */
function minutesOf(label: string) {
  const match = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(label.trim())
  if (!match) return Number.MAX_SAFE_INTEGER
  const hour = Number(match[1]) % 12
  const pm = match[3].toLowerCase() === "pm"
  return (pm ? hour + 12 : hour) * 60 + Number(match[2])
}

export default function TimetablePage() {
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [timetable, setTimetable] = useState<TimetableSlot[]>([])
  const [studyHours, setStudyHours] = useState(3)
  const [examDate, setExamDate] = useState("")
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return
      try {
        const snap = await getDoc(doc(db, "users", user.uid))
        if (snap.exists()) {
          const data = snap.data()
          setProfile(data)
          if (Array.isArray(data.timetable)) setTimetable(data.timetable)
          // Both settings are stored with the rota so a regenerate starts from
          // the same answers the student gave last time.
          if (typeof data.timetableHours === "number") setStudyHours(data.timetableHours)
          if (typeof data.timetableExamDate === "string") setExamDate(data.timetableExamDate)
        }
      } catch (err) {
        console.error("Failed to load timetable:", err)
      } finally {
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [])

  const subjects = useMemo(
    () => (Array.isArray(profile?.subjects) ? (profile!.subjects as string[]) : []),
    [profile],
  )

  /** Subject → palette index, stable across renders and reloads. */
  const toneIndex = useMemo(() => {
    const order = subjects.length > 0 ? subjects : Array.from(new Set(timetable.map((s) => s.subject)))
    const map = new Map<string, number>()
    order.forEach((subject, index) => map.set(subject, index % SLOT_TONES.length))
    return map
  }, [subjects, timetable])

  const hours = useMemo(
    () =>
      Array.from(new Set(timetable.map((slot) => slot.time))).sort(
        (a, b) => minutesOf(a) - minutesOf(b),
      ),
    [timetable],
  )

  const totalHours = timetable.reduce((sum, slot) => sum + (slot.duration || 1), 0)

  const generate = async () => {
    const user = auth.currentUser
    if (!user) {
      setError("Your session has expired. Sign in again to rebuild your timetable.")
      return
    }
    if (subjects.length === 0) {
      setError("Choose your subjects in Settings first — the rota is built from them.")
      return
    }

    setError("")
    setGenerating(true)
    try {
      const idToken = await user.getIdToken()
      const res = await fetch("/api/ai-timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          subjects,
          hoursPerDay: studyHours,
          examDate: examDate || null,
          learningMode: profile?.learningMode ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !Array.isArray(data.timetable)) {
        throw new Error(data.error || "The timetable service did not return a schedule.")
      }

      setTimetable(data.timetable)
      await updateDoc(doc(db, "users", user.uid), {
        timetable: data.timetable,
        timetableHours: studyHours,
        timetableExamDate: examDate || null,
      })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 4000)
    } catch (err) {
      console.error("Failed to build timetable:", err)
      setError("Couldn't build your timetable just now. Check your connection and try again.")
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <LoadingState full text="Loading your timetable…" />

  return (
    <>
      <PageHeader
        eyebrow="Planner"
        title="Study timetable"
        subtitle="A balanced weekly rota built from your subjects and the hours you actually have. Rebuild it whenever your week changes."
      />

      <section className="card mb-8 p-5 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-[auto,1fr,auto] sm:items-end">
          <fieldset>
            <legend className="field-label">Hours per day</legend>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((hour) => (
                <button
                  key={hour}
                  type="button"
                  onClick={() => setStudyHours(hour)}
                  aria-pressed={studyHours === hour}
                  className={cn(
                    "h-10 w-10 rounded-lg border text-body-sm font-semibold transition-colors",
                    studyHours === hour
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-hairline bg-surface text-muted hover:bg-surface-hover hover:text-foreground",
                  )}
                >
                  {hour}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="exam-date" className="field-label">
              Exam date <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="exam-date"
              type="date"
              value={examDate}
              onChange={(event) => setExamDate(event.target.value)}
              className="input-premium"
            />
            <p className="field-hint">Within a month of it, weekend revision slots are added.</p>
          </div>

          <button type="button" onClick={generate} disabled={generating} className="btn-primary">
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="h-4 w-4" aria-hidden="true" />
            )}
            {generating ? "Building…" : timetable.length > 0 ? "Rebuild" : "Build my rota"}
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-danger/35 bg-danger/10 px-4 py-3 text-body-sm font-medium text-danger"
          >
            {error}
          </p>
        )}

        {saved && !error && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-body-sm font-semibold text-success">
            <CheckCircle2 size={16} aria-hidden="true" />
            Saved — {totalHours} {totalHours === 1 ? "hour" : "hours"} scheduled this week.
          </p>
        )}
      </section>

      {timetable.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No rota yet"
          description={
            subjects.length === 0
              ? "Choose the subjects you are studying and then build your rota."
              : `Set your hours above and build a week across your ${subjects.length} ${subjects.length === 1 ? "subject" : "subjects"}.`
          }
          actionText={subjects.length === 0 ? "Choose subjects" : undefined}
          actionHref={subjects.length === 0 ? "/app/settings" : undefined}
        />
      ) : (
        <>
          {/* Phones get one card per day; the grid needs more width than they have. */}
          <div className="space-y-4 md:hidden">
            {DAYS.map((day) => {
              const daySlots = timetable
                .filter((slot) => slot.day === day)
                .sort((a, b) => minutesOf(a.time) - minutesOf(b.time))
              if (daySlots.length === 0) return null

              return (
                <section key={day} className="card p-4">
                  <h2 className="mb-3 text-body-sm font-semibold text-foreground">{day}</h2>
                  <ul className="space-y-2">
                    {daySlots.map((slot, index) => (
                      <li key={`${slot.time}-${index}`} className="flex items-center gap-3">
                        <span className="w-20 shrink-0 text-caption font-medium tabular-nums text-muted">
                          {slot.time}
                        </span>
                        <span
                          className={cn(
                            "flex-1 rounded-lg border px-3 py-2 text-caption font-semibold",
                            SLOT_TONES[toneIndex.get(slot.subject) ?? SLOT_TONES.length - 1],
                          )}
                        >
                          {slot.subject}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-hairline bg-surface md:block">
            <table className="w-full table-fixed border-collapse">
              <caption className="sr-only">
                Your weekly study rota, by hour and day
              </caption>
              <thead>
                <tr className="border-b border-hairline">
                  <th scope="col" className="w-24 px-4 py-3 text-left">
                    <span className="inline-flex items-center gap-1.5 text-overline uppercase text-subtle">
                      <Clock size={13} aria-hidden="true" />
                      Time
                    </span>
                  </th>
                  {DAY_SHORT.map((day, index) => (
                    <th
                      key={day}
                      scope="col"
                      className="px-2 py-3 text-center text-caption font-semibold text-foreground"
                    >
                      <abbr title={DAYS[index]} className="no-underline">
                        {day}
                      </abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hours.map((time) => (
                  <tr key={time} className="border-b border-hairline last:border-b-0">
                    <th
                      scope="row"
                      className="px-4 py-2.5 text-left align-middle text-caption font-medium tabular-nums text-muted"
                    >
                      {time}
                    </th>
                    {DAYS.map((day) => {
                      const slot = timetable.find((s) => s.day === day && s.time === time)
                      return (
                        <td key={day} className="p-1.5 align-middle">
                          {slot ? (
                            <span
                              className={cn(
                                "flex min-h-[2.75rem] items-center justify-center rounded-lg border px-2 py-1.5 text-center text-[11px] font-semibold leading-tight",
                                SLOT_TONES[toneIndex.get(slot.subject) ?? SLOT_TONES.length - 1],
                              )}
                            >
                              {slot.subject}
                            </span>
                          ) : (
                            <span className="sr-only">Free</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-xl border border-hairline bg-surface-sunken px-5 py-4">
            <p className="text-overline uppercase text-subtle">Subjects</p>
            {Array.from(toneIndex.keys()).map((subject) => (
              <span key={subject} className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    DOT_TONES[toneIndex.get(subject) ?? DOT_TONES.length - 1],
                  )}
                />
                <span className="text-caption font-medium text-foreground">{subject}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </>
  )
}
