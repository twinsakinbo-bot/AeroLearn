"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Target,
  Check,
  X as XIcon,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Lock,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface DemoQuestion {
  id: string
  subject: string
  question: string
  options: string[]
  correct: number
  explanation: string
}

const FALLBACK_QUESTIONS: DemoQuestion[] = [
  {
    id: "demo-1",
    subject: "JAMB · Mathematics",
    question: "If a polynomial p(x) is divided by (x − a), the remainder is…",
    options: ["p(a)", "−p(a)", "a", "0"],
    correct: 0,
    explanation: "By the Remainder Theorem, dividing p(x) by (x − a) leaves p(a).",
  },
  {
    id: "demo-2",
    subject: "WAEC · Chemistry",
    question: "Which of the following is an inert gas?",
    options: ["Chlorine", "Nitrogen", "Argon", "Oxygen"],
    correct: 2,
    explanation: "Argon is a noble gas — a full outer shell makes it chemically inert.",
  },
]

const DEMO_LIMIT = 5

export function EnhancedDemoQuiz() {
  const [questions, setQuestions] = useState<DemoQuestion[]>(FALLBACK_QUESTIONS)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [answers, setAnswers] = useState<Array<{ correct: boolean }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check localStorage for demo attempts
    const attempts = parseInt(localStorage.getItem("demoAttempts") || "0")
    setAnswers(new Array(attempts).fill({ correct: false }))

    // Fetch real questions from API
    fetch("/api/demo-questions")
      .then((res) => res.json())
      .then((data) => {
        if (data.questions && data.questions.length > 0) {
          setQuestions(data.questions)
        }
        setLoading(false)
      })
      .catch(() => {
        setQuestions(FALLBACK_QUESTIONS)
        setLoading(false)
      })
  }, [])

  const question = questions[currentIndex]
  const answered = selected !== null
  const demoLimitReached = answers.length >= DEMO_LIMIT

  const handleAnswer = (index: number) => {
    if (answered || demoLimitReached) return
    
    setSelected(index)
    const isCorrect = index === question.correct
    const newAnswers = [...answers, { correct: isCorrect }]
    setAnswers(newAnswers)
    localStorage.setItem("demoAttempts", newAnswers.length.toString())
  }

  const nextQuestion = () => {
    setSelected(null)
    setCurrentIndex((prev) => (prev + 1) % questions.length)
  }

  const correctCount = answers.filter((a) => a.correct).length
  const accuracy = answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0

  if (loading) {
    return (
      <div className="card-glass animate-pulse p-6 sm:p-7">
        <div className="h-4 w-32 rounded bg-surface-sunken" />
        <div className="mt-4 h-6 w-full rounded bg-surface-sunken" />
        <div className="mt-4 space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 rounded bg-surface-sunken" />
          ))}
        </div>
      </div>
    )
  }

  if (demoLimitReached) {
    return (
      <div className="card-glass p-6 sm:p-7">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent/20">
            <Lock className="h-8 w-8 text-accent" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-h3 text-foreground">Demo Limit Reached</h2>
          <p className="mt-2 text-body text-muted">
            You've answered {DEMO_LIMIT} questions. Sign up to continue practicing with thousands more!
          </p>

          <div className="mt-6 rounded-lg border border-hairline bg-surface-sunken p-4">
            <div className="flex items-center justify-around">
              <div>
                <p className="text-h3 font-bold text-foreground">{correctCount}/{answers.length}</p>
                <p className="text-caption text-muted">Correct</p>
              </div>
              <div>
                <p className="text-h3 font-bold text-accent">{accuracy}%</p>
                <p className="text-caption text-muted">Accuracy</p>
              </div>
            </div>
          </div>

          {accuracy >= 60 && (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/10 p-4 text-left">
              <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
              <div>
                <p className="text-body-sm font-semibold text-foreground">Great start!</p>
                <p className="mt-1 text-caption text-muted">
                  You're scoring {accuracy}%. Keep going to master every topic.
                </p>
              </div>
            </div>
          )}

          <Link href="/auth/signup" className="btn-primary btn-block mt-6">
            Sign up free to continue
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>

          <p className="mt-4 text-caption text-muted">
            Already have an account?{" "}
            <Link href="/auth/login" className="link-inline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="card-glass p-6 sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3">
        <span className="badge-brand">
          <Target className="h-3.5 w-3.5" aria-hidden="true" />
          Demo {answers.length + 1}/{DEMO_LIMIT}
        </span>
        <span className="text-caption font-semibold text-muted">{question.subject}</span>
      </div>

      <h2 className="text-h4 leading-snug text-foreground">{question.question}</h2>

      <div className="mt-5 space-y-2.5">
        {question.options.map((option, i) => {
          const isCorrect = i === question.correct
          const isPicked = selected === i
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => handleAnswer(i)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3",
                "text-left text-body-sm font-medium transition-colors duration-150",
                !answered &&
                  "border-hairline bg-surface text-foreground hover:border-accent/50 hover:bg-surface-hover",
                answered && isCorrect && "border-success/45 bg-success/10 text-success",
                answered && isPicked && !isCorrect && "border-danger/45 bg-danger/10 text-danger",
                answered && !isCorrect && !isPicked && "border-hairline bg-surface text-subtle"
              )}
            >
              <span>
                <span className="mr-2 font-bold">{"ABCD"[i]}.</span>
                {option}
              </span>
              {answered && isCorrect && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              {answered && isPicked && !isCorrect && (
                <XIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
            </button>
          )
        })}
      </div>

      {answered && (
        <div className="mt-5 animate-fade-in" role="status">
          <div className="rounded-lg border border-hairline bg-surface-sunken p-4 text-body-sm text-muted">
            <strong className="mb-1 block text-foreground">Explanation</strong>
            {question.explanation}
          </div>
          <button type="button" onClick={nextQuestion} className="btn-secondary btn-block mt-3">
            Next question
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {answers.length > 0 && !answered && (
        <div className="mt-5 rounded-lg border border-hairline bg-surface-sunken p-3">
          <div className="flex items-center justify-between text-caption">
            <span className="text-muted">Progress</span>
            <span className="font-semibold text-foreground">
              {correctCount}/{answers.length} correct
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${(answers.length / DEMO_LIMIT) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
