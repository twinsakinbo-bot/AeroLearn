"use client"

import { cn } from "@/lib/utils"

/**
 * Segmented control for switching between views of the same page. Controlled
 * by the caller — the previous version kept its own copy of the selected value
 * as well, which let the highlight drift away from what was on screen.
 */

export interface TabsProps<T extends string> {
  /** Either plain strings or `{ value, label, count }` for a badge. */
  options: readonly (T | { value: T; label: string; count?: number })[]
  value: T
  onChange: (value: T) => void
  /** "pills" sits on a sunken track; "underline" reads as a page-level switch. */
  variant?: "pills" | "underline"
  /** Stretch each tab to fill the row. */
  fill?: boolean
  ariaLabel?: string
  className?: string
}

function normalize<T extends string>(option: T | { value: T; label: string; count?: number }) {
  return typeof option === "string"
    ? { value: option, label: option, count: undefined as number | undefined }
    : option
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
  variant = "pills",
  fill = false,
  ariaLabel = "View",
  className,
}: TabsProps<T>) {
  const pills = variant === "pills"

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        pills
          ? "inline-flex gap-1 rounded-lg border border-hairline bg-surface-sunken p-1"
          : "flex gap-1 border-b border-hairline",
        fill && "w-full",
        className,
      )}
    >
      {options.map((option) => {
        const { value: optionValue, label, count } = normalize(option)
        const active = optionValue === value

        return (
          <button
            key={optionValue}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(optionValue)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-body-sm font-semibold transition-colors",
              fill && "flex-1",
              pills
                ? active
                  ? "rounded-md bg-surface px-3.5 py-1.5 text-foreground shadow-xs"
                  : "rounded-md px-3.5 py-1.5 text-muted hover:text-foreground"
                : active
                  ? "-mb-px border-b-2 border-accent px-3.5 pb-2.5 pt-1 text-accent"
                  : "-mb-px border-b-2 border-transparent px-3.5 pb-2.5 pt-1 text-muted hover:border-hairline hover:text-foreground",
            )}
          >
            {label}
            {count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                  active ? "bg-accent/[0.12] text-accent" : "bg-surface-sunken text-subtle",
                )}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
