import { cn } from "@/lib/utils"

import { Container } from "./container"

type Tone = "default" | "sunken" | "invert"

const TONES: Record<Tone, string> = {
  default: "",
  // Alternating band. Opts out of the ambient mesh so it reads as a distinct
  // surface rather than a tinted overlay.
  sunken: "bg-surface-sunken bg-flat",
  invert: "bg-ink-950 bg-flat text-ink-100",
}

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  /** Vertical rhythm. `lg` is for the hero and the closing CTA. */
  size?: "md" | "lg"
  tone?: Tone
  /** Skip the Container wrapper when the section manages its own gutter. */
  bare?: boolean
  containerClassName?: string
}

export function Section({
  size = "md",
  tone = "default",
  bare = false,
  className,
  containerClassName,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(size === "lg" ? "section-lg" : "section", TONES[tone], className)}
      {...props}
    >
      {bare ? children : <Container className={containerClassName}>{children}</Container>}
    </section>
  )
}

/**
 * Centred eyebrow + heading + lede. Used at the top of most marketing
 * sections; keeps the measure consistent instead of each page picking its own
 * max-width.
 */
export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = "center",
  className,
}: {
  eyebrow?: string
  title: React.ReactNode
  lede?: React.ReactNode
  align?: "center" | "start"
  className?: string
}) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" ? "mx-auto text-center" : "text-left",
        className,
      )}
    >
      {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
      <h2 className="text-h2 sm:text-display text-foreground">{title}</h2>
      {lede && <p className="mt-4 text-body-lg text-muted">{lede}</p>}
    </div>
  )
}
