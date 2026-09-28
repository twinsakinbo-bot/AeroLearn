"use client"

import { Moon, Sun } from "lucide-react"

import { useTheme } from "@/components/ui/theme-provider"
import { cn } from "@/lib/utils"

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, mounted, toggleTheme } = useTheme()
  const isDark = theme === "dark"

  return (
    <button
      type="button"
      onClick={toggleTheme}
      // Until hydration we don't know the real theme, so don't claim one.
      aria-label={mounted ? (isDark ? "Switch to light theme" : "Switch to dark theme") : "Switch theme"}
      title={mounted ? (isDark ? "Light mode" : "Dark mode") : undefined}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-hairline",
        "bg-surface text-muted transition-colors hover:bg-surface-hover hover:text-foreground",
        className,
      )}
    >
      {/* Both icons render; opacity is what changes, so there is no layout shift
          and no hydration mismatch from branching on `theme`. */}
      <span className="relative block h-4 w-4">
        <Sun
          className={cn(
            "absolute inset-0 h-4 w-4 transition-all duration-200",
            isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100",
          )}
          aria-hidden="true"
        />
        <Moon
          className={cn(
            "absolute inset-0 h-4 w-4 transition-all duration-200",
            isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0",
          )}
          aria-hidden="true"
        />
      </span>
    </button>
  )
}
