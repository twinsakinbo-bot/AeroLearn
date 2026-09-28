"use client"

import { cn } from "@/lib/utils"
import { SUBJECTS } from "@/lib/constants"
import { BookOpen } from "lucide-react"

export interface SubjectListProps {
  selected?: string
  onSelect?: (subject: string) => void
  className?: string
  showCount?: boolean
  count?: number
}

export const SubjectList = ({
  selected,
  onSelect,
  className,
  showCount,
  count,
}: SubjectListProps) => {
  return (
    <div className={cn("flex flex-col sm:flex-row gap-2", className)}>
      {SUBJECTS.map((subject) => {
        const isSelected = selected === subject
        const itemClasses = cn(
          "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isSelected
            ? "bg-primary text-white"
            : "text-muted hover:bg-surface-hover hover:text-foreground"
        )

        return (
          <button
            key={subject}
            onClick={() => onSelect?.(subject)}
            className={itemClasses}
            aria-pressed={isSelected}
            aria-label={isSelected ? `Deselect ${subject}` : `Select ${subject}`}
          >
            {subject}
          </button>
        )
      })}
      {showCount && count && (
        <span className="text-xs text-subtle ml-2">{count} topics</span>
      )}
    </div>
  )
}