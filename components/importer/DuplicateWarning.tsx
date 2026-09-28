/**
 * DuplicateWarning — what to do about questions already in the bank.
 *
 * These are matches against Firestore, not repeats within the file (those are
 * always skipped). The old version was a hardcoded `bg-orange-50` panel whose
 * three radios carried no explanation of what each one does to existing data —
 * "Replace existing questions" overwrites rows an admin cannot get back, and it
 * read as the mildest of the three. Each choice now states its consequence, and
 * the destructive one is marked as such.
 */
"use client"

import { Copy } from "lucide-react"

import { cn } from "@/lib/utils"

export type DuplicateAction = "skip" | "replace" | "import-as-new"

export interface DuplicateWarningProps {
  duplicateCount: number
  onSelect: (action: DuplicateAction) => void
  selected: DuplicateAction
}

const CHOICES = [
  {
    id: "skip",
    title: "Leave them alone",
    hint: "The copy already in the bank is kept. Nothing is written for these rows.",
    danger: false,
  },
  {
    id: "replace",
    title: "Overwrite with this file",
    hint: "The existing question is replaced by the one in this file. This cannot be undone.",
    danger: true,
  },
  {
    id: "import-as-new",
    title: "Add anyway",
    hint: "Both copies end up in the bank. Students may see the same question twice.",
    danger: false,
  },
] satisfies { id: DuplicateAction; title: string; hint: string; danger: boolean }[]

export function DuplicateWarning({ duplicateCount, onSelect, selected }: DuplicateWarningProps) {
  if (duplicateCount === 0) return null

  return (
    <section className="card border-warn/25 bg-warn/[0.04] p-5">
      <h3 className="flex items-center gap-2 text-h4 font-semibold text-foreground">
        <Copy size={18} className="text-warn" aria-hidden="true" />
        {duplicateCount} question{duplicateCount === 1 ? " is" : "s are"} already in the bank
      </h3>
      <p className="mt-1 text-caption text-muted">
        Matched on exam, year, subject and question text. Everything else in the file
        is imported normally.
      </p>

      <fieldset className="mt-4">
        <legend className="sr-only">What to do with questions already in the bank</legend>

        <div className="grid gap-2">
          {CHOICES.map((choice) => {
            const active = selected === choice.id
            return (
              <label
                key={choice.id}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border p-3 transition",
                  active
                    ? choice.danger
                      ? "border-danger bg-danger/[0.06] ring-2 ring-danger/25"
                      : "border-accent bg-accent/[0.04] ring-2 ring-accent/25"
                    : "border-hairline bg-surface hover:border-accent/30",
                )}
              >
                <input
                  type="radio"
                  name="duplicateAction"
                  value={choice.id}
                  checked={active}
                  onChange={() => onSelect(choice.id)}
                  className="mt-0.5 accent-accent"
                />
                <span className="min-w-0">
                  <span className="block text-body-sm font-semibold text-foreground">
                    {choice.title}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block text-caption",
                      choice.danger ? "text-danger" : "text-muted",
                    )}
                  >
                    {choice.hint}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>
    </section>
  )
}

