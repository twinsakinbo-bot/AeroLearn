/**
 * QuestionPreviewTable — the parsed rows of an import, before anything is
 * written, with per-row validation and inline editing.
 *
 * Three real problems fixed:
 *
 * 1. **"Edit" did nothing unless the row happened to be expanded.** The editor
 *    was rendered inside the `isExpanded` branch while the button only set
 *    `editing`, so on a collapsed row — every row, until clicked — pressing Edit
 *    produced no visible change at all.
 * 2. **A row with no `options` map crashed the page.** `q.options.A` on a parsed
 *    row that had no options threw during render, so one malformed line in a
 *    spreadsheet took down the whole preview.
 * 3. **The row was a clickable `<tr>`.** Not focusable, not operable from a
 *    keyboard, and it swallowed clicks meant for the buttons inside it. Each row
 *    is a real `<button>` with `aria-expanded` now.
 *
 * It is a list rather than a table: ten columns, four of them holding full
 * option text, could not fit any screen and scrolled sideways off the page.
 */
"use client"

import { useState } from "react"
import { AlertTriangle, Check, ChevronDown, Copy, Pencil, Trash2, X } from "lucide-react"

import type { PracticeQuestion, QuestionOptions, ValidationError } from "@/lib/types/question"
import { cn } from "@/lib/utils"

import { QuestionEditor } from "./QuestionEditor"

export interface QuestionPreviewRow {
  question: PracticeQuestion
  errors?: ValidationError[]
  isDuplicate?: boolean
  isBlank?: boolean
}

export interface QuestionPreviewTableProps {
  questions: QuestionPreviewRow[]
  onUpdateQuestion: (index: number, updated: PracticeQuestion) => void
  onRemoveQuestion: (index: number) => void
}

const LETTERS = ["A", "B", "C", "D"] as const

/** Parsed rows are not guaranteed to have an option map at all. */
function optionsOf(question: PracticeQuestion): QuestionOptions {
  const options = (question.options ?? {}) as Partial<QuestionOptions>
  return {
    A: options.A ?? "",
    B: options.B ?? "",
    C: options.C ?? "",
    D: options.D ?? "",
  }
}
export function QuestionPreviewTable({
  questions,
  onUpdateQuestion,
  onRemoveQuestion,
}: QuestionPreviewTableProps) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)

  if (questions.length === 0) return null

  return (
    <section className="space-y-2">
      <h2 className="text-overline uppercase text-subtle">
        {questions.length} row{questions.length === 1 ? "" : "s"} in this file
      </h2>

      <ul className="space-y-2">
        {questions.map((row, index) => {
          const question = row.question
          const options = optionsOf(question)
          const problems = row.errors?.filter((entry) => entry.severity === "error") ?? []
          const cautions = row.errors?.filter((entry) => entry.severity === "warning") ?? []
          const open = expanded === index
          const isEditing = editing === index

          return (
            <li
              key={index}
              className={cn(
                "card overflow-hidden p-0",
                problems.length > 0 && "border-danger/30",
                problems.length === 0 && row.isDuplicate && "border-warn/30",
              )}
            >
              <div className="flex items-start gap-2 p-4">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : index)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 text-caption tabular-nums text-subtle">
                      {question.questionNumber ?? index + 1}.
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-body-sm font-medium",
                          question.question ? "text-foreground" : "text-danger",
                          !open && "line-clamp-2",
                        )}
                        dangerouslySetInnerHTML={
                          question.question
                            ? { __html: question.question }
                            : { __html: "This row has no question text." }
                        }
                      />
                      <span className="mt-2 flex flex-wrap items-center gap-1.5">
                        {problems.length > 0 ? (
                          <span className="badge bg-danger/10 text-danger">
                            <AlertTriangle size={11} aria-hidden="true" />
                            {problems.length} problem{problems.length === 1 ? "" : "s"}
                          </span>
                        ) : row.isDuplicate ? (
                          <span className="badge bg-warn/10 text-warn">
                            <Copy size={11} aria-hidden="true" />
                            Already in the bank
                          </span>
                        ) : (
                          <span className="badge bg-success/10 text-success">
                            <Check size={11} aria-hidden="true" />
                            Ready
                          </span>
                        )}
                        {cautions.length > 0 && problems.length === 0 && (
                          <span className="badge bg-warn/10 text-warn">
                            {cautions.length} to check
                          </span>
                        )}
                        {question.subject && (
                          <span className="badge bg-surface-sunken text-subtle">
                            {question.subject}
                          </span>
                        )}
                        {question.topic && (
                          <span className="badge bg-surface-sunken text-subtle">
                            {question.topic}
                          </span>
                        )}
                        <span className="badge bg-surface-sunken text-subtle">
                          Answer {question.correctAnswer || "—"}
                        </span>
                      </span>
                    </span>
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 shrink-0 text-subtle transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </span>
                </button>

                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(isEditing ? null : index)
                      setExpanded(index)
                    }}
                    className="btn-ghost btn-sm"
                  >
                    {isEditing ? (
                      <X size={14} aria-hidden="true" />
                    ) : (
                      <Pencil size={14} aria-hidden="true" />
                    )}
                    <span className="sr-only">
                      {isEditing ? "Stop editing" : "Edit"} row {index + 1}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveQuestion(index)}
                    className="btn-ghost btn-sm text-danger"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    <span className="sr-only">Leave row {index + 1} out of the import</span>
                  </button>
                </div>
              </div>
              {(problems.length > 0 || cautions.length > 0) && (
                <ul className="space-y-1 border-t border-hairline bg-surface-sunken px-4 py-3">
                  {problems.map((problem, position) => (
                    <li
                      key={`error-${position}`}
                      role="alert"
                      className="flex items-start gap-1.5 text-caption text-danger"
                    >
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <span>
                        <span className="font-semibold">{problem.field}</span> — {problem.message}
                      </span>
                    </li>
                  ))}
                  {cautions.map((caution, position) => (
                    <li
                      key={`warning-${position}`}
                      className="flex items-start gap-1.5 text-caption text-warn"
                    >
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <span>
                        <span className="font-semibold">{caution.field}</span> — {caution.message}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {open && (
                <div className="border-t border-hairline p-4">
                  {isEditing ? (
                    <QuestionEditor
                      question={question}
                      onSave={(updated) => {
                        onUpdateQuestion(index, updated)
                        setEditing(null)
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <>
                      <ul className="grid gap-1.5 sm:grid-cols-2">
                        {LETTERS.map((letter) => {
                          const correct = question.correctAnswer === letter
                          return (
                            <li key={letter} className="flex items-start gap-2">
                              <span
                                className={cn(
                                  "flex h-6 w-6 shrink-0 items-center justify-center rounded text-caption font-bold",
                                  correct
                                    ? "bg-success/10 text-success"
                                    : "bg-surface-sunken text-subtle",
                                )}
                              >
                                {letter}
                              </span>
                              <span
                                className={cn(
                                  "text-caption",
                                  options[letter] ? "text-foreground" : "text-danger",
                                )}
                                dangerouslySetInnerHTML={
                                  options[letter]
                                    ? { __html: options[letter] }
                                    : { __html: "Empty" }
                                }
                              />
                            </li>
                          )
                        })}
                      </ul>

                      {question.explanation && (
                        <p className="mt-3 border-t border-hairline pt-3 text-caption text-muted">
                          <span className="font-semibold text-foreground">Explanation. </span>
                          <span dangerouslySetInnerHTML={{ __html: question.explanation }} />
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
