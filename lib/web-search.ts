export type WebResult = { title: string; url: string; description: string }

export function webSearchProvider(): "tavily" | "brave" | "wikipedia" {
  if (process.env.TAVILY_API_KEY?.trim()) return "tavily"
  if (process.env.BRAVE_SEARCH_API_KEY?.trim()) return "brave"
  return "wikipedia"
}

export function webSearchConfigured(): boolean {
  return true // Wikimedia's public search API needs no account or key.
}

function normalizeResults(items: Array<{ title?: string; url?: string; description?: string; content?: string }>): WebResult[] {
  return items.flatMap((item) => {
    try {
      const parsed = new URL(item.url || "")
      if (parsed.protocol !== "https:") return []
      return [{
        title: String(item.title || "").slice(0, 160),
        url: parsed.toString(),
        description: String(item.description || item.content || "").slice(0, 500),
      }]
    } catch { return [] }
  }).slice(0, 5)
}

/** Bounded web search for the tutor. Never follows result links or sends page HTML to the model. */
export async function searchWeb(query: string): Promise<WebResult[]> {
  const tavilyKey = process.env.TAVILY_API_KEY?.trim()
  if (tavilyKey) {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${tavilyKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: query.trim().slice(0, 180),
        search_depth: "basic",
        max_results: 5,
        include_answer: false,
        include_raw_content: false,
        safe_search: true,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`Web search failed (${response.status}).`)
    const data = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string }> }
    return normalizeResults(data.results || [])
  }

  const key = process.env.BRAVE_SEARCH_API_KEY?.trim()
  if (!key) {
    const url = new URL("https://en.wikipedia.org/w/rest.php/v1/search/page")
    url.searchParams.set("q", query.trim().slice(0, 180))
    url.searchParams.set("limit", "5")
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "AeroLearn/1.0 (support@aerolearn.name.ng)" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`Wikipedia search failed (${response.status}).`)
    const data = await response.json() as { pages?: Array<{ key?: string; title?: string; excerpt?: string; description?: string }> }
    return (data.pages || []).filter((item) => item.key).map((item) => ({
      title: String(item.title || "").slice(0, 160),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.key || "")}`,
      description: String(item.excerpt || item.description || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500),
    })).slice(0, 5)
  }
  const url = new URL("https://api.search.brave.com/res/v1/web/search")
  url.searchParams.set("q", query.trim().slice(0, 180))
  url.searchParams.set("count", "5")
  url.searchParams.set("safesearch", "strict")
  const response = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Web search failed (${response.status}).`)
  const data = await response.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } }
  return normalizeResults(data.web?.results || [])
}
