import { NextResponse } from "next/server"

import { requireAdmin } from "@/lib/api-auth"
import { getAdminDb } from "@/lib/db-admin"
import cronConfig from "@/vercel.json"

export async function GET(request: Request) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response
  const db = getAdminDb()
  const [lessonJob, alocJob, statusEmail, settings, receipts] = await Promise.all([
    db.collection("settings").doc("automation-lessons").get(),
    db.collection("settings").doc("automation-aloc").get(),
    db.collection("settings").doc("automation-status-email").get(),
    db.collection("settings").get(),
    db.collection("verificationRequests").where("status", "==", "pending").get(),
  ])
  const drafts = settings.docs.filter((row) => row.id.startsWith("lesson-pipeline-"))
  const count = (status: string) => drafts.filter((row) => row.data().status === status).length
  const lessons = lessonJob.data() || {}
  const aloc = alocJob.data() || {}
  const email = statusEmail.data() || {}
  return NextResponse.json({
    lessonJob: {
      lastResults: Array.isArray(lessons.lastResults) ? lessons.lastResults : lessons.lastResult ? [lessons.lastResult] : [],
      history: Array.isArray(lessons.history) ? lessons.history.slice(-30).reverse() : Array.isArray(lessons.lastResults) ? lessons.lastResults : lessons.lastResult ? [lessons.lastResult] : [],
      sourceErrors: Array.isArray(lessons.sourceErrors) ? lessons.sourceErrors : [],
      updatedAt: lessons.updatedAt || null,
    },
    alocJob: {
      lastResult: aloc.lastResult || null,
      history: Array.isArray(aloc.history) ? aloc.history.slice(-30).reverse() : aloc.lastResult ? [aloc.lastResult] : [],
      updatedAt: aloc.updatedAt || null,
    },
    email: { lastSentDay: email.lastSentDay || null, sentAt: email.sentAt || null },
    counts: { published: count("published"), awaitingReview: count("awaiting_ai_review"), needsRevision: count("needs_revision"), pendingReceipts: receipts.size },
    configured: {
      lessons: Boolean(process.env.CRON_SECRET && (process.env.COARENA_API_KEY || process.env.AETHER_API_KEY)),
      aloc: Boolean(process.env.CRON_SECRET && process.env.ALOC_ACCESS_TOKEN && (process.env.COARENA_API_KEY || process.env.AETHER_API_KEY)),
      email: Boolean(process.env.CRON_SECRET && process.env.RESEND_API_KEY),
      webSearch: Boolean(process.env.BRAVE_SEARCH_API_KEY),
    },
    schedules: cronConfig.crons.filter((item) => item.path.startsWith("/api/automation/")),
  })
}
