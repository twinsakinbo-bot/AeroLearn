import { Check, Coins, ShoppingBag } from "lucide-react"
import { storeItems } from "../data"
import type { DesktopProfile } from "../storage"
import { Page, PageHeading, Panel } from "../ui"

export function Store({
  profile,
  update,
  showToast,
}: {
  profile: DesktopProfile
  update: (patch: Partial<DesktopProfile> | ((current: DesktopProfile) => DesktopProfile), toast?: string) => void
  showToast: (text: string) => void
}) {
  const buy = (id: string, cost: number) => {
    if (profile.storeOwned.includes(id)) return
    if (profile.coins < cost) { showToast("Not enough coins yet"); return }
    update((current) => ({
      ...current,
      coins: current.coins - cost,
      storeOwned: [...current.storeOwned, id],
    }), "Purchased")
  }

  const equip = (item: { id: string; kind: string }) => {
    update((current) => {
      if (item.kind === "avatar-frame") return { ...current, activeFrame: item.id }
      if (item.kind === "theme") return { ...current, activeTheme: item.id }
      return current
    }, "Equipped")
  }

  return (
    <Page>
      <PageHeading overline="Spend those coins" title="Store" subtitle="Frames, themes and boosts you earned." aside={<span className="coin-chip"><Coins size={13} /> {profile.coins}</span>} />
      <div className="store-grid">
        {storeItems.map((item) => {
          const owned = profile.storeOwned.includes(item.id)
          const equipped = (item.kind === "avatar-frame" && profile.activeFrame === item.id) || (item.kind === "theme" && profile.activeTheme === item.id)
          return (
            <div className="store-card" key={item.id}>
              <div className="store-preview">
                <div className="store-swatch" style={{ background: item.swatch }} />
              </div>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <span className="cost"><Coins size={11} /> {item.cost}</span>
                <span className="chip mini">{item.kind.replace("-", " ")}</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  {owned ? (
                    equipped ? (
                      <span className="completed-pill"><Check size={12} /> Equipped</span>
                    ) : (
                      <button className="light-button" onClick={() => equip(item)}>Equip</button>
                    )
                  ) : (
                    <button className="primary-button" onClick={() => buy(item.id, item.cost)}><ShoppingBag size={13} /> Buy</button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ height: 18 }} />
      <Panel title="Earning coins">
        <p className="muted">Coins arrive when you finish lessons, close out practice sessions, sit mock exams, and claim challenges. Everything you own here stays on this device — the store is offline-first.</p>
      </Panel>
    </Page>
  )
}
