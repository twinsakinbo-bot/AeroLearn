import { createElement, type ReactNode } from "react"

/**
 * Question text is not plain text.
 *
 * Past questions imported from the ALOC bank arrive as HTML fragments, because
 * that is how the source stores them: `451<sub>6</sub> - P<sub>7</sub>`, `stop
 * <u>browbeating</u> the children`, `H<sub>2</sub>SO<sub>4</sub>`, `&nbsp;`,
 * `&amp;`. Every page rendered those strings as React text, so students read the
 * tags out loud in their heads — and worse, in `451<sub>6</sub> - P<sub>7</sub>`
 * a base-6 number and a base-7 number came out looking identical, which makes
 * the question unanswerable.
 *
 * Stripping the tags is not a fix either. `451<sub>6</sub>` would become `4516`,
 * and the underlined word in a synonym question would lose the only thing
 * marking which word is being asked about.
 *
 * So this renders them — without `dangerouslySetInnerHTML`. The bank is
 * third-party data and the AI writes some of it, so raw HTML is an injection
 * vector. The string is tokenized and rebuilt as React elements from a fixed
 * allowlist of inline tags instead. Attributes are dropped while tokenizing, so
 * `onerror=` and `href="javascript:"` cannot survive the trip, and any tag not
 * on the list degrades to its own text content.
 *
 * `plainText()` is the same parse for the places that need a string rather than
 * nodes — the PDF export, and comparing a stored answer against option text.
 */

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", bull: "•",
  middot: "·", deg: "°", times: "×", divide: "÷",
  minus: "−", plusmn: "±", le: "≤", ge: "≥",
  ne: "≠", asymp: "≈", radic: "√", infin: "∞",
  sup1: "¹", sup2: "²", sup3: "³", frac12: "½",
  frac14: "¼", frac34: "¾", prime: "′", Prime: "″",
  rarr: "→", larr: "←", harr: "↔", rArr: "⇒",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ",
  theta: "θ", lambda: "λ", mu: "μ", pi: "π",
  sigma: "σ", omega: "ω", Delta: "Δ", Sigma: "Σ",
  Omega: "Ω", lsquo: "‘", rsquo: "’", ldquo: "“",
  rdquo: "”", laquo: "«", raquo: "»", pound: "£",
  euro: "€", cent: "¢",
}

const ENTITY_PATTERN = /&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g
const COMMENT_PATTERN = /<!--[\s\S]*?-->/g
const TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g

/** Named, decimal and hexadecimal. An entity we do not know is left as typed. */
export function decodeEntities(input: string): string {
  return input.replace(ENTITY_PATTERN, (match, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X"
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10)
      /* Control characters and anything past the last code point stay literal. */
      if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return match
      return String.fromCodePoint(code)
    }
    return ENTITIES[body] ?? match
  })
}

type Token =
  | { kind: "text"; value: string }
  | { kind: "open"; name: string; selfClosing: boolean }
  | { kind: "close"; name: string }

/** Tags with no closing partner, so `<br>` needs no `/` to be understood. */
const VOID = new Set(["br", "hr", "img", "wbr", "input", "meta", "link"])

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let cursor = 0

  TAG_PATTERN.lastIndex = 0
  for (let match = TAG_PATTERN.exec(source); match; match = TAG_PATTERN.exec(source)) {
    if (match.index > cursor) {
      tokens.push({ kind: "text", value: source.slice(cursor, match.index) })
    }

    const name = match[2].toLowerCase()
    if (match[1]) tokens.push({ kind: "close", name })
    else tokens.push({ kind: "open", name, selfClosing: Boolean(match[4]) || VOID.has(name) })

    cursor = match.index + match[0].length
  }

  if (cursor < source.length) tokens.push({ kind: "text", value: source.slice(cursor) })
  return tokens
}

/**
 * The allowlist. Every entry is inline, so it is safe to nest inside a heading
 * or a button — which is where question text and options actually live.
 */
const ELEMENTS: Record<string, { tag: string; className?: string }> = {
  sub: { tag: "sub", className: "align-sub text-[0.75em]" },
  sup: { tag: "sup", className: "align-super text-[0.75em]" },
  b: { tag: "strong", className: "font-semibold" },
  strong: { tag: "strong", className: "font-semibold" },
  i: { tag: "em", className: "italic" },
  em: { tag: "em", className: "italic" },
  u: { tag: "u", className: "underline underline-offset-2" },
  ins: { tag: "u", className: "underline underline-offset-2" },
  s: { tag: "s", className: "line-through" },
  del: { tag: "s", className: "line-through" },
  strike: { tag: "s", className: "line-through" },
  small: { tag: "span", className: "text-[0.85em]" },
  mark: { tag: "mark", className: "bg-accent/[0.14] text-inherit" },
  code: { tag: "code", className: "font-mono text-[0.9em]" },
  br: { tag: "br" },
  /* Block-ish tags do appear in imported text; a `block` span keeps them legal
     inside the inline contexts above while still breaking the line. */
  p: { tag: "span", className: "block" },
  div: { tag: "span", className: "block" },
  li: { tag: "span", className: "block" },
}

