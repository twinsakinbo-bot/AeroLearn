import Image from "next/image"

import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  showText?: boolean
  /** Mark only — used by the collapsed app sidebar. */
  collapsed?: boolean
  /** The tagline is for the sidebar and footer, not for a dense top bar. */
  showTagline?: boolean
  size?: "sm" | "md" | "lg"
}

const MARK = { sm: 28, md: 34, lg: 40 } as const
const WORD = { sm: "text-body", md: "text-h4", lg: "text-h3" } as const

export function Logo({
  className,
  showText = true,
  collapsed = false,
  showTagline = false,
  size = "md",
}: LogoProps) {
  const px = collapsed ? MARK.sm : MARK[size]

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src="/aerolearn_logo.svg"
        alt=""
        width={px}
        height={px}
        priority
        className="shrink-0 object-contain"
      />

      {showText && !collapsed && (
        <span className="flex flex-col justify-center leading-none">
          <span className={cn("font-display font-extrabold tracking-tight", WORD[size])}>
            <span className="text-brand">Aero</span>
            <span className="text-accent">Learn</span>
          </span>
          {showTagline && (
            <span className="mt-1 text-overline uppercase text-subtle">
              Your Path to Academic Altitude
            </span>
          )}
        </span>
      )}

      {/* Mark-only mode still needs an accessible name. */}
      {(!showText || collapsed) && <span className="sr-only">AeroLearn</span>}
    </span>
  )
}
