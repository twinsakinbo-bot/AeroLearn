"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { auth, onAuthStateChanged, signOut } from "@/lib/auth"
import { db, doc, getDoc } from "@/lib/db"
import {
  ArrowLeft,
  BookOpen,
  CreditCard,
  Ticket,
  Database,
  FileText,
  Sparkles,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Upload,
  Users,
  X,
  type LucideIcon,
} from "lucide-react"

import { Logo } from "@/components/ui/logo"
import { LoadingState } from "@/components/ui/loading-state"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { cn } from "@/lib/utils"

/**
 * Admin shell.
 *
 * The old version forced a permanently dark sidebar (`bg-foreground` + a
 * `blur-[80px]` glow blob) against a light content area that hard-coded
 * `bg-white/80` and `border-gray-200/50`, so the admin portal was the one part
 * of the product that ignored the theme. It is adaptive now: the same tokens,
 * radii and nav treatment as the student shell, so the two read as one product.
 *
 * Five real bugs fixed:
 *
 * 1. **A whole admin page was unreachable.** `/admin/aloc-sync` existed but was
 *    in no sidebar section, so the only way in was to type the URL.
 * 2. **A non-admin saw a spinner forever.** On `role !== "admin"` the old code
 *    called `router.replace("/app")` but never set `authorized`, so the guard
 *    `loading || authorized === null` stayed true until the navigation landed.
 *    The gate is one explicit state now and says what is happening.
 * 3. **The collapse toggle was an invisible button covering the logo.** When
 *    collapsed it was `opacity-0 hover:opacity-100` stretched across the whole
 *    header with `inset-0`, so a keyboard user tabbed onto a control they could
 *    not see, sitting on top of the link to `/admin`. It is a normal, visible
 *    button in both states.
 * 4. **Sub-pages did not highlight their nav item.** `pathname === item.href`
 *    means `/admin/questions/new` lit nothing. Prefix matching now, with
 *    `/admin` itself matched exactly so it is not always active.
 * 5. **`h-screen overflow-hidden` on the content column** put every admin page
 *    inside a nested scroller: `position: sticky` could not escape it, browser
 *    scroll restoration broke, and on mobile Safari `100vh` sits under the URL
 *    bar so the last rows were unreachable. The page scrolls normally now.
 *
 * Also new: the mobile drawer closes on Escape and locks background scroll, the
 * nav is labelled and marks `aria-current="page"`, and there is a sign-out
 * button — previously the only exit was "Back to App", which left an admin
 * signed in on a shared machine.
 */

type NavItem = { label: string; href: string; icon: LucideIcon }
type NavGroup = { title: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", href: "/admin", icon: LayoutDashboard }],
  },
  {
    title: "Content",
    items: [
      { label: "Curriculum", href: "/admin/curriculum", icon: BookOpen },
      { label: "AI lesson generator", href: "/admin/lesson-generator", icon: Sparkles },
      { label: "Lesson editor", href: "/admin/lesson-editor", icon: FileText },
      { label: "Import lessons", href: "/admin/lesson-importer", icon: Upload },
    ],
  },
  {
    title: "Questions",
    items: [
      { label: "Question bank", href: "/admin/questions", icon: HelpCircle },
      { label: "Import questions", href: "/admin/question-importer", icon: Upload },
      { label: "ALOC sync", href: "/admin/aloc-sync", icon: Database },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Students", href: "/admin/students", icon: Users },
      { label: "Payments", href: "/admin/subscriptions", icon: CreditCard },
      { label: "Licence codes", href: "/admin/licences", icon: Ticket },
    ],
  },
]

const COLLAPSE_KEY = "admin-sidebar-collapsed"

/* `/admin` is a prefix of every other admin route, so it alone matches exactly. */
function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href)
}

type Gate = "checking" | "granted" | "denied"

