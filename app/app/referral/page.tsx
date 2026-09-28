"use client"

import { useEffect, useState } from "react"
import { Gift, Copy, Check, Share2, Users } from "lucide-react"
import Link from "next/link"

interface ReferralData {
  referralCode: string
  referralCount: number
  rewardsEarned: number
  referrals: Array<{ created_at: string; display_name: string }>
}

export default function ReferralPage() {
  const [data, setData] = useState<ReferralData | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/referral")
      .then((res) => res.json())
      .then((data) => {
        setData(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const referralLink = data
    ? `${window.location.origin}/auth/signup?ref=${data.referralCode}`
    : ""

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareWhatsApp = () => {
    const message = encodeURIComponent(
      `🚀 Join me on AeroLearn! Get full access to WAEC, NECO & JAMB prep materials. Sign up with my link: ${referralLink}`
    )
    window.open(`https://wa.me/?text=${message}`, "_blank")
  }

  const shareTwitter = () => {
    const message = encodeURIComponent(
      `Preparing for WAEC, NECO or JAMB? Join me on @AeroLearnNG 🚀 ${referralLink}`
    )
    window.open(`https://twitter.com/intent/tweet?text=${message}`, "_blank")
  }

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-16">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-surface-sunken" />
          <div className="h-4 w-96 rounded bg-surface-sunken" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-16">
        <p className="text-muted">Failed to load referral data.</p>
      </div>
    )
  }

  const nextRewardIn = 3 - (data.referralCount % 3)

  return (
    <div className="container mx-auto max-w-4xl px-4 py-16">
      <div className="mb-8">
        <h1 className="text-display text-foreground">Invite Friends, Earn Rewards</h1>
        <p className="mt-2 text-body-lg text-muted">
          Get <strong className="text-foreground">1 free Pro month</strong> for every 3 friends who
          sign up with your link.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="card p-6">
          <Users className="h-8 w-8 text-brand" aria-hidden="true" />
          <p className="mt-4 text-h2 font-bold text-foreground">{data.referralCount}</p>
          <p className="text-body-sm text-muted">Friends referred</p>
        </div>

        <div className="card p-6">
          <Gift className="h-8 w-8 text-accent" aria-hidden="true" />
          <p className="mt-4 text-h2 font-bold text-foreground">{data.rewardsEarned}</p>
          <p className="text-body-sm text-muted">Pro months earned</p>
        </div>

        <div className="card p-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warn/20 text-warn">
            <span className="text-body-sm font-bold">{nextRewardIn}</span>
          </div>
          <p className="mt-4 text-h4 font-bold text-foreground">
            {nextRewardIn === 1 ? "1 more" : `${nextRewardIn} more`}
          </p>
          <p className="text-body-sm text-muted">Until next reward</p>
        </div>
      </div>

      <div className="card mt-8 p-8">
        <h2 className="text-h3 text-foreground">Your Referral Link</h2>
        <p className="mt-2 text-body-sm text-muted">
          Share this link with friends. When 3 sign up, you get 1 free Pro month.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            readOnly
            value={referralLink}
            className="flex-1 rounded-lg border border-hairline bg-surface px-4 py-3 text-body-sm text-foreground"
          />
          <button onClick={copyLink} className="btn-secondary flex items-center gap-2">
            {copied ? (
              <>
                <Check className="h-4 w-4" aria-hidden="true" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copy Link
              </>
            )}
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={shareWhatsApp} className="btn-secondary flex items-center gap-2">
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Share on WhatsApp
          </button>
          <button onClick={shareTwitter} className="btn-secondary flex items-center gap-2">
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Share on Twitter
          </button>
        </div>
      </div>

      {data.referrals.length > 0 && (
        <div className="card mt-8 p-8">
          <h2 className="text-h3 text-foreground">Your Referrals</h2>
          <div className="mt-6 space-y-3">
            {data.referrals.map((referral, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-hairline bg-surface px-4 py-3"
              >
                <span className="text-body-sm text-foreground">
                  {referral.display_name || "Anonymous User"}
                </span>
                <span className="text-caption text-muted">
                  {new Date(referral.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-invert mt-8 p-8 text-center">
        <h2 className="text-h3 text-white">How It Works</h2>
        <div className="mx-auto mt-8 grid max-w-2xl gap-6 text-left md:grid-cols-3">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-400/20 text-accent-300 font-bold">
              1
            </div>
            <p className="mt-3 text-body-sm text-ink-300">
              Share your unique referral link with friends
            </p>
          </div>
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-400/20 text-accent-300 font-bold">
              2
            </div>
            <p className="mt-3 text-body-sm text-ink-300">
              They sign up and start learning on AeroLearn
            </p>
          </div>
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-400/20 text-accent-300 font-bold">
              3
            </div>
            <p className="mt-3 text-body-sm text-ink-300">
              For every 3 signups, you get 1 free Pro month
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
