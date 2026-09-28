import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (client) return client
  if (!url || !anon) return null
  client = createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "aerolearn-desktop-auth" },
  })
  return client
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anon)
}

export type ConnectionStatus = "checking" | "online" | "offline" | "demo"

export async function checkConnection(): Promise<ConnectionStatus> {
  const supabase = getSupabase()
  if (!supabase) return "demo"
  try {
    const { error } = await supabase.from("lessons").select("id").limit(1)
    if (error) return "offline"
    return "online"
  } catch {
    return "offline"
  }
}
