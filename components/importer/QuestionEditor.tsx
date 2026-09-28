/**
 * QuestionEditor — one question, edited in place.
 *
 * Used by both the question bank and the importer preview, so the props are
 * unchanged. Three things it now does that it did not:
 *
 * 1. **Survives a question with no `options` map.** `draft.options.A` threw on
 *    any legacy document that was written without one, taking the whole admin
 *    page down with it. The draft is normalised on the way in.
 * 2. **Refuses to save something unusable.** Empty question text, a blank
 *    option, two identical options, or a correct answer pointing at an empty
 *    option all used to save happily and then appear in a real quiz.
 * 3. **Labels are attached to their inputs.** Every `<label>` was floating free,
 *    so nothing was clickable or reachable by a screen reader.
 */
"use client"

import { useId, useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"

import type { Difficulty, PracticeQuestion, QuestionOptions } from "@/lib/types/question"
import { cn } from "@/lib/utils"

export interface QuestionEditorProps {
  question: PracticeQuestion
  onSave: (updated: PracticeQuestion) => void
  onCancel: () => void
}

const LETTERS = ["A", "B", "C", "D"] as const
const DIFFICULTIES: Difficulty[] = ["Easy", "Medium", "Hard"]

/** A question with a usable option map, whatever the stored document held. */
function normalise(question: PracticeQuestion): PracticeQuestion {
  const options = (question.options ?? {}) as Partial<QuestionOptions>
  return {
    ...question,
    options: {
      A: options.A ?? "",
      B: options.B ?? "",
      C: options.C ?? "",
      D: options.D ?? "",
    },
  }
}

function problemsIn(draft: PracticeQuestion): string[] {
  const problems: string[] = []
  if (!draft.question.trim()) problems.push("The question text is empty.")
  if (!draft.subject.trim()) problems.push("No subject.")
  if (!draft.exam.trim()) problems.push("No exam.")
  if (!draft.year) problems.push("No year.")

  const blank = LETTERS.filter((letter) => !draft.options[letter]?.trim())
  if (blank.length > 0) problems.push(`Option ${blank.join(", ")} is empty.`)

  const seen = new Map<string, string>()
  for (const letter of LETTERS) {
    const value = draft.options[letter]?.trim().toLowerCase()
    if (!value) continue
    const first = seen.get(value)
    if (first) problems.push(`Options ${first} and ${letter} are the same.`)
    else seen.set(value, letter)
  }

  if (!LETTERS.includes(draft.correctAnswer)) problems.push("No correct answer is marked.")
  return problems
}
export function QuestionEditor({ question, onSave, onCancel }: QuestionEditorProps) {
  const uid = useId()
  const [draft, setDraft] = useState<PracticeQuestion>(() => normalise(question))
  const [tried, setTried] = useState(false)

  const problems = useMemo(() => problemsIn(draft), [draft])

  const set = <K extends keyof PracticeQuestion>(key: K, value: PracticeQuestion[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const setOption = (letter: keyof QuestionOptions, value: string) =>
    setDraft((prev) => ({ ...prev, options: { ...prev.options, [letter]: value } }))

  const save = () => {
    setTried(true)
    if (problems.length > 0) return
    onSave({
      ...draft,
      question: draft.question.trim(),
      subject: draft.subject.trim(),
      exam: draft.exam.trim(),
      topic: draft.topic?.trim() || undefined,
      paper: draft.paper?.trim() || undefined,
      source: draft.source?.trim() || undefined,
      explanation: draft.explanation?.trim() || undefined,
      options: {
        A: draft.options.A.trim(),
        B: draft.options.B.trim(),
        C: draft.options.C.trim(),
        D: draft.options.D.trim(),
      },
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${uid}-question`} className="field-label">
          Question
        </label>
        <textarea
          id={`${uid}-question`}
          value={draft.question}
          onChange={(event) => set("question", event.target.value)}
          rows={3}
          className="input-premium"
        />
      </div>

      <fieldset>
        <legend className="field-label mb-2">Options — tick the correct one</legend>
        <div className="space-y-2">
          {LETTERS.map((letter) => {
            const checked = draft.correctAnswer === letter
            return (
              <div key={letter} className="flex items-center gap-2">
                <label
                  className={cn(
                    "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border text-caption font-bold transition",
                    checked
                      ? "border-success bg-success/10 text-success"
                      : "border-hairline bg-surface-sunken text-subtle hover:border-accent/40",
                  )}
                >
                  <input
                    type="radio"
                    name={`${uid}-answer`}
                    checked={checked}
                    onChange={() => set("correctAnswer", letter)}
                    className="peer sr-only"
                  />
                  <span className="sr-only">Mark {letter} as the correct answer</span>
                  {letter}
                </label>
                <label htmlFor={`${uid}-option-${letter}`} className="sr-only">
                  Option {letter}
                </label>
                <input
                  id={`${uid}-option-${letter}`}
                  type="text"
                  value={draft.options[letter]}
                  onChange={(event) => setOption(letter, event.target.value)}
                  className="input-premium"
                />
              </div>
            )
          })}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${uid}-explanation`} className="field-label">
          Explanation
        </label>
        <textarea
          id={`${uid}-explanation`}
          value={draft.explanation ?? ""}
          onChange={(event) => set("explanation", event.target.value)}
          rows={3}
          className="input-premium"
        />
        <p className="field-hint">
          Shown after the student answers. Without one, they see the right letter and nothing else.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor={`${uid}-subject`} className="field-label">
            Subject
          </label>
          <input
            id={`${uid}-subject`}
            type="text"
            value={draft.subject}
            onChange={(event) => set("subject", event.target.value)}
            className="input-premium"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-topic`} className="field-label">
            Topic
          </label>
          <input
            id={`${uid}-topic`}
            type="text"
            value={draft.topic ?? ""}
            onChange={(event) => set("topic", event.target.value)}
            className="input-premium"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-exam`} className="field-label">
            Exam
          </label>
          <input
            id={`${uid}-exam`}
            type="text"
            value={draft.exam}
            onChange={(event) => set("exam", event.target.value)}
            className="input-premium"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-year`} className="field-label">
            Year
          </label>
          <input
            id={`${uid}-year`}
            type="number"
            inputMode="numeric"
            value={draft.year || ""}
            onChange={(event) => set("year", Number.parseInt(event.target.value, 10) || 0)}
            className="input-premium"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-paper`} className="field-label">
            Paper
          </label>
          <input
            id={`${uid}-paper`}
            type="text"
            value={draft.paper ?? ""}
            onChange={(event) => set("paper", event.target.value)}
            className="input-premium"
          />
        </div>
        <div>
          <label htmlFor={`${uid}-difficulty`} className="field-label">
            Difficulty
          </label>
          <select
            id={`${uid}-difficulty`}
            value={draft.difficulty ?? ""}
            onChange={(event) =>
              set("difficulty", (event.target.value || undefined) as Difficulty | undefined)
            }
            className="select-premium"
          >
            <option value="">Not set</option>
            {DIFFICULTIES.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor={`${uid}-source`} className="field-label">
            Source
          </label>
          <input
            id={`${uid}-source`}
            type="text"
            value={draft.source ?? ""}
            onChange={(event) => set("source", event.target.value)}
            className="input-premium"
          />
        </div>
      </div>
      {tried && problems.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-xl border border-danger/25 bg-danger/[0.06] p-3">
          {problems.map((problem) => (
            <li key={problem} className="flex items-start gap-1.5 text-caption text-danger">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              {problem}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-hairline pt-4">
        <button type="button" onClick={onCancel} className="btn-secondary btn-sm">
          Cancel
        </button>
        <button type="button" onClick={save} className="btn-primary btn-sm">
          Save question
        </button>
      </div>
    </div>
  )
}
