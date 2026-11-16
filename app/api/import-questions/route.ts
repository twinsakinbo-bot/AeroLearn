/**
 * API Route: /api/import-questions
 *
 * Server-side batch Firestore import using the Firebase Admin SDK.
 * Ensures Firebase service account credentials are NEVER exposed to the browser.
 * Uses batched writes (max 500 per batch for Firestore limits).
 *
 * Client sends a valid Firebase ID token in the Authorization header
 * for an authenticated admin user, plus the array of validated questions.
 */
import { NextRequest, NextResponse } from "next/server"
import { PracticeQuestion } from "@/lib/types/question"
import { generateFingerprint } from "@/lib/utils/fingerprint"
import { requireSchedulerOrAdmin } from "@/lib/api-auth"

const BATCH_SIZE = 500

export async function POST(request: NextRequest) {
  const gate = await requireSchedulerOrAdmin(request)
  if (!gate.ok) return gate.response
  try {
    const { getAdminDb } = await import("@/lib/db-admin")

    // --- 2. Parse request body ---
    const body = await request.json()
    const { questions, duplicateAction } = body as {
      questions: PracticeQuestion[]
      duplicateAction: "skip" | "replace" | "import-as-new"
    }

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "No questions provided" }, { status: 400 })
    }

    const db = getAdminDb()
    const collection = db.collection("practiceQuestions")

    // --- 3. Group by exam+subject and check duplicates in Firestore ---
    const groups = new Map<string, PracticeQuestion[]>()
    questions.forEach((q) => {
      const key = `${q.exam}|${q.subject}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(q)
    })

    const fingerprintsToSkip = new Set<string>()
    const fingerprintsToReplace = new Map<string, string>()

    for (const [, group] of groups) {
      const exam = group[0].exam
      const subject = group[0].subject
      const existing = await fetchExistingFingerprints(collection, exam, subject)

      for (const q of group) {
        const fp = generateFingerprint({
          exam: q.exam, year: q.year, subject: q.subject, question: q.question,
        })

        if (existing.has(fp)) {
          if (duplicateAction === "skip") {
            fingerprintsToSkip.add(fp)
          } else if (duplicateAction === "replace") {
            fingerprintsToReplace.set(fp, existing.get(fp)!)
          }
        }
      }
    }

    // --- 4. Filter and prepare questions for import ---
    const questionsToImport: PracticeQuestion[] = []
    let skippedCount = 0
    let replacedCount = 0

    for (const q of questions) {
      const fp = generateFingerprint({
        exam: q.exam, year: q.year, subject: q.subject, question: q.question,
      })

      if (duplicateAction === "skip" && fingerprintsToSkip.has(fp)) {
        skippedCount++
        continue
      }

      if (duplicateAction === "replace" && fingerprintsToReplace.has(fp)) {
        await collection.doc(fingerprintsToReplace.get(fp)!).delete()
        replacedCount++
      }

      questionsToImport.push(q)
    }

    // --- 5. Batch write to Firestore ---
    let importedCount = 0
    let failedCount = 0
    const failures: string[] = []

    for (let i = 0; i < questionsToImport.length; i += BATCH_SIZE) {
      const batch = db.batch()
      const batchItems = questionsToImport.slice(i, i + BATCH_SIZE)
      const now = new Date()

      batchItems.forEach((q) => {
        const docRef = collection.doc()
        batch.set(docRef, {
          questionId: docRef.id,
          id: docRef.id,
          exam: q.exam,
          year: q.year,
          subject: q.subject,
          topic: q.topic || null,
          questionNumber: q.questionNumber || null,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || null,
          paper: q.paper || null,
          difficulty: q.difficulty || null,
          source: q.source || null,
          fingerprint: generateFingerprint({
            exam: q.exam, year: q.year, subject: q.subject, question: q.question,
          }),
          createdAt: q.createdAt || now,
          updatedAt: q.updatedAt || now,
        })
      })

      try {
        await batch.commit()
        importedCount += batchItems.length
      } catch (batchError: any) {
        failedCount += batchItems.length
        failures.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchError.message}`)
      }
        }

    return NextResponse.json({
      success: true,
      imported: importedCount,
      skipped: skippedCount,
      replaced: replacedCount,
      failed: failedCount,
      failures,
      duplicateAction,
    })
  } catch (error: any) {
    console.error("Import error:", error)
    const status = error.status || 500
    return NextResponse.json({ error: `Import failed: ${error.message}` }, { status })
  }
}

/**
 * Query Firestore for existing questions with the given exam+subject.
 * Returns a Map of fingerprint → document ID.
 * Paginates through all matching documents (handles large collections).
 */
async function fetchExistingFingerprints(
  collection: any,
  exam: string,
  subject: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  let lastDoc: any = null

  while (true) {
    let query: any = collection
      .where("exam", "==", exam)
      .where("subject", "==", subject)
      .limit(BATCH_SIZE)

    if (lastDoc) {
      query = query.startAfter(lastDoc)
    }

    const snapshot = await query.get()

    for (const doc of snapshot.docs) {
      const data = doc.data()
      const fp = data.fingerprint || generateFingerprint({
        exam: data.exam, year: data.year, subject: data.subject, question: data.question,
      })
      result.set(fp, doc.id)
    }

    if (snapshot.size < BATCH_SIZE) break
    lastDoc = snapshot.docs[snapshot.docs.length - 1] || null
  }

  return result
}

