import { useEffect, useMemo, useState } from "react"
import { ChevronRight, RefreshCcw, Target } from "lucide-react"
import { awardStudy, easeWeakTopic, recordWeakTopic, type DesktopProfile } from "../storage"
import { fetchQuestions, type RemoteQuestion } from "../db"
import { Page, PageHeading, Panel } from "../ui"
import type { Subject } from "../data"

const subjects: (Subject | "All")[] = ["All", "Mathematics", "English", "Physics", "Chemistry", "Biology", "Literature", "Government", "Economics"]

export function Practice({
  profile,
  update,
  showToast,
}: {
  profile: DesktopProfile
  update: (patch: Partial<DesktopProfile> | ((current: DesktopProfile) => DesktopProfile), toast?: string) => void
  showToast: (text: string) => void
}) {
  const [subject, setSubject] = useState<Subject | "All">("All")
  const [questions, setQuestions] = useState<RemoteQuestion[]>([])
  const [source, setSource] = useState<"supabase" | "cache" | "demo">("demo")
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)
  const [pickedLetter, setPickedLetter] = useState<"A" | "B" | "C" | "D" | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [done, setDone] = useState(false)

  const load = () => {
    setLoading(true)
    setIndex(0); setPickedLetter(null); setCorrectCount(0); setWrongCount(0); setDone(false)
    fetchQuestions({ subject: subject === "All" ? undefined : subject, limit: 10 }).then(({ questions, source }) => {
      setQuestions(questions)
      setSource(source)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [subject])

  const current = questions[index]
  const letters = ["A", "B", "C", "D"] as const

  const submit = (letter: "A" | "B" | "C" | "D") => {
    if (pickedLetter || !current) return
    setPickedLetter(letter)
    if (letter === current.correctAnswer) {
      setCorrectCount((count) => count + 1)
      update((profile) => easeWeakTopic(profile, current.subject as Subject, current.topic || "General"))
    } else {
      setWrongCount((count) => count + 1)
      update((profile) => recordWeakTopic(profile, current.subject as Subject, current.topic || "General"))
    }
  }

  const next = () => {
    setPickedLetter(null)
    if (index + 1 >= questions.length) {
      setDone(true)
      const earned = correctCount + (pickedLetter === current?.correctAnswer ? 1 : 0)
      const points = earned * 2
      update((profile) => awardStudy(profile, { xp: earned * 8, coins: Math.max(3, earned), points }), `Session done · +${earned * 8} XP`)
    } else {
      setIndex((current) => current + 1)
    }
  }

  const restart = () => load()

  const percent = useMemo(() => (questions.length ? Math.round(((correctCount) / questions.length) * 100) : 0), [correctCount, questions.length])

  return (
    <Page>
      <PageHeading
        overline="Build confidence"
        title="Practice room"
        subtitle="Ten questions at a time. No pressure."
        aside={
          <span className="sync-status">
            <span className={source === "supabase" ? "" : "offline-dot"} />
            {source === "supabase" ? "Live from database" : source === "cache" ? "Offline · downloaded" : "Demo questions"}
          </span>
        }
      />

      <div className="chip-row">
        {subjects.map((option) => (
          <button key={option} className={subject === option ? "chip selected" : "chip"} onClick={() => setSubject(option)}>
            {option}
          </button>
        ))}
      </div>

      <div style={{ height: 16 }} />

      <div className="practice-layout">
        {loading ? (
          <Panel>Loading questions…</Panel>
        ) : done || !current ? (
          <Panel>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ width: 80, height: 80, borderRadius: 24, background: "linear-gradient(135deg, var(--navy-600), var(--orange))", color: "#FFF", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 26 }}>
                {percent}%
              </div>
              <div>
                <h2 style={{ margin: "0 0 4px" }}>Session complete</h2>
                <p className="muted" style={{ margin: 0 }}>{correctCount} correct · {wrongCount} to review</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="primary-button" onClick={restart}><RefreshCcw size={14} /> New session</button>
            </div>
          </Panel>
        ) : (
          <div className="question-card">
            <p className="overline">Question {index + 1} of {questions.length} · {current.subject}{current.topic ? ` · ${current.topic}` : ""}</p>
            <h2>{current.question}</h2>
            <div className="option-list">
              {letters.map((letter) => {
                const value = current.options[letter]
                const cls = pickedLetter
                  ? letter === current.correctAnswer
                    ? "option correct"
                    : letter === pickedLetter
                      ? "option wrong"
                      : "option"
                  : "option"
                return (
                  <button key={letter} className={cls} disabled={Boolean(pickedLetter)} onClick={() => submit(letter)}>
                    <span className="option-letter">{letter}</span>
                    <span>{value}</span>
                  </button>
                )
              })}
            </div>
            {pickedLetter && (
              <div className={pickedLetter === current.correctAnswer ? "answer-feedback right" : "answer-feedback wrong"}>
                <strong>{pickedLetter === current.correctAnswer ? "Correct" : "Not quite"}</strong>
                {current.explanation || (pickedLetter === current.correctAnswer ? "Nice work." : `The right answer is ${current.correctAnswer}.`)}
              </div>
            )}
            <div className="question-actions">
              <span className="question-progress">Correct: {correctCount} · Wrong: {wrongCount}</span>
              <button className="primary-button" onClick={next} disabled={!pickedLetter}>
                {index + 1 >= questions.length ? "Finish" : "Next"} <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}

        <Panel title="Your practice" description="How you're doing right now.">
          <div className="practice-score-big">
            <span>{profile.practicePoints}</span>
            <small>lifetime practice points</small>
          </div>
          <div className="practice-line"><Target size={14} /><span>This session</span><strong>{correctCount}/{questions.length || 0}</strong></div>
          <div className="practice-line"><span>Current streak</span><strong>{profile.streak}d</strong></div>
          <div className="practice-line"><span>Weak topics tracked</span><strong>{Object.values(profile.weakTopics).filter((topic) => topic.misses > 0).length}</strong></div>
        </Panel>
      </div>
    </Page>
  )
}
