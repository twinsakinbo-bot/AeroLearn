import { useState } from "react"
import { MessageCircle, Send } from "lucide-react"
import type { DesktopProfile } from "../storage"
import { newId } from "../storage"
import { EmptyState, Page, PageHeading } from "../ui"

export function Messages({ profile, update }: {
  profile: DesktopProfile
  update: (patch: Partial<DesktopProfile> | ((current: DesktopProfile) => DesktopProfile), toast?: string) => void
}) {
  const [activeId, setActiveId] = useState(profile.messages[0]?.id || "")
  const [draft, setDraft] = useState("")
  const active = profile.messages.find((thread) => thread.id === activeId) || profile.messages[0]
  const send = () => {
    if (!active || !draft.trim()) return
    update((current) => ({ ...current, messages: current.messages.map((thread) => thread.id === active.id ? { ...thread, messages: [...thread.messages, { id: newId("message"), from: "you", text: draft.trim(), at: new Date().toISOString() }] } : thread) }))
    setDraft("")
  }
  return <Page>
    <PageHeading overline="Your conversations" title="Messages" subtitle="Messages here are local to this desktop and are not sent online." />
    {profile.messages.length === 0 ? <EmptyState icon={MessageCircle} title="No conversations" body="Your local conversations will appear here." /> : <div className="messages-layout">
      <div className="thread-list" aria-label="Conversations">{profile.messages.map((thread) => <button key={thread.id} className={active?.id === thread.id ? "active" : ""} onClick={() => setActiveId(thread.id)}><span className="avatar small">{thread.with.slice(0, 1)}</span><span><strong>{thread.with}</strong><small>{thread.messages.at(-1)?.text || "No messages"}</small></span></button>)}</div>
      {active && <section className="chat-panel" aria-label={`Conversation with ${active.with}`}>
        <div className="chat-head"><strong>{active.with}</strong><small>Local conversation</small></div>
        <div className="chat-body">{active.messages.map((message) => <div className={`bubble ${message.from === "you" ? "me" : "them"}`} key={message.id}>{message.text}</div>)}</div>
        <form className="chat-input" onSubmit={(event) => { event.preventDefault(); send() }}><input aria-label="Message" value={draft} maxLength={1000} onChange={(event) => setDraft(event.target.value)} placeholder="Write a local message" /><button className="primary-button" type="submit" disabled={!draft.trim()} aria-label="Save message"><Send size={15} /></button></form>
      </section>}
    </div>}
  </Page>
}
