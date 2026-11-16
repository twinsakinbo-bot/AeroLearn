/** The model may request a private factual lookup instead of guessing. */
export function referenceQuery(reply: string): string | null {
  const match = reply.match(/\[\[LOOKUP:\s*([^\]\r\n]{3,180}?)\s*\]\]/i)
  return match?.[1]?.trim() || null
}

export const UNCERTAIN_REPLY = "I'm not sure enough to answer that accurately yet. Could you share the topic or your class notes so we can work through it together?"
