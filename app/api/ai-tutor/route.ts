/**
 * Explains a question a student just got wrong.
 *
 * This was an open proxy onto a paid Groq key: no authentication, no rate limit,
 * and a caller-supplied prompt. Anyone who found the URL could spend the account's
 * inference budget indefinitely. It now requires a signed-in account, and the text
 * that goes into the prompt is length-capped so a large body cannot be used to run
 * up a bill either.
 */
import { NextResponse } from 'next/server'
import { aiKey, aiModel, aiVisionModel, chatCompletion, transcribeAudio } from "@/lib/ai-provider"

import { requireUser } from '@/lib/api-auth'

// Initialize Groq API
const apiKey = aiKey

/** Trimmed to keep a caller from paying for someone else's essay. */
const cap = (value: unknown, limit: number) => String(value ?? "").slice(0, limit)

export async function POST(req: Request) {
  const gate = await requireUser(req)
  if (!gate.ok) return gate.response

  try {
    const { question, selectedAnswer, correctAnswer, options, subject } = await req.json()

    if (!apiKey) {
      return NextResponse.json(
        { error: "AI Tutor is currently unavailable (API key not configured)" },
        { status: 503 }
      )
    }

    /* `options.A` on a request without an options object threw a 500. */
    const choices = (options ?? {}) as Record<string, string>
    if (!question || !correctAnswer) {
      return NextResponse.json({ error: "Missing question or answer." }, { status: 400 })
    }

    // Construct prompt
    const prompt = `
    You are AeroLearn's friendly, encouraging AI tutor helping a high school student in Nigeria studying for ${cap(subject, 60)} exams (like WAEC or JAMB).

    Question: ${cap(question, 1500)}
    Options:
    A: ${cap(choices.A, 400)}
    B: ${cap(choices.B, 400)}
    C: ${cap(choices.C, 400)}
    D: ${cap(choices.D, 400)}

    The student incorrectly chose: Option ${cap(selectedAnswer, 4)} (${cap(choices[String(selectedAnswer)], 400)})
    The correct answer is: Option ${cap(correctAnswer, 4)} (${cap(choices[String(correctAnswer)], 400)})

    Provide a brief, supportive, and easy-to-understand explanation of WHY the correct answer is correct, and gently point out the misconception that might have led them to choose the wrong answer.
    Keep your response under 4 sentences. Speak directly to the student in a positive tone. Do not use markdown formatting, just plain text.
    `

    const completion = await chatCompletion({
      messages: [{ role: "user", content: prompt }],
      model: aiModel,
    });

    const aiResponse = completion.choices[0]?.message?.content || "";

    return NextResponse.json({ explanation: aiResponse })
  } catch (error: any) {
    console.error("AI Tutor Error:", error)
    return NextResponse.json(
      { error: "Failed to generate explanation. Please try again." },
      { status: 500 }
    )
  }
}
