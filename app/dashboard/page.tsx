/**
 * /dashboard — the old address for the signed-in dashboard. Kept so existing
 * links and bookmarks land somewhere useful; it only redirects.
 */
"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

export default function DashboardPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/app")
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden="true" />
      <span className="sr-only">Taking you to your dashboard</span>
    </div>
  )
}
