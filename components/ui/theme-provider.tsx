"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

export type Theme = "light" | "dark"

const STORAGE_KEY = "aerolearn-theme"

type ThemeContextValue = {
  /** The theme currently painted on <html>. */
  theme: Theme
  /** True once the client has hydrated. Gate theme-dependent icons on this. */
  mounted: boolean
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  mounted: false,
  setTheme: () => {},
  toggleTheme: () => {},
})

/** Matches the inline script in app/layout.tsx. Keep the two in sync. */
function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light"
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === "light" || stored === "dark") return stored
  } catch {
    // Private browsing / storage disabled — fall through to the OS setting.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Server render assumes light; the inline script has already applied the real
  // class to <html> before paint, so there is no flash. The first effect below
  // reconciles React's state with what the script decided.
  const [theme, setThemeState] = useState<Theme>("light")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setThemeState(readInitialTheme())
    setMounted(true)
  }, [])

  // Follow the OS while the user has not made an explicit choice.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = (event: MediaQueryListEvent) => {
      let stored: string | null = null
      try {
        stored = window.localStorage.getItem(STORAGE_KEY)
      } catch {
        stored = null
      }
      if (!stored) setThemeState(event.matches ? "dark" : "light")
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  // Paint. Runs on mount too, which is harmless — the class is already correct.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      // Only an explicit choice is persisted, so a user who has never touched
      // the toggle keeps tracking their OS setting.
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Non-fatal: the theme still applies for this session.
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark")
  }, [setTheme, theme])

  return (
    <ThemeContext.Provider value={{ theme, mounted, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
