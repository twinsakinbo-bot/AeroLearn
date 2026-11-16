import { NextRequest, NextResponse } from "next/server"
import { getAdminDb } from "@/lib/db-admin"
import { Resend } from "resend"

import { requireSchedulerOrAdmin } from "@/lib/api-auth"
import {
  MAIL_FROM,
  emailLayout,
  emailList,
  emailParagraph,
  escapeHtml,
} from "@/lib/email-template"
import { siteUrl } from "@/lib/site"
import { GET as runReminders } from "@/app/api/subscription/reminders/route"

export const maxDuration = 300

// Vercel cron sends GET requests
export async function GET(req: NextRequest) {
  const reminders = await runReminders(req)
  if (!reminders.ok) return reminders
  return runDripCampaign(req)
}

const DEFAULT_DRIP_SCHEDULE = [
  { day: 3, subject: "Try Your First Quiz! 📝", templateKey: "day3_quiz" },
  { day: 7, subject: "Your Streak is Waiting! 🔥", templateKey: "day7_streak" },
  { day: 14, subject: "Unlock Pro — Here's What You're Missing 🚀", templateKey: "day14_pro" },
  { day: 30, subject: "We Miss You! Come Back to AeroLearn 💙", templateKey: "day30_reengagement" },
]

/* Sent to people who have not asked for each one individually, so every template
   says why it arrived. There is no unsubscribe link yet — see the note in
   `runDripCampaign`. */
const WHY_THIS_EMAIL = `You are receiving this because you created an AeroLearn account. <a href="${siteUrl("/app/settings")}">Turn off study and learning-tip emails in Settings</a>.`

const EMAIL_TEMPLATES: Record<string, (name: string) => string> = {
  day3_quiz: (name) =>
    emailLayout({
      preheader: "A ten-question quiz on any topic, generated in seconds.",
      heading: `Ready for your first quiz, ${escapeHtml(name)}? 👋`,
      body:
        emailParagraph("Three days in. Good start — here is the part that makes it count.") +
        emailParagraph(
          "Reading a topic feels like learning it. Answering questions on it is how you find out. " +
            "Pick a subject, pick a topic, and AeroLearn writes you a quiz on the spot — with a " +
            "worked explanation behind every answer you get wrong.",
        ),
      cta: { label: "Take your first quiz", href: "/app/practice" },
      footnote: WHY_THIS_EMAIL,
    }),

  day7_streak: (name) =>
    emailLayout({
      preheader: "Fifteen minutes today keeps the streak alive.",
      heading: `Your streak is waiting, ${escapeHtml(name)} 🔥`,
      body:
        emailParagraph("It has been a week. The students who get the most out of this are not the ones who study hardest on a Sunday — they are the ones who show up on a Tuesday.") +
        emailParagraph(
          "Every correct answer pays <strong>10 XP and 5 Aero Coins</strong>, and coins buy things " +
            "in the store. Fifteen minutes is enough to keep the run going.",
        ),
      cta: { label: "Keep the streak", href: "/app" },
      footnote: WHY_THIS_EMAIL,
    }),

  day14_pro: (name) =>
    emailLayout({
      preheader: "Every subject, unlimited practice and essay grading — ₦2,500 a month.",
      heading: `Two weeks in, ${escapeHtml(name)} — ready for Pro? 🚀`,
      body:
        emailParagraph("Two weeks of studying is not a whim. Here is what the free plan is holding back:") +
        emailList([
          "📚 <strong>Every subject, JSS 1 to SS 3</strong> — the free plan stops at two",
          "🤖 <strong>Unlimited AI practice and AI tutor</strong>, on any topic in your syllabus",
          "✍️ <strong>Essay grading</strong> on writing you submit yourself",
          "📄 <strong>PDF question papers</strong> to work through offline",
          "🏆 <strong>Timed mock exams and weekly challenges</strong> as papers land in the library",
        ]) +
        emailParagraph("₦2,500 a month. Less than one textbook, and you can stop any time."),
      cta: { label: "Upgrade to Pro — ₦2,500/mo", href: "/app/upgrade", tone: "accent" },
      footnote: WHY_THIS_EMAIL,
    }),

  day30_reengagement: (name) =>
    emailLayout({
      preheader: "Your subjects are where you left them.",
      heading: `We miss you, ${escapeHtml(name)} 💙`,
      body:
        emailParagraph("It has been a while since your last session, and your exam date has not moved.") +
        emailParagraph(
          "You do not have to start over. Open the subject you were on, answer five questions, and " +
            "you are back in it.",
        ),
      cta: { label: "Pick up where you left off", href: "/app" },
      footnote: WHY_THIS_EMAIL,
    }),
}

