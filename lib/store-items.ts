import { Atom, Crown, Flame, FlaskConical, Gem, Lightbulb, ShieldCheck, Star, Trophy, type LucideIcon } from "lucide-react"

/**
 * What the coin store sells.
 *
 * The catalogue used to list twelve items; six of them did nothing at all. Both
 * XP boosts wrote (or, for the x3, did not even write) an `xpBoostExpiresAt`
 * field that no XP award anywhere in the app reads, so a student paid 350 or 800
 * coins for the same XP they already earned. Both themes wrote `equippedTheme`,
 * which is read nowhere. The three mock-exam passes at 1,500 coins each existed
 * only in this array — the mock-exams page never looks at anyone's inventory,
 * and its exams are free to start. Taking a student's earned currency for
 * nothing is worse than having a small store, so the catalogue now lists only
 * what the app genuinely honours:
 *
 *   - `streak_freeze`  spent by the login endpoint to cover one missed day
 *   - `*_frame`        drawn around the avatar on the profile and leaderboard
 *   - `title_*`        shown under the name on the profile and community pages
 *
 * If boosts, themes or exam passes come back, they need the code that honours
 * them first, and then an entry here.
 */

export type StoreCategory = "Power-ups" | "Cosmetics"

/** Cosmetics are worn one per slot, so equipping one replaces the last. */
export type EquipSlot = "frame" | "title"

export type StoreItem = {
  id: string
  name: string
  /** What it does, in terms of something the app actually implements. */
  description: string
  price: number
  category: StoreCategory
  icon: LucideIcon
  slot?: EquipSlot
  /** Spent by the app rather than worn, so it can be bought again afterwards. */
  consumable?: boolean
}

/** The profile field each slot is stored in. */
export const EQUIP_FIELD = {
  frame: "equippedFrame",
  title: "equippedTitle",
} as const satisfies Record<EquipSlot, string>

export type EquipField = (typeof EQUIP_FIELD)[EquipSlot]

/**
 * Titles and their labels, in one place. The profile and community pages each
 * had their own inline `id === "title_math_genius" ? … : "Scholar"` ladder and
 * both were missing Speed Demon, so that title showed up as someone else's.
 */
export const STORE_TITLES: Record<string, string> = {
  title_math_genius: "Math Genius",
  title_jamb_scholar: "JAMB Scholar",
  title_speed_demon: "Speed Demon",
  title_science_explorer: "Science Explorer",
  title_chemistry_whiz: "Chemistry Whiz",
  title_problem_solver: "Problem Solver",
}

export function titleLabel(id?: string | null): string | null {
  if (!id) return null
  return STORE_TITLES[id] ?? null
}

export function frameClass(id?: string | null): string {
  if (id === "gold_frame") return "ring-2 ring-coin ring-offset-2 ring-offset-surface"
  if (id === "sapphire_frame") return "ring-2 ring-blue-500 ring-offset-2 ring-offset-surface"
  if (id === "emerald_frame") return "ring-2 ring-emerald-500 ring-offset-2 ring-offset-surface"
  return "border border-hairline"
}

export const STORE_ITEMS: StoreItem[] = [
  {
    id: "streak_freeze",
    name: "Streak freeze",
    description:
      "Covers one missed day. Sign in the day after that missed day to keep your streak; the freeze is then used.",
    price: 200,
    category: "Power-ups",
    icon: ShieldCheck,
    consumable: true,
  },
  {
    id: "gold_frame",
    name: "Gold frame",
    description: "A gold ring around your photo on your profile and the community leaderboard.",
    price: 500,
    category: "Cosmetics",
    icon: Crown,
    slot: "frame",
  },
  { id: "sapphire_frame", name: "Sapphire frame", description: "A blue ring around your photo on your profile and the community leaderboard.", price: 450, category: "Cosmetics", icon: Gem, slot: "frame" },
  { id: "emerald_frame", name: "Emerald frame", description: "A green ring around your photo on your profile and the community leaderboard.", price: 450, category: "Cosmetics", icon: Gem, slot: "frame" },
  {
    id: "title_math_genius",
    name: "“Math Genius” title",
    description: "Sits under your name on your profile and in the community.",
    price: 300,
    category: "Cosmetics",
    icon: Star,
    slot: "title",
  },
  {
    id: "title_jamb_scholar",
    name: "“JAMB Scholar” title",
    description: "For serious exam candidates. Shown under your name on your profile and in the community.",
    price: 400,
    category: "Cosmetics",
    icon: Trophy,
    slot: "title",
  },
  {
    id: "title_speed_demon",
    name: "“Speed Demon” title",
    description: "For the fastest finishers. Shown under your name on your profile and in the community.",
    price: 300,
    category: "Cosmetics",
    icon: Flame,
    slot: "title",
  },
  { id: "title_science_explorer", name: "“Science Explorer” title", description: "Shown under your name on your profile and in the community.", price: 350, category: "Cosmetics", icon: Atom, slot: "title" },
  { id: "title_chemistry_whiz", name: "“Chemistry Whiz” title", description: "Shown under your name on your profile and in the community.", price: 350, category: "Cosmetics", icon: FlaskConical, slot: "title" },
  { id: "title_problem_solver", name: "“Problem Solver” title", description: "Shown under your name on your profile and in the community.", price: 350, category: "Cosmetics", icon: Lightbulb, slot: "title" },
]

export const STORE_FILTERS = ["All", "Power-ups", "Cosmetics"] as const

export type StoreFilter = (typeof STORE_FILTERS)[number]
