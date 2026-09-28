import { NextRequest, NextResponse } from "next/server"
import { getAdminAuth, getAdminDb } from "@/lib/db-admin"

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
      const today = new Date().toISOString().split("T")[0]
      
      if (data.lastLoginDate === today) {
        // Already logged in today
        return { updated: false }
      }
      
      const newStreak = (data.streak || 0) + 1
      const newCoins = (data.coins || 0) + 10
      
      transaction.update(userRef, {
        lastLoginDate: today,
        streak: newStreak,
        coins: newCoins
      })
      
      return {
        updated: true,
        streak: newStreak,
        coins: newCoins,
        lastLoginDate: today
      }
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Login Gamification Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