function NavList({
  collapsed,
  pathname,
  onNavigate,
}: {
  collapsed: boolean
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <>
      {NAV.map((group, index) => (
        <div key={group.title} className={index > 0 ? "mt-6" : ""}>
          {collapsed ? (
            <div className="mx-auto mb-3 h-px w-8 bg-hairline" aria-hidden="true" />
          ) : (
            <p className="mb-2 px-3 text-overline uppercase text-subtle">{group.title}</p>
          )}

          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href)
              const Icon = item.icon
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "relative flex items-center rounded-lg text-body-sm font-semibold transition-colors",
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
                    <Icon size={19} strokeWidth={active ? 2.4 : 2} className="shrink-0" aria-hidden="true" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<Gate>("checking")
  const [userName, setUserName] = useState("Admin")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  /* Read after mount, not in the initial state: the server has no
     localStorage, and branching on it during render is a hydration mismatch. */
  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_KEY) === "true") setCollapsed(true)
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      localStorage.setItem(COLLAPSE_KEY, String(!prev))
      return !prev
    })
  }, [])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth/login")
        setGate("denied")
        return
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid))
        if (snap.exists() && snap.data()?.role === "admin") {
          setUserName(user.displayName || user.email || "Admin")
          setGate("granted")
        } else {
          setGate("denied")
          router.replace("/app")
        }
      } catch (error) {
        console.error("Admin role check failed:", error)
        setGate("denied")
        router.replace("/auth/login")
      }
    })
    return () => unsubscribe()
  }, [router])

  /* The drawer is the only thing on screen on mobile — Escape should close it,
     and the page behind it should not scroll under your finger. */
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false)
    }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [drawerOpen])

  useEffect(() => setDrawerOpen(false), [pathname])

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      router.replace("/")
    } catch (error) {
      console.error("Sign out failed:", error)
    }
  }

  if (gate === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <LoadingState text="Checking your admin access…" />
      </div>
    )
  }

  if (gate === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="card p-6 max-w-sm animate-fade-in text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warn/10 text-warn">
            <ShieldCheck size={22} aria-hidden="true" />
          </span>
          <h1 className="text-h4 font-semibold">Admin access only</h1>
          <p className="mt-2 text-body-sm text-muted">
            This area is for staff accounts. Taking you back to your dashboard…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* Desktop rail — collapsible, sticky, scrolls its own nav only. */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 border-r border-hairline bg-surface lg:flex",
          collapsed ? "w-[76px]" : "w-[264px]",
        )}
      >
        <SidebarPanel
          collapsed={collapsed}
          pathname={pathname}
          userName={userName}
          onToggleCollapse={toggleCollapsed}
          onSignOut={handleSignOut}
        />
      </aside>

      {/* Mobile drawer. Always expanded — the collapsed rail is a desktop idea. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink-950/50 animate-fade-in"
          >
            <span className="sr-only">Close the admin menu</span>
          </button>
          <aside className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] animate-slide-in-right border-r border-hairline bg-surface shadow-xl">
            <SidebarPanel
              collapsed={false}
              pathname={pathname}
              userName={userName}
              onNavigate={() => setDrawerOpen(false)}
              onClose={() => setDrawerOpen(false)}
              onSignOut={handleSignOut}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-hairline bg-surface/95 px-4 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            className="-ml-1 inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <Menu size={20} aria-hidden="true" />
            <span className="sr-only">Open the admin menu</span>
          </button>
          <span className="flex items-center gap-2 text-body-sm font-semibold">
            <ShieldCheck size={16} className="text-accent" aria-hidden="true" />
            Admin
          </span>
          <ThemeToggle className="ml-auto" />
        </header>

        <main id="main" className="mx-auto w-full max-w-content p-4 pb-16 sm:p-6 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  )
}

function SidebarPanel({
  collapsed,
  pathname,
  userName,
  onNavigate,
  onClose,
  onToggleCollapse,
  onSignOut,
}: {
  collapsed: boolean
  pathname: string
  userName: string
  onNavigate?: () => void
  onClose?: () => void
  onToggleCollapse?: () => void
  onSignOut: () => void
}) {
  const iconButton =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"

  return (
    <div className="flex h-full w-full flex-col">
      {collapsed ? (
        <div className="flex shrink-0 flex-col items-center gap-1 border-b border-hairline px-2 py-3">
          <Link href="/admin" onClick={onNavigate} className="rounded-lg p-1">
            <Logo showText={false} collapsed size="sm" />
          </Link>
          {onToggleCollapse && (
            <button type="button" onClick={onToggleCollapse} className={iconButton}>
              <PanelLeftOpen size={17} aria-hidden="true" />
              <span className="sr-only">Expand the sidebar</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-hairline px-4">
          <Link href="/admin" onClick={onNavigate} className="min-w-0 flex-1 rounded-lg">
            <Logo size="sm" />
          </Link>
          {onToggleCollapse && (
            <button type="button" onClick={onToggleCollapse} className={iconButton}>
              <PanelLeftClose size={17} aria-hidden="true" />
              <span className="sr-only">Collapse the sidebar</span>
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} className={iconButton}>
              <X size={18} aria-hidden="true" />
              <span className="sr-only">Close the menu</span>
            </button>
          )}
        </div>
      )}

      <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 py-4">
        <NavList collapsed={collapsed} pathname={pathname} onNavigate={onNavigate} />
      </nav>

      <div className="shrink-0 space-y-2 border-t border-hairline p-3">
        {collapsed ? (
          <>
            <span
              title={userName}
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-body-sm font-bold text-accent"
            >
              {userName.charAt(0).toUpperCase()}
              <span className="sr-only">Signed in as {userName}</span>
            </span>
            <ThemeToggle className="mx-auto" />
            <Link href="/app" title="Back to the app" className={cn(iconButton, "mx-auto")}>
              <ArrowLeft size={17} aria-hidden="true" />
              <span className="sr-only">Back to the app</span>
            </Link>
            <button type="button" onClick={onSignOut} title="Sign out" className={cn(iconButton, "mx-auto hover:text-danger")}>
              <LogOut size={17} aria-hidden="true" />
              <span className="sr-only">Sign out</span>
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-lg bg-surface-sunken px-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-body-sm font-bold text-accent">
                {userName.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm font-semibold">{userName}</span>
                <span className="block text-caption text-subtle">Staff account</span>
              </span>
              <ThemeToggle />
            </div>
            <div className="flex gap-2">
              <Link
                href="/app"
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-hairline px-3 py-2 text-body-sm font-semibold text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <ArrowLeft size={15} aria-hidden="true" />
                Back to app
              </Link>
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-hairline px-3 py-2 text-body-sm font-semibold text-muted transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
              >
                <LogOut size={15} aria-hidden="true" />
                <span className="sr-only">Sign out</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
