import { isProtectedLearner } from '@/lib/institutional/safeguards'
import { NextResponse } from "next/server"
import { Resend } from "resend"

import { requireSchedulerOrAdmin } from "@/lib/api-auth"
import { getAdminDb } from "@/lib/db-admin"
import { emailLayout, emailParagraph, escapeHtml, MAIL_FROM } from "@/lib/email-template"
import { studyEmailFootnote, unsubscribeHeaders, unsubscribeUrl } from "@/lib/email-unsubscribe"
import { isPaidPlan, planName } from "@/lib/plans"
import { dormantStreak, lagosDayKey, streakWarningDue } from "@/lib/streak"

export const maxDuration = 300

function dateOf(value: unknown): Date | null {
  if (!value) return null
  const date = typeof value === "object" && value !== null && "toDate" in value
    ? (value as { toDate: () => Date }).toDate()
    : new Date(value as string)
  return Number.isFinite(date.getTime()) ? date : null
}

const dayMs = 86_400_000

export async function GET(request: Request) {
  const gate = await requireSchedulerOrAdmin(request)
  if (!gate.ok) return gate.response
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "RESEND_API_KEY is not configured." }, { status: 503 })
  const resend = new Resend(process.env.RESEND_API_KEY)
  const db = getAdminDb()
  const users = await db.collection("users").get()
  const now = Date.now()
  let expiring = 0
  let ended = 0
  let study = 0
  let streakWarnings = 0
  let streaksReset = 0
  let failures = 0
  const today = lagosDayKey()

  for (const entry of users.docs) {
    const user = entry.data()
    if (await isProtectedLearner(entry.id)) continue
    if (user.role === "admin" || !user.email) continue
    const ref = db.collection("users").doc(entry.id)
    const name = escapeHtml(String(user.displayName || "Student"))
    const expiry = dateOf(user.proExpiresAt)
    const expiryKey = expiry?.toISOString()

    try {
      const currentStreak = dormantStreak(user, today)
      if (currentStreak === 0 && Number(user.streak || 0) > 0) {
        await ref.update({ streak: 0 })
        streaksReset++
      }
      if (user.trustPassRequestId) {
        if (expiry && expiry.getTime() <= now && user.subscription === "pro") {
          await ref.update({ subscription: "free", proExpiresAt: null })
        }
        continue
      }
      if (isPaidPlan(user.subscription) && user.subscription !== "lifetime" && expiry && expiry.getTime() <= now) {
        // Access checks already deny an expired plan; this makes the profile show Free.
        await ref.update({ subscription: "free", proExpiresAt: null, lastExpiredPlan: { plan: user.subscription, expiry: expiryKey } })
        user.lastExpiredPlan = { plan: user.subscription, expiry: expiryKey }
      }

      const expired = user.lastExpiredPlan as { plan?: string; expiry?: string } | undefined
      if (expired?.expiry && user.planEndedNotifiedFor !== expired.expiry) {
        const result = await resend.emails.send({
          from: MAIL_FROM.hello, to: user.email,
          subject: "Your AeroLearn Pro access has ended",
          html: emailLayout({ preheader: "Your paid access has ended; your progress is still here.", heading: `Your plan has ended, ${name}`,
            body: emailParagraph(`Your ${escapeHtml(planName(expired.plan || "monthly"))} access has ended. Your lessons, scores and progress are saved. You can continue on the Free plan or make another transfer when you are ready.`),
            cta: { label: "Renew Pro", href: "/app/upgrade" } }),
        })
        if (result.error) throw result.error
        await ref.update({ planEndedNotifiedFor: expired.expiry, lastEmailActivityDate: new Date().toISOString().slice(0, 10) })
        ended++
        continue
      }

      if (isPaidPlan(user.subscription) && user.subscription !== "lifetime" && expiry &&
          expiry.getTime() > now && expiry.getTime() - now <= 3 * dayMs && user.planExpiryReminderFor !== expiryKey) {
        const result = await resend.emails.send({
          from: MAIL_FROM.hello, to: user.email,
          subject: "Your AeroLearn Pro plan ends soon",
          html: emailLayout({ preheader: "Your Pro access ends in the next three days.", heading: `Keep learning with Pro, ${name}`,
            body: emailParagraph(`Your ${escapeHtml(planName(user.subscription))} plan ends on ${escapeHtml(expiry.toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "long" }))}. It will not renew or charge you automatically. To keep Pro access, choose a plan and send a new transfer.`),
            cta: { label: "Renew your plan", href: "/app/upgrade" } }),
        })
        if (result.error) throw result.error
        await ref.update({ planExpiryReminderFor: expiryKey, lastEmailActivityDate: new Date().toISOString().slice(0, 10) })
        expiring++
        continue
      }

      if (user.studyEmailsEnabled === false) continue
      const unsubscribe = unsubscribeUrl(entry.id, user.email)
      if (streakWarningDue(user, today) && user.lastStreakWarningFor !== today) {
        const result = await resend.emails.send({
          from: MAIL_FROM.hello, to: user.email,
          subject: `Keep your ${Number(user.streak)}-day AeroLearn streak 🔥`,
          html: emailLayout({ preheader: "Your study streak needs a visit today.", heading: `Your streak is waiting, ${name}`,
            body: emailParagraph(`You have a ${Number(user.streak)}-day study streak. Open AeroLearn today before midnight in Nigeria to keep it going. Five practice questions are enough to get started.`),
            cta: { label: "Keep my streak", href: "/app/practice" },
            footnote: studyEmailFootnote(unsubscribe) }),
          headers: unsubscribeHeaders(unsubscribe),
        })
        if (result.error) throw result.error
        await ref.update({ lastStreakWarningFor: today, lastEmailActivityDate: today })
        streakWarnings++
        continue
      }
      const lastActive = dateOf(user.lastActiveDate) || dateOf(user.createdAt)
      const lastReminder = dateOf(user.lastStudyReminderAt)
      if (!lastActive || now - lastActive.getTime() < 2 * dayMs ||
          (lastReminder && now - lastReminder.getTime() < 3 * dayMs)) continue
      const result = await resend.emails.send({
        from: MAIL_FROM.hello, to: user.email,
        subject: "A quick study session is waiting 📚",
        html: emailLayout({ preheader: "Five questions today can get you moving again.", heading: `Ready for five questions, ${name}?`,
          body: emailParagraph("Your next study session can be small: pick one subject, answer five questions and see what you remember. Your progress and XP are ready when you return."),
          cta: { label: "Start a quick practice", href: "/app/practice" },
          footnote: studyEmailFootnote(unsubscribe) }),
        headers: unsubscribeHeaders(unsubscribe),
      })
      if (result.error) throw result.error
      await ref.update({ lastStudyReminderAt: new Date(), lastEmailActivityDate: new Date().toISOString().slice(0, 10) })
      study++
    } catch (error) {
      failures++
      console.error("Could not process subscription or study reminder:", entry.id, error)
    }
  }
  return NextResponse.json({ expiring, ended, study, streakWarnings, streaksReset, failures })
}
