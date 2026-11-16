/** Server-only Coarena chat client and optional Aether audio transcription. */
const COARENA_BASE = "https://coarena.ai/api/v1"
const AETHER_BASE = "https://obasi-ai.vercel.app/api/v1"

const coarenaKey = process.env.COARENA_API_KEY?.trim() || ""
const legacyKey = process.env.AETHER_API_KEY?.trim() || ""
export const aiKey = coarenaKey || legacyKey
export const aiModel = coarenaKey
  ? process.env.COARENA_MODEL?.trim() || "mimo-v2-6-pro"
  : process.env.AETHER_MODEL?.trim() || "aether-minimax-m3-1-flash"
export const aiVisionModel = coarenaKey
  ? process.env.COARENA_VISION_MODEL?.trim() || aiModel
  : process.env.AETHER_VISION_MODEL?.trim() || aiModel
const backupModel = process.env.COARENA_BACKUP_MODEL?.trim() || "gpt-6-luna"

type Message = { role: "system" | "user" | "assistant"; content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> }

export async function chatCompletion(options: {
  messages: Message[]
  model?: string
  temperature?: number
  max_tokens?: number
  response_format?: { type: "json_object" }
}, timeoutMs = 60_000) {
  if (!aiKey) throw new Error("COARENA_API_KEY is not configured")
  const request = async (model: string, budgetMs: number, useCoarena: boolean) => {
    const response = await fetch(`${useCoarena ? COARENA_BASE : AETHER_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${useCoarena ? coarenaKey : legacyKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...options, model }),
      cache: "no-store",
      signal: AbortSignal.timeout(budgetMs),
    })
    if (!response.ok) throw new Error(`${useCoarena ? "Coarena" : "Aether"} ${model} request failed (${response.status})`)
    const result = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> }
    if (!result.choices?.[0]?.message?.content) throw new Error(`${useCoarena ? "Coarena" : "Aether"} ${model} returned no answer`)
    return result as { choices: Array<{ message: { content: string | null } }> }
  }

  const primaryModel = options.model || aiModel
  // Keep the existing gateway live until a Coarena key is installed in Vercel.
  if (!coarenaKey) return request(primaryModel, timeoutMs, false)
  if (primaryModel === backupModel) return request(primaryModel, timeoutMs, true)
  const startedAt = Date.now()
  try {
    return await request(primaryModel, Math.ceil(timeoutMs * 0.6), true)
  } catch (primaryError) {
    const remainingMs = timeoutMs - (Date.now() - startedAt)
    if (remainingMs < 5_000) throw primaryError
    try {
      return await request(backupModel, remainingMs, true)
    } catch (backupError) {
      throw new Error(`Coarena primary and backup models failed: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}; ${backupError instanceof Error ? backupError.message : String(backupError)}`)
    }
  }
}

export async function transcribeAudio(file: File): Promise<string> {
  const aetherKey = process.env.AETHER_API_KEY?.trim()
  if (!aetherKey) throw new Error("AETHER_API_KEY is not configured")
  const model = process.env.AETHER_TRANSCRIPTION_MODEL?.trim()
  if (!model) throw new Error("AETHER_TRANSCRIPTION_MODEL is not configured")
  const form = new FormData()
  form.append("model", model)
  form.append("file", file)
  const response = await fetch(`${AETHER_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${aetherKey}` },
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`Aether transcription failed (${response.status})`)
  const data = await response.json() as { text?: string }
  if (!data.text) throw new Error("Aether returned no transcription")
  return data.text
}
