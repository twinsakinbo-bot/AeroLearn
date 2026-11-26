import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/api-auth"
import { getAdminDb } from "@/lib/db-admin"

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (!gate.ok) return gate.response
  const uid = gate.uid
  try {
    
    const body = await req.json()
    const type = body.type // 'xp' or 'lessons'

    if (type !== 'xp' && type !== 'lessons') {
      return NextResponse.json({ error: "Invalid claim type" }, { status: 400 })
    }

    const db = getAdminDb()
    const userRef = db.collection("users").doc(uid)
    
    const result = await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef)
      if (!userDoc.exists) {
        throw new Error("User does not exist")
      }
      
      const data = userDoc.data()!
      const xp = data.xp || 0
      const completedLessons = data.completedLessons?.length || 0
      const quests = data.quests || { xpTier: 1, lessonsTier: 1 }
      
      const xpTarget = quests.xpTier * 50
      const lessonsTarget = quests.lessonsTier * 5
      
      let rewardCoins = 0
      const newQuests = { ...quests }
      
      if (type === 'xp') {
        if (xp < xpTarget) {
          throw new Error("XP target not met")
        }
        rewardCoins = quests.xpTier * 20
        newQuests.xpTier += 1
      } else {
        if (completedLessons < lessonsTarget) {
          throw new Error("Lessons target not met")
        }
        rewardCoins = quests.lessonsTier * 30
        newQuests.lessonsTier += 1
      }
      
      const newCoins = (data.coins || 0) + rewardCoins
      
      transaction.update(userRef, {
        quests: newQuests,
        coins: newCoins
      })
      
      return {
        success: true,
        quests: newQuests,
        coins: newCoins,
        reward: rewardCoins
      }
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Claim Gamification Error:", error)
    return NextResponse.json({ error: "Could not save your progress. Please try again." }, { status: 500 })
  }
}
