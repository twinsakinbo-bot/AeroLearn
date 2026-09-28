"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import { primaryMobileItems, isNavActive } from "@/components/ui/nav-config"

type BottomNavProps = {
  /** Opens the full navigation drawer. */
  onMoreClick: () => void
  /** Unread count badge for the "More" tab, where Messages lives. */
  moreBadgeCount?: number
}

/**
 * Mobile tab bar. Puts the four most-used destinations one tap away instead of
 * behind a drawer, and keeps everything else reachable via "More".
 */
export function BottomNav({ onMoreClick, moreBadgeCount = 0 }: BottomNavProps) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="flex items-stretch">
        {primaryMobileItems.map((item) => {
          const active = isNavActive(pathname, item.href)
          const Icon = item.icon
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
                  active ? "text-accent" : "text-muted",
                )}
              >
                <span className="relative">
                  <Icon size={22} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
                  {active && (
                    <span
                      className="absolute -bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent"
                      aria-hidden="true"
                    />
                  )}
                </span>
                {item.label}
              </Link>
            </li>
          )
        })}

        <li className="flex-1">
          <button
            type="button"
            onClick={onMoreClick}
            aria-label="Open all sections"
            className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted transition-colors"
          >
            <span className="relative">
              <Menu size={22} strokeWidth={2} aria-hidden="true" />
              {moreBadgeCount > 0 && (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-surface bg-accent px-1 text-[10px] font-bold text-white dark:text-ink-950">
                  {moreBadgeCount > 9 ? "9+" : moreBadgeCount}
                </span>
              )}
            </span>
            More
          </button>
        </li>
      </ul>
    </nav>
  )
}
