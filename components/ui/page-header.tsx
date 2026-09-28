"use client"

import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { cn } from "@/lib/utils"

const BACK_LINK =
  "mb-3 inline-flex items-center gap-1.5 text-caption font-semibold text-muted transition-colors hover:text-foreground"

export interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Small uppercase label above the title. */
  eyebrow?: string
  /** Actions aligned to the far end of the title row. */
  actions?: React.ReactNode
  /** Renders a back link above the title. */
  backHref?: string
  /** Same affordance for views that live in state rather than the URL. */
  onBack?: () => void
  backLabel?: string
  className?: string
  /** Rule above the header. Off by default now — most pages don't want it. */
  showDivider?: boolean
}

export const PageHeader = ({
  title,
  subtitle,
  eyebrow,
  actions,
  backHref,
  onBack,
  backLabel = "Back",
  className,
  showDivider = false,
}: PageHeaderProps) => (
  <header className={cn("mb-8", showDivider && "border-t border-hairline pt-6", className)}>
    {(backHref || onBack) &&
      (backHref ? (
        <Link href={backHref} className={BACK_LINK}>
          <ChevronLeft size={15} aria-hidden="true" />
          {backLabel}
        </Link>
      ) : (
        <button type="button" onClick={onBack} className={BACK_LINK}>
          <ChevronLeft size={15} aria-hidden="true" />
          {backLabel}
        </button>
      ))}

    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-h1 text-foreground">{title}</h1>
        {subtitle && <p className="mt-2 max-w-prose text-body text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  </header>
)
