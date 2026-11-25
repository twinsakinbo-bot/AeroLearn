import { Award, BookOpen, ChevronRight, ClipboardList, Play, Sparkles, Target, Timer, Zap } from "lucide-react"
import { lessons, challenges } from "../data"
import { awardStudy, easeWeakTopic, type DesktopProfile } from "../storage"
import { Page, PageHeading, Panel, ProgressBar } from "../ui"
import type { View } from "../App"

export function Overview({
  profile,
  update,
  onNavigate,
}: {
  profile: DesktopProfile
  update: (patch: Partial<DesktopProfile> | ((current: DesktopProfile) => DesktopProfile), toast?: string) => void
  onNavigate: (view: View) => void
}) {
  const nextLesson = lessons.find((lesson) => !profile.completedLessons.includes(lesson.id)) || lessons[0]
  const dueSoon = profile.homework.filter((item) => !item.done).slice(0, 3)
  const openChallenges = challenges.filter((challenge) => !profile.challenges.find((state) => state.id === challenge.id && state.completedAt)).slice(0, 2)
  const percent = Math.round((profile.completedLessons.length / lessons.length) * 100)

  const openLesson = (id: string) => {
    if (profile.completedLessons.includes(id)) return
    const lesson = lessons.find((entry) => entry.id === id)
    if (!lesson) return
    update((current) => {
      const seeded = awardStudy(current, { xp: 20, points: 10, coins: 5 })
      return {
        ...lesson.topics.reduce((acc, topic) => easeWeakTopic(acc, lesson.subject, topic), seeded),
        completedLessons: [...current.completedLessons, id],
      }
    }, "Lesson opened")
  }

  return (
    <Page>
      <PageHeading
        overline={`${greeting()}, ${profile.name.split(" ")[0] || "Student"}`}
        title="Ready for a focused session?"
        subtitle="Small steps today become confidence tomorrow."
        aside={
          <button className="primary-button" onClick={() => onNavigate("learn")}>
            <Play size={16} fill="currentColor" /> Start learning
          </button>
        }
      />

      <div className="hero-grid">
        <div className="hero-card">
          <div className="hero-copy">
            <span className="hero-kicker"><Sparkles size={15} /> Your next session</span>
            <h2>{nextLesson.title}</h2>
            <p>{nextLesson.description}</p>
            <div className="hero-meta">
              <span><BookOpen size={15} /> {nextLesson.subject}</span>
              <span><Zap size={15} /> {nextLesson.duration}</span>
            </div>
            <div className="hero-actions">
              <button className="light-button" onClick={() => openLesson(nextLesson.id)}>
                {profile.completedLessons.includes(nextLesson.id) ? "Reviewed" : "Continue lesson"}
                <ChevronRight size={16} />
              </button>
              <button className="text-button light" onClick={() => onNavigate("learn")}>
                Full library <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div className="hero-orbit">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit-core"><BookOpen size={28} /></div>
          </div>
        </div>
        <StreakCard profile={profile} />
      </div>

      <div className="section-heading">
        <div>
          <h2>At a glance</h2>
          <p>Keep an eye on your learning rhythm.</p>
        </div>
        <button className="text-button" onClick={() => onNavigate("progress")}>
          View progress <ChevronRight size={15} />
        </button>
      </div>

      <div className="stats-grid">
        <StatCard tone="cyan" icon={BookOpen} label="Lessons completed" value={profile.completedLessons.length} hint={`of ${lessons.length} available`} />
        <StatCard tone="violet" icon={Zap} label="Practice points" value={profile.practicePoints} hint="Keep building" />
        <StatCard tone="orange" icon={Target} label="Current streak" value={`${profile.streak}d`} hint={profile.streak ? "You're on a roll" : "Start today"} />
        <StatCard tone="green" icon={Timer} label="Mock exams" value={profile.mockResults.length} hint={profile.mockResults[0] ? `Latest ${Math.round((profile.mockResults[0].score / profile.mockResults[0].total) * 100)}%` : "None yet"} />
      </div>

      <div className="content-grid">
        <Panel
          title="Recommended for you"
          description="Lessons picked from your current path."
          action={<button className="icon-button" onClick={() => onNavigate("learn")}><ChevronRight size={18} /></button>}
        >
          {lessons.slice(0, 4).map((lesson) => (
            <div className="lesson-row" key={lesson.id}>
              <span className={`subject-icon ${lesson.color}`}>{lesson.subject[0]}</span>
              <div className="lesson-info">
                <strong>{lesson.title}</strong>
                <span>{lesson.subject} · {lesson.duration}</span>
              </div>
              {profile.completedLessons.includes(lesson.id) ? (
                <span className="completed-pill">Done</span>
              ) : (
                <button className="row-action" onClick={() => openLesson(lesson.id)}><Play size={14} fill="currentColor" /></button>
              )}
            </div>
          ))}
        </Panel>
        <div className="stacked">
          <Panel title="Today's focus" description="A quiet 20 minutes goes a long way.">
            <div className="focus-body">
              <span className="focus-icon"><Award size={20} /></span>
              <div>
                <strong>{percent}% of your library</strong>
                <p>{percent ? "Nice work. Keep the momentum." : "No lessons finished yet."}</p>
                <ProgressBar percent={percent} tone="cyan" />
              </div>
            </div>
          </Panel>
          <Panel
            title="Due soon"
            description="Homework and open tasks."
            action={<button className="text-button" onClick={() => onNavigate("homework")}>All homework <ChevronRight size={13} /></button>}
          >
            {dueSoon.length === 0 ? (
              <p className="muted">Nothing on your plate. Add homework in the homework tab.</p>
            ) : (
              dueSoon.map((item) => (
                <div className="hw-row" key={item.id}>
                  <ClipboardList size={15} />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.subject} · due {item.dueDate}</span>
                  </div>
                </div>
              ))
            )}
          </Panel>
          <Panel title="Live challenges" description="Small wins for the week." action={<button className="text-button" onClick={() => onNavigate("challenges")}>All <ChevronRight size={13} /></button>}>
            {openChallenges.map((challenge) => (
              <div className="hw-row" key={challenge.id}>
                <Sparkles size={15} />
                <div>
                  <strong>{challenge.title}</strong>
                  <span>+{challenge.reward} coins · {challenge.cadence}</span>
                </div>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </Page>
  )
}

function StreakCard({ profile }: { profile: DesktopProfile }) {
  return (
    <div className="streak-card">
      <div className="streak-fire">🔥</div>
      <span className="overline">Your momentum</span>
      <strong>{profile.streak}<small> day streak</small></strong>
      <p>{profile.streak ? "Consistency compounds." : "Complete a session to begin."}</p>
      <div className="week-dots">
        {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
          <span className={index < Math.min(7, profile.streak) ? "filled" : ""} key={index}>{label}</span>
        ))}
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: typeof Award
  tone: "cyan" | "violet" | "orange" | "green"
  label: string
  value: number | string
  hint: string
}) {
  return (
    <div className="stat-card">
      <span className={`stat-icon ${tone}`}><Icon size={17} /></span>
      <small>{label}</small>
      <strong>{value}</strong>
      <em>{hint}</em>
    </div>
  )
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}
