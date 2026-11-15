import { getSupabaseServer } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseServer()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user's referral code
    const { data: profile } = await supabase
      .from("profiles")
      .select("referral_code, referral_count")
      .eq("id", user.id)
      .single()

    // If no referral code exists, generate one
    let referralCode = profile?.referral_code
    if (!referralCode) {
      referralCode = generateReferralCode()
      await supabase
        .from("profiles")
        .update({ referral_code: referralCode })
        .eq("id", user.id)
    }

    // Get referred users
    const { data: referrals } = await supabase
      .from("profiles")
      .select("created_at, display_name")
      .eq("referred_by", user.id)
      .order("created_at", { ascending: false })

    return NextResponse.json({
      referralCode,
      referralCount: referrals?.length || 0,
      referrals: referrals || [],
      rewardsEarned: Math.floor((referrals?.length || 0) / 3),
    })
  } catch (error) {
    console.error("Referral fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch referral data" }, { status: 500 })
  }
}

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
