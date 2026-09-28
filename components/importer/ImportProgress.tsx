/**
 * ImportProgress — how far through the write we are.
 *
 * The bar itself was `bg-gray-200` / `bg-blue-600` with no ARIA role, so a screen
 * reader announced nothing at all while the import ran. It also rendered
 * "Importing… 0 / 500" indefinitely, because the page it belongs to set progress
 * once before the request and once after it returned — that is fixed in the page,
 * but the bar now also degrades honestly: with no per-row signal it shows an
 * indeterminate shimmer rather than a stuck 0%.
 */
"use client"

import { cn } from "@/lib/utils"

export interface ImportProgressProps {
  imported: number
  total: number
  failed: number
  /** No per-row progress available — show motion instead of a stuck bar. */
  indeterminate?: boolean
}

export function ImportProgress({
  imported,
  total,
  failed,
  indeterminate = false,
}: ImportProgressProps) {
  const processed = Math.min(imported + failed, total)
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-body-sm font-medium text-foreground">
          {indeterminate ? (
            <>Writing {total} question{total === 1 ? "" : "s"}…</>
          ) : (
            <>
              <span className="tabular-nums">{processed}</span> of{" "}
              <span className="tabular-nums">{total}</span> written
            </>
          )}
        </p>

        <p className="flex items-center gap-3 text-caption">
          <span className="text-success tabular-nums">{imported} added</span>
          {failed > 0 && <span className="text-danger tabular-nums">{failed} failed</span>}
        </p>
      </div>

      <div
        role="progressbar"
        aria-label="Import progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={indeterminate ? undefined : processed}

        aria-valuetext={
          indeterminate ? "Working" : `${processed} of ${total} questions written`
        }
        className="h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        {indeterminate ? (
          /* `animate-shimmer` travels background-position from -200% to 200%, which
             only moves when the background is wider than the box — hence the
             explicit length, the same trick `.skeleton` uses. */
          <div className="h-full w-full animate-shimmer bg-gradient-to-r from-transparent via-accent/70 to-transparent bg-[length:200%_100%]" />
        ) : (
          <div
            className={cn(
              "h-full rounded-full bg-accent transition-[width] duration-500 ease-out",
              failed > 0 && "bg-gradient-to-r from-accent to-warn",
            )}
            style={{ width: `${percent}%` }}
          />
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {indeterminate ? "Import in progress" : `${percent} percent complete`}
      </p>
    </div>
  )
}
