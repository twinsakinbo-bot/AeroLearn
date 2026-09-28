"use client"

import {
  BookOpen,
  Briefcase,
  Check,
  ChevronLeft,
  FlaskConical,
  Palette,
  Search,
  Target,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { Department, LearningMode } from "@/lib/constants"
import { cn } from "@/lib/utils"

/**
 * The pieces shared by the two multi-step account screens — sign-up and
 * onboarding. Both are wizards with the same vocabulary: a progress rail, a
 * few big choices, a grid of small ones, and a back button.
 */

/**
 * The three learning paths, in the order both wizards offer them. Shared so
 * the wording a student reads at sign-up is the wording they read again if
 * they finish setting up later.
 */
export const GOALS: { id: LearningMode; title: string; desc: string; icon: LucideIcon }[] = [
  {
    id: "school",
    title: "School learning",
    desc: "Keep up with what you are taught this term",
    icon: BookOpen,
  },
  {
    id: "exam",
    title: "Exam preparation",
    desc: "Sitting WAEC, NECO or JAMB",
    icon: Target,
  },
  {
    id: "self_learning",
    title: "Personal growth",
    desc: "Learning at your own pace, outside class",
    icon: Search,
  },
]

export const DEPARTMENT_META: Record<Department, { icon: LucideIcon; desc: string }> = {
  Science: { icon: FlaskConical, desc: "Physics, Chemistry, Biology, Further Maths and more" },
  Art: { icon: Palette, desc: "Literature, Government, History, languages and more" },
  Commercial: { icon: Briefcase, desc: "Economics, Accounts, Commerce, Government and more" },
}

/**
 * Progress rail above a wizard heading. Decorative: the live position is
 * announced by the sentence underneath, which is the accessible version.
 */
export function StepRail({ labels, index }: { labels: string[]; index: number }) {
  return (
    <div>
      <ol className="flex items-center gap-2" aria-hidden="true">
        {labels.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-caption font-semibold",
                i < index && "border-success/35 bg-success/12 text-success",
                i === index &&
                  "border-transparent bg-brand-800 text-white dark:bg-accent-400 dark:text-ink-950",
                i > index && "border-hairline bg-surface-sunken text-subtle",
              )}
            >
              {i < index ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            {i < labels.length - 1 && (
              <span
                className={cn("h-px flex-1 rounded-full", i < index ? "bg-success/45" : "bg-hairline")}
              />
            )}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-overline uppercase text-subtle">
        Step {index + 1} of {labels.length} — {labels[index]}
      </p>
    </div>
  )
}

/** Big tappable row — the goal, department and learning-path choices. */
export function OptionRow({
  active,
  onClick,
  icon: Icon,
  title,
  desc,
}: {
  active: boolean
  onClick: () => void
  icon: LucideIcon
  title: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-colors",
        active
          ? "border-accent/45 bg-accent/[0.06]"
          : "border-hairline bg-surface hover:border-accent/30 hover:bg-surface-hover",
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
          active ? "bg-accent/12 text-accent" : "bg-surface-sunken text-muted",
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body-sm font-semibold text-foreground">{title}</span>
        <span className="block text-caption text-muted">{desc}</span>
      </span>
      <Check
        className={cn("h-4 w-4 shrink-0 text-accent", active ? "opacity-100" : "opacity-0")}
        aria-hidden="true"
      />
    </button>
  )
}

/** Compact pill — class levels and exam papers. */
export function ChoicePill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-body-sm font-semibold transition-colors",
        active
          ? "border-accent/45 bg-accent/[0.08] text-accent"
          : "border-hairline bg-surface text-muted hover:border-accent/30 hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

/** Checkbox-style toggle for the subject grids. */
export function SubjectToggle({
  selected,
  onClick,
  label,
}: {
  selected: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-caption font-semibold transition-colors",
        selected
          ? "border-accent/45 bg-accent/[0.08] text-accent"
          : "border-hairline bg-surface text-muted hover:border-accent/30 hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-xs border",
          selected ? "border-accent bg-accent/20" : "border-hairline",
        )}
      >
        {selected && <Check className="h-3 w-3" aria-hidden="true" />}
      </span>
      <span className="truncate">{label}</span>
    </button>
  )
}

/** Label plus a leading-icon input — the field pattern the auth screens use. */
export function IconField({
  id,
  label,
  icon: Icon,
  children,
}: {
  id: string
  label: string
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
          aria-hidden="true"
        />
        {children}
      </div>
    </div>
  )
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn-secondary btn-lg">
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      Back
    </button>
  )
}
