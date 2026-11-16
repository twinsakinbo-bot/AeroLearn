import { NextResponse } from "next/server"

import { requireSchedulerOrAdmin } from "@/lib/api-auth"
import { listCurriculumSubjects } from "@/lib/curriculum-research"
import { getAdminDb } from "@/lib/db-admin"
import { CLASS_LEVELS } from "@/lib/constants"
import { GET as readPipeline, POST as runPipeline } from "@/app/api/lessons/pipeline/route"

export const maxDuration = 300

type Plan = { topics: Array<{ title: string }> }
type Draft = { status: "awaiting_ai_review" | "needs_revision" | "published" } | null

async function execute(request: Request) {
  const gate = await requireSchedulerOrAdmin(request)
  if (!gate.ok) return gate.response
  if (!process.env.CRON_SECRET && gate.uid === "cron") {
    return NextResponse.json({ error: "CRON_SECRET is required." }, { status: 503 })
  }

  const db = getAdminDb()
  const stateRef = db.collection("settings").doc("automation-lessons")
  const state = (await stateRef.get()).data() || {}
  const combinations: Array<{ classLevel: string; subject: string }> = []
  const sourceErrors: string[] = []
  for (const classLevel of CLASS_LEVELS) {
    try {
      for (const subject of await listCurriculumSubjects(classLevel)) combinations.push({ classLevel, subject })
    } catch (error) {
      sourceErrors.push(`${classLevel}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (!combinations.length) {
    return NextResponse.json({ error: "No NERDC subjects are reachable.", sourceErrors }, { status: 503 })
  }

  const headers = new Headers({ authorization: request.headers.get("authorization") || "", "content-type": "application/json" })
  const start = Number.isInteger(state.cursor) ? state.cursor % combinations.length : 0
  const tasks: Array<{ index: number; classLevel: string; subject: string; action: "plan" | "write" | "review"; topicTitle?: string }> = []
  for (let offset = 0; offset < combinations.length && tasks.length < 3; offset++) {
    const index = (start + offset) % combinations.length
    const { classLevel, subject } = combinations[index]
    const query = new URLSearchParams({ classLevel, subject })
    const read = await readPipeline(new Request(`https://aerolearn.local/api/lessons/pipeline?${query}`, { headers }))
    if (!read.ok) {
      sourceErrors.push(`${classLevel} ${subject}: ${(await read.json()).error || read.status}`)
      continue
    }
    const data = await read.json() as { plan: Plan | null; drafts: Draft[] }
    let action: "plan" | "write" | "review"
    let topicTitle: string | undefined
    if (!data.plan) {
      action = "plan"
    } else {
      const topicIndex = data.plan.topics.findIndex((_, i) => data.drafts[i]?.status !== "published")
      if (topicIndex < 0) continue
      topicTitle = data.plan.topics[topicIndex].title
      action = data.drafts[topicIndex]?.status === "awaiting_ai_review" ? "review" : "write"
    }
    tasks.push({ index, classLevel, subject, action, topicTitle })
  }
  if (!tasks.length) {
    const outcome = { status: "complete", at: new Date().toISOString() }
    await stateRef.set({ cursor: 0, lastResult: outcome, sourceErrors: sourceErrors.slice(0, 12), updatedAt: new Date() }, { merge: true })
    return NextResponse.json({ outcome, sourceErrors: sourceErrors.slice(0, 12) })
  }
  const outcomes = await Promise.all(tasks.map(async (task) => {
    try {
      const run = await runPipeline(new Request("https://aerolearn.local/api/lessons/pipeline", {
        method: "POST", headers,
        body: JSON.stringify({ action: task.action, classLevel: task.classLevel, subject: task.subject, topicTitle: task.topicTitle }),
      }))
      const result = await run.json().catch(() => ({}))
      return {
        classLevel: task.classLevel, subject: task.subject, topicTitle: task.topicTitle || null, action: task.action,
        status: run.ok ? result.draft?.status || "planned" : "failed",
        error: run.ok ? null : String(result.error || `Request failed (${run.status})`).slice(0, 400),
        at: new Date().toISOString(),
      }
    } catch (error) {
      return {
        classLevel: task.classLevel, subject: task.subject, topicTitle: task.topicTitle || null, action: task.action,
        status: "failed", error: error instanceof Error ? error.message.slice(0, 400) : "Lesson job failed",
        at: new Date().toISOString(),
      }
    }
  }))
  await stateRef.set({
    cursor: (tasks[tasks.length - 1].index + 1) % combinations.length,
    lastResult: outcomes[outcomes.length - 1], lastResults: outcomes,
    sourceErrors: sourceErrors.slice(0, 12), updatedAt: new Date(),
  }, { merge: true })
  return NextResponse.json({ outcomes, sourceErrors: sourceErrors.slice(0, 12) })
}

export const GET = execute
export const POST = execute
