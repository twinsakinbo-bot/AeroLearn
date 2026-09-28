"use client"

import { Children, cloneElement, forwardRef, isValidElement } from "react"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

type Variant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "link"
  /* The rest of what globals.css ships. `accent` is the orange half of the
     brand — the button for "start", "continue", "claim", anywhere navy would
     feel too formal. `glow` is the one-per-screen hero action. */
  | "accent"
  | "success"
  | "gem"
  | "gold"
  | "flame"
  | "premium"
  | "glow"
type Size = "sm" | "md" | "lg" | "xl"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Renders a spinner, disables interaction, and keeps the label for screen readers. */
  loading?: boolean
  /** Stretch to the container width. */
  block?: boolean
  /**
   * Render the single child element instead of a <button>, merging these
   * styles onto it. Use for `<Button asChild><Link href="/x">Go</Link></Button>`.
   */
  asChild?: boolean
}

/**
 * The variant classes live in app/globals.css so that markup which cannot
 * import a component (e.g. plain `<a className="btn-primary">`) stays visually
 * identical to markup that can.
 */
const VARIANTS: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
  link: "btn text-accent underline-offset-4 hover:underline",
  accent: "btn-accent",
  success: "btn-success",
  gem: "btn-gem",
  gold: "btn-gold",
  flame: "btn-flame",
  premium: "btn-premium",
  glow: "btn-primary-glow",
}

const SIZES: Record<Size, string> = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
  xl: "btn-xl",
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    block = false,
    asChild = false,
    disabled,
    className,
    children,
    ...props
  },
  ref,
) {
  const classes = cn(VARIANTS[variant], SIZES[size], block && "btn-block", className)

  if (asChild) {
    const child = Children.only(children)
    if (!isValidElement(child)) return null
    return cloneElement(child as React.ReactElement<{ className?: string }>, {
      className: cn(classes, (child.props as { className?: string }).className),
    })
  }

  return (
    <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
})
