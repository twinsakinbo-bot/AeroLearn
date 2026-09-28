"use client"

import Link from "next/link"
import { type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The metric tile used across the dashboard, progress and profile pages.
 *
 * Colour sits in the icon chip only — the number itself stays in the
 * foreground colour. Tinting every figure was what made the old dashboard read
 * as a demo: six saturated numbers competing, none of them more important than
 * the others.
 */

const TONE_CHIP = {
  accent: "bg-accent/10 text-accent",
  brand: "bg-brand/10 text-brand",
  success: "bg-success/10 text-success",
  warn: "bg-warn/10 text-warn",
  danger: "bg-danger/10 text-danger",
  streak: "bg-streak/10 text-streak",
  neutral: "bg-surface-sunken text-subtle",
}

export interface StatCardProps {
  label: string
  value: string | number
  icon?: LucideIcon
  tone?: keyof typeof TONE_CHIP
  /** Secondary line under the value — a target, a best-ever, a breakdown. */
  hint?: string
  /** Makes the whole tile a link. */
  href?: string
  className?: string
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
  href,
  className,
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-overline uppercase text-subtle">{label}</p>
        {Icon && (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              TONE_CHIP[tone],
            )}
          >
            <Icon size={16} strokeWidth={2.2} aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="mt-3 text-h2 font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-1 text-caption text-muted">{hint}</p>}
    </>
  )

  if (href) {
    return (
      <Link href={href} className={cn("card-interactive block p-5", className)}>
        {body}
      </Link>
    )
  }

  return <div className={cn("card p-5", className)}>{body}</div>
}
