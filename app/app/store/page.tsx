"use client"
import { retailReward } from "@/lib/retail-rewards"

import { useEffect, useState } from "react"
import { auth, onAuthStateChanged } from "@/lib/auth"
import { db, doc, getDoc, updateDoc } from "@/lib/db"
import { AlertCircle, Check, Coins, Loader2, ShoppingBag } from "lucide-react"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { Tabs } from "@/components/ui/tabs"
import {
  EQUIP_FIELD,
  STORE_FILTERS,
  STORE_ITEMS,
  type EquipField,
  type StoreFilter,
  type StoreItem,
} from "@/lib/store-items"
import { cn } from "@/lib/utils"

/** Purchases are validated and committed by the server; equipment selection is a display preference. */

type Banner = { tone: "success" | "error"; text: string }

const FILTER_TABS = STORE_FILTERS.map((value) => ({
  value,
  label: value,
  count: value === "All" ? STORE_ITEMS.length : STORE_ITEMS.filter((item) => item.category === value).length,
}))

export default function StorePage() {
  const [uid, setUid] = useState<string | null>(null)
  const [balance, setBalance] = useState(0)
  const [inventory, setInventory] = useState<string[]>([])
  const [equipped, setEquipped] = useState<Record<EquipField, string | null>>({
    equippedFrame: null,
    equippedTitle: null,
  })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StoreFilter>("All")
  const [busy, setBusy] = useState<string | null>(null)
  const [banner, setBanner] = useState<Banner | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUid(null)
        setLoading(false)
        return
      }
      setUid(user.uid)
      try {
        const snap = await getDoc(doc(db, "users", user.uid))
        const data = snap.data()
        if (data) {
          setBalance(data.coins ?? 0)
          setInventory(data.inventory ?? [])
          setEquipped({
            equippedFrame: data.equippedFrame ?? null,
            equippedTitle: data.equippedTitle ?? null,
          })
        }
      } catch (error) {
        console.error("Failed to load your wallet:", error)
        setBanner({ tone: "error", text: "We could not read your coin balance. Reload the page." })
      } finally {
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [])

  const buy = async (item: StoreItem) => {
    if (!uid || busy) return
    setBusy(item.id)
    setBanner(null)
    try {
      /* Read and write in one transaction, so the price comes off whatever the
         balance actually is at that moment rather than what this page last saw. */
      const { balance: left } = await retailReward("purchase", { item: item.id })

      setBalance(left)
      setInventory((owned) => (owned.includes(item.id) ? owned : [...owned, item.id]))
      setBanner({
        tone: "success",
        text: item.slot ? `${item.name} is yours — wear it below.` : `${item.name} is yours.`,
      })
    } catch (error) {
      console.error("Purchase failed:", error)
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "The purchase did not go through.",
      })
    } finally {
      setBusy(null)
    }
  }

  /* One item per slot, so wearing a second title takes the first one off. */
  const toggleEquip = async (item: StoreItem) => {
    if (!uid || !item.slot || busy) return
    const field = EQUIP_FIELD[item.slot]
    const next = equipped[field] === item.id ? null : item.id

    setBusy(item.id)
    setBanner(null)
    try {
      await updateDoc(doc(db, "users", uid), { [field]: next })
      setEquipped((prev) => ({ ...prev, [field]: next }))
      setBanner({
        tone: "success",
        text: next ? `You are wearing the ${item.name}.` : `${item.name} taken off.`,
      })
    } catch (error) {
      console.error("Failed to save what you are wearing:", error)
      setBanner({ tone: "error", text: "That did not save. Try again." })
    } finally {
      setBusy(null)
    }
  }

  const items = filter === "All" ? STORE_ITEMS : STORE_ITEMS.filter((item) => item.category === filter)

  if (loading) return <LoadingState full text="Opening the store…" />

  if (!uid) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Sign in to spend your coins"
        description="Your coin balance and everything you own live on your account."
        actionText="Sign in"
        actionHref="/auth/login"
      />
    )
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Store"
        title="Spend your Aero coins"
        subtitle="Coins come from correct answers, finished lessons and weekly challenges. Everything on this shelf does something in the app."
        actions={
          <span className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface-sunken px-3.5 py-2">
            <Coins size={16} className="text-coin" aria-hidden="true" />
            <span className="text-body-sm font-semibold tabular-nums text-foreground">
              {balance.toLocaleString()}
            </span>
            <span className="text-caption text-muted">coins</span>
          </span>
        }
      />

      {banner && (
        <p
          role={banner.tone === "error" ? "alert" : "status"}
          className={cn(
            "mb-6 flex items-start gap-2.5 rounded-lg border px-4 py-3 text-body-sm",
            banner.tone === "error"
              ? "border-danger/30 bg-danger/[0.06] text-danger"
              : "border-success/30 bg-success/[0.06] text-success",
          )}
        >
          {banner.tone === "error" ? (
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          ) : (
            <Check size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          )}
          {banner.text}
        </p>
      )}

      <Tabs options={FILTER_TABS} value={filter} onChange={setFilter} ariaLabel="Item type" />

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const owned = inventory.includes(item.id)
          const worn = Boolean(item.slot && equipped[EQUIP_FIELD[item.slot]] === item.id)
          const short = Math.max(item.price - balance, 0)
          const working = busy === item.id

          return (
            <li key={item.id} className={cn("card flex flex-col p-5", worn && "border-accent/40")}>
              <div className="flex flex-1 items-start gap-3">
                <span
                  className={cn(
                    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
                    owned ? "bg-accent/[0.08] text-accent" : "bg-surface-sunken text-muted",
                  )}
                >
                  <item.icon size={19} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-body font-semibold text-foreground">{item.name}</h2>
                  <p className="mt-1 text-body-sm leading-relaxed text-muted">{item.description}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-4">
                {owned ? (
                  <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-success">
                    <Check size={14} aria-hidden="true" />
                    {item.consumable ? "In your pocket" : "Owned"}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Coins size={15} className="text-coin" aria-hidden="true" />
                    <span className="text-body-sm font-semibold tabular-nums text-foreground">
                      {item.price.toLocaleString()}
                    </span>
                  </span>
                )}

                {owned && item.slot ? (
                  <button
                    type="button"
                    onClick={() => toggleEquip(item)}
                    disabled={working}
                    className={cn("btn-sm", worn ? "btn-secondary" : "btn-primary")}
                  >
                    {working && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                    {worn ? "Take off" : "Wear it"}
                  </button>
                ) : owned ? (
                  <span className="text-caption text-subtle">Spends itself when you need it</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => buy(item)}
                    disabled={working || short > 0}
                    className="btn-primary btn-sm"
                  >
                    {working && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                    {short > 0 ? `${short.toLocaleString()} coins short` : "Buy"}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="card mt-6 p-5 sm:p-6">
        <h2 className="text-body font-semibold text-foreground">Where coins come from</h2>
        <ul className="mt-3 space-y-2">
          <li className="flex items-baseline gap-2 text-body-sm text-muted">
            <span className="shrink-0 font-semibold tabular-nums text-coin">+5</span>
            for every practice question you get right
          </li>
          <li className="flex items-baseline gap-2 text-body-sm text-muted">
            <span className="shrink-0 font-semibold tabular-nums text-coin">+5</span>
            every time you mark a lesson complete
          </li>
          <li className="flex items-baseline gap-2 text-body-sm text-muted">
            <span className="shrink-0 font-semibold tabular-nums text-coin">+2</span>
            per correct answer in a mock exam
          </li>
          <li className="flex items-baseline gap-2 text-body-sm text-muted">
            <span className="shrink-0 font-semibold tabular-nums text-coin">30–100</span>
            from each weekly challenge, in proportion to what you score
          </li>
        </ul>
        <p className="mt-3 border-t border-hairline pt-3 text-caption text-subtle">
          Lessons, mock exams and challenges all need material in the library, which is still being loaded.
          Practice does not, so it is the quickest way to earn today.
        </p>
      </div>
    </div>
  )
}
