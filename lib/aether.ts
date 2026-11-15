/** Server-only client for the owner's OpenAI-compatible Aether gateway. */
const BASE = "https://obasi-ai.vercel.app/api/v1"

export const aetherKey = process.env.AETHER_API_KEY?.trim() || ""
export const aetherModel = process.env.AETHER_MODEL?.trim() || "auto"
export const aetherVisionModel = process.env.AETHER_VISION_MODEL?.trim() || aetherModel

type Message = { role: "system" | "user" | "assistant"; content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> }

export async function chatCompletion(options: {
  messages: Message[]
  model?: string
  temperature?: number
  max_tokens?: number
  response_format?: { type: "json_object" }
}) {
  if (!aetherKey) throw new Error("AETHER_API_KEY is not configured")
  const response = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${aetherKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: aetherModel, ...options }),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`Aether chat request failed (${response.status})`)
  return response.json() as Promise<{ choices: Array<{ message: { content: string | null } }> }>
}

export async function transcribeAudio(file: File): Promise<string> {
  if (!aetherKey) throw new Error("AETHER_API_KEY is not configured")
  const model = process.env.AETHER_TRANSCRIPTION_MODEL?.trim()
  if (!model) throw new Error("AETHER_TRANSCRIPTION_MODEL is not configured")
  const form = new FormData()
  form.append("model", model)
  form.append("file", file)
  const response = await fetch(`${BASE}/audio/transcriptions`, {
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
