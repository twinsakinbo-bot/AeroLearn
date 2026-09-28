/**
 * The AI assistant behind the chat bubble, the lesson-page helper and the
 * messages screen.
 *
 * It did check for a token, but with its own copy of the fifteen lines four
 * routes each carried separately; it now shares `requireUser`, which also fixes
 * the status code — an expired token was answered with 403, and a client cannot
 * tell "sign in again" from "you are not allowed" by that.
 *
 * The real hole was the voice-note path: `fetch(mediaUrl)` on a caller-supplied
 * URL, from inside the server's network, is server-side request forgery, and the
 * transcript came back in the reply. It goes through `safeFetch` now, with a size
 * cap — a voice note is a few hundred kilobytes and an unbounded `blob()` is a
 * way to exhaust the server's memory.
 *
 * Also fixed: the lesson-page branch called `content.substring(0, 3000)`, so a
 * request with a `topicTitle` and no `content` returned a 500; every field that
 * reaches the prompt is now length-capped rather than trusted.
 *
 * Left alone deliberately: `llama-3.2-11b-vision-preview` on the image path is a
 * preview model name and may no longer be served. Picking its replacement is a
 * decision about cost and quality, not a bug fix.
 */
import { NextResponse } from "next/server"
import Groq from "groq-sdk"

import { requireUser } from "@/lib/api-auth"
import { FetchRefused, safeFetch } from "@/lib/safe-fetch"

const apiKey = process.env.GROQ_API_KEY || ""
const groq = new Groq({ apiKey })

/** A voice note that does not fit in this is not a voice note. */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024

const cap = (value: unknown, limit: number) => String(value ?? "").trim().slice(0, limit)

/** The image path hands the URL to Groq, so it only has to be a real web URL. */
function webUrlOrNull(raw: unknown): string | null {
  try {
    const parsed = new URL(String(raw))
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const gate = await requireUser(req)
  if (!gate.ok) return gate.response

  try {
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI is currently unavailable (API key not configured)" },
        { status: 503 },
      )
    }

    const body = await req.json()
    const mediaType = cap(body?.mediaType, 20)
    const mediaUrl = webUrlOrNull(body?.mediaUrl)
    const message = cap(body?.message, 2000)
    const userMessage = cap(body?.userMessage, 2000)
    const topicTitle = cap(body?.topicTitle, 200)
    const subject = cap(body?.subject, 60)
    const content = cap(body?.content, 3000)

    let prompt = ""

    if (mediaType === "audio" && mediaUrl) {
      let transcribedText: string
      try {
        const audio = await safeFetch(mediaUrl, { maxBytes: MAX_AUDIO_BYTES, timeoutMs: 10000 })
        const file = new File([audio.bytes], "audio.webm", { type: "audio/webm" })
        const transcription = await groq.audio.transcriptions.create({
          file,
          model: "distil-whisper-large-v3-en",
        })
        transcribedText = transcription.text
      } catch (error) {
        if (error instanceof FetchRefused) {
          return NextResponse.json({ error: error.message }, { status: error.status })
        }
        throw error
      }

      prompt = `
      You are the Aerolearn AI Assistant, a helpful AI tutor for high school students in Nigeria.
      The student sent you a voice note which was transcribed as: "${transcribedText}"

      Respond to the student's voice note in a helpful, friendly, and educational manner. Keep it concise and conversational.
      `
    } else if (topicTitle) {
      // From the lesson page's floating chat
      prompt = `
      You are Aerolearn's AI Tutor helping a Nigerian high school student.
      Context: The student is learning ${subject || "this subject"}, specifically the topic "${topicTitle}".
      Lesson Content: ${content}

      Student's question: ${userMessage}

      Respond directly, simply, and conversationally in a helpful and encouraging tone. Keep it concise.
      DO NOT use markdown tables or complex formatting. Use plain text paragraphs and simple bold text if necessary.
      `
    } else {
      // From the messages page
      prompt = `
      You are the Aerolearn AI Assistant, a helpful AI tutor for high school students in Nigeria.
      The student sent you this message: "${message}"

      Respond in a helpful, friendly, and educational manner. Keep it concise and conversational.
      `
    }

    const isImage = Boolean(mediaUrl) && mediaType !== "audio"
    const model = isImage ? "llama-3.2-11b-vision-preview" : "openai/gpt-oss-120b"

    const completion = await groq.chat.completions.create({
      messages: isImage
        ? [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: mediaUrl as string } },
              ],
            },
          ]
        : [{ role: "user", content: prompt }],
      model,
    })

    return NextResponse.json({ reply: completion.choices[0]?.message?.content || "" })
  } catch (error) {
    console.error("AI Error:", error)
    return NextResponse.json({ error: "Failed to generate AI response" }, { status: 500 })
  }
}
