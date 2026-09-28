"use client"

import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The one spinner. Every page that waits on Firestore uses this so the wait
 * looks the same everywhere instead of each page inventing its own size,
 * colour and wording.
 */

const SPINNER_SIZES = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
}

export interface LoadingStateProps {
  /** Shown next to the spinner. Omit for a bare spinner with a screen-reader label. */
  text?: string
  /** Screen-reader wording when `text` is omitted. */
  label?: string
  size?: keyof typeof SPINNER_SIZES
  /** Centre it in the viewport — for a whole page that has nothing to show yet. */
  full?: boolean
  className?: string
}

export function LoadingState({
  text,
  label = "Loading",
  size = "md",
  full = false,
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center justify-center gap-3",
        full && "min-h-[60vh] flex-col",
        className,
      )}
    >
      <Loader2
        className={cn("animate-spin text-accent", SPINNER_SIZES[size])}
        aria-hidden="true"
      />
      {text ? (
        <span className="text-body-sm font-medium text-muted">{text}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </div>
  )
}

/** Placeholder block for content whose shape is known before its data arrives. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton", className)} />
}
