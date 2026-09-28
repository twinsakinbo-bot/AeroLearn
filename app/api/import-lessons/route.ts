import { NextRequest, NextResponse } from "next/server"
import { Lesson } from "@/lib/types/lesson"

const BATCH_SIZE = 500

export async function POST(request: NextRequest) {
  // --- 1. Verify admin auth ---
  const authHeader = request.headers.get("authorization")
  const idToken = authHeader?.replace("Bearer ", "")

  if (!idToken) {
    return NextResponse.json({ error: "No auth token provided" }, { status: 401 })
  }

  try {
    const { getAdminDb, getAdminAuth } = await import("@/lib/db-admin")
    const decoded = await getAdminAuth().verifyIdToken(idToken)

    const userSnap = await getAdminDb().collection("users").doc(decoded.uid).get()
    const role = userSnap.exists ? userSnap.data()?.role : undefined
    if (role !== "admin") {
      return NextResponse.json({ error: "Unauthorized: admin access required" }, { status: 403 })
    }

    // --- 2. Parse request body ---
    const body = await request.json()
    const { lessons, duplicateAction } = body as {
      lessons: Lesson[]
      duplicateAction: "skip" | "replace" | "import-as-new"
    }

    if (!lessons || !Array.isArray(lessons) || lessons.length === 0) {
      return NextResponse.json({ error: "No lessons provided" }, { status: 400 })
    }

    const db = getAdminDb()
    const collection = db.collection("lessons")

    // --- 3. Check duplicates in Firestore based on subject, classLevel, and topicTitle ---
    const existingMap = new Map<string, string>() // fingerprint -> docId
    const querySnapshot = await collection.get() // For large collections, we'd paginate, but lessons shouldn't be huge

    querySnapshot.docs.forEach(doc => {
      const data = doc.data()
      const fp = `${data.subject}|${data.classLevel}|${data.topicTitle}`.toLowerCase()
      existingMap.set(fp, doc.id)
    })

    const fingerprintsToSkip = new Set<string>()
    const fingerprintsToReplace = new Map<string, string>()

    for (const l of lessons) {
      const fp = `${l.subject}|${l.classLevel}|${l.topicTitle}`.toLowerCase()
      if (existingMap.has(fp)) {
        if (duplicateAction === "skip") {
          fingerprintsToSkip.add(fp)
        } else if (duplicateAction === "replace") {
          fingerprintsToReplace.set(fp, existingMap.get(fp)!)
        }
      }
    }

    // --- 4. Filter and prepare lessons for import ---
    const lessonsToImport: Lesson[] = []
    let skippedCount = 0
    let replacedCount = 0

    for (const l of lessons) {
      const fp = `${l.subject}|${l.classLevel}|${l.topicTitle}`.toLowerCase()

      if (duplicateAction === "skip" && fingerprintsToSkip.has(fp)) {
        skippedCount++
        continue
      }

      if (duplicateAction === "replace" && fingerprintsToReplace.has(fp)) {
        await collection.doc(fingerprintsToReplace.get(fp)!).delete()
        replacedCount++
      }

      lessonsToImport.push(l)
    }

    // --- 5. Batch write to Firestore ---
    let importedCount = 0
    let failedCount = 0
    const failures: string[] = []

    for (let i = 0; i < lessonsToImport.length; i += BATCH_SIZE) {
      const batch = db.batch()
      const batchItems = lessonsToImport.slice(i, i + BATCH_SIZE)
      const now = new Date()

      batchItems.forEach((l) => {
        const docRef = collection.doc()
        batch.set(docRef, {
          id: docRef.id,
          subject: l.subject,
          classLevel: l.classLevel,
          term: l.term,
          topicTitle: l.topicTitle,
          content: l.content,
          examples: l.examples || [],
          homework: l.homework || [],
          /* `videoUrl` used to be dropped here, so a lesson file that carried a
             video imported without one and the loss was silent. */
          videoUrl: l.videoUrl || "",
          createdAt: l.createdAt || now,
          updatedAt: l.updatedAt || now,
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
