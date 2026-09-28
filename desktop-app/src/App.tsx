import { useEffect, useMemo, useState } from "react"
import {
  Award,
  BookOpen,
  Calendar,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Coins,
  FileText,
  GraduationCap,
  Layers,
  LayoutDashboard,
  Library,
  LogOut,
  MessageCircle,
  NotebookPen,
  Sparkles,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Target,
  Timer,
  Trophy,
  Users,
  Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  loadProfile,
  saveProfile,
  resetProfile,
  level,
  xpIntoLevel,
  todayKey,
  type DesktopProfile,
} from "./storage"
import { initials, useToast } from "./ui"
import { Welcome } from "./screens/Welcome"
import { Overview } from "./screens/Overview"
import { Learn } from "./screens/Learn"
import { Practice } from "./screens/Practice"
import { Homework } from "./screens/Homework"
import { Notes } from "./screens/Notes"
import { Timetable } from "./screens/Timetable"
import { MockExams } from "./screens/MockExams"
import { EssayGrader } from "./screens/EssayGrader"
import { WeakTopics } from "./screens/WeakTopics"
import { Progress } from "./screens/Progress"
import { Leaderboard } from "./screens/Leaderboard"
import { Challenges } from "./screens/Challenges"
import { Store } from "./screens/Store"
import { Community } from "./screens/Community"
import { Messages } from "./screens/Messages"
import { SettingsScreen } from "./screens/Settings"

export type View =
  | "overview"
  | "learn"
  | "practice"
  | "homework"
  | "notes"
  | "timetable"
  | "mock-exams"
  | "essay-grader"
  | "weak-topics"
  | "progress"
  | "leaderboard"
  | "challenges"
  | "store"
  | "community"
  | "messages"
  | "settings"

type NavGroup = { label: string; items: { id: View; label: string; icon: LucideIcon; badge?: (profile: DesktopProfile) => number }[] }

const navGroups: NavGroup[] = [
  {
    label: "Study",
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard },
      { id: "learn", label: "Learn", icon: Library },
      { id: "practice", label: "Practice", icon: Target },
      { id: "homework", label: "Homework", icon: ClipboardList, badge: (profile) => profile.homework.filter((item) => !item.done).length },
      { id: "notes", label: "Notes", icon: NotebookPen },
      { id: "timetable", label: "Timetable", icon: Calendar },
    ],
  },
  {
    label: "Test yourself",
    items: [
      { id: "mock-exams", label: "Mock exams", icon: Timer },
      { id: "essay-grader", label: "Essay grader", icon: FileText },
      { id: "weak-topics", label: "Weak topics", icon: Layers, badge: (profile) => Object.values(profile.weakTopics).filter((topic) => topic.misses > 0).length },
      { id: "progress", label: "Progress", icon: Trophy },
    ],
  },
  {
    label: "Community",
    items: [
      { id: "challenges", label: "Challenges", icon: Award },
      { id: "leaderboard", label: "Leaderboard", icon: Sparkles },
      { id: "store", label: "Store", icon: ShoppingBag },
      { id: "community", label: "Community", icon: Users },
      { id: "messages", label: "Messages", icon: MessageCircle, badge: (profile) => Math.min(9, profile.messages.reduce((sum, thread) => sum + (thread.messages.at(-1)?.from === "them" ? 1 : 0), 0)) },
    ],
  },
]

function App() {
  const [profile, setProfile] = useState<DesktopProfile>(loadProfile)
  const [view, setView] = useState<View>("overview")
  const [showProfile, setShowProfile] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (profile.focusDate !== todayKey()) {
      const cleared: DesktopProfile = { ...profile, focusDate: todayKey(), focusMinutesToday: 0 }
      setProfile(cleared)
      saveProfile(cleared)
    }
  }, [])

  const update = (patch: Partial<DesktopProfile> | ((current: DesktopProfile) => DesktopProfile), toastMsg?: string) => {
    setProfile((current) => {
      const next = typeof patch === "function" ? patch(current) : { ...current, ...patch }
      saveProfile(next)
      return next
    })
    if (toastMsg) toast.show(toastMsg)
  }

  const completeOnboarding = (name: string, classLevel: string, goal: string) => {
    update({ name, classLevel, goal, onboardingComplete: true }, "Workspace ready")
  }

  const signOut = () => {
    resetProfile()
    setProfile(loadProfile())
    setShowProfile(false)
  }

  if (!profile.onboardingComplete) return <Welcome onComplete={completeOnboarding} />

  return (
    <div className="desktop-shell" data-theme={profile.activeTheme}>
      <Sidebar view={view} onNavigate={setView} profile={profile} onProfile={() => setShowProfile(true)} />
      <main className="content-area">
        <Topbar profile={profile} onProfile={() => setShowProfile(true)} view={view} />
        <ScreenRouter view={view} profile={profile} update={update} onNavigate={setView} showToast={toast.show} />
      </main>
      {showProfile && (
        <ProfilePanel
          profile={profile}
          onClose={() => setShowProfile(false)}
          onSettings={() => { setShowProfile(false); setView("settings") }}
          onSignOut={signOut}
        />
      )}
      {toast.node}
      <span className="desktop-version">AeroLearn Desktop · v1.1 · Local workspace</span>
    </div>
  )
}

