import { cn } from "@/lib/utils"

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * `interactive` adds the lift-on-hover treatment — only use it when the whole
   * card is a link or button, otherwise it promises an affordance that isn't there.
   * `chunky` is the 3D hard-edge card: use it for the one card on a screen that
   * the student is meant to act on. `premium` is the upgrade/paywall surface.
   */
  variant?: "default" | "interactive" | "chunky" | "premium" | "glass" | "invert"
  /** Built-in padding. Pass `none` when the card contains its own layout. */
  padding?: "none" | "sm" | "md" | "lg"
}

const VARIANTS = {
  default: "card",
  interactive: "card-interactive",
  chunky: "card-chunky",
  premium: "card-premium",
  glass: "card-glass",
  invert: "card-invert",
} as const

const PADDING = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
} as const

export function Card({
  variant = "default",
  padding = "md",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div className={cn(VARIANTS[variant], PADDING[padding], className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mb-4 space-y-1.5", className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-h4 text-foreground", className)} {...props}>
      {children}
    </h3>
  )
}

export function CardDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-body-sm text-muted", className)} {...props}>
      {children}
    </p>
  )
}

export function CardFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-5 flex items-center gap-3 border-t border-hairline pt-4", className)}
      {...props}
    >
      {children}
    </div>
  )
}
