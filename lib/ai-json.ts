/**
 * Reading JSON back out of a model's reply.
 *
 * `/api/ai-quiz` did `text.indexOf("[")`, then `JSON.parse`, and that is where
 * the 502 and "Failed to parse AI response. Try again." came from. Four separate
 * things break that line:
 *
 * 1. `openai/gpt-oss-20b` is a reasoning model, and its reasoning is billed
 *    against `max_tokens`. The visible answer gets cut off mid-object — valid
 *    JSON up to a point, then nothing. Ten complete questions out of twelve is a
 *    quiz; a 502 is not.
 * 2. `indexOf("[")` finds the first `[` anywhere, including one inside the prose
 *    a model writes before the array.
 * 3. Maths and chemistry answers contain backslashes — `\frac{1}{2}`, `\sqrt`.
 *    A lone `\` that is not a legal JSON escape makes the whole document
 *    unparseable, and no amount of asking in the prompt stops it.
 * 4. Trailing commas, and real newlines inside strings.
 *
 * So: unwrap the reply, normalise the text, find a *balanced* value rather than
 * the first bracket, and if it was truncated, cut back to the last complete
 * element and close what is still open. `parseAiJson` returns `null` only when
 * there is nothing usable in there at all.
 */

/** Legal characters after a backslash inside a JSON string. */
const ESCAPES = new Set(['"', "\\", "/", "b", "f", "n", "r", "t", "u"])

const CONTROL: Record<string, string> = {
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\b": "\\b",
  "\f": "\\f",
}

const FENCE = /```(?:[a-zA-Z]+)?\s*([\s\S]*?)```/g
const REASONING = /<\/?(?:think|thinking|reasoning|analysis|answer)>/gi

/** Bounds, so a hostile or babbling reply cannot turn this into a hang. */
const MAX_CANDIDATES = 16
const MAX_SNAPSHOTS = 500
const MAX_REPAIRS = 60

function asString(source: unknown): string {
  return typeof source === "string" ? source : ""
}

function tryParse(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

/** Nothing to work with — an empty array or `{}` is a parse, not an answer. */
function filled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === "object") return Object.keys(value).length > 0
  return false
}

/**
 * Fenced blocks and reasoning tags wrap the answer rather than being part of it.
 * The first fence that contains a bracket wins: a model that explains itself in
 * one block and answers in the next would otherwise lose the answer.
 */
