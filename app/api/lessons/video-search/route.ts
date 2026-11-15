import { NextResponse } from "next/server"

import { requireAdmin } from "@/lib/api-auth"

export async function GET(request: Request) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  const query = new URL(request.url).searchParams.get("q")?.trim() || ""
  if (query.length < 3 || query.length > 150) {
    return NextResponse.json({ error: "Enter a lesson topic to search for videos." }, { status: 400 })
  }
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
  const key = process.env.YOUTUBE_API_KEY?.trim()
  if (!key) return NextResponse.json({ results: [], searchUrl, needsApiKey: true })

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search")
    url.searchParams.set("key", key)
    url.searchParams.set("q", query)
    url.searchParams.set("part", "snippet")
    url.searchParams.set("type", "video")
    url.searchParams.set("videoEmbeddable", "true")
    url.searchParams.set("safeSearch", "strict")
    url.searchParams.set("maxResults", "6")
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) })
    if (!response.ok) throw new Error(`YouTube search is unavailable (${response.status}).`)
    const data = await response.json() as { items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string } } } }> }
    const results = (data.items || []).flatMap((item) => {
      const id = item.id?.videoId || ""
      if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) return []
      return [{
        id,
        title: item.snippet?.title || "YouTube video",
        channel: item.snippet?.channelTitle || "",
        thumbnail: item.snippet?.thumbnails?.medium?.url || "",
        url: `https://www.youtube.com/watch?v=${id}`,
      }]
    })
    return NextResponse.json({ results, searchUrl, needsApiKey: false })
  } catch (error) {
    console.error("Video search failed:", error)
    return NextResponse.json({ results: [], searchUrl, error: "YouTube suggestions are unavailable. Open YouTube search to choose a video." })
  }
}
