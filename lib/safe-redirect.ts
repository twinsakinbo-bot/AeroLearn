/** Resolve through the browser's URL rules, then enforce the original origin. */
export function safeNextPath(raw: string | null, origin: string): string {
  if (!raw?.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(raw)) return '/app'
  try {
    const target = new URL(raw, origin)
    if (target.origin !== new URL(origin).origin) return '/app'
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return '/app'
  }
}