// This endpoint is called by a cron job (e.g., Vercel Cron or manual trigger from admin)
export async function POST(req: NextRequest) {
  return runDripCampaign(req)
}

async function runDripCampaign(req: NextRequest) {
  /* Open until now: the old check was `secret !== CRON_SECRET && authHeader`,
     which skips itself entirely when no `authorization` header is sent — so an
     anonymous POST mailed every user on file. */
  const gate = await requireSchedulerOrAdmin(req)
  if (!gate.ok) return gate.response

  /* TODO: these four are marketing mail, and there is no way to opt out of them.
     Every template says why it arrived, which is the honest half; the missing half
     is a one-click unsubscribe and a `List-Unsubscribe` header. Gmail weighs both
     when deciding whether a sender lands in the inbox, so this costs delivery of
     the transactional mail too. Needs a token route and a flag on `users`. */

  /* `new Resend(undefined)` throws, and this used to run at module scope, so a
     build without RESEND_API_KEY failed on importing this route. */
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.error("RESEND_API_KEY is not set")
    return NextResponse.json({ error: "Email service not configured." }, { status: 503 })
  }
  const resend = new Resend(resendKey)

  try {
    const adminDb = getAdminDb()

    // Get drip schedule from admin settings (or use defaults)
    let dripSchedule = DEFAULT_DRIP_SCHEDULE
    try {
      const settingsSnap = await adminDb.collection("settings").doc("emailDrip").get()
      if (settingsSnap.exists && settingsSnap.data()?.schedule) {
        dripSchedule = settingsSnap.data()!.schedule
      }
    } catch (e) {}

    // Get all users
    const usersSnap = await adminDb.collection("users").get()
    const now = new Date()
    let emailsSent = 0

    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data()
      if (!userData.email || !userData.createdAt || userData.studyEmailsEnabled === false ||
          userData.lastEmailActivityDate === new Date().toISOString().slice(0, 10)) continue

      const createdAt = userData.createdAt.toDate ? userData.createdAt.toDate() : new Date(userData.createdAt)
      const daysSinceSignup = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
      const lastDripDay = userData.lastDripEmailDay || 0

      // Find the next drip email to send
      for (const drip of dripSchedule) {
        if (daysSinceSignup >= drip.day && lastDripDay < drip.day) {
          // Send this email
          try {
            const template = EMAIL_TEMPLATES[drip.templateKey]
            if (!template) continue

            const sent = await resend.emails.send({
              from: MAIL_FROM.hello,
              to: userData.email,
              subject: drip.subject,
              html: template(userData.displayName || "Student"),
            })
            if (sent.error) throw sent.error

            await adminDb.collection("users").doc(userDoc.id).update({
              lastDripEmailDay: drip.day,
              lastDripEmailDate: now,
              lastEmailActivityDate: now.toISOString().slice(0, 10),
            })

            emailsSent++
          } catch (emailErr) {
            console.error(`Failed to send drip email to ${userData.email}:`, emailErr)
          }
          break // Only send one email per user per run
        }
      }
    }

    return NextResponse.json({ success: true, emailsSent })
  } catch (error: any) {
    console.error("Drip campaign error:", error)
    return NextResponse.json({ error: "Failed to run drip campaign" }, { status: 500 })
  }
}
