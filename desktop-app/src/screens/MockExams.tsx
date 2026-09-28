import { useEffect, useMemo, useState } from "react"
import { ChevronRight, RefreshCcw, Timer, Trophy } from "lucide-react"
import { awardStudy, newId, recordWeakTopic, type DesktopProfile, type MockResult } from "../storage"
import { fetchQuestions, type RemoteQuestion } from "../db"
import { Page, PageHeading, Panel, formatTime } from "../ui"
import type { Subject } from "../data"

const subjects: (Subject | "Mixed")[] = ["Mixed", "Mathematics", "English", "Physics", "Chemistry", "Biology", "Government", "Economics"]

export function MockExams({
  profile,
  update,
  showToast,
}: {
  profile: DesktopProfile
  update: (patch: Partial<DesktopProfile> | ((current: DesktopProfile) => DesktopProfile), toast?: string) => void
  showToast: (text: string) => void
}) {
  const [subject, setSubject] = useState<Subject | "Mixed">("Mixed")
  const [duration, setDuration] = useState(600)
  const [inExam, setInExam] = useState(false)
  const [questions, setQuestions] = useState<RemoteQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [remaining, setRemaining] = useState(duration)
  const [current, setCurrent] = useState(0)
  const [result, setResult] = useState<MockResult | null>(null)

  useEffect(() => {
    if (!inExam) return
    const timer = window.setInterval(() => {
      setRemaining((seconds) => {
        if (seconds <= 1) { window.clearInterval(timer); finish(); return 0 }
        return seconds - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [inExam])

  const begin = async () => {
    const { questions } = await fetchQuestions({ subject: subject === "Mixed" ? undefined : subject, limit: 10 })
    setQuestions(questions)
    setAnswers({})
    setCurrent(0)
    setRemaining(duration)
    setResult(null)
    setInExam(true)
  }

  const pick = (id: string, letter: string) => {
    setAnswers((current) => ({ ...current, [id]: letter }))
  }

  const finish = () => {
    let score = 0
    questions.forEach((question) => {
      if (answers[question.id] === question.correctAnswer) score++
      else if (answers[question.id]) update((profile) => recordWeakTopic(profile, question.subject as Subject, question.topic || "General"))
    })
    const takenSeconds = duration - remaining
    const record: MockResult = {
      id: newId("mock"),
      subject,
      score,
      total: questions.length,
      takenAt: new Date().toISOString(),
      seconds: takenSeconds,
    }
    update((profile) => {
      const seeded = awardStudy(profile, { xp: score * 12, coins: score * 2, points: score * 5 })
      return { ...seeded, mockResults: [record, ...profile.mockResults].slice(0, 30) }
    }, `Mock done · ${score}/${questions.length}`)
    setResult(record)
    setInExam(false)
  }

  const timerClass = remaining < 60 ? "exam-timer danger" : remaining < 180 ? "exam-timer warn" : "exam-timer"
  const question = questions[current]

  if (inExam && question) {
    return (
      <Page>
        <div className="page-heading">
          <div>
            <p className="overline">Mock exam · {subject}</p>
            <h1>Question {current + 1} of {questions.length}</h1>
          </div>
          <div className="page-aside">
            <span className={timerClass}><Timer size={14} /> {formatTime(remaining)}</span>
            <button className="danger-button" onClick={finish}>End exam</button>
          </div>
        </div>
        <div className="question-card">
          <p className="overline">{question.subject}{question.topic ? ` · ${question.topic}` : ""}</p>
          <h2>{question.question}</h2>
          <div className="option-list">
            {(["A", "B", "C", "D"] as const).map((letter) => {
              const cls = answers[question.id] === letter ? "option selected" : "option"
              return (
                <button key={letter} className={cls} onClick={() => pick(question.id, letter)}>
                  <span className="option-letter">{letter}</span>
                  <span>{question.options[letter]}</span>
                </button>
              )
            })}
          </div>
          <div className="question-actions">
            <button className="ghost-button" onClick={() => setCurrent((index) => Math.max(0, index - 1))} disabled={current === 0}>Previous</button>
            {current + 1 < questions.length ? (
              <button className="primary-button" onClick={() => setCurrent((index) => index + 1)}>Next <ChevronRight size={14} /></button>
            ) : (
              <button className="primary-button" onClick={finish}>Submit</button>
            )}
          </div>
        </div>
        <div style={{ height: 16 }} />
        <div className="chip-row">
          {questions.map((question, index) => (
            <button
              key={question.id}
              className={index === current ? "chip selected" : answers[question.id] ? "chip ok" : "chip"}
              onClick={() => setCurrent(index)}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeading overline="Timed practice" title="Mock exams" subtitle="A real exam feels different. Rehearse it." />
      <div className="practice-layout">
        <Panel>
          <span className="practice-badge"><Timer size={22} /></span>
          <h2 style={{ margin: "16px 0 6px", fontSize: 22, color: "var(--navy-800)" }}>Set up a new mock</h2>
          <p className="muted" style={{ marginBottom: 22 }}>Pick a subject and a duration. Ten questions, no going back to fix a typo — just like the real thing.</p>
          <label>Subject
            <select value={subject} onChange={(event) => setSubject(event.target.value as any)}>
              {subjects.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>Duration
            <select value={duration} onChange={(event) => { setDuration(Number(event.target.value)); setRemaining(Number(event.target.value)) }}>
              <option value={300}>5 minutes</option>
              <option value={600}>10 minutes</option>
              <option value={900}>15 minutes</option>
              <option value={1500}>25 minutes</option>
            </select>
          </label>
          <button className="primary-button" onClick={begin}>Begin exam <ChevronRight size={14} /></button>
          {result && (
            <div className="exam-summary" style={{ marginTop: 22 }}>
              <p style={{ margin: "0 0 4px", fontSize: 12, opacity: .8 }}>Latest result</p>
              <strong>{result.score}/{result.total}</strong>
              <p>{result.subject} · {formatTime(result.seconds)} used</p>
            </div>
          )}
        </Panel>
        <Panel title="Recent exams" description="Your past mocks stay here.">
          {profile.mockResults.length === 0 ? (
            <p className="muted">No exams yet. Your first one takes 10 minutes.</p>
          ) : (
            profile.mockResults.slice(0, 8).map((record) => (
              <div className="hw-row" key={record.id}>
                <Trophy size={14} />
                <div>
                  <strong>{record.subject} · {record.score}/{record.total}</strong>
                  <span>{new Date(record.takenAt).toLocaleDateString()} · {formatTime(record.seconds)}</span>
                </div>
                <span className="chip mini">{Math.round((record.score / record.total) * 100)}%</span>
              </div>
            ))
          )}
        </Panel>
      </div>
    </Page>
  )
}
