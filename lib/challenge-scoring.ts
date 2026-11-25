import { correctLetterOf, type OptionLetter, type StoredQuestion } from "@/lib/questions"

/** Scores stored questions only; null means a forged or stale submission. */
export function scoreChallengeQuestions(
  questions: (StoredQuestion | undefined)[],
  ids: string[],
  answers: Record<string, unknown>,
  subject: string,
): number | null {
  if (questions.length !== ids.length || new Set(ids).size !== ids.length) return null
  let score = 0
  for (let index = 0; index < ids.length; index++) {
    const question = questions[index]
    const answer = answers[ids[index]]
    if (!question || question.subject !== subject
      || (answer !== null && !["A", "B", "C", "D"].includes(answer as string))) return null
    if (answer && correctLetterOf(question) === answer as OptionLetter) score++
  }
  return score
}
