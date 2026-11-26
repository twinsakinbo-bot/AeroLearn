import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/api-auth"
import { getAdminDb } from "@/lib/db-admin"
import { lagosDayKey, nextLoginStreak } from "@/lib/streak"

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (!gate.ok) return gate.response
  const uid = gate.uid
  try {

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
    return NextResponse.json({ error: "Could not save your progress. Please try again." }, { status: 500 })
  }
}
