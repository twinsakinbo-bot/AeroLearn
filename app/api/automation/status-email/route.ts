import { NextResponse } from "next/server"

import { requireSchedulerOrAdmin } from "@/lib/api-auth"
import { sendAdminNotification } from "@/lib/admin-notifications"
import { getAdminDb } from "@/lib/db-admin"

export const maxDuration = 60

async function execute(request: Request) {
  const gate = await requireSchedulerOrAdmin(request)
  if (!gate.ok) return gate.response
  const db = getAdminDb()
  const [receipts, lessons, aloc, notices, settings] = await Promise.all([
    db.collection("verificationRequests").where("status", "==", "pending").get(),
    db.collection("settings").doc("automation-lessons").get(),
    db.collection("settings").doc("automation-aloc").get(),
    db.collection("settings").doc("automation-status-email").get(),
    db.collection("settings").get(),
  ])
  const pending = receipts.docs.length
  const lesson = lessons.data()?.lastResult || {}
  const lessonRuns = Array.isArray(lessons.data()?.lastResults) ? lessons.data()!.lastResults : [lesson]
  const questions = aloc.data()?.lastResult || {}
  const drafts = settings.docs.filter((row) => row.id.startsWith("lesson-pipeline-"))
  const awaitingReview = drafts.filter((row) => row.data().status === "awaiting_ai_review").length
  const needsRevision = drafts.filter((row) => row.data().status === "needs_revision").length
  const published = drafts.filter((row) => row.data().status === "published").length
  const sourceErrors: string[] = Array.isArray(lessons.data()?.sourceErrors) ? lessons.data()!.sourceErrors : []
  const today = new Date().toISOString().slice(0, 10)
  const fingerprint = JSON.stringify({ pending, lessonRuns, questions, awaitingReview, needsRevision, published, sourceErrors })
  const previous = notices.data() || {}
  if (previous.lastSentDay === today && previous.fingerprint === fingerprint) {
    return NextResponse.json({ sent: false, reason: "Already sent today." })
  }
  const lessonDescription = lesson.status === "complete"
    ? "All reachable NERDC lesson topics have been processed."
    : lessonRuns.some((run: any) => run.action)
      ? lessonRuns.map((run: any) => `${run.classLevel} ${run.subject}${run.topicTitle ? ` — ${run.topicTitle}` : ""}: ${run.status}${run.error ? ` (${run.error})` : ""}`).join("; ")
      : "The scheduled lesson writer has not run yet."
  const alocDescription = questions.status
    ? `${questions.examType || ""} ${questions.subject || ""} ${questions.year || ""}: ${questions.status}; ${questions.imported || 0} imported, ${questions.removedByReview || 0} removed by AI review${questions.error ? ` (${questions.error})` : ""}.`
    : "The scheduled ALOC sync has not run yet."
  const sent = await sendAdminNotification({
    subject: `AeroLearn admin update: ${pending} receipt${pending === 1 ? "" : "s"} pending`,
    heading: "Your AeroLearn work queue",
    paragraphs: [
      `${pending} transfer receipt${pending === 1 ? " needs" : "s need"} your approval. No payment is approved by AI.`,
      `Lessons: ${lessonDescription}`,
      `${published} AI-reviewed lessons published; ${awaitingReview} awaiting AI review; ${needsRevision} need revision. ${sourceErrors.length ? `NERDC sources unavailable for: ${sourceErrors.join("; ")}.` : ""}`,
      `ALOC questions: ${alocDescription}`,
    ],
    href: "/admin/subscriptions",
    label: "Review pending receipts",
  })
  if (!sent) return NextResponse.json({ error: "Set RESEND_API_KEY and ADMIN_NOTIFICATION_EMAIL, or give an admin account an email address." }, { status: 503 })
  await db.collection("settings").doc("automation-status-email").set({ lastSentDay: today, fingerprint, sentAt: new Date() })
  return NextResponse.json({ sent: true, pending, lesson, questions, published, awaitingReview, needsRevision, sourceErrors })
}

export const GET = execute
export const POST = execute
