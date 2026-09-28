import { cn } from "@/lib/utils"

type Tone =
  | "neutral"
  | "brand"
  | "accent"
  | "success"
  | "warn"
  | "danger"
  /* The gamification tones. These exist in globals.css and had no way in. */
  | "streak"
  | "xp"
  | "gem"
  | "pro"

const TONES: Record<Tone, string> = {
  neutral: "badge-neutral",
  brand: "badge-brand",
  accent: "badge-accent",
  success: "badge-success",
  warn: "badge-warn",
  danger: "badge-danger",
  streak: "badge-streak",
  xp: "badge-xp",
  gem: "badge-gem",
  pro: "badge-pro",
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
  /** Leading status dot — for live/queued/failed style labels. */
  dot?: boolean
}

export function Badge({ tone = "neutral", dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span className={cn(TONES[tone], className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  )
}
