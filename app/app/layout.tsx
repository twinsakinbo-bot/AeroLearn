"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { auth, onAuthStateChanged, signOut, type User } from "@/lib/auth"
import { db, doc, type DocumentData, getDoc, setDoc } from "@/lib/db"
import {
  ChevronDown,
  Crown,
  Flame,
  Loader2,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Sun,
  UserCircle,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react"

import { BottomNav } from "@/components/ui/bottom-nav"
import { Logo } from "@/components/ui/logo"
import { isNavActive, navGroups } from "@/components/ui/nav-config"
import { useTheme } from "@/components/ui/theme-provider"
import { Tooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { isProUser } from "@/lib/subscription"
import { planName } from "@/lib/plans"

/**
 * Chrome for every signed-in page: sidebar, mobile drawer, tab bar, the
 * streak/XP header and the profile menu. It also owns the three pieces of
 * account housekeeping that happen once per visit — rolling the daily streak
 * over, creating a profile document for an account that somehow lacks one, and
 * remembering this account for the sign-in screen's account picker.
 */

/** Shared by the drawer footer and the desktop profile menu. */
const MENU_ROW =
  "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-body-sm font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-foreground"

const AVATAR_SIZES = {
  sm: "h-8 w-8 text-caption",
  md: "h-9 w-9 text-caption",
  lg: "h-10 w-10 text-body-sm",
}

/** Profile picture, falling back to initials. */
function Avatar({
  src,
  initials,
  size = "md",
}: {
  src?: string | null
  initials: string
  size?: keyof typeof AVATAR_SIZES
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-hairline bg-accent/10 font-semibold text-accent",
        AVATAR_SIZES[size],
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  )
}

/** Streak / XP / gem readout in the desktop header. */
const PILL_TONE = {
  streak: "stat-pill-streak",
  xp: "stat-pill-xp",
  gem: "stat-pill-gem",
}

function StatPill({
  icon: Icon,
  value,
  label,
  tone,
  title,
}: {
  icon: LucideIcon
  value: number
  label: string
  tone: keyof typeof PILL_TONE
  title?: string
}) {
  return (
    <span className={cn("stat-pill relative", PILL_TONE[tone])}>
      <Icon
        size={15}
        strokeWidth={2.6}
        aria-hidden="true"
        /* The streak flame is the one number a student checks every day. */
        className={cn("shrink-0", tone === "streak" && value > 0 && "animate-flicker")}
      />
      {value}
      <span className="font-bold opacity-70"> {label}</span>
      {/* Was a native `title=`, which waits a second and then renders in the OS's
          own styling. Same text, but on brand and instant. */}
      {title && <Tooltip side="bottom">{title}</Tooltip>}
    </span>
  )
}

/**
 * The navigation itself, rendered twice: once in the desktop sidebar (where it
 * can be collapsed to icons) and once in the mobile drawer.
 */
function NavSections({
  collapsed,
  pathname,
  unread,
  onNavigate,
}: {
  collapsed: boolean
  pathname: string
  unread: number
  onNavigate?: () => void
}) {
  return (
    <>
      {navGroups.map((group, groupIndex) => (
        <div key={group.title ?? `group-${groupIndex}`} className={groupIndex > 0 ? "mt-6" : ""}>
          {group.title &&
            (collapsed ? (
              <div className="mx-auto mb-3 h-px w-8 bg-hairline" aria-hidden="true" />
            ) : (
              <p className="mb-2 px-3 text-overline uppercase text-subtle">{group.title}</p>
            ))}
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = isNavActive(pathname, item.href)
              const Icon = item.icon
              const badge = item.label === "Messages" ? unread : 0
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center rounded-lg text-body-sm font-semibold transition-colors",
                      collapsed ? "mx-auto h-11 w-11 justify-center" : "gap-3 px-3 py-2.5",
                      active
                        ? "bg-accent/10 text-accent"
                        : "text-muted hover:bg-surface-hover hover:text-foreground",
                    )}
                  >
                    {active && !collapsed && (
                      <span
                        className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-accent"
                        aria-hidden="true"
                      />
                    )}

                    <Icon
                      size={19}
                      strokeWidth={active ? 2.4 : 2}
                      className="shrink-0"
                      aria-hidden="true"
                    />

                    {!collapsed && <span className="truncate">{item.label}</span>}

                    {badge > 0 && (
                      <span
                        className={cn(
                          "flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white dark:text-ink-950",
                          collapsed ? "absolute -right-0.5 -top-0.5 border-2 border-surface" : "ml-auto",
                        )}
                      >
                        {badge > 9 ? "9+" : badge}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}

                    {collapsed && <Tooltip>{item.label}</Tooltip>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </>
  )
}

/** Feeds the account picker on the sign-in screen. Best effort only. */
function rememberAccount(email: string | null, displayName: string, photoURL: string) {
  try {
    const raw = localStorage.getItem("saved-accounts")
    const saved: { email?: string | null }[] = raw ? JSON.parse(raw) : []
    const next = [{ email, displayName, photoURL }, ...saved.filter((a) => a.email !== email)]
    localStorage.setItem("saved-accounts", JSON.stringify(next.slice(0, 5)))
  } catch {
    // Storage may be blocked or full. The picker is a convenience, not a
    // requirement, so there is nothing worth telling the student here.
  }
}

/** For an account that exists in Firebase Auth but has no profile document. */
function blankProfile(email: string | null, displayName: string) {
  return {
    email: email || "",
    displayName,
    createdAt: new Date(),
    favoriteSubjects: [],
    studyStats: { questionsAttempted: 0, questionsCorrect: 0, subjectsStudied: [] },
    subscription: "free",
    onboardingCompleted: false,
    xp: 0,
    streak: 0,
    longestStreak: 0,
    lastActiveDate: null,
    completedLessons: [],
    completedTopics: [],
    completedQuizzes: [],
    homeworkCompleted: 0,
    badges: [],
    balance: 0,
    inventory: [],
  }
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()

  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<DocumentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [streakMoment, setStreakMoment] = useState<number | null>(null)

  useEffect(() => {
    if (streakMoment === null) return
    const timer = window.setTimeout(() => setStreakMoment(null), 6500)
    return () => window.clearTimeout(timer)
  }, [streakMoment])

  useEffect(() => {
    if (localStorage.getItem("sidebar-collapsed") === "true") setCollapsed(true)
  }, [])

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem("sidebar-collapsed", String(next))
      return next
    })
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.replace("/auth/login")
        setLoading(false)
        return
      }
      setUser(firebaseUser)
      try {
        const ref = doc(db, "users", firebaseUser.uid)
        const snap = await getDoc(ref)

        let data: DocumentData
        if (!snap.exists()) {
          // Created straight in the Firebase console, or a sign-up that failed
          // half way. Give the account something to read from.
          const profile = blankProfile(
            firebaseUser.email,
            firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Student",
          )
          await setDoc(ref, profile)
          data = profile
        } else {
          data = snap.data()
        }
        setUserProfile(data)
        try {
          const token = await firebaseUser.getIdToken()
          const response = await fetch("/api/gamification/login", { method: "POST", headers: { Authorization: `Bearer ${token}` } })
          if (response.ok) {
            const login = await response.json()
            setUserProfile((previous) => previous ? { ...previous, streak: login.streak, longestStreak: login.longestStreak, coins: login.coins, lastActiveDate: login.lastActiveDate, lastLoginDate: login.lastLoginDate, inventory: login.inventory } : previous)
            if (login.updated && login.streak > 0) {
              setStreakMoment(login.streak)
              if (login.streak % 7 === 0 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                void import("canvas-confetti").then(({ default: confetti }) => confetti({ particleCount: 90, spread: 70, origin: { y: 0.75 } }))
              }
            }
          }
        } catch (error) {
          console.error("Could not update study streak:", error)
        }

        rememberAccount(
          firebaseUser.email,
          data.displayName || firebaseUser.displayName || "Student",
          data.photoURL || firebaseUser.photoURL || "",
        )
      } catch (err) {
        console.error("Failed to load user profile:", err)
      } finally {
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [router])

  // Any navigation closes whatever was open.
  useEffect(() => {
    setDrawerOpen(false)
    setProfileMenuOpen(false)
  }, [pathname])

  // A click anywhere outside the profile menu closes it, and Escape closes
  // both overlays.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".profile-menu")) setProfileMenuOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setDrawerOpen(false)
      setProfileMenuOpen(false)
    }
    window.addEventListener("click", onClick)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("click", onClick)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  // The drawer is a modal, so the page behind it must not scroll.
  useEffect(() => {
    if (!drawerOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [drawerOpen])

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      router.replace("/auth/login")
    } catch (err) {
      console.error("Sign-out failed:", err)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden="true" />
        <span className="sr-only">Loading your dashboard</span>
      </div>
    )
  }

  if (!user) return null

  const displayName = userProfile?.displayName || user.email || "Student"
  const initials = displayName
    .split(" ")
    .map((part: string) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const photo = userProfile?.photoURL || user.photoURL
  const isPro = isProUser(userProfile)
  const planLabel = userProfile?.trustPassRequestId && isPro && userProfile.subscription === "pro"
    ? "24-hour Trust Pass"
    : isPro ? `${planName(userProfile?.subscription)} Pro`.replace("Pro Pro", "Pro") : "Free plan"
  const isAdmin = userProfile?.role === "admin"
  const unread: number = userProfile?.unreadMessagesCount || 0
  const streak: number = userProfile?.streak || 0
  const xp: number = userProfile?.xp || 0

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside
        className={cn(
          "sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-hairline bg-surface/70 backdrop-blur-xl transition-[width] duration-300 ease-out md:flex",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div
          className={cn(
            "flex h-16 shrink-0 items-center border-b border-hairline px-4",
            collapsed && "justify-center px-0",
          )}
        >
          <Link href="/app" aria-label="AeroLearn dashboard" className="flex items-center">
            <Logo showText={!collapsed} collapsed={collapsed} />
          </Link>
        </div>

        <nav
          aria-label="Main navigation"
          className="scrollbar-hide flex-1 overflow-y-auto px-3 py-4"
        >
          <NavSections collapsed={collapsed} pathname={pathname} unread={unread} />
        </nav>

        <div className="shrink-0 border-t border-hairline p-3">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className={cn(
              "group relative flex items-center rounded-lg text-body-sm font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-foreground",
              collapsed ? "mx-auto h-11 w-11 justify-center" : "w-full gap-3 px-3 py-2.5",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen size={19} strokeWidth={2} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={19} strokeWidth={2} aria-hidden="true" />
            )}
            {!collapsed && "Collapse"}
            {collapsed && <Tooltip>Expand sidebar</Tooltip>}
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-hairline bg-surface/85 px-4 backdrop-blur-md sm:px-6 md:hidden">
        <Link href="/app" aria-label="AeroLearn dashboard" className="flex items-center">
          <Logo showText />
        </Link>
        {isPro ? (
          <Link href="/app/profile" aria-label="My profile">
            <Avatar src={photo} initials={initials} />
          </Link>
        ) : (
          <Link href="/app/upgrade" className="btn-primary btn-sm rounded-full">
            <Crown size={13} aria-hidden="true" />
            Go Pro
          </Link>
        )}
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 animate-fade-in bg-ink-950/50"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="All sections"
            className="relative flex h-full w-[17rem] max-w-[85vw] animate-slide-in-right flex-col border-l border-hairline bg-surface shadow-xl"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-hairline px-4">
              <Logo showText />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <nav aria-label="All sections" className="flex-1 overflow-y-auto px-3 py-4">
              <NavSections
                collapsed={false}
                pathname={pathname}
                unread={unread}
                onNavigate={() => setDrawerOpen(false)}
              />

            </nav>

            <div className="shrink-0 space-y-1 border-t border-hairline p-3">
              <Link
                href="/app/profile"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-hover"
              >
                <Avatar src={photo} initials={initials} size="lg" />
                <span className="min-w-0">
                  <span className="block truncate text-body-sm font-semibold text-foreground">
                    {displayName}
                  </span>
                  <span className="block truncate text-caption text-muted">
                    {planLabel}
                  </span>
                </span>
              </Link>

              {isAdmin && (
                <Link href="/admin" onClick={() => setDrawerOpen(false)} className={MENU_ROW}>
                  <ShieldCheck size={17} strokeWidth={2} aria-hidden="true" />
                  Admin
                </Link>
              )}

              <Link href="/app/settings" onClick={() => setDrawerOpen(false)} className={MENU_ROW}>
                <Settings size={17} strokeWidth={2} aria-hidden="true" />
                Settings
              </Link>

              <button type="button" onClick={toggleTheme} className={MENU_ROW}>
                {theme === "dark" ? (
                  <Sun size={17} strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Moon size={17} strokeWidth={2} aria-hidden="true" />
                )}
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className={cn(MENU_ROW, "text-danger hover:bg-danger/10 hover:text-danger")}
              >
                <LogOut size={17} strokeWidth={2} aria-hidden="true" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <main id="main" className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 hidden h-16 shrink-0 items-center justify-end gap-3 border-b border-hairline bg-surface/70 px-6 backdrop-blur-xl md:flex lg:px-8">
          <StatPill
            icon={Flame}
            value={streak}
            label={streak === 1 ? "day" : "days"}
            tone="streak"
            title={`${streak}-day study streak`}
          />
          <StatPill icon={Zap} value={xp} label="XP" tone="xp" title={`${xp} XP earned`} />

          {!isPro && (
            <Link href="/app/upgrade" className="btn-primary btn-sm rounded-full">
              <Crown size={14} aria-hidden="true" />
              Upgrade to Pro
            </Link>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="rounded-md p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            {theme === "dark" ? (
              <Sun size={18} strokeWidth={2} aria-hidden="true" />
            ) : (
              <Moon size={18} strokeWidth={2} aria-hidden="true" />
            )}
          </button>

          <div className="profile-menu relative">
            <button
              type="button"
              onClick={() => setProfileMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              className="flex items-center gap-2 rounded-full border border-hairline bg-surface py-1 pl-1 pr-2.5 transition-colors hover:bg-surface-hover"
            >
              <Avatar src={photo} initials={initials} size="sm" />
              <span className="hidden max-w-[10rem] truncate text-caption font-semibold text-foreground lg:block">
                {displayName}
              </span>
              <ChevronDown
                size={15}
                strokeWidth={2.4}
                aria-hidden="true"
                className={cn(
                  "shrink-0 text-muted transition-transform",
                  profileMenuOpen && "rotate-180",
                )}
              />
            </button>

            {profileMenuOpen && (
              <div
                role="menu"
                aria-label="Account"
                className="absolute right-0 top-full z-50 mt-2 w-60 animate-scale-in origin-top-right rounded-lg border border-hairline bg-surface-raised p-1.5 shadow-lg"
              >
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <Avatar src={photo} initials={initials} size="lg" />
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm font-semibold text-foreground">
                      {displayName}
                    </span>
                    <span className="block truncate text-caption text-muted">
                      {planLabel}
                    </span>
                  </span>
                </div>

                <div className="my-1.5 h-px bg-hairline" aria-hidden="true" />

                <Link href="/app/profile" role="menuitem" className={MENU_ROW}>
                  <UserCircle size={17} strokeWidth={2} aria-hidden="true" />
                  My profile
                </Link>
                <Link href="/app/settings" role="menuitem" className={MENU_ROW}>
                  <Settings size={17} strokeWidth={2} aria-hidden="true" />
                  Settings
                </Link>
                {isAdmin && (
                  <Link href="/admin" role="menuitem" className={MENU_ROW}>
                    <ShieldCheck size={17} strokeWidth={2} aria-hidden="true" />
                    Admin
                  </Link>
                )}

                <div className="my-1.5 h-px bg-hairline" aria-hidden="true" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className={cn(MENU_ROW, "text-danger hover:bg-danger/10 hover:text-danger")}
                >
                  <LogOut size={17} strokeWidth={2} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="mx-auto w-full max-w-content flex-1 p-4 pb-24 sm:p-6 md:pb-8 lg:p-8">
          {children}
        </div>
      </main>

      <BottomNav onMoreClick={() => setDrawerOpen(true)} moreBadgeCount={unread} />
      {streakMoment !== null && <div role="status" className="fixed bottom-24 left-1/2 z-50 flex w-[min(92vw,26rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-streak/30 bg-surface-raised p-4 shadow-xl md:bottom-6">
        <Flame size={24} className="shrink-0 text-streak" aria-hidden="true" />
        <div className="min-w-0 flex-1"><p className="text-body-sm font-bold text-foreground">{streakMoment % 7 === 0 ? `${streakMoment}-day milestone!` : `Day ${streakMoment} of your streak!`}</p><p className="text-caption text-muted">+10 coins for showing up. Keep learning a little each day.</p></div>
        <button type="button" onClick={() => setStreakMoment(null)} aria-label="Dismiss streak message" className="text-muted hover:text-foreground"><X size={17} /></button>
      </div>}
    </div>
  )
}
