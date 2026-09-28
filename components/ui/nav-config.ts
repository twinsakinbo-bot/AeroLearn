import {
  Home,
  BookOpen,
  PenLine,
  Timer,
  Calendar,
  Trophy,
  FileDown,
  ShoppingBag,
  MessageSquare,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
}

export type NavGroup = {
  /** Section heading shown in the expanded sidebar. Null renders the items with no heading. */
  title: string | null
  items: NavItem[]
}

/**
 * Single source of truth for student navigation.
 * Grouped so the 11 destinations stay scannable instead of reading as one long list.
 */
export const navGroups: NavGroup[] = [
  {
    title: null,
    items: [{ label: "Home", href: "/app", icon: Home }],
  },
  {
    title: "Study",
    items: [
      { label: "Learn", href: "/app/learn", icon: BookOpen },
      { label: "Practice", href: "/app/practice", icon: PenLine },
      { label: "Mock Exams", href: "/app/mock-exams", icon: Timer },
      { label: "Timetable", href: "/app/timetable", icon: Calendar },
      { label: "Downloads", href: "/app/downloads", icon: FileDown },
    ],
  },
  {
    title: "Progress",
    items: [
      { label: "Progress", href: "/app/progress", icon: TrendingUp },
      { label: "Challenges", href: "/app/challenges", icon: Trophy },
      { label: "Store", href: "/app/store", icon: ShoppingBag },
    ],
  },
  {
    title: "Social",
    items: [
      { label: "Community", href: "/app/community", icon: Users },
      { label: "Messages", href: "/app/messages", icon: MessageSquare },
    ],
  },
]

/** Flat list, for the mobile drawer and any consumer that doesn't need grouping. */
export const navItems: NavItem[] = navGroups.flatMap((g) => g.items)

/** The four destinations students hit most, surfaced as mobile tabs. */
export const primaryMobileItems: NavItem[] = [
  { label: "Home", href: "/app", icon: Home },
  { label: "Learn", href: "/app/learn", icon: BookOpen },
  { label: "Practice", href: "/app/practice", icon: PenLine },
  { label: "Progress", href: "/app/progress", icon: TrendingUp },
]

/**
 * True when `href` is the section the user is currently in.
 * `/app` only matches exactly, so it doesn't light up on every child route.
 */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app"
  return pathname === href || pathname.startsWith(`${href}/`)
}
