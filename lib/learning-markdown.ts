/** Adapt LaTeX delimiters before Markdown consumes their backslash escapes.
 * Keep code examples literal; existing dollar-delimited maths stays unchanged.
 */
export function normalizeMathDelimiters(markdown: string): string {
  return markdown.replace(
    /(^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\2[^\S\n]*(?:\n|$))|(`+)[\s\S]*?\3(?!`)|\\\[([\s\S]*?)\\\]|\\\(([^\n]*?)\\\)/gm,
    (match, fence, _marker, code, display, inline) => {
      if (fence || code) return match
      if (display !== undefined) return `\n\n$$\n${display.trim()}\n$$\n\n`
      return `$${inline.trim()}$`
    },
  )
}