function unwrap(text: string): string {
  const out = text.replace(REASONING, " ")

  FENCE.lastIndex = 0
  for (let match = FENCE.exec(out); match; match = FENCE.exec(out)) {
    const body = match[1].trim()
    if (body.includes("{") || body.includes("[")) return body
  }

  /* An unclosed fence — the reply was cut off inside one. */
  return out.replace(/```(?:[a-zA-Z]+)?/g, " ").trim()
}

/**
 * One string-aware pass. Inside a string: real control characters become their
 * escapes, and a backslash that is not a legal escape is doubled, so `\frac`
 * survives as the text `\frac` instead of poisoning the document. Outside one: a
 * comma sitting just before `]` or `}` is dropped.
 */
function normalize(text: string): string {
  let out = ""
  let inString = false

  for (let index = 0; index < text.length; index++) {
    const char = text[index]

    if (inString) {
      if (char === "\\") {
        const next = text[index + 1]
        if (next !== undefined && ESCAPES.has(next)) {
          out += char + next
          index++
        } else {
          out += "\\\\"
        }
        continue
      }
      if (char === '"') {
        inString = false
        out += char
        continue
      }
      out += CONTROL[char] ?? (char < " " ? " " : char)
      continue
    }

    if (char === '"') {
      inString = true
      out += char
      continue
    }

    if (char === ",") {
      let ahead = index + 1
      while (ahead < text.length && /\s/.test(text[ahead])) ahead++
      if (text[ahead] === "]" || text[ahead] === "}") continue
    }

    out += char
  }

  return out
}

/**
 * A point the document could be cut at, with what was still open there. Recorded
 * after every complete element, which is what makes salvaging a truncated reply
 * possible: cut at the last one and append `stack` reversed.
 */
type Snapshot = { end: number; stack: string[] }

type Scan = { end: number; complete: boolean; snapshots: Snapshot[] }

/** Reads one balanced value starting at `start`, tracking cut points as it goes. */
function scanValue(text: string, start: number): Scan {
  const stack: string[] = []
  const snapshots: Snapshot[] = []
  let inString = false
  let escaped = false

  const remember = (end: number) => {
    if (stack.length === 0) return
    snapshots.push({ end, stack: stack.slice() })
    if (snapshots.length > MAX_SNAPSHOTS) snapshots.shift()
  }

  for (let index = start; index < text.length; index++) {
    const char = text[index]

    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }
    if (char === "[" || char === "{") {
      stack.push(char === "[" ? "]" : "}")
      continue
    }
    if (char === "]" || char === "}") {
      stack.pop()
      if (stack.length === 0) return { end: index + 1, complete: true, snapshots }
      /* Just after a nested value closed — a whole question, for instance. */
      remember(index + 1)
      continue
    }
    /* Before the comma, so the cut never leaves a trailing one. */
    if (char === ",") remember(index)
  }

  return { end: text.length, complete: false, snapshots }
}

function closers(stack: string[]): string {
  let out = ""
  for (let index = stack.length - 1; index >= 0; index--) out += stack[index]
  return out
}

/** The longest prefix of a truncated value that still parses. */
function salvage(text: string, start: number, scan: Scan): unknown {
  let attempts = 0
  for (let index = scan.snapshots.length - 1; index >= 0 && attempts < MAX_REPAIRS; index--) {
    attempts++
    const shot = scan.snapshots[index]
    const value = tryParse(text.slice(start, shot.end) + closers(shot.stack))
    if (value !== undefined && filled(value)) return value
  }
  return undefined
}

/** Every position a JSON value could begin at, capped. */
function starts(text: string): number[] {
  const out: number[] = []
  for (let index = 0; index < text.length && out.length < MAX_CANDIDATES; index++) {
    const char = text[index]
    if (char === "[" || char === "{") out.push(index)
  }
  return out
}

/**
 * The JSON hiding in a model's reply, or `null`.
 *
 * Complete values are preferred, and among those the longest — a `[` inside the
 * model's own prose usually closes within a few characters, while the payload
 * runs for pages. Only when nothing balances does it fall back to salvaging a
 * truncated reply.
 */
export function parseAiJson(source: unknown): unknown {
  const raw = unwrap(asString(source))
  if (!raw) return null

  /* Most replies parse as they stand; do not rewrite those at all. */
  const direct = tryParse(raw)
  if (direct !== undefined) return direct

  const text = normalize(raw)
  const whole = tryParse(text)
  if (whole !== undefined) return whole

  const scans: Array<{ start: number; scan: Scan }> = []
  let best: { value: unknown; length: number } | null = null

  for (const start of starts(text)) {
    const scan = scanValue(text, start)
    scans.push({ start, scan })
    if (!scan.complete) continue

    const value = tryParse(text.slice(start, scan.end))
    if (value === undefined || !filled(value)) continue

    const length = scan.end - start
    if (!best || length > best.length) best = { value, length }
  }

  if (best) return best.value

  for (const entry of scans) {
    const value = salvage(text, entry.start, entry.scan)
    if (value !== undefined) return value
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

/**
 * The list of rows in a parsed reply.
 *
 * Asked for an array, a model may still wrap it — `{"questions": [...]}` is the
 * usual one, and is *required* when the request uses JSON mode, since that mode
 * can only return an object. A single row may also arrive unwrapped, so a bare
 * object that looks like a row is treated as a list of one.
 */
export function rowsFrom(value: unknown, keys: string[] = []): Record<string, unknown>[] {
  const asRows = (entries: unknown[]) => entries.filter(isRecord)

  if (Array.isArray(value)) return asRows(value)
  if (!isRecord(value)) return []

  for (const key of keys) {
    if (Array.isArray(value[key])) return asRows(value[key] as unknown[])
  }

  /* Any array of objects will do — a model that renamed the field still meant it. */
  for (const entry of Object.values(value)) {
    if (Array.isArray(entry) && entry.some(isRecord)) return asRows(entry)
  }

  return Object.keys(value).length > 0 ? [value] : []
}

/** `parseAiJson` and `rowsFrom` together, which is how every caller uses them. */
export function parseAiRows(source: unknown, keys: string[] = []): Record<string, unknown>[] {
  return rowsFrom(parseAiJson(source), keys)
}
