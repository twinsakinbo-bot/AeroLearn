"use client"

import { BookOpen, Check, Gift, Lock, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A stop on the learning path.
 *
 * This replaces a flat list row that was hard-coded in stock Tailwind greys
 * (`text-gray-900`, `hover:bg-gray-50`, `border-gray-100`) and so was close to
 * invisible in dark mode; it also put the difficulty colour on the lesson
 * *title*, which turned every heading green, amber or red. It was a `<div>` with
 * an `onClick`, so it could not be reached by keyboard at all.
 *
 * Now it is the `.node` circle from globals.css: a real `<button>`, with the
 * 6px hard bottom edge that presses in when tapped, `disabled` when locked, and
 * `aria-current="step"` on the one the student is on. Pair it with `LessonSpine`
 * to draw the connector between two stops.
 */

export interface LessonNodeProps {
  title: string
  /** Shown under the title, one line. */
  description?: string
  difficulty?: "beginner" | "intermediate" | "advanced"
  xpReward?: number
  /** Position on the path, rendered inside the circle. Falls back to an icon. */
  step?: number
  completed?: boolean
  /** The single stop the student is on. Draws the navy fill and the XP badge. */
  current?: boolean
  /** A side quest rather than a curriculum lesson — gold instead of navy. */
  bonus?: boolean
  locked?: boolean
  onSelect?: () => void
  className?: string
}

const DIFFICULTY: Record<
  NonNullable<LessonNodeProps["difficulty"]>,
  { label: string; tone: string }
> = {
  beginner: { label: "Beginner", tone: "badge-success" },
  intermediate: { label: "Intermediate", tone: "badge-warn" },
  advanced: { label: "Advanced", tone: "badge-danger" },
}

export function LessonNode({
  title,
  description,
  difficulty,
  xpReward,
  step,
  completed,
  current,
  bonus,
  locked,
  onSelect,
  className,
}: LessonNodeProps) {
  const state = locked
    ? "node-locked"
    : completed
      ? "node-done"
      : current
        ? "node-active animate-pulse-glow"
        : bonus
          ? "node-bonus"
          : /* Available, but not the current stop. `.node` ships no default fill,
               so give it one; utilities outrank the component layer. */
            "border-hairline bg-surface text-foreground"

  const Icon: LucideIcon = locked ? Lock : completed ? Check : bonus ? Gift : BookOpen

  return (
    <div className={cn("flex flex-col items-center gap-2 text-center", className)}>
      <button
        type="button"
        onClick={onSelect}
        disabled={locked}
        aria-current={current ? "step" : undefined}
        aria-label={locked ? `${title} — locked` : title}
        className={cn("node", state)}
      >
        {step != null && !completed && !locked ? (
          <span aria-hidden="true">{step}</span>
        ) : (
          <Icon size={26} strokeWidth={2.6} aria-hidden="true" />
        )}
      </button>

      <div className="max-w-[11rem]">
        <p
          className={cn(
            "text-body-sm font-extrabold leading-tight",
            locked ? "text-subtle" : "text-foreground",
          )}
        >
          {title}
        </p>
        {description && <p className="mt-0.5 line-clamp-1 text-caption text-muted">{description}</p>}

        {(difficulty || (current && xpReward)) && (
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
            {difficulty && (
              <span className={DIFFICULTY[difficulty].tone}>{DIFFICULTY[difficulty].label}</span>
            )}
            {current && xpReward ? <span className="badge-xp">+{xpReward} XP</span> : null}
          </div>
        )}
      </div>
    </div>
  )
}

/** The connector between two stops. `done` colours it as completed track. */
export function LessonSpine({ done, className }: { done?: boolean; className?: string }) {
  return <span aria-hidden="true" className={cn("spine", done && "spine-done", className)} />
}
