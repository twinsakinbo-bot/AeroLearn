/**
 * WorksheetSelector — which sheet of a workbook to import.
 *
 * The parent used to render this and then immediately overwrite the step with the
 * preview, so a multi-sheet workbook silently imported sheet 1 and there was no
 * way to reach any other. It also had no selected state coming in, so the sheet
 * being previewed was never the one shown as chosen.
 */
"use client"

import { Loader2, Table2 } from "lucide-react"

import { cn } from "@/lib/utils"

export interface WorksheetSelectorProps {
  sheetNames: string[]
  /** The sheet currently parsed and shown in the preview. */
  selected?: string
  onSelect: (sheetName: string) => void
  busy?: boolean
}

export function WorksheetSelector({
  sheetNames,
  selected,
  onSelect,
  busy = false,
}: WorksheetSelectorProps) {
  if (sheetNames.length === 0) return null

  return (
    <fieldset disabled={busy}>
      <legend className="field-label mb-3">
        {sheetNames.length} sheet{sheetNames.length === 1 ? "" : "s"} in this workbook
      </legend>

      <div className="grid gap-2 sm:grid-cols-2">
        {sheetNames.map((name, index) => {
          const active = selected === name
          return (
            <label
              key={`${name}-${index}`}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3 transition",
                busy ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                active
                  ? "border-accent ring-2 ring-accent/25"
                  : "border-hairline hover:border-accent/30",
              )}
            >
              <input
                type="radio"
                name="worksheet"
                value={name}
                checked={active}
                onChange={() => onSelect(name)}
                className="accent-accent"
              />
              <span className="flex min-w-0 items-center gap-2">
                {busy && active ? (
                  <Loader2 size={14} className="shrink-0 animate-spin text-accent" aria-hidden="true" />
                ) : (
                  <Table2 size={14} className="shrink-0 text-subtle" aria-hidden="true" />
                )}
                <span className="truncate text-body-sm font-medium text-foreground">
                  {name || "(untitled sheet)"}
                </span>
              </span>
            </label>
          )
        })}
      </div>

      <p className="field-hint">
        Picking a different sheet re-reads the file and replaces the preview below.
      </p>
    </fieldset>
  )
}
