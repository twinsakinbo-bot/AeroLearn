"use client"

import { useState } from "react"
import { Check, RotateCcw, Sparkles, Undo2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A deck of term/definition cards, one at a time.
 *
 * This was a drag-to-swipe stack built on framer-motion, `canvas-confetti` and
 * 3D transform utilities (`preserve-3d`, `rotate-y-180`, `backface-hidden`) that
 * are not defined in this project's Tailwind config — so the "flip" never
 * actually flipped, and the two faces were only ever swapped by a conditional.
 * It is now two explicit buttons: keyboard reachable, screen-reader legible, and
 * honest about what it does. Every colour was a light-only tint
 * (`bg-white`, `text-gray-900`, `bg-green-100`) which made it unreadable in dark
 * mode; those are tokens now.
 */

type Flashcard = {
  id: string
  term: string
  definition: string
}

export function FlashcardDeck({
  cards,
  onClose,
}: {
  cards: Flashcard[]
  onClose: () => void
}) {
  /* Cards you mark for review go to the back, so the deck shrinks only as you
     genuinely learn a term. */
  const [queue, setQueue] = useState(cards)
  const [flipped, setFlipped] = useState(false)
  const [learned, setLearned] = useState(0)

  const card = queue[0]

  const know = () => {
    setFlipped(false)
    setLearned((count) => count + 1)
    setQueue((rest) => rest.slice(1))
  }

  const review = () => {
    setFlipped(false)
    setQueue((rest) => (rest.length < 2 ? rest : [...rest.slice(1), rest[0]]))
  }

  if (!card) {
    return (
      <div className="animate-fade-in py-6 text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-success/30 bg-success/10 text-success">
          <Sparkles size={24} aria-hidden="true" />
        </span>
        <h3 className="mt-4 text-h4 font-semibold text-foreground">
          {cards.length} terms, all learned
        </h3>
        <p className="mx-auto mt-1.5 max-w-xs text-body-sm text-muted">
          Come back to this deck tomorrow — spacing them out is what makes them stick.
        </p>
        <button type="button" onClick={onClose} className="btn-primary mt-5">
          Back to the lesson
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-caption font-semibold tabular-nums text-muted" role="status">
          {learned} of {cards.length} learned
        </p>
        <p className="text-caption tabular-nums text-subtle">{queue.length} left in the deck</p>
      </div>

      <div
        aria-hidden="true"
        className="h-1 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${(learned / Math.max(cards.length, 1)) * 100}%` }}
        />
      </div>

      <button
        type="button"
        onClick={() => setFlipped((state) => !state)}
        aria-expanded={flipped}
        className={cn(
          "mt-4 flex min-h-[13rem] w-full flex-col items-center justify-center rounded-xl border px-5 py-8 text-center transition-colors",
          flipped
            ? "border-accent/30 bg-accent/[0.06]"
            : "border-hairline bg-surface-sunken hover:bg-surface-hover",
        )}
      >
        <span className="text-overline uppercase text-subtle">
          {flipped ? "Definition" : "Term"}
        </span>

        {flipped ? (
          <span className="mt-3 text-body text-muted">{card.definition}</span>
        ) : (
          <span className="mt-3 text-h4 font-semibold text-foreground">{card.term}</span>
        )}

        <span className="mt-5 inline-flex items-center gap-1.5 text-caption text-subtle">
          <RotateCcw size={13} aria-hidden="true" />
          {flipped ? "Tap to hide it again" : "Tap to reveal the definition"}
        </span>
      </button>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={review} disabled={queue.length < 2} className="btn-secondary">
          <Undo2 size={15} aria-hidden="true" />
          Review later
        </button>
        <button type="button" onClick={know} className="btn-primary">
          <Check size={15} aria-hidden="true" />
          I know this
        </button>
      </div>

      <p className="mt-3 text-center text-caption text-subtle">
        &ldquo;Review later&rdquo; sends the card to the back of the deck.
      </p>
    </div>
  )
}
