"use client"

import { useEffect, useState } from "react"
import { Clock } from "lucide-react"

interface ExamDate {
  name: string
  date: Date
}

const EXAM_DATES: ExamDate[] = [
  { name: "JAMB 2026", date: new Date("2026-04-15") },
  { name: "WAEC 2026", date: new Date("2026-05-18") },
  { name: "NECO 2026", date: new Date("2026-06-22") },
]

export function ExamCountdown() {
  const [timeLeft, setTimeLeft] = useState<{ exam: string; days: number } | null>(null)

  useEffect(() => {
    const calculateClosestExam = () => {
      const now = new Date()
      const upcoming = EXAM_DATES.filter((exam) => exam.date > now).sort(
        (a, b) => a.date.getTime() - b.date.getTime()
      )

      if (upcoming.length === 0) return null

      const closest = upcoming[0]
      const days = Math.ceil((closest.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      return { exam: closest.name, days }
    }

    const update = () => {
      const result = calculateClosestExam()
      setTimeLeft(result)
    }

    update()
    const interval = setInterval(update, 1000 * 60 * 60) // Update every hour

    return () => clearInterval(interval)
  }, [])

  if (!timeLeft || timeLeft.days > 120) return null

  return (
    <div className="fixed bottom-6 left-6 z-50 hidden animate-fade-in rounded-lg border border-warn/30 bg-gradient-to-br from-warn/20 to-warn/5 px-4 py-3 shadow-lg backdrop-blur-sm lg:block">
      <div className="flex items-center gap-3">
        <Clock className="h-5 w-5 text-warn" aria-hidden="true" />
        <div>
          <p className="text-caption font-bold text-foreground">{timeLeft.exam}</p>
          <p className="text-xs text-muted">
            {timeLeft.days} day{timeLeft.days !== 1 ? "s" : ""} away
          </p>
        </div>
      </div>
    </div>
  )
}
