"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { ChevronDown, Menu, X } from "lucide-react"
import { auth, onAuthStateChanged } from "@/lib/auth"

import { Logo } from "@/components/ui/logo"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { cn } from "@/lib/utils"

type NavLink = {
  href: string
  label: string
  description?: string
}

/** Grouped under the "Product" trigger. */
const PRODUCT: NavLink[] = [
  {
    href: "/product/learning",
    label: "Guided learning",
    description: "The full JSS1–SS3 curriculum, one lesson at a time.",
  },
  {
    href: "/product/practice",
    label: "Practice & mock exams",
    description: "WAEC, NECO and JAMB past questions under real timing.",
  },
  {
    href: "/product/analytics",
    label: "Progress analytics",
    description: "See exactly which topics are costing you marks.",
  },
]

const NAV: NavLink[] = [
  { href: "/pricing", label: "Pricing" },
  { href: "/download", label: "Download" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
]

export function SiteHeader() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [productOpen, setProductOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const productRef = useRef<HTMLDivElement>(null)

  // A returning student should not be asked to "get started free".
  useEffect(() => onAuthStateChanged(auth, (user) => setSignedIn(Boolean(user))), [])

  // The header is transparent over the hero and gains a surface once you leave it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Navigating with a menu open would otherwise leave it stuck open.
  useEffect(() => {
    setProductOpen(false)
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [mobileOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setProductOpen(false)
      setMobileOpen(false)
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!productRef.current?.contains(event.target as Node)) setProductOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("mousedown", onPointerDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("mousedown", onPointerDown)
    }
  }, [])

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const productActive = PRODUCT.some((item) => isActive(item.href))

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-shadow duration-200",
        scrolled
          ? "border-b border-hairline bg-background/85 shadow-xs backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="shrink-0 rounded-lg" aria-label="AeroLearn home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          <div ref={productRef} className="relative">
            <button
              type="button"
              onClick={() => setProductOpen((open) => !open)}
              aria-expanded={productOpen}
              aria-haspopup="true"
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-3 py-2 text-body-sm font-medium transition-colors",
                productActive || productOpen
                  ? "bg-surface-hover text-foreground"
                  : "text-muted hover:bg-surface-hover hover:text-foreground",
              )}
            >
              Product
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", productOpen && "rotate-180")}
                aria-hidden="true"
              />
            </button>

            {productOpen && (
              <div className="absolute left-0 top-full mt-2 w-[22rem] animate-scale-in rounded-xl border border-hairline bg-surface p-2 shadow-lg">
                {PRODUCT.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-hover"
                  >
                    <span className="block text-body-sm font-semibold text-foreground">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-caption text-muted">{item.description}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-2 text-body-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-surface-hover text-foreground"
                  : "text-muted hover:bg-surface-hover hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {signedIn ? (
            <Link href="/app" className="btn-primary btn-sm">
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link href="/auth/login" className="btn-ghost btn-sm hidden sm:inline-flex">
                Log in
              </Link>
              <Link href="/auth/signup" className="btn-primary btn-sm">
                Get started free
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-hairline bg-surface text-muted transition-colors hover:text-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-sm animate-slide-in-right flex-col border-l border-hairline bg-surface shadow-2xl">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-hairline px-5">
              <Logo size="sm" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-4 py-5" aria-label="Mobile">
              <p className="eyebrow px-2 pb-2">Product</p>
              {PRODUCT.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-lg px-2 py-2.5 text-body-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
                >
                  {item.label}
                </Link>
              ))}

              <div className="divider my-4" />

              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-2 py-2.5 text-body-sm font-semibold transition-colors hover:bg-surface-hover",
                    isActive(item.href) ? "text-accent" : "text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="shrink-0 space-y-2 border-t border-hairline px-4 py-4">
              {signedIn ? (
                <Link href="/app" className="btn-primary btn-block">
                  Go to dashboard
                </Link>
              ) : (
                <>
                  <Link href="/auth/login" className="btn-secondary btn-block">
                    Log in
                  </Link>
                  <Link href="/auth/signup" className="btn-primary btn-block">
                    Get started free
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}


