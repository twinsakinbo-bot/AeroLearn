"use client"

import React from "react"
import { cn } from "@/lib/utils"

export function AnimatedBook({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-64 h-80 flex items-center justify-center group", className)} style={{ perspective: '1200px' }}>
      {/* Book Container */}
      <div className="relative w-48 h-64 animate-float transition-transform duration-700 ease-out group-hover:rotate-x-12 group-hover:-rotate-y-12" style={{ transformStyle: 'preserve-3d' }}>
        {/* Back Cover */}
        <div className="absolute inset-0 bg-brand rounded-r-2xl rounded-l-sm shadow-2xl border-r-4 border-b-4 border-brand-950" style={{ transform: 'translateZ(-20px)' }}></div>

        {/* Pages (Static thick block) */}
        <div className="absolute inset-y-1 left-2 right-1 bg-surface rounded-r-xl border-y border-r border-hairline" style={{ transform: 'translateZ(-10px)' }}>
          <div className="absolute right-0 inset-y-0 w-8 bg-gradient-to-l from-surface-sunken to-transparent rounded-r-xl"></div>
        </div>

        {/* Animated Page 1 */}
        <div className="absolute inset-0 bg-surface rounded-r-2xl origin-left shadow-[inset_-2px_0_10px_rgba(0,0,0,0.05)] overflow-hidden transition-transform duration-1000 ease-in-out group-hover:-rotate-y-180">
          <div className="absolute inset-x-4 top-8 h-2 bg-hairline rounded-full w-24"></div>
          <div className="absolute inset-x-4 top-14 h-2 bg-surface-sunken rounded-full w-32"></div>
          <div className="absolute inset-x-4 top-20 h-2 bg-surface-sunken rounded-full w-28"></div>
          <div className="absolute bottom-6 right-6 w-12 h-12 rounded-full border-4 border-accent opacity-20"></div>
        </div>

        {/* Animated Page 2 */}
        <div className="absolute inset-0 bg-surface rounded-r-2xl origin-left shadow-[inset_-2px_0_10px_rgba(0,0,0,0.05)] overflow-hidden transition-transform duration-1000 delay-100 ease-in-out group-hover:-rotate-y-180">
          <div className="absolute inset-x-4 top-8 h-8 bg-brand/10 rounded-lg w-16"></div>
          <div className="absolute inset-x-4 top-20 h-2 bg-hairline rounded-full w-32"></div>
          <div className="absolute inset-x-4 top-26 h-2 bg-surface-sunken rounded-full w-24"></div>
        </div>

        {/* Front Cover */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand to-brand-800 rounded-r-2xl rounded-l-sm origin-left shadow-xl border-l-2 border-white/20 flex flex-col items-center justify-center overflow-hidden transition-transform duration-1000 delay-200 ease-in-out group-hover:-rotate-y-180">
          <div className="absolute top-0 left-0 bottom-0 w-4 bg-black/20 shadow-[2px_0_5px_rgba(0,0,0,0.3)] z-10"></div>
          <div className="text-white font-extrabold text-2xl tracking-tighter ml-4 relative z-20 flex flex-col items-center">
            <span className="text-accent">Aero</span>
            <span>Learn</span>
          </div>
          <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-accent/20 rounded-full blur-xl"></div>
          <div className="absolute -top-4 -left-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
        </div>
      </div>
    </div>
  )
}