/** Dropped along with everything inside them. */
const DROPPED = new Set(["script", "style", "iframe", "object", "embed", "svg", "noscript"])

interface Frame {
  name: string
  children: ReactNode[]
}

function lastIndexOfFrame(stack: Frame[], name: string): number {
  for (let index = stack.length - 1; index >= 0; index--) {
    if (stack[index].name === name) return index
  }
  return -1
}

function asString(source: unknown): string {
  if (typeof source === "string") return source
  if (source === null || source === undefined) return ""
  if (typeof source === "number" || typeof source === "boolean") return String(source)
  return ""
}

/**
 * The markup in `source`, rendered as React nodes.
 *
 * Text with no `<` and no `&` — most of the bank — is returned as-is without
 * being parsed at all, so this is cheap enough to call in a render.
 */
export function richText(source: unknown): ReactNode {
  const text = asString(source)
  if (!text) return null
  if (!text.includes("<") && !text.includes("&")) return text

  const root: ReactNode[] = []
  const stack: Frame[] = []
  let dropDepth = 0
  let key = 0

  const push = (node: ReactNode) => {
    const target = stack.length > 0 ? stack[stack.length - 1].children : root
    target.push(node)
  }

  /* Pop first, then wrap: `push` has to land in the parent, not in the frame
     being closed. An unknown tag is transparent — its children move up. */
  const unwind = (frame: Frame) => {
    const element = ELEMENTS[frame.name]
    if (!element) {
      frame.children.forEach(push)
      return
    }
    push(
      createElement(
        element.tag,
        { key: `r${key++}`, className: element.className },
        ...frame.children,
      ),
    )
  }

  for (const token of tokenize(text.replace(COMMENT_PATTERN, ""))) {
    if (dropDepth > 0) {
      if (token.kind === "open" && !token.selfClosing && DROPPED.has(token.name)) dropDepth++
      if (token.kind === "close" && DROPPED.has(token.name)) dropDepth--
      continue
    }

    if (token.kind === "text") {
      push(decodeEntities(token.value))
      continue
    }

    if (token.kind === "open") {
      if (DROPPED.has(token.name)) {
        if (!token.selfClosing) dropDepth = 1
        continue
      }
      if (token.selfClosing) {
        const element = ELEMENTS[token.name]
        if (element) {
          push(createElement(element.tag, { key: `r${key++}`, className: element.className }))
        }
        continue
      }
      stack.push({ name: token.name, children: [] })
      continue
    }

    /* A stray `</b>` with nothing open is simply ignored, as a browser would. */
    const opened = lastIndexOfFrame(stack, token.name)
    if (opened === -1) continue
    while (stack.length > opened) unwind(stack.pop() as Frame)
  }

  /* Tags left open at the end still render their contents. */
  while (stack.length > 0) unwind(stack.pop() as Frame)

  return root.length === 1 ? root[0] : root
}

/**
 * Where a tag has to survive as characters.
 *
 * `_` and `^` are how a subscript and a superscript are written when they cannot
 * be drawn — `451_6 - P_7 = 305_6` still says which base each number is in. The
 * asterisks around an underline keep the marked word marked. Both matter in the
 * PDF export, where jsPDF's built-in fonts are WinAnsi and cannot draw `₆`.
 */
const PLAIN: Record<string, { open?: string; close?: string }> = {
  sub: { open: "_" },
  sup: { open: "^" },
  u: { open: "*", close: "*" },
  ins: { open: "*", close: "*" },
  br: { open: " " },
  p: { close: " " },
  div: { close: " " },
  li: { close: " " },
}

/** The same parse, flattened to a string, with whitespace collapsed. */
export function plainText(source: unknown): string {
  const text = asString(source)
  if (!text) return ""
  if (!text.includes("<") && !text.includes("&")) return text.replace(/\s+/g, " ").trim()

  let out = ""
  let dropDepth = 0

  for (const token of tokenize(text.replace(COMMENT_PATTERN, ""))) {
    if (dropDepth > 0) {
      if (token.kind === "open" && !token.selfClosing && DROPPED.has(token.name)) dropDepth++
      if (token.kind === "close" && DROPPED.has(token.name)) dropDepth--
      continue
    }

    if (token.kind === "text") {
      out += decodeEntities(token.value)
    } else if (token.kind === "open") {
      if (DROPPED.has(token.name)) {
        if (!token.selfClosing) dropDepth = 1
        continue
      }
      out += PLAIN[token.name]?.open ?? ""
    } else {
      out += PLAIN[token.name]?.close ?? ""
    }
  }

  return out.replace(/\s+/g, " ").trim()
}

/**
 * For comparing two pieces of question text that may be marked up differently —
 * a stored `correctAnswer` of "62<sub>7</sub>" against an option of "62 <sub>7</sub>".
 */
export function comparableText(source: unknown): string {
  return plainText(source).replace(/[\s*]/g, "").toLowerCase()
}




