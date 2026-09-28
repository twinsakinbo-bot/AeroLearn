"use client"

import { cn } from "@/lib/utils"

/**
 * A single horizontal meter.
 *
 * The track and fill are the shared `.progress-track` / `.progress-fill` pair
 * from globals.css rather than hand-rolled utilities, which is what gets the
 * glossy cap and the ease-out-expo width transition — a bar that eases and
 * catches a highlight reads as a reward, and a flat 6px line reads as a form
 * field. Every call site asked for `size="sm"`, so the scale itself was bumped:
 * `sm` is now 12px, not 6px.
 *
 * Tones are spelled out rather than interpolated because Tailwind only ships
 * classes it can see in the source — a `bg-${tone}` template compiles to
 * nothing at all.
 */

const TONE_FILL = {
  /** Default. `.progress-fill` is already brand-500, so nothing to add. */
  brand: "",
  accent: "bg-accent-500",
  success: "progress-fill-success",
  streak: "progress-fill-streak",
  xp: "progress-fill-xp",
  warn: "bg-warn-500",
  danger: "bg-danger-500",
}

/** `.progress-track` is natively 16px; utilities outrank the component layer. */
const SIZES = {
  xs: "h-2",
  sm: "h-3",
  md: "",
  lg: "h-5",
}

export interface ProgressBarProps {
  value: number
  max?: number
  tone?: keyof typeof TONE_FILL
  size?: keyof typeof SIZES
  /** Caption on the left, above the bar. */
  label?: string
  /** Caption on the right, above the bar. Pass "" to show nothing. */
  valueLabel?: string
  /** Used for the accessible name when there is no visible `label`. */
  ariaLabel?: string
  className?: string
}

export function ProgressBar({
  value,
  max = 100,
  tone = "accent",
  size = "md",
  label,
  valueLabel,
  ariaLabel,
  className,
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1
  const percent = Math.min(100, Math.max(0, (value / safeMax) * 100))
  const rendered = valueLabel ?? `${Math.round(percent)}%`

  return (
    <div className={className}>
      {(label || rendered) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          {label && <span className="text-caption font-semibold text-muted">{label}</span>}
          {rendered && (
            <span className="ml-auto text-caption font-extrabold tabular-nums text-foreground">
              {rendered}
            </span>
          )}
        </div>
      )}

      <div
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || ariaLabel || "Progress"}
        className={cn("progress-track", SIZES[size])}
      >
        <div className={cn("progress-fill", TONE_FILL[tone])} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
