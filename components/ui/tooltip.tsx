"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"

/**
 * Tooltip — a hover/focus label that cannot be clipped or covered.
 *
 * The version this replaces was an `absolute left-full z-50` span inside the
 * collapsed sidebar's nav links, and it never appeared. Two separate reasons,
 * both worth writing down because `z-50` looks like it should have been enough:
 *
 *   1. Clipping. The links live inside `<nav class="overflow-y-auto">`, and CSS
 *      resolves `overflow-x` to `auto` whenever the other axis is not `visible`.
 *      So the nav is a scroll container on *both* axes and cuts the bubble off
 *      at the 76px sidebar edge. z-index does not defeat overflow.
 *   2. Stacking. The `<aside>` is `sticky z-30`, which makes it a stacking
 *      context. `z-50` inside it can only outrank its siblings, never anything
 *      painted above the aside itself.
 *
 * Both are fixed by leaving the tree: the bubble is portalled to `document.body`
 * and positioned `fixed` from the trigger's rect, so nothing can clip it and it
 * competes for z-index at the top level.
 *
 * The API is deliberately the same as before — drop it *inside* the element it
 * describes and it finds that element itself:
 *
 *   <Link className="...">  <Icon />  <Tooltip>Dashboard</Tooltip>  </Link>
 *
 * Accessibility: the visible bubble is `aria-hidden`, and the label is also
 * rendered `sr-only` inside the trigger. That is not belt-and-braces — a
 * collapsed nav link has no other text, so portalling the bubble out of the
 * subtree would otherwise leave the link with no accessible name at all.
 */

type Side = "right" | "left" | "top" | "bottom"

interface TooltipProps {
  children: React.ReactNode
  /** Which side of the trigger to sit on. Default `right` (collapsed sidebar). */
  side?: Side
  /** Gap between trigger and bubble, in px. */
  offset?: number
  className?: string
}

/** Keeps the bubble off the viewport edge. */
const EDGE = 8

export function Tooltip({ children, side = "right", offset = 10, className }: TooltipProps) {
  const anchor = useRef<HTMLSpanElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => setMounted(true), [])

  /** Measure the trigger and the bubble, then place. Runs after paint, so the
      bubble is rendered `invisible` until `pos` exists — no first-frame flash. */
  const place = useCallback(() => {
    const trigger = anchor.current?.parentElement
    const box = bubble.current
    if (!trigger || !box) return

    const t = trigger.getBoundingClientRect()
    const w = box.offsetWidth
    const h = box.offsetHeight

    let top: number
    let left: number

    switch (side) {
      case "left":
        left = t.left - offset - w
        top = t.top + t.height / 2 - h / 2
        break
      case "top":
        left = t.left + t.width / 2 - w / 2
        top = t.top - offset - h
        break
      case "bottom":
        left = t.left + t.width / 2 - w / 2
        top = t.bottom + offset
        break
      default:
        left = t.right + offset
        top = t.top + t.height / 2 - h / 2
    }

    // Clamp to the viewport, but only when there is a viewport to clamp to.
    // `window.innerWidth` is 0 in an offscreen/unrendered tab and during print
    // layout, and clamping against 0 pins every bubble to the top-left corner
    // instead of leaving it beside its trigger.
    const vw = window.innerWidth || document.documentElement.clientWidth || 0
    const vh = window.innerHeight || document.documentElement.clientHeight || 0
    if (vw > w + EDGE * 2) left = Math.min(Math.max(left, EDGE), vw - w - EDGE)
    if (vh > h + EDGE * 2) top = Math.min(Math.max(top, EDGE), vh - h - EDGE)

    setPos({ top, left })
  }, [offset, side])

  /* Subscribe to the parent element rather than wrapping it, so no call site has
     to change and no extra box enters the layout. `focus`/`blur` do not bubble,
     which is exactly why they are attached to the trigger itself. */
  useEffect(() => {
    const trigger = anchor.current?.parentElement
    if (!trigger) return

    const show = () => setOpen(true)
    const hide = () => setOpen(false)

    trigger.addEventListener("pointerenter", show)
    trigger.addEventListener("pointerleave", hide)
    trigger.addEventListener("focus", show)
    trigger.addEventListener("blur", hide)
    // A tap fires pointerenter on touch and would leave the bubble stuck open.
    trigger.addEventListener("pointerdown", hide)

    return () => {
      trigger.removeEventListener("pointerenter", show)
      trigger.removeEventListener("pointerleave", hide)
      trigger.removeEventListener("focus", show)
      trigger.removeEventListener("blur", hide)
      trigger.removeEventListener("pointerdown", hide)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setPos(null)
      return
    }

    place()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    // Capture, because the scroll happens on the nav container, not on window.
    window.addEventListener("scroll", place, true)
    window.addEventListener("resize", place)
    window.addEventListener("keydown", onKey)

    return () => {
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
      window.removeEventListener("keydown", onKey)
    }
  }, [open, place])

  return (
    <>
      <span ref={anchor} className="sr-only">
        {children}
      </span>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={bubble}
            aria-hidden="true"
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0 }}
            className={cn(
              "pointer-events-none fixed z-[90] max-w-[16rem] rounded-lg border-2 border-brand-700",
              "bg-brand-900 px-3 py-1.5 text-caption font-extrabold leading-tight text-white",
              "shadow-lg",
              pos ? "visible animate-scale-in" : "invisible",
              className,
            )}
          >
            {children}
            <span
              className={cn(
                "absolute h-2 w-2 rotate-45 border-brand-700 bg-brand-900",
                side === "right" && "-left-[5px] top-1/2 -translate-y-1/2 border-b-2 border-l-2",
                side === "left" && "-right-[5px] top-1/2 -translate-y-1/2 border-r-2 border-t-2",
                side === "top" && "-bottom-[5px] left-1/2 -translate-x-1/2 border-b-2 border-r-2",
                side === "bottom" && "-top-[5px] left-1/2 -translate-x-1/2 border-l-2 border-t-2",
              )}
            />
          </div>,
          document.body,
        )}
    </>
  )
}
