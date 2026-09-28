import Link from "next/link"
import { ChevronRight, Circle, Info, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * What works today, and what is still waiting on content.
 *
 * The move to Supabase brought the schema across but not a library: `lessons`,
 * `notes`, `practice_questions`, `challenges` and `homework` all start empty and
 * fill only when an admin imports into them (/admin/lesson-importer,
 * /admin/question-importer, /admin/aloc-sync). Everything AI-generated needs no
 * library at all, so a student can do real work today — but only if we say which
 * is which. A blank screen the student has to explain to themselves reads as a
 * broken app; the same screen with a reason reads as an app mid-build.
 *
 * These two lists are the single source of truth. The dashboard renders both;
 * the library-backed pages point back here from their empty states, so the
 * answer cannot drift between the places that give it.
 */

export type Feature = {
  label: string
  detail: string
  href: string
}

/** No content library involved — these work the moment you sign in. */
export const READY_NOW: Feature[] = [
  {
    label: "Practice quizzes",
    detail: "Written on request for any subject, at four difficulties.",
    href: "/app/practice",
  },
  {
    label: "AI tutor",
    detail: "Ask in text, or send a photo of the question or a voice note.",
    href: "/app/messages",
  },
  {
    label: "Essay grader",
    detail: "Paste an essay, get a mark and the reasoning behind it.",
    href: "/app/essay-grader",
  },
  {
    label: "Timetable",
    detail: "A study plan built around your subjects and your free time.",
    href: "/app/timetable",
  },
  {
    label: "Progress and weak topics",
    detail: "Both fill in from the questions you answer.",
    href: "/app/progress",
  },
  {
    label: "Streaks, coins and friends",
    detail: "XP, the shop and the leaderboard all run off your own activity.",
    href: "/app/community",
  },
]

/** Backed by a library that is still being loaded. */
export const NEEDS_LIBRARY: Feature[] = [
  {
    label: "Lessons and written notes",
    detail: "Curriculum notes, chapter by chapter.",
    href: "/app/learn",
  },
  {
    label: "Past questions",
    detail: "Real WAEC, NECO and JAMB papers, by year and by subject.",
    href: "/app/downloads",
  },
  {
    label: "Timed mock exams",
    detail: "Full papers sat against the clock.",
    href: "/app/mock-exams",
  },
  {
    label: "Weekly challenges",
    detail: "The timed contest against everyone else in your class.",
    href: "/app/challenges",
  },
]

/**
 * The sentence every library-backed empty state should be telling the student.
 *
 * Use `LIBRARY_PENDING_LINE` where the page has nothing specific to name, and
 * `AI_FALLBACK_LINE` on its own after a sentence that already names the subject
 * or class — otherwise the two halves say "nothing has been imported" twice.
 */
export const AI_FALLBACK_LINE =
  "AI-generated practice covers the same syllabus in the meantime."

export const LIBRARY_PENDING_LINE = `Nothing has been imported into the library for your class yet. ${AI_FALLBACK_LINE}`

/**
 * The banner a library-backed page shows when its table is empty for this
 * student — above the list, before they start clicking into subjects to find out
 * for themselves. Every caller drives it from a real count or a `limit(1)` probe,
 * so it disappears on its own once an admin imports.
 */
export function LibraryPendingNotice({
  title,
  detail,
  className,
}: {
  title: string
  detail?: string
  className?: string
}) {
  return (
    <div
      role="status"
      className={cn("card p-4 border-hairline bg-surface-sunken", className)}
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-muted">
          <Info size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-body font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-body-sm text-muted">
            {detail ?? LIBRARY_PENDING_LINE}{" "}
            <Link href="/app/practice" className="font-semibold text-accent hover:underline">
              Start an AI practice quiz
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  )
}

function Column({
  heading,
  note,
  items,
  tone,
}: {
  heading: string
  note: string
  items: Feature[]
  tone: "ready" | "pending"
}) {
  const ready = tone === "ready"
  return (
    <div>
      <h3
        className={cn(
          "flex items-center gap-2 text-body-sm font-extrabold",
          ready ? "text-success" : "text-muted",
        )}
      >
        {ready ? (
          <Sparkles size={15} aria-hidden="true" />
        ) : (
          <Circle size={15} aria-hidden="true" />
        )}
        {heading}
      </h3>
      <p className="mt-1.5 text-caption text-subtle">{note}</p>

      <ul className="mt-4 space-y-1">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-hover"
            >
              <span
                className={cn(
                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  ready ? "bg-success" : "bg-hairline",
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm font-bold text-foreground">{item.label}</span>
                <span className="mt-0.5 block text-caption text-muted">{item.detail}</span>
              </span>
              <ChevronRight
                size={15}
                aria-hidden="true"
                className="mt-1 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The disclosure panel. Sits on the dashboard so the answer arrives before the
 * student goes looking for it in a blank Learn tab.
 */
export function AvailabilityPanel({ className }: { className?: string }) {
  return (
    <section
      className={cn("card p-5 sm:p-6", className)}
      aria-labelledby="availability-heading"
    >
      <h2 id="availability-heading" className="text-body font-semibold text-foreground">
        What you can use right now
      </h2>
      <p className="mt-1 max-w-2xl text-body-sm text-muted">
        AeroLearn is still filling its library of lessons and past papers. Everything in the first
        column works today and does not wait on that.
      </p>

      <div className="mt-5 grid gap-6 border-t border-hairline pt-5 sm:grid-cols-2 sm:gap-8">
        <Column
          tone="ready"
          heading="Ready now"
          note="No content library needed — these generate as you go."
          items={READY_NOW}
        />
        <Column
          tone="pending"
          heading="Still being loaded"
          note="These stay empty until your class's material is imported."
          items={NEEDS_LIBRARY}
        />
      </div>
    </section>
  )
}
