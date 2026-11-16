import { NextRequest, NextResponse } from "next/server"
import { getAdminAuth, getAdminDb } from "@/lib/db-admin"
import { lagosDayKey, nextLoginStreak } from "@/lib/streak"

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization")
    const idToken = authHeader?.replace("Bearer ", "")

    if (!idToken) {
      return NextResponse.json({ error: "No auth token provided" }, { status: 401 })
    }

    const decoded = await getAdminAuth().verifyIdToken(idToken)
    const uid = decoded.uid

    const db = getAdminDb()
    const userRef = db.collection("users").doc(uid)
    
    // We run a transaction to avoid race conditions with daily streaks
    const result = await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef)
      if (!userDoc.exists) {
        throw new Error("User does not exist")
      }
      
      const data = userDoc.data()!
      const today = lagosDayKey()
      const result = nextLoginStreak(data, today)
      if (!result.updated) return { ...result, lastLoginDate: today }
      transaction.update(userRef, {
        lastLoginDate: today,
        lastActiveDate: today,
        streak: result.streak,
        longestStreak: result.longestStreak,
        coins: result.coins,
        inventory: result.inventory,
      })
      return { ...result, lastLoginDate: today }
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Login Gamification Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
