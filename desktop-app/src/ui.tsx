import { useEffect, useRef, useState, type ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

export function Page({ children }: { children: ReactNode }) {
  return <div className="page">{children}</div>
}

export function PageHeading({
  overline,
  title,
  subtitle,
  aside,
}: {
  overline?: string
  title: string
  subtitle?: string
  aside?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        {overline && <p className="overline">{overline}</p>}
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {aside && <div className="page-aside">{aside}</div>}
    </div>
  )
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className ? `panel ${className}` : "panel"}>
      {(title || action) && (
        <div className="panel-heading">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={22} /></span>
      <strong>{title}</strong>
      <p>{body}</p>
      {action}
    </div>
  )
}

export function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)
  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current) }, [])
  const show = (text: string) => {
    setMessage(text)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setMessage(null), 2400)
  }
  const node = message ? <div className="toast">{message}</div> : null
  return { show, node }
}

export function StatChip({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="stat-chip">
      <small>{label}</small>
      <strong>{value}</strong>
      {hint && <em>{hint}</em>}
    </div>
  )
}

export function ProgressBar({ percent, tone = "cyan" }: { percent: number; tone?: "cyan" | "violet" | "amber" }) {
  const width = Math.max(0, Math.min(100, percent))
  return (
    <div className={`bar bar-${tone}`}><span style={{ width: `${width}%` }} /></div>
  )
}

export function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${minutes}:${s.toString().padStart(2, "0")}`
}

export function initials(name: string) {
  return (name || "Student").split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase()
}

export function relativeTime(iso: string) {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} d ago`
}
