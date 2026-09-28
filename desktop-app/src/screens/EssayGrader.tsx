import { useState } from "react"
import { FileText, Sparkles, Trash2 } from "lucide-react"
import { awardStudy, newId, type DesktopProfile, type EssaySubmission } from "../storage"
import { Page, PageHeading, Panel, EmptyState } from "../ui"

type Review = { score: number; strengths: string[]; improvements: string[] }

export function EssayGrader({
  profile,
  update,
  showToast,
}: {
  profile: DesktopProfile
  update: (patch: Partial<DesktopProfile> | ((current: DesktopProfile) => DesktopProfile), toast?: string) => void
  showToast: (text: string) => void
}) {
  const [title, setTitle] = useState("")
  const [prompt, setPrompt] = useState("Discuss the impact of technology on modern learning.")
  const [body, setBody] = useState("")
  const [review, setReview] = useState<Review | null>(null)

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0
  const sentences = body.split(/[.!?]+/).filter((s) => s.trim().length > 0)
  const avgSentenceLength = sentences.length ? Math.round((body.split(/\s+/).length / sentences.length) * 10) / 10 : 0

  const grade = () => {
    if (!body.trim()) { showToast("Write something first"); return }
    const strengths: string[] = []
    const improvements: string[] = []
    let score = 40

    if (wordCount >= 250) { score += 15; strengths.push("Well-developed — 250+ words gives you room to build an argument.") }
    else if (wordCount >= 120) { score += 8; improvements.push("Aim for 250+ words to build a full argument.") }
    else { improvements.push("Very short. Push for at least 150 words next time.") }

    if (sentences.length >= 6) { score += 10; strengths.push("Enough sentences to move through several ideas.") }
    else improvements.push("Add more sentences — try to give each idea room.")

    if (avgSentenceLength >= 10 && avgSentenceLength <= 22) { score += 10; strengths.push(`Nice sentence rhythm — around ${avgSentenceLength} words per sentence.`) }
    else if (avgSentenceLength > 22) improvements.push(`Sentences run long (${avgSentenceLength} words on average). Break a few up.`)
    else if (avgSentenceLength > 0) improvements.push(`Sentences are short (${avgSentenceLength} words on average). Try combining ideas.`)

    const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
    if (paragraphs.length >= 3) { score += 10; strengths.push(`${paragraphs.length} paragraphs — a solid structure.`) }
    else improvements.push("Use at least three paragraphs: intro, body, conclusion.")

    const transitions = ["however", "therefore", "moreover", "in addition", "furthermore", "in conclusion", "on the other hand", "first", "second", "finally"]
    const hits = transitions.filter((word) => body.toLowerCase().includes(word)).length
    if (hits >= 2) { score += 8; strengths.push(`Uses linking words (${hits} found) — the reader can follow you.`) }
    else improvements.push("Use linking words like 'however', 'therefore', 'in addition'.")

    if (/[A-Z][^.!?]*[.!?]/.test(body)) { score += 5; strengths.push("Capitalisation and full stops are in place.") }
    else improvements.push("Check capitalisation and end each sentence with a full stop.")

    if (prompt.trim()) {
      const promptWords = new Set(prompt.toLowerCase().split(/\W+/).filter((word) => word.length > 4))
      const bodyLower = body.toLowerCase()
      const covered = Array.from(promptWords).filter((word) => bodyLower.includes(word)).length
      const coverage = promptWords.size ? covered / promptWords.size : 1
      if (coverage >= 0.5) { score += 8; strengths.push("On-topic — the essay covers the prompt's main ideas.") }
      else improvements.push("Return to the prompt. Some of its key ideas are missing.")
    }

    score = Math.max(20, Math.min(100, score))
    setReview({ score, strengths, improvements })

    const record: EssaySubmission = {
      id: newId("essay"),
      title: title.trim() || "Untitled essay",
      prompt: prompt.trim(),
      wordCount,
      score,
      feedback: improvements,
      strengths,
      submittedAt: new Date().toISOString(),
    }
    update((current) => {
      const seeded = awardStudy(current, { xp: Math.round(score / 2), coins: 3, points: 8 })
      return { ...seeded, essays: [record, ...current.essays].slice(0, 20) }
    }, `Graded · ${score}/100`)
  }

  const removeEssay = (id: string) => {
    update((current) => ({ ...current, essays: current.essays.filter((essay) => essay.id !== id) }), "Removed")
  }

  return (
    <Page>
      <PageHeading overline="Write, then improve" title="Essay grader" subtitle="A structured second opinion on your draft." />
      <div className="essay-layout">
        <Panel className="essay-form">
          <label>Prompt<input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="What is the essay question?" /></label>
          <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Give your essay a title" /></label>
          <label>Your essay
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Start typing your draft. Aim for at least 250 words."
            />
          </label>
          <div className="chip-row">
            <span className="chip mini">{wordCount} words</span>
            <span className="chip mini">{sentences.length} sentences</span>
            <span className="chip mini">{avgSentenceLength || 0} avg</span>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button className="primary-button" onClick={grade}><Sparkles size={14} /> Grade my essay</button>
          </div>
        </Panel>

        <div className="stacked">
          {review ? (
            <div className="essay-result">
              <div className="essay-score">
                <div className="big-score">{review.score}</div>
                <div>
                  <h2 style={{ margin: 0, color: "var(--navy-800)", fontSize: 20 }}>{review.score >= 80 ? "Very strong" : review.score >= 60 ? "Solid draft" : "Good start"}</h2>
                  <p className="muted" style={{ margin: "4px 0 0" }}>Rubric: length, structure, sentence variety, cohesion, on-topic.</p>
                </div>
              </div>
              {review.strengths.length > 0 && (
                <>
                  <h3 style={{ margin: "16px 0 6px", color: "var(--navy-800)", fontSize: 13, textTransform: "uppercase", letterSpacing: ".1em" }}>Strengths</h3>
                  <ul className="essay-list strengths">
                    {review.strengths.map((strength, index) => <li key={index}>{strength}</li>)}
                  </ul>
                </>
              )}
              {review.improvements.length > 0 && (
                <>
                  <h3 style={{ margin: "16px 0 6px", color: "var(--navy-800)", fontSize: 13, textTransform: "uppercase", letterSpacing: ".1em" }}>Try next</h3>
                  <ul className="essay-list improvements">
                    {review.improvements.map((suggestion, index) => <li key={index}>{suggestion}</li>)}
                  </ul>
                </>
              )}
            </div>
          ) : (
            <EmptyState icon={FileText} title="Feedback appears here" body="Write your draft on the left and press Grade. The rubric checks length, structure, sentence variety, cohesion and topic coverage." />
          )}

          {profile.essays.length > 0 && (
            <Panel title="Recent essays">
              {profile.essays.slice(0, 5).map((essay) => (
                <div key={essay.id} className="hw-row">
                  <FileText size={14} />
                  <div>
                    <strong>{essay.title}</strong>
                    <span>{essay.wordCount} words · scored {essay.score}/100</span>
                  </div>
                  <button className="icon-button" onClick={() => removeEssay(essay.id)}><Trash2 size={14} /></button>
                </div>
              ))}
            </Panel>
          )}
        </div>
      </div>
    </Page>
  )
}
