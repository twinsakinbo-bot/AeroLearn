import { getSupabaseServer } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServer()
    
    // Fetch 10 random demo questions across popular subjects
    const { data: questions, error } = await supabase
      .from("questions")
      .select("id, question_text, options, correct_answer, explanation, subject, exam_type")
      .in("subject", ["Mathematics", "English", "Chemistry", "Physics", "Biology"])
      .in("exam_type", ["JAMB", "WAEC"])
      .limit(10)

    if (error) {
      console.error("Demo questions fetch error:", error)
      return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 })
    }

    // Format questions for frontend
    const formattedQuestions = questions?.map((q) => ({
      id: q.id,
      subject: `${q.exam_type} · ${q.subject}`,
      question: q.question_text,
      options: Array.isArray(q.options) ? q.options : [],
      correct: q.correct_answer,
      explanation: q.explanation || "No explanation available.",
    }))

    return NextResponse.json({ questions: formattedQuestions || [] })
  } catch (error) {
    console.error("Demo API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
