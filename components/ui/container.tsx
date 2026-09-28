import { cn } from "@/lib/utils"

/**
 * Page gutter. Every top-level section should be wrapped in one of these so
 * the left edge of content lines up down the whole page.
 */
export function Container({
  className,
  narrow = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { narrow?: boolean }) {
  return (
    <div className={cn(narrow ? "container-narrow" : "container-page", className)} {...props}>
      {children}
    </div>
  )
}