function ScreenRouter({
  view,
  profile,
  update,
  onNavigate,
  showToast,
}: {
  view: View
  profile: DesktopProfile
  update: (patch: Partial<DesktopProfile> | ((current: DesktopProfile) => DesktopProfile), toast?: string) => void
  onNavigate: (view: View) => void
  showToast: (text: string) => void
}) {
  switch (view) {
    case "overview": return <Overview profile={profile} update={update} onNavigate={onNavigate} />
    case "learn": return <Learn profile={profile} update={update} showToast={showToast} />
    case "practice": return <Practice profile={profile} update={update} showToast={showToast} />
    case "homework": return <Homework profile={profile} update={update} showToast={showToast} />
    case "notes": return <Notes profile={profile} update={update} showToast={showToast} />
    case "timetable": return <Timetable profile={profile} update={update} showToast={showToast} />
    case "mock-exams": return <MockExams profile={profile} update={update} showToast={showToast} />
    case "essay-grader": return <EssayGrader profile={profile} update={update} showToast={showToast} />
    case "weak-topics": return <WeakTopics profile={profile} onNavigate={onNavigate} />
    case "progress": return <Progress profile={profile} />
    case "leaderboard": return <Leaderboard profile={profile} />
    case "challenges": return <Challenges profile={profile} update={update} onNavigate={onNavigate} showToast={showToast} />
    case "store": return <Store profile={profile} update={update} showToast={showToast} />
    case "community": return <Community profile={profile} update={update} showToast={showToast} />
    case "messages": return <Messages profile={profile} update={update} />
    case "settings": return <SettingsScreen profile={profile} update={update} showToast={showToast} />
  }
}

function Sidebar({
  view,
  onNavigate,
  profile,
  onProfile,
}: {
  view: View
  onNavigate: (view: View) => void
  profile: DesktopProfile
  onProfile: () => void
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-symbol"><GraduationCap size={20} /></span>
        <span>Aero<span>Learn</span></span>
      </div>
      <div className="sidebar-scroll">
        {navGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="workspace-label">{group.label}</div>
            <nav>
              {group.items.map(({ id, label, icon: Icon, badge }) => {
                const count = badge?.(profile) ?? 0
                return (
                  <button
                    key={id}
                    className={view === id ? "nav-item active" : "nav-item"}
                    onClick={() => onNavigate(id)}
                  >
                    <Icon size={17} />
                    <span>{label}</span>
                    {count > 0 && <span className="nav-badge">{count}</span>}
                  </button>
                )
              })}
            </nav>
          </div>
        ))}
      </div>
      <div className="sidebar-bottom">
        <button className={view === "settings" ? "nav-item active" : "nav-item"} onClick={() => onNavigate("settings")}>
          <Settings size={17} />
          <span>Settings</span>
        </button>
        <button className="mini-profile" onClick={onProfile}>
          <span className="avatar small">{initials(profile.name)}</span>
          <span className="mini-profile-body">
            <strong>{profile.name || "Student"}</strong>
            <small>Level {level(profile.xp)} · {profile.classLevel || "—"}</small>
          </span>
          <ChevronRight size={14} />
        </button>
      </div>
    </aside>
  )
}

function Topbar({ profile, onProfile, view }: { profile: DesktopProfile; onProfile: () => void; view: View }) {
  const label = useMemo(() => {
    for (const group of navGroups) for (const item of group.items) if (item.id === view) return item.label
    return view === "settings" ? "Settings" : "Workspace"
  }, [view])
  const lv = level(profile.xp)
  const into = xpIntoLevel(profile.xp)
  return (
    <header className="topbar">
      <div className="breadcrumbs">
        <span>AeroLearn</span>
        <ChevronRight size={14} />
        <strong>{label}</strong>
      </div>
      <div className="top-actions">
        <div className="level-chip" title={`${into}/100 XP to next level`}>
          <ShieldCheck size={14} />
          <span>Lv {lv}</span>
          <div className="level-track"><span style={{ width: `${into}%` }} /></div>
        </div>
        <div className="coin-chip" title="Coins">
          <Coins size={14} />
          <span>{profile.coins}</span>
        </div>
        <div className="sync-status"><span /> Saved locally</div>
        <button className="icon-button" title="Help"><CircleHelp size={17} /></button>
        <button className="avatar" onClick={onProfile}>{initials(profile.name)}</button>
      </div>
    </header>
  )
}

function ProfilePanel({
  profile,
  onClose,
  onSettings,
  onSignOut,
}: {
  profile: DesktopProfile
  onClose: () => void
  onSettings: () => void
  onSignOut: () => void
}) {
  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="profile-panel" onClick={(event) => event.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <span className="avatar large">{initials(profile.name)}</span>
        <h2>{profile.name || "Student"}</h2>
        <p>{profile.classLevel || "—"} · {profile.goal || "Learning"}</p>
        <div className="profile-stats">
          <div><small>Level</small><strong>{level(profile.xp)}</strong></div>
          <div><small>Coins</small><strong>{profile.coins}</strong></div>
          <div><small>Streak</small><strong>{profile.streak}d</strong></div>
        </div>
        <button className="profile-action" onClick={onSettings}><Settings size={16} /> Profile settings</button>
        <button className="profile-action"><BookOpen size={16} /> {profile.completedLessons.length} lessons done</button>
        <button className="profile-action"><Zap size={16} /> {profile.practicePoints} practice points</button>
        <button className="profile-action danger" onClick={onSignOut}><LogOut size={16} /> Reset local workspace</button>
      </div>
    </div>
  )
}

export { App }
