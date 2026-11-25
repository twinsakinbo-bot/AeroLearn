import { useState } from "react"
import { MessageCircle, Plus } from "lucide-react"
import type { DesktopProfile } from "../storage"
import { newId } from "../storage"
import { EmptyState, Page, PageHeading } from "../ui"
import type { Subject } from "../data"

export function Community({ profile, update, showToast }: {
  profile: DesktopProfile
  update: (patch: Partial<DesktopProfile> | ((current: DesktopProfile) => DesktopProfile), toast?: string) => void
  showToast: (text: string) => void
}) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [reply, setReply] = useState<Record<string, string>>({})
  const addThread = () => {
    if (!title.trim() || !body.trim()) return
    update((current) => ({ ...current, community: [{ id: newId("thread"), title: title.trim(), body: body.trim(), author: current.name || "You", subject: "English" as Subject, createdAt: new Date().toISOString(), replies: [], liked: false }, ...current.community] }))
    setTitle(""); setBody(""); showToast("Discussion saved on this device")
  }
  const addReply = (id: string) => {
    const text = reply[id]?.trim()
    if (!text) return
    update((current) => ({ ...current, community: current.community.map((thread) => thread.id === id ? { ...thread, replies: [...thread.replies, { id: newId("reply"), author: current.name || "You", body: text, at: new Date().toISOString() }] } : thread) }))
    setReply((current) => ({ ...current, [id]: "" }))
  }
  return <Page>
    <PageHeading overline="Study together" title="Community" subtitle="These discussions are saved locally on this desktop." />
    <section className="thread-card" aria-label="Start a discussion">
      <label htmlFor="thread-title">Topic</label><input id="thread-title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="What are you studying?" />
      <label htmlFor="thread-body">Question or idea</label><textarea id="thread-body" value={body} maxLength={2000} onChange={(event) => setBody(event.target.value)} placeholder="Share a question or useful tip" />
      <button className="primary-button" onClick={addThread} disabled={!title.trim() || !body.trim()}><Plus size={14} /> Post locally</button>
    </section>
    <div className="section-heading"><div><h2>Discussions</h2></div></div>
    {profile.community.length === 0 ? <EmptyState icon={MessageCircle} title="No discussions yet" body="Start with a question about today's lesson." /> : <div className="community-list">
      {profile.community.map((thread) => <article className="thread-card" key={thread.id}>
        <div className="thread-head"><strong>{thread.title}</strong><span className="thread-meta">{thread.subject} · {thread.author}</span></div>
        <p className="thread-body">{thread.body}</p>
        {thread.replies.map((item) => <div className="reply" key={item.id}><strong>{item.author}</strong>{item.body}</div>)}
        <div className="thread-actions"><input aria-label={`Reply to ${thread.title}`} value={reply[thread.id] || ""} maxLength={1000} onChange={(event) => setReply((current) => ({ ...current, [thread.id]: event.target.value }))} placeholder="Add a reply" /><button className="secondary-button" onClick={() => addReply(thread.id)} disabled={!reply[thread.id]?.trim()}>Reply</button></div>
      </article>)}
    </div>}
  </Page>
}
