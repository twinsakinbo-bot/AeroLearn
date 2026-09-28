import { NextRequest, NextResponse } from "next/server"
import { FieldValue, getAdminAuth, getAdminDb } from "@/lib/db-admin"

/**
 * Adds Aero coins to the signed-in student's wallet.
 *
 * This wrote `balance`, a field the app initialises in two places and reads in
 * none — the wallet everything else spends from is `coins`. Challenge winnings
 * were therefore invisible. It also did a read-modify-write of the total and
 * accepted any number the caller sent, so a student could mint an unlimited
 * balance with one request. It is now an `increment` on `coins`, capped at the
 * largest prize the app can legitimately award.
 */

const MAX_AWARD = 100

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const token = authHeader.slice("Bearer ".length)
    const decoded = await getAdminAuth().verifyIdToken(token)

    const { coins, reason } = await req.json()
    if (typeof coins !== "number" || !Number.isInteger(coins) || coins <= 0) {
      return NextResponse.json({ error: "Invalid coins value" }, { status: 400 })
    }
    if (coins > MAX_AWARD) {
      return NextResponse.json({ error: "That is more than any prize awards" }, { status: 400 })
    }

    const adminDb = getAdminDb()
    const userRef = adminDb.collection("users").doc(decoded.uid)
    const userSnap = await userRef.get()

    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Server-resolved, so two awards landing together cannot overwrite each other.
    await userRef.update({ coins: FieldValue.increment(coins) })

    const balance = (userSnap.data()?.coins || 0) + coins
    console.info(`Awarded ${coins} coins to ${decoded.uid}${reason ? `: ${reason}` : ""}`)

    return NextResponse.json({ coins: balance, added: coins })
  } catch (error: any) {
    console.error("Add coins error:", error)
    return NextResponse.json({ error: "Failed to add coins" }, { status: 500 })
  }
}
