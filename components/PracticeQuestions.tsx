"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, Check, ListChecks, RefreshCw, Star, Target, Trophy, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { ProgressBar } from "@/components/ui/progress-bar"
import { StatCard } from "@/components/ui/stat-card"
import { auth } from "@/lib/auth"
import { collection, db, doc, getDoc, getDocs, query, updateDoc, where } from "@/lib/db"
import { cn } from "@/lib/utils"

export interface PracticeQuestion {
  id: string
  subject: string
  topic?: string
  question: string
  options: string[] | { A: string; B: string; C: string; D: string }
  correctAnswer: string
  explanation?: string
  difficulty?: string
}

/** Matches the award written by the gamification routes. */
const XP_PER_CORRECT = 10

function getOptionsList(options: PracticeQuestion["options"]): { letter: string; text: string }[] {
  if (Array.isArray(options)) {
    return options.map((opt, i) => ({ letter: "ABCD"[i] || "", text: opt }))
  }
  return (["A", "B", "C", "D"] as const).map((l) => ({
    letter: l,
    text: options[l] || "",
  }))
}

/** Drives `.chip-choice[data-state]` — the shared answer-option treatment. */
type ChoiceState = "correct" | "wrong" | "picked" | undefined

export function PracticeQuestions({ subject }: { subject: string }) {
  const [questions, setQuestions] = useState<PracticeQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answered, setAnswered] = useState<
    Record<string, { isCorrect: boolean; explanation: string; selectedLetter?: string }>
  >({})
  const [xp, setXp] = useState(0)
  const [showXpAnimation, setShowXpAnimation] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  const loadQuestions = useCallback(async () => {
    setLoading(true)
    try {
      const questionsCol = collection(db, "practiceQuestions")
      const qQuery = query(questionsCol, where("subject", "==", subject))
      const snapshot = await getDocs(qQuery)

      setQuestions(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as PracticeQuestion[],
      )
    } catch (error) {
      console.error("Error loading questions:", error)
    } finally {
      setLoading(false)
    }
  }, [subject])

  useEffect(() => {
    if (subject) loadQuestions()
  }, [subject, loadQuestions])

  const handleRefresh = async () => {
    setCurrentIndex(0)
    setAnswered({})
    setIsComplete(false)
    await loadQuestions()
  }

  const handleAnswer = async (letter: string, question: PracticeQuestion) => {
    if (!auth.currentUser || isComplete) return

    const isCorrect = letter === question.correctAnswer

    const userRef = doc(db, "users", auth.currentUser.uid)
    const userSnap = await getDoc(userRef)
    const currentStats = userSnap.data()?.studyStats || {
      questionsAttempted: 0,
      questionsCorrect: 0,
      subjectsStudied: [] as string[],
    }

    await updateDoc(userRef, {
      "studyStats.questionsAttempted": currentStats.questionsAttempted + 1,
      "studyStats.questionsCorrect": isCorrect
        ? currentStats.questionsCorrect + 1
        : currentStats.questionsCorrect,
      "studyStats.subjectsStudied": [...new Set([...currentStats.subjectsStudied, subject])],
    })

    if (isCorrect) {
      setXp((prev) => prev + XP_PER_CORRECT)
      setShowXpAnimation(true)
      setTimeout(() => setShowXpAnimation(false), 1500)
    }

    setAnswered((prev) => ({
      ...prev,
      [question.id]: { isCorrect, explanation: question.explanation || "", selectedLetter: letter },
    }))

    if (currentIndex === questions.length - 1) setIsComplete(true)
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) setCurrentIndex((prev) => prev + 1)
  }

  const handlePrevious = () => {
    if (currentIndex > 0) setCurrentIndex((prev) => prev - 1)
  }

  const handleRestart = () => {
    setCurrentIndex(0)
    setAnswered({})
    setXp(0)
    setIsComplete(false)
  }

  if (loading) {
    return (
      <Card padding="lg">
        <LoadingState text="Loading questions…" size="lg" className="flex-col py-8" />
      </Card>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={ListChecks}
          title="No questions yet"
          description={`There is nothing to practise in ${subject} at the moment. Your teacher adds questions as topics are covered.`}
        />
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={handleRefresh}>
            <RefreshCw size={16} aria-hidden="true" />
            Check again
          </Button>
        </div>
      </div>
    )
  }

  if (isComplete) {
    const correctCount = questions.filter((q) => answered[q.id]?.isCorrect).length
    const percentage = Math.round((correctCount / questions.length) * 100)

    return (
      <Card padding="lg" className="text-center">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-success/10 text-success">
          <Trophy size={26} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <h2 className="text-h3 font-extrabold text-foreground">Practice complete</h2>
        <p className="mt-2 text-body-sm text-muted">
          You answered every question in this session.
        </p>

        <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-3 text-left">
          <StatCard label="Score" value={`${percentage}%`} icon={Target} tone="brand" />
          <StatCard
            label="Correct"
            value={`${correctCount}/${questions.length}`}
            icon={Check}
            tone="success"
          />
          <StatCard label="XP earned" value={`+${xp}`} icon={Star} tone="warn" />
        </div>

        <Button variant="primary" size="lg" className="mt-7" onClick={handleRestart}>
          Practise again
        </Button>
      </Card>
    )
  }

  const currentQuestion = questions[currentIndex]
  const optionsList = getOptionsList(currentQuestion.options)
  const answerState = answered[currentQuestion.id]

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-h4 font-extrabold text-foreground">{subject}</h2>
          <p className="text-body-sm text-muted">
            Question {currentIndex + 1} of {questions.length}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {xp > 0 && (
            <span className="stat-pill stat-pill-xp">
              <Star size={14} strokeWidth={2.4} aria-hidden="true" />
              +{xp} XP
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            title="Reload questions from the server"
          >
            <RefreshCw size={14} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      <ProgressBar
        value={currentIndex + 1}
        max={questions.length}
        tone="accent"
        size="sm"
        valueLabel=""
        ariaLabel={`Question ${currentIndex + 1} of ${questions.length}`}
      />

      <div>
        <h3 
          className="text-body-lg font-bold leading-relaxed text-foreground"
          dangerouslySetInnerHTML={{ __html: currentQuestion.question }}
        />
        {currentQuestion.topic && (
          <Badge tone="neutral" className="mt-3">
            {currentQuestion.topic}
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        {optionsList.map((opt) => {
          const isCorrectAnswer = opt.letter === currentQuestion.correctAnswer
          const isSelected = answerState?.selectedLetter === opt.letter

          const state: ChoiceState = !answerState
            ? undefined
            : isCorrectAnswer
              ? "correct"
              : isSelected
                ? "wrong"
                : undefined

          return (
            <button
              key={opt.letter}
              type="button"
              onClick={() => handleAnswer(opt.letter, currentQuestion)}
              disabled={!!answerState}
              className="chip-choice"
              data-state={state}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-current/25 text-body-sm font-extrabold">
                {opt.letter}
              </span>
              <span className="flex-1" dangerouslySetInnerHTML={{ __html: opt.text }} />
              {state === "correct" && (
                <Check size={20} className="shrink-0" aria-label="Correct answer" />
              )}
              {state === "wrong" && (
                <X size={20} className="shrink-0" aria-label="Your answer, incorrect" />
              )}
            </button>
          )
        })}
      </div>

      {answerState && (
        <div
          className={cn(
            "rounded-xl border-2 p-5",
            answerState.isCorrect
              ? "border-success/30 bg-success/[0.08]"
              : "border-danger/30 bg-danger/[0.08]",
          )}
        >
          <div className="mb-2 flex items-center gap-2">
            {answerState.isCorrect ? (
              <Check size={20} className="text-success" aria-hidden="true" />
            ) : (
              <X size={20} className="text-danger" aria-hidden="true" />
            )}
            <p
              className={cn(
                "text-body-sm font-bold",
                answerState.isCorrect ? "text-success" : "text-danger",
              )}
            >
              {answerState.isCorrect
                ? "Correct"
                : `Incorrect — the answer is ${currentQuestion.correctAnswer}`}
            </p>
            {answerState.isCorrect && (
              <Badge tone="xp" className="ml-auto">
                <Star size={12} strokeWidth={2.6} aria-hidden="true" />
                +{XP_PER_CORRECT} XP
              </Badge>
            )}
          </div>
          {answerState.explanation && (
            <p 
              className="text-body-sm leading-relaxed text-muted"
              dangerouslySetInnerHTML={{ __html: answerState.explanation }}
            />
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t-2 border-hairline pt-5">
        <Button
          variant="secondary"
          onClick={handlePrevious}
          disabled={currentIndex === 0}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Previous
        </Button>
        <span className="text-body-sm font-bold tabular-nums text-muted">
          {currentIndex + 1} / {questions.length}
        </span>
        <Button
          variant="primary"
          onClick={handleNext}
          disabled={currentIndex === questions.length - 1}
        >
          Next
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </div>

      {showXpAnimation && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
        >
          <div className="card px-7 py-5 shadow-lg">
            <p className="text-h3 font-extrabold text-xp">+{XP_PER_CORRECT} XP</p>
          </div>
        </div>
      )}
    </div>
  )
}






