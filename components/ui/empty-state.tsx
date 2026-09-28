"use client"

import Link from "next/link"
import { ChevronRight, Inbox, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * What a page shows before the student has done anything. The tone matters:
 * an empty screen should read as an invitation, not as a failure, so every one
 * of these carries a way out — either a primary action or a short list of
 * places worth going instead.
 */

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: LucideIcon
  /** Primary action. Both are needed for it to render. */
  actionText?: string
  actionHref?: string
  /** Secondary suggestions, shown as a small list of links. */
  suggestions?: { title: string; href: string }[]
  /** Draw the surrounding card. Off when the caller already has one. */
  bordered?: boolean
  className?: string
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  actionText,
  actionHref,
  suggestions,
  bordered = true,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-6 py-14 text-center",
        bordered && "rounded-xl border border-dashed border-hairline bg-surface-sunken/50",
        className,
      )}
    >
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-surface">
        <Icon size={22} strokeWidth={2} className="text-subtle" aria-hidden="true" />
      </span>

      <h2 className="text-h4 font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-2 max-w-sm text-body-sm text-muted">{description}</p>}

      {actionText && actionHref && (
        <Link href={actionHref} className="btn-primary mt-6">
          {actionText}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      )}

      {suggestions && suggestions.length > 0 && (
        <ul className="mt-6 w-full max-w-sm space-y-1.5 text-left">
          {suggestions.map((suggestion) => (
            <li key={suggestion.href}>
              <Link
                href={suggestion.href}
                className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-surface px-3.5 py-2.5 text-body-sm font-semibold text-foreground transition-colors hover:border-accent/30 hover:bg-surface-hover"
              >
                {suggestion.title}
                <ChevronRight size={15} className="shrink-0 text-subtle" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
