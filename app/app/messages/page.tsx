"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { auth, onAuthStateChanged } from "@/lib/auth"
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  db,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "@/lib/db"
import {
  ArrowLeft,
  Camera,
  Check,
  CornerUpLeft,
  ImageIcon,
  Info,
  Loader2,
  MessageSquare,
  Mic,
  Search,
  Send,
  Shield,
  Smile,
  Square,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { LoadingState } from "@/components/ui/loading-state"
import { cn } from "@/lib/utils"

/**
 * Real-time messaging with voice notes, images, groups, AI tutor, and read receipts.
 *
 * The old page was a `fixed inset-0 z-[100]` overlay that broke out of the app
 * shell, layered `backdrop-blur-3xl` over `backdrop-blur-2xl`, hard-coded WhatsApp's
 * palette (`#0b141a`, `#f0f2f5`, `#40c4ff`), and used framer-motion for drag-to-reply,
 * modal transitions, and three bouncing typing dots. It is now a two-pane card inside
 * the shell: conversation list on the left, thread on the right, panes swapping on
 * mobile. Drag-to-reply is a hover button (drag had no keyboard equivalent).
 *
 * Six real bugs fixed:
 *
 * 1. **Listener leak.** `loadConversations` and `openConversation` called
 *    `onSnapshot` without keeping the unsubscribe. Every conversation you opened
 *    added a permanent message listener, and the conversations listener was never
 *    torn down on unmount. Both are held in refs and cleaned up now.
 * 2. **`unreadBy: []` cleared everyone's unread flag,** not just yours — opening a
 *    group chat marked it read for all participants. Now `arrayRemove(uid)`.
 * 3. **Read receipts were per-conversation, not per-message.** `isRead` was computed
 *    once from `unreadBy` and applied to every bubble, so all your old messages
 *    flipped back to "sent" the moment you sent a new one. Only the last message you
 *    sent shows a receipt now, which is the only one the data can actually support.
 * 4. **Push notifications were removed.** Nothing ever mounted the token manager, so
 *    no student had an FCM token and every send fired a POST that could only fail. The
 *    deep link was wrong too — `?with=${conversationId}` where `with` is read as a
 *    *user* id. The whole path is gone rather than left as a broken promise.
 * 5. **"Messages are end-to-end encrypted" was false.** Message text is stored in
 *    plaintext in Firestore and read by `/api/ai-chat`. That claim is removed; the
 *    placeholder now says what is true.
 * 6. **`deleteConversation` deleted the document for every participant** and orphaned
 *    the `messages` subcollection. Leaving now removes only this student's membership.
 *
 * Left alone but worth flagging: `/api/link-preview` has no auth (SSRF), the
 * friends-only rule is enforced only in this file so Firestore rules must repeat it,
 * `handleSearch` reads every user at your school and filters in memory, and
 * `Message.reactions` is written by nothing — the "Reactions" emoji picker appends to
 * your draft text instead.
 */

const AI_BOT_ID = "ai-bot"
const AI_BOT = {
  id: AI_BOT_ID,
  displayName: "AeroLearn AI Assistant",
  photoURL: "/aerolearn_logo.svg",
  isOnline: true,
}

const EMOJI = ["😀", "😂", "😍", "🙏", "👍", "🙌", "🔥", "🎉", "❤️", "🤔", "😢", "😡", "👏", "✨", "💯"]
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

type Message = {
  id: string
  senderId: string
  text: string
  createdAt: any
  mediaUrl?: string
  mediaType?: "image" | "file" | "audio"
  replyTo?: string | null
}

type Conversation = {
  id: string
  participants: string[]
  type: "direct" | "group"
  name?: string
  groupPhoto?: string
  admins?: string[]
  lastMessage?: string
  updatedAt?: any
  unreadBy?: string[]
  typing?: string[]
  displayPhoto?: string
  displayName?: string
  isOnline?: boolean
}

type Person = { id: string; displayName: string; photoURL?: string }
type Banner = { tone: "success" | "error"; text: string }

function initialsOf(name?: string | null) {
  if (!name) return "?"
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

function clockOf(timestamp: any) {
  if (!timestamp?.seconds) return ""
  return new Date(timestamp.seconds * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function dayOf(timestamp: any) {
  if (!timestamp?.seconds) return ""
  const date = new Date(timestamp.seconds * 1000)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return "Today"
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
}

const AVATAR_SIZES = {
  sm: "h-9 w-9 text-caption",
  md: "h-11 w-11 text-body-sm",
  lg: "h-14 w-14 text-body",
  xl: "h-24 w-24 text-h2",
}

function Avatar({
  name,
  photo,
  size = "md",
  online,
}: {
  name?: string | null
  photo?: string | null
  size?: keyof typeof AVATAR_SIZES
  online?: boolean
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={cn(
          "inline-flex items-center justify-center overflow-hidden rounded-full bg-accent/[0.10] font-semibold text-accent",
          AVATAR_SIZES[size],
        )}
      >
        {photo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          initialsOf(name)
        )}
      </span>
      {online && (
        <span
          className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface bg-success"
          aria-label="Online"
        />
      )}
    </span>
  )
}

/* Unfurls a link into a card. `/api/link-preview` used to fetch whatever URL it was
   handed, from inside the server's network and with no authentication — it now vets
   the address and needs a token, so the request carries one. */
function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<{ title?: string; description?: string; image?: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        const token = await auth.currentUser?.getIdToken()
        const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const body = await res.json()
        if (live && res.ok && !body.error) setData(body)
      } catch {
        /* A preview is decoration: a failure leaves the plain link in place. */
      } finally {
        if (live) setLoading(false)
      }
    }
    void load()
    return () => {
      live = false
    }
  }, [url])

  if (loading) {
    return <div className="mt-2 h-20 w-full max-w-sm animate-shimmer rounded-lg bg-surface-sunken" />
  }
  if (!data?.title) return null

  let hostname = url
  try {
    hostname = new URL(url).hostname
  } catch {
    /* leave the raw string */
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block max-w-sm overflow-hidden rounded-lg border border-hairline bg-surface transition-colors hover:bg-surface-hover"
    >
      {data.image && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={data.image} alt="" className="h-28 w-full border-b border-hairline object-cover" />
      )}
      <span className="block p-3">
        <span className="block truncate text-body-sm font-semibold text-foreground">{data.title}</span>
        {data.description && (
          <span className="mt-1 line-clamp-2 block text-caption leading-snug text-muted">
            {data.description}
          </span>
        )}
        <span className="mt-2 block truncate text-caption text-subtle">{hostname}</span>
      </span>
    </a>
  )
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g
const URL_TEST = /^https?:\/\/[^\s]+$/

function TextWithLinks({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN)
  const links = parts.filter((part) => URL_TEST.test(part))

  return (
    <span className="flex flex-col">
      <span className="whitespace-pre-wrap break-words">
        {parts.map((part, i) =>
          URL_TEST.test(part) ? (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all underline underline-offset-2"
            >
              {part}
            </a>
          ) : (
            part
          ),
        )}
      </span>
      {links.map((link, i) => (
        <LinkPreview key={i} url={link} />
      ))}
    </span>
  )
}

export default function MessagesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const withUserId = searchParams.get("with")
  const withUserName = searchParams.get("name")
  const exportedQuestion = searchParams.get("q")

  const [uid, setUid] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<Banner | null>(null)

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConv, setActiveConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [webSearchAvailable, setWebSearchAvailable] = useState(false)
  const [quizModeEnabled, setQuizModeEnabled] = useState(false)
  const [userCache, setUserCache] = useState<Record<string, Person>>({})

  const [draft, setDraft] = useState("")
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)

  const [search, setSearch] = useState("")
  const [searchResults, setSearchResults] = useState<Person[]>([])
  const [searching, setSearching] = useState(false)

  const [showNewGroup, setShowNewGroup] = useState(false)
  const [showGroupInfo, setShowGroupInfo] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [groupPicks, setGroupPicks] = useState<Person[]>([])
  const [memberSearch, setMemberSearch] = useState("")
  const [memberResults, setMemberResults] = useState<Person[]>([])

  const [recording, setRecording] = useState(false)
  const [aiAudioAvailable, setAiAudioAvailable] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)

  const messageLogRef = useRef<HTMLDivElement>(null)
  const convUnsubRef = useRef<(() => void) | null>(null)
  const msgUnsubRef = useRef<(() => void) | null>(null)
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null)
  const activeConvRef = useRef<Conversation | null>(null)
  const listVersionRef = useRef(0)

  activeConvRef.current = activeConv

  /* One conversations listener for the life of the page, torn down on unmount. */
  useEffect(() => {
    let cancelled = false
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth/login")
        return
      }
      setUid(user.uid)

      try {
        const snap = await getDoc(doc(db, "users", user.uid))
        if (snap.exists()) setProfile(snap.data())

        /* Make sure the student has a thread with the AI assistant. */
        const existing = await getDocs(
          query(collection(db, "conversations"), where("participants", "array-contains", user.uid)),
        )
        const hasBot = existing.docs.some((d) => {
          const data = d.data()
          return data.type === "direct" && (data.participants ?? []).includes(AI_BOT_ID)
        })
        if (!hasBot) {
          await addDoc(collection(db, "conversations"), {
            participants: [user.uid, AI_BOT_ID],
            type: "direct",
            lastMessage: "Hi! I am the AeroLearn AI Assistant. How can I help you today?",
            updatedAt: serverTimestamp(),
            unreadBy: [user.uid],
            typing: [],
          })
        }
      } catch (error) {
        console.error("Failed to set up your messages:", error)
        setBanner({ tone: "error", text: "We could not load your messages. Reload the page." })
      }

      convUnsubRef.current?.()
      convUnsubRef.current = onSnapshot(
        query(collection(db, "conversations"), where("participants", "array-contains", user.uid)),
        async (snapshot) => {
          const version = ++listVersionRef.current
          const rows = await Promise.all(
            snapshot.docs.map(async (d) => {
              const data = d.data()
              let displayPhoto: string | undefined = data.groupPhoto
              let displayName: string | undefined = data.name
              let isOnline = false

              if (data.type !== "group") {
                const otherId = (data.participants ?? []).find((p: string) => p !== user.uid)
                if (otherId === AI_BOT_ID) {
                  displayPhoto = AI_BOT.photoURL
                  displayName = AI_BOT.displayName
                  isOnline = true
                } else if (otherId) {
                  try {
                    const otherSnap = await getDoc(doc(db, "users", otherId))
                    if (otherSnap.exists()) {
                      const other = otherSnap.data()
                      displayPhoto = other.photoURL
                      displayName = other.displayName || "Student"
                      isOnline = Boolean(other.isOnline)
                    }
                  } catch {
                    /* keep the fallback name */
                  }
                }
              }

              return {
                id: d.id,
                participants: data.participants ?? [],
                type: data.type ?? "direct",
                name: data.name,
                groupPhoto: data.groupPhoto,
                admins: data.admins,
                lastMessage: data.lastMessage,
                updatedAt: data.updatedAt,
                unreadBy: data.unreadBy ?? [],
                typing: data.typing ?? [],
                displayPhoto,
                displayName: displayName || "Student",
                isOnline,
              } as Conversation
            }),
          )

          rows.sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0))
          if (cancelled || version !== listVersionRef.current) return
          setConversations(rows)

          const current = activeConvRef.current
          if (current) {
            const refreshed = rows.find((c) => c.id === current.id)
            if (refreshed) setActiveConv(refreshed)
            else {
              msgUnsubRef.current?.()
              msgUnsubRef.current = null
              setActiveConv(null)
              setMessages([])
            }
          }
          setLoading(false)
        },
        (error) => {
          console.error("The conversation list stopped updating:", error)
          setLoading(false)
        },
      )

    })

    return () => {
      cancelled = true
      unsubscribeAuth()
      convUnsubRef.current?.()
      msgUnsubRef.current?.()
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    }
  }, [router])

  useEffect(() => {
    const log = messageLogRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messages])

  useEffect(() => {
    let live = true
    fetch("/api/ai-chat")
      .then((response) => response.json())
      .then((data) => {
        if (live) {
          setAiAudioAvailable(data.audioTranscription === true)
          setWebSearchAvailable(data.webSearch === true)
        }
      })
      .catch(() => {})
    return () => { live = false }
  }, [])

  const cachePeople = async (ids: string[]) => {
    const missing = ids.filter((id) => id !== uid && id !== AI_BOT_ID && !userCache[id])
    if (missing.length === 0) return
    const rows = await Promise.all(
      missing.map(async (id) => {
        try {
          const snap = await getDoc(doc(db, "users", id))
          if (!snap.exists()) return null
          const data = snap.data()
          return { id, displayName: data.displayName || "Student", photoURL: data.photoURL } as Person
        } catch {
          return null
        }
      }),
    )
    setUserCache((prev) => {
      const next = { ...prev }
      rows.forEach((person) => {
        if (person) next[person.id] = person
      })
      return next
    })
  }

  const openConversation = async (conv: Conversation) => {
    if (!uid) return
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    const previous = activeConvRef.current
    if (previous && previous.id !== conv.id) {
      updateDoc(doc(db, "conversations", previous.id), { typing: arrayRemove(uid) }).catch(console.error)
    }
    setActiveConv(conv)
    setMessages([])
    setDraft("")
    setShowGroupInfo(false)
    setReplyingTo(null)
    setSearchResults([])
    setSearch("")

    /* Clear only your own unread flag — the old code wrote `unreadBy: []`, which
       marked the thread read for every other participant too. */
    if (conv.unreadBy?.includes(uid)) {
      updateDoc(doc(db, "conversations", conv.id), { unreadBy: arrayRemove(uid) }).catch(console.error)
    }

    if (conv.participants.includes(AI_BOT_ID)) {
      setUserCache((prev) => ({ ...prev, [AI_BOT_ID]: AI_BOT }))
    }
    void cachePeople(conv.participants)

    msgUnsubRef.current?.()
    msgUnsubRef.current = onSnapshot(
      query(collection(db, "conversations", conv.id, "messages"), orderBy("createdAt", "asc")),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message))
        setMessages(rows)
        const current = activeConvRef.current
        if (current?.id === conv.id && current.unreadBy?.includes(uid) && rows.at(-1)?.senderId !== uid) {
          updateDoc(doc(db, "conversations", conv.id), { unreadBy: arrayRemove(uid) }).catch(console.error)
        }
      },
      (error) => {
        console.error("The message thread stopped updating:", error)
        setBanner({ tone: "error", text: "This chat stopped updating. Open it again to retry." })
      },
    )
  }

  const closeConversation = () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    if (uid && activeConvRef.current) {
      updateDoc(doc(db, "conversations", activeConvRef.current.id), { typing: arrayRemove(uid) }).catch(console.error)
    }
    msgUnsubRef.current?.()
    msgUnsubRef.current = null
    setActiveConv(null)
    setMessages([])
    setDraft("")
    setShowGroupInfo(false)
    setReplyingTo(null)
  }

  /* Friends-only is enforced here and nowhere else. Firestore rules have to repeat
     it, or a hand-written request can open a thread with any student. */
  const startConversationWith = async (person: Person) => {
    if (!uid || !profile) return
    if (person.id !== AI_BOT_ID && !(profile.friends ?? []).includes(person.id)) {
      setBanner({ tone: "error", text: "You can only message friends. Send a friend request first." })
      return
    }

    const existing = conversations.find(
      (c) => c.type === "direct" && c.participants.includes(person.id),
    )
    if (existing) {
      openConversation(existing)
      return
    }

    try {
      const created = await addDoc(collection(db, "conversations"), {
        participants: [uid, person.id],
        type: "direct",
        lastMessage: "",
        updatedAt: serverTimestamp(),
        unreadBy: [],
        typing: [],
      })
      setSearch("")
      setSearchResults([])
      await openConversation({ id: created.id, participants: [uid, person.id], type: "direct", displayName: person.displayName, displayPhoto: person.photoURL, unreadBy: [], typing: [] })
    } catch (error) {
      console.error("Failed to start the chat:", error)
      setBanner({ tone: "error", text: "That chat did not open. Try again." })
    }
  }

  const createGroup = async () => {
    if (!uid || groupPicks.length === 0 || !groupName.trim()) return
    const participants = [uid, ...groupPicks.map((p) => p.id)]
    try {
      await addDoc(collection(db, "conversations"), {
        participants,
        type: "group",
        name: groupName.trim(),
        admins: [uid],
        lastMessage: "Group created",
        updatedAt: serverTimestamp(),
        unreadBy: participants.filter((p) => p !== uid),
        typing: [],
      })
      setShowNewGroup(false)
      setGroupName("")
      setGroupPicks([])
      setBanner({ tone: "success", text: "Group created." })
    } catch (error) {
      console.error("Failed to create the group:", error)
      setBanner({ tone: "error", text: "The group was not created. Try again." })
    }
  }

  const askBot = async (conv: Conversation, payload: Record<string, unknown>) => {
    const convRef = doc(db, "conversations", conv.id)
    updateDoc(convRef, { typing: arrayUnion(AI_BOT_ID) }).catch(() => {})
    try {
      const idToken = await auth.currentUser?.getIdToken()
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ ...payload, senderId: uid, conversationId: conv.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.reply) throw new Error(data.error || "The assistant did not reply.")
      if (data.reply) {
        await addDoc(collection(db, "conversations", conv.id, "messages"), {
          senderId: AI_BOT_ID,
          text: data.reply,
          createdAt: serverTimestamp(),
        })
        await updateDoc(convRef, {
          lastMessage: data.reply,
          updatedAt: serverTimestamp(),
          unreadBy: conv.participants.filter((p) => p !== AI_BOT_ID),
          typing: arrayRemove(AI_BOT_ID),
        })
      } else {
        updateDoc(convRef, { typing: arrayRemove(AI_BOT_ID) }).catch(() => {})
      }
    } catch (error) {
      console.error("The assistant did not reply:", error)
      setBanner({ tone: "error", text: error instanceof Error ? error.message : "The assistant could not reply. Please try again." })
      updateDoc(convRef, { typing: arrayRemove(AI_BOT_ID) }).catch(() => {})
    }
  }

  const sendMessage = async (mediaUrl?: string) => {
    const conv = activeConv
    if (!conv || !uid || sending) return
    const text = draft.trim()
    if (!text && !mediaUrl) return

    setSending(true)
    setDraft("")
    setShowEmoji(false)
    const quoted = replyingTo
    setReplyingTo(null)
    let stored = false

    try {
      await addDoc(collection(db, "conversations", conv.id, "messages"), {
        senderId: uid,
        text,
        createdAt: serverTimestamp(),
        replyTo: quoted?.id ?? null,
        ...(mediaUrl ? { mediaUrl, mediaType: "image" } : {}),
      })
      stored = true

      const summary = mediaUrl ? "📷 Image" : text
      await updateDoc(doc(db, "conversations", conv.id), {
        lastMessage: summary,
        updatedAt: serverTimestamp(),
        unreadBy: conv.participants.filter((p) => p !== uid),
        typing: arrayRemove(uid),
      })

      if (conv.participants.includes(AI_BOT_ID)) {
        void askBot(conv, {
          message: text, mediaUrl, mediaType: mediaUrl ? "image" : undefined,
          webSearch: webSearchEnabled, quizMode: quizModeEnabled,
          history: messages.slice(-8).filter((item) => item.text).map((item) => ({ role: item.senderId === AI_BOT_ID ? "assistant" : "user", text: item.text })),
        })
      }
    } catch (error) {
      console.error("Failed to send:", error)
      if (!stored) {
        setDraft(text)
        setReplyingTo(quoted)
      }
      setBanner({ tone: "error", text: stored
        ? "Message sent, but the conversation summary did not update. Do not resend it."
        : "That message did not send. Try again." })
    } finally {
      setSending(false)
    }
  }

  const uploadTo = async (kind: "image" | "video", file: Blob, filename?: string) => {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "rwlflvjg"
    const form = new FormData()
    if (filename) form.append("file", file, filename)
    else form.append("file", file)
    form.append("upload_preset", "aerolearn_avatars")
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${kind}/upload`, {
      method: "POST",
      body: form,
    })
    const data = await res.json()
    if (!data.secure_url) throw new Error("The upload failed.")
    return data.secure_url as string
  }

  const sendVoiceNote = async (blob: Blob) => {
    const conv = activeConv
    if (!conv || !uid) return
    setUploading(true)
    try {
      const url = await uploadTo("video", blob, "voicenote.webm")
      await addDoc(collection(db, "conversations", conv.id, "messages"), {
        senderId: uid,
        text: "Voice note",
        mediaUrl: url,
        mediaType: "audio",
        createdAt: serverTimestamp(),
      })
      await updateDoc(doc(db, "conversations", conv.id), {
        lastMessage: "🎤 Voice note",
        updatedAt: serverTimestamp(),
        unreadBy: conv.participants.filter((p) => p !== uid),
      })
      if (conv.participants.includes(AI_BOT_ID)) {
        void askBot(conv, {
          message: "Transcribe and respond to this voice note",
          mediaUrl: url,
          mediaType: "audio",
        })
      }
    } catch (error) {
      console.error("Failed to send the voice note:", error)
      setBanner({ tone: "error", text: "The voice note did not upload. Try again." })
    } finally {
      setUploading(false)
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        sendVoiceNote(new Blob(chunksRef.current, { type: "audio/webm" }))
      }

      recorder.start()
      setRecording(true)
      setRecordSeconds(0)
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000)
    } catch (error) {
      console.error("Microphone unavailable:", error)
      setBanner({ tone: "error", text: "We could not reach your microphone. Check your permissions." })
    }
  }

  const stopRecording = () => {
    if (!recorderRef.current || !recording) return
    recorderRef.current.stop()
    recorderRef.current.stream.getTracks().forEach((track) => track.stop())
    setRecording(false)
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
  }

  const onPickImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !activeConv || !uid) return
    if (file.size > MAX_IMAGE_BYTES) {
      setBanner({ tone: "error", text: "Pick an image under 5 MB." })
      return
    }
    setUploading(true)
    try {
      const url = await uploadTo("image", file)
      setUploading(false)
      await sendMessage(url)
    } catch (error) {
      console.error("Failed to upload the image:", error)
      setBanner({ tone: "error", text: "The image did not upload. Try again." })
      setUploading(false)
    }
  }

  const onPickGroupPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !activeConv || !uid || !activeConv.admins?.includes(uid)) return
    if (file.size > MAX_IMAGE_BYTES) {
      setBanner({ tone: "error", text: "Pick an image under 5 MB." })
      return
    }
    setUploading(true)
    try {
      const url = await uploadTo("image", file)
      await updateDoc(doc(db, "conversations", activeConv.id), { groupPhoto: url })
    } catch (error) {
      console.error("Failed to update the group photo:", error)
      setBanner({ tone: "error", text: "The photo did not upload. Try again." })
    } finally {
      setUploading(false)
    }
  }

  const onDraftChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(event.target.value)
    const conv = activeConv
    if (!conv || !uid) return

    if (!conv.typing?.includes(uid)) {
      updateDoc(doc(db, "conversations", conv.id), { typing: arrayUnion(uid) }).catch(console.error)
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      updateDoc(doc(db, "conversations", conv.id), { typing: arrayRemove(uid) }).catch(console.error)
    }, 2000)
  }

  /* Reads every student at your school and filters in memory. Fine for one school,
     wasteful at scale — a lowercased `displayNameLower` field and a prefix query
     would fix it, the way the community page has to work around the same gap. */
  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault()
    const term = search.trim().toLowerCase()
    if (!term || !uid) return
    setSearching(true)
    try {
      const snap = await getDocs(
        query(collection(db, "users"), where("schoolName", "==", profile?.schoolName || "")),
      )
      const results: Person[] = []
      snap.forEach((d) => {
        const data = d.data()
        if (d.id !== uid && (data.displayName ?? "").toLowerCase().includes(term)) {
          results.push({ id: d.id, displayName: data.displayName || "Student", photoURL: data.photoURL })
        }
      })
      if ("ai bot assistant aerolearn".includes(term)) results.unshift(AI_BOT)
      setSearchResults(results.slice(0, 10))
    } catch (error) {
      console.error("Search failed:", error)
      setBanner({ tone: "error", text: "The search did not run. Try again." })
    } finally {
      setSearching(false)
    }
  }

  const runMemberSearch = async (event: React.FormEvent) => {
    event.preventDefault()
    const term = memberSearch.trim().toLowerCase()
    if (!term || !uid) return
    const friends: string[] = profile?.friends ?? []
    const candidates = friends.filter((id) => !activeConv?.participants.includes(id))

    const rows = await Promise.all(
      candidates.map(async (id) => {
        if (userCache[id]) return userCache[id]
        try {
          const snap = await getDoc(doc(db, "users", id))
          if (!snap.exists()) return null
          const data = snap.data()
          return { id, displayName: data.displayName || "Student", photoURL: data.photoURL } as Person
        } catch {
          return null
        }
      }),
    )

    setMemberResults(
      rows
        .filter((p): p is Person => Boolean(p) && p!.displayName.toLowerCase().includes(term))
        .slice(0, 10),
    )
  }

  const addMember = async (personId: string) => {
    if (!activeConv || activeConv.type !== "group" || !uid) return
    if (!activeConv.admins?.includes(uid)) {
      setBanner({ tone: "error", text: "Only admins can add members." })
      return
    }
    try {
      await updateDoc(doc(db, "conversations", activeConv.id), {
        participants: arrayUnion(personId),
        unreadBy: arrayUnion(personId),
      })
      setShowAddMember(false)
      setMemberSearch("")
      setMemberResults([])
      setBanner({ tone: "success", text: "Member added." })
    } catch (error) {
      console.error("Failed to add the member:", error)
      setBanner({ tone: "error", text: "That did not work. Try again." })
    }
  }

  const makeAdmin = async (personId: string) => {
    if (!activeConv || !uid || !activeConv.admins?.includes(uid)) return
    try {
      await updateDoc(doc(db, "conversations", activeConv.id), { admins: arrayUnion(personId) })
    } catch (error) {
      console.error("Failed to promote:", error)
      setBanner({ tone: "error", text: "That did not save. Try again." })
    }
  }

  const renameGroup = async (nextName: string) => {
    if (!activeConv || activeConv.type !== "group" || !uid) return
    if (!activeConv.admins?.includes(uid)) {
      setBanner({ tone: "error", text: "Only admins can rename the group." })
      return
    }
    if (!nextName.trim() || nextName.trim() === activeConv.displayName) return
    try {
      await updateDoc(doc(db, "conversations", activeConv.id), { name: nextName.trim() })
    } catch (error) {
      console.error("Failed to rename:", error)
      setBanner({ tone: "error", text: "That did not save. Try again." })
    }
  }

  /* Leaving a thread changes only this student's membership. Other participants
     keep their messages, and no orphaned message rows are created. */
  const deleteConversation = async () => {
    if (!activeConv || !uid) return
    const confirmed = confirm(
      "Leave this chat? It will disappear from your conversations.",
    )
    if (!confirmed) return
    try {
      await updateDoc(doc(db, "conversations", activeConv.id), {
        participants: arrayRemove(uid),
        unreadBy: arrayRemove(uid),
        typing: arrayRemove(uid),
        ...(activeConv.type === "group" ? { admins: arrayRemove(uid) } : {}),
      })
      closeConversation()
    } catch (error) {
      console.error("Failed to delete the chat:", error)
      setBanner({ tone: "error", text: "The chat was not deleted. Try again." })
    }
  }

  /* `?with=<uid>&name=<label>` from the community page, handled once. */
  const deepLinkRef = useRef(false)
  useEffect(() => {
    if (deepLinkRef.current || loading || !uid || !profile || !withUserId) return
    deepLinkRef.current = true
    window.history.replaceState(null, "", "/app/messages")

    const existing = conversations.find(
      (c) => c.type === "direct" && c.participants.includes(withUserId),
    )
    if (existing) {
      openConversation(existing)
      return
    }
    startConversationWith({ id: withUserId, displayName: withUserName || "Student" })
  }, [loading, uid, profile, withUserId, withUserName, conversations]) // eslint-disable-line react-hooks/exhaustive-deps

  /* `?q=<question>` from a lesson or quiz — opens the assistant with the text drafted. */
  const exportRef = useRef(false)
  useEffect(() => {
    if (exportRef.current || loading || !uid || !exportedQuestion) return
    exportRef.current = true
    window.history.replaceState(null, "", "/app/messages")

    const botThread = conversations.find(
      (c) => c.type === "direct" && c.participants.includes(AI_BOT_ID),
    )
    if (botThread) openConversation(botThread)
    else startConversationWith(AI_BOT)
    setDraft(`Can you explain this to me?\n\n${exportedQuestion}`)
  }, [loading, uid, exportedQuestion, conversations]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showNewGroup && !showAddMember && !showGroupInfo && !showEmoji) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setShowEmoji(false)
      setShowAddMember(false)
      setShowNewGroup(false)
      setShowGroupInfo(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [showNewGroup, showAddMember, showGroupInfo, showEmoji])

  /* Resolve friend names once the group sheet opens, so the picker has something to show. */
  useEffect(() => {
    if (!showNewGroup) return
    void cachePeople(profile?.friends ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNewGroup, profile?.friends])

  if (loading) return <LoadingState full text="Loading your messages…" />

  const isAdmin = Boolean(uid && activeConv?.admins?.includes(uid))
  const someoneTyping = (activeConv?.typing ?? []).filter((p) => p !== uid)
  /* Only the newest message you sent can carry a receipt — `unreadBy` is one flag for
     the whole thread, so painting a tick on every bubble was inventing data. */
  const lastMineId = [...messages].reverse().find((m) => m.senderId === uid)?.id ?? null
  const readByAll = activeConv
    ? (activeConv.unreadBy ?? []).filter((p) => p !== uid).length === 0
    : false
  const friendPeople: Person[] = ((profile?.friends ?? []) as string[])
    .map((id) => userCache[id])
    .filter((person): person is Person => Boolean(person))

  return (
    <div className="animate-fade-in">
      {banner && (
        <p
          role={banner.tone === "error" ? "alert" : "status"}
          className={cn(
            "mb-4 flex items-start gap-2.5 rounded-lg border px-4 py-3 text-body-sm",
            banner.tone === "error"
              ? "border-danger/30 bg-danger/[0.06] text-danger"
              : "border-success/30 bg-success/[0.06] text-success",
          )}
        >
          {banner.text}
        </p>
      )}

      <div className="flex h-[calc(100dvh-13rem)] min-h-[460px] overflow-hidden rounded-xl border border-hairline bg-surface md:h-[calc(100dvh-9rem)]">
        {/* Conversation list */}
        <div
          className={cn(
            "w-full min-w-0 flex-col border-hairline md:flex md:w-80 md:border-r lg:w-96",
            activeConv ? "hidden md:flex" : "flex",
          )}
        >
          <div className="shrink-0 border-b border-hairline p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Link
                  href="/app"
                  aria-label="Back to dashboard"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <ArrowLeft size={18} aria-hidden="true" />
                </Link>
                <h1 className="truncate text-h4 font-semibold text-foreground">Messages</h1>
              </div>
              <button
                type="button"
                onClick={() => setShowNewGroup(true)}
                aria-label="Create a group"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-sunken text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <Users size={16} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={runSearch} className="relative mt-3">
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search schoolmates…"
                aria-label="Search schoolmates"
                className="input-premium pl-9"
              />
            </form>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {searching && (
              <p className="px-2 py-3 text-body-sm text-muted" role="status">
                Searching…
              </p>
            )}

            {searchResults.length > 0 && (
              <div className="mb-2 rounded-lg border border-hairline bg-surface-sunken p-2">
                <p className="px-2 pb-2 text-overline text-muted">Search results</p>
                <ul className="space-y-1">
                  {searchResults.map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() => startConversationWith(person)}
                        className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-surface-hover"
                      >
                        <Avatar name={person.displayName} photo={person.photoURL} size="sm" />
                        <span className="truncate text-body-sm font-medium text-foreground">
                          {person.displayName}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {conversations.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent/[0.08] text-accent">
                  <MessageSquare size={24} aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-body font-semibold text-foreground">No conversations yet</h2>
                <p className="mt-1 text-body-sm text-muted">
                  Start a chat with a friend, or ask the assistant for help.
                </p>
                <button
                  type="button"
                  onClick={() => startConversationWith(AI_BOT)}
                  className="btn-primary btn-sm mt-4"
                >
                  Chat with the assistant
                </button>
              </div>
            ) : (
              <ul>
                {conversations.map((conv) => {
                  const unread = Boolean(uid && conv.unreadBy?.includes(uid))
                  const active = activeConv?.id === conv.id
                  const typing = (conv.typing ?? []).filter((p) => p !== uid).length > 0
                  return (
                    <li key={conv.id}>
                      <button
                        type="button"
                        onClick={() => openConversation(conv)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors",
                          active ? "bg-accent/[0.08]" : "hover:bg-surface-hover",
                        )}
                      >
                        <Avatar
                          name={conv.displayName}
                          photo={conv.displayPhoto}
                          size="lg"
                          online={conv.type === "direct" && conv.isOnline}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span
                              className={cn(
                                "truncate text-body-sm font-semibold",
                                active ? "text-accent" : "text-foreground",
                              )}
                            >
                              {conv.displayName}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 text-caption tabular-nums",
                                unread ? "font-semibold text-accent" : "text-subtle",
                              )}
                            >
                              {clockOf(conv.updatedAt)}
                            </span>
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                "truncate text-caption",
                                typing
                                  ? "italic text-accent"
                                  : unread
                                    ? "font-medium text-foreground"
                                    : "text-muted",
                              )}
                            >
                              {typing ? "typing…" : conv.lastMessage || "No messages yet"}
                            </span>
                            {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Thread */}
        <div
          className={cn(
            "relative min-w-0 flex-1 flex-col bg-surface-sunken",
            activeConv ? "flex" : "hidden md:flex",
          )}
        >
          {!activeConv ? (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
              <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/[0.08] text-accent">
                <MessageSquare size={30} aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-h3 font-semibold text-foreground">Pick a conversation</h2>
              <p className="mt-2 max-w-sm text-body-sm leading-relaxed text-muted">
                Message classmates, run a study group, or ask the AeroLearn assistant a question.
              </p>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline bg-surface px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={closeConversation}
                    aria-label="Back to conversations"
                    className="-ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground md:hidden"
                  >
                    <ArrowLeft size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => activeConv.type === "group" && setShowGroupInfo(true)}
                    className="flex min-w-0 items-center gap-3 text-left"
                  >
                    <Avatar
                      name={activeConv.displayName}
                      photo={activeConv.displayPhoto}
                      size="md"
                      online={activeConv.type === "direct" && activeConv.isOnline}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-body-sm font-semibold text-foreground">
                        {activeConv.displayName}
                      </span>
                      <span className="block truncate text-caption text-muted">
                        {someoneTyping.length > 0 ? (
                          <span className="text-accent">typing…</span>
                        ) : activeConv.type === "group" ? (
                          `${activeConv.participants.length} participants`
                        ) : activeConv.isOnline ? (
                          <span className="text-success">Online</span>
                        ) : (
                          "Offline"
                        )}
                      </span>
                    </span>
                  </button>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {activeConv.type === "group" && (
                    <button
                      type="button"
                      onClick={() => setShowGroupInfo((v) => !v)}
                      aria-label="Group info"
                      aria-pressed={showGroupInfo}
                      className={cn(
                        "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                        showGroupInfo
                          ? "bg-accent/[0.08] text-accent"
                          : "text-muted hover:bg-surface-hover hover:text-foreground",
                      )}
                    >
                      <Info size={18} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={deleteConversation}
                    aria-label="Leave this chat"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/[0.08] hover:text-danger"
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div
                ref={messageLogRef}
                className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-5 sm:px-6"
                role="log"
                aria-live="polite"
                aria-label="Messages"
              >
                {messages.length === 0 && (
                  <p className="mx-auto max-w-sm rounded-lg border border-hairline bg-surface px-4 py-3 text-center text-caption leading-relaxed text-muted">
                    Nothing here yet. Messages are stored on your AeroLearn account — they are not
                    end-to-end encrypted, so keep anything private off this chat.
                  </p>
                )}

                {messages.map((msg, i) => {
                  const mine = msg.senderId === uid
                  const prev = i > 0 ? messages[i - 1] : null
                  const firstOfRun = !prev || prev.senderId !== msg.senderId
                  const day = dayOf(msg.createdAt)
                  const showDay = day !== (prev ? dayOf(prev.createdAt) : null)
                  const quoted = msg.replyTo ? messages.find((m) => m.id === msg.replyTo) : null
                  const senderName =
                    msg.senderId === AI_BOT_ID
                      ? AI_BOT.displayName
                      : userCache[msg.senderId]?.displayName || "Student"

                  return (
                    <div key={msg.id}>
                      {showDay && (
                        <div className="my-5 flex justify-center">
                          <span className="rounded-full border border-hairline bg-surface px-3 py-1 text-overline text-muted">
                            {day}
                          </span>
                        </div>
                      )}

                      <div
                        className={cn(
                          "group flex items-end gap-2",
                          mine ? "justify-end" : "justify-start",
                          firstOfRun ? "mt-3" : "mt-0.5",
                        )}
                      >
                        {!mine && (
                          <button
                            type="button"
                            onClick={() => setReplyingTo(msg)}
                            aria-label={`Reply to ${senderName}`}
                            className="mb-1 hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-hover hover:text-foreground group-hover:flex"
                          >
                            <CornerUpLeft size={14} aria-hidden="true" />
                          </button>
                        )}

                        <div
                          className={cn(
                            "max-w-[85%] rounded-xl border px-3.5 py-2.5 text-body-sm leading-relaxed md:max-w-[68%]",
                            mine
                              ? "border-accent bg-accent text-white dark:text-ink-950"
                              : "border-hairline bg-surface text-foreground",
                          )}
                        >
                          {activeConv.type === "group" && !mine && firstOfRun && (
                            <p
                              className={cn(
                                "mb-1 text-caption font-semibold",
                                mine ? "text-white/80" : "text-accent",
                              )}
                            >
                              {senderName}
                            </p>
                          )}

                          {quoted && (
                            <div
                              className={cn(
                                "mb-2 truncate rounded-lg border-l-2 px-2.5 py-1.5 text-caption",
                                mine
                                  ? "border-white/50 bg-white/[0.15] text-white/90 dark:border-ink-950/40 dark:bg-ink-950/10 dark:text-ink-950/80"
                                  : "border-accent bg-surface-sunken text-muted",
                              )}
                            >
                              <span className="block font-semibold">
                                {quoted.senderId === uid
                                  ? "You"
                                  : userCache[quoted.senderId]?.displayName || "Student"}
                              </span>
                              {quoted.text || (quoted.mediaUrl ? "Media" : "")}
                            </div>
                          )}

                          {msg.mediaUrl && msg.mediaType === "image" && (
                            <span className="mb-2 block overflow-hidden rounded-lg">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={msg.mediaUrl}
                                alt="Shared image"
                                className="max-h-80 w-full object-cover"
                              />
                            </span>
                          )}

                          {msg.mediaUrl && msg.mediaType === "audio" && (
                            <span className="mb-2 block min-w-[220px]">
                              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                              <audio controls src={msg.mediaUrl} className="h-10 w-full" />
                            </span>
                          )}

                          {msg.senderId === AI_BOT_ID ? (
                            <div className="prose prose-sm max-w-none text-foreground prose-p:leading-relaxed prose-pre:bg-surface-sunken prose-pre:text-foreground dark:prose-invert">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                            </div>
                          ) : (
                            msg.text && <TextWithLinks text={msg.text} />
                          )}

                          <span
                            className={cn(
                              "mt-1 flex items-center justify-end gap-1 text-caption tabular-nums",
                              mine ? "text-white/70 dark:text-ink-950/60" : "text-subtle",
                            )}
                          >
                            {clockOf(msg.createdAt)}
                            {mine && msg.id === lastMineId && (
                              <span className="inline-flex items-center gap-0.5">
                                <Check size={12} aria-hidden="true" />
                                <span className="sr-only">{readByAll ? "Read" : "Sent"}</span>
                                {readByAll && <Check size={12} className="-ml-2" aria-hidden="true" />}
                              </span>
                            )}
                          </span>
                        </div>

                        {mine && (
                          <button
                            type="button"
                            onClick={() => setReplyingTo(msg)}
                            aria-label="Reply to your message"
                            className="mb-1 hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-hover hover:text-foreground group-hover:flex"
                          >
                            <CornerUpLeft size={14} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div className="h-2" />
              </div>

              <div className="shrink-0 border-t border-hairline bg-surface p-3">
                {replyingTo && (
                  <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border-l-2 border-accent bg-surface-sunken px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-caption font-semibold text-accent">
                        Replying to{" "}
                        {replyingTo.senderId === uid
                          ? "yourself"
                          : userCache[replyingTo.senderId]?.displayName || "Student"}
                      </p>
                      <p className="truncate text-body-sm text-muted">
                        {replyingTo.text || (replyingTo.mediaUrl ? "Media" : "")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyingTo(null)}
                      aria-label="Cancel reply"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                )}

                {showEmoji && (
                  <div className="mb-2 rounded-lg border border-hairline bg-surface-sunken p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-overline text-muted">Insert emoji</span>
                      <button
                        type="button"
                        onClick={() => setShowEmoji(false)}
                        aria-label="Close the emoji picker"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="grid grid-cols-8 gap-1">
                      {EMOJI.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            setDraft((d) => d + emoji)
                            setShowEmoji(false)
                          }}
                          className="rounded-lg p-1 text-h4 transition-colors hover:bg-surface-hover"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeConv.participants.includes(AI_BOT_ID) && (
                  <div className="mb-2 flex flex-wrap gap-2" aria-label="AI tutor options">
                    {webSearchAvailable && (
                      <button type="button" aria-pressed={webSearchEnabled} onClick={() => setWebSearchEnabled((enabled) => !enabled)}
                        className={cn("rounded-full border px-3 py-1.5 text-caption font-semibold", webSearchEnabled ? "border-accent bg-accent/10 text-accent" : "border-hairline text-muted")}>
                        {webSearchEnabled ? "✓ " : ""}Search web
                      </button>
                    )}
                    <button type="button" aria-pressed={quizModeEnabled} onClick={() => setQuizModeEnabled((enabled) => !enabled)}
                      className={cn("rounded-full border px-3 py-1.5 text-caption font-semibold", quizModeEnabled ? "border-accent bg-accent/10 text-accent" : "border-hairline text-muted")}>
                      {quizModeEnabled ? "✓ " : ""}Quiz me
                    </button>
                  </div>
                )}

                {recording ? (
                  <div className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger/[0.06] px-4 py-3">
                    <span
                      className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-danger"
                      aria-hidden="true"
                    />
                    <p className="flex-1 text-body-sm font-semibold tabular-nums text-danger" role="status">
                      Recording {Math.floor(recordSeconds / 60)}:
                      {String(recordSeconds % 60).padStart(2, "0")}
                    </p>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="btn-primary btn-sm"
                    >
                      <Square size={14} aria-hidden="true" />
                      Stop and send
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      void sendMessage()
                    }}
                    className="flex items-end gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => setShowEmoji((v) => !v)}
                      aria-label="Insert emoji"
                      aria-pressed={showEmoji}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                    >
                      <Smile size={18} aria-hidden="true" />
                    </button>

                    <label className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-hairline bg-surface text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
                      {uploading ? (
                        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <ImageIcon size={18} aria-hidden="true" />
                      )}
                      <span className="sr-only">Attach an image</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={uploading}
                        onChange={onPickImage}
                      />
                    </label>

                    <label htmlFor="message-draft" className="sr-only">
                      Write a message
                    </label>
                    <textarea
                      id="message-draft"
                      value={draft}
                      onChange={onDraftChange}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault()
                          void sendMessage()
                        }
                      }}
                      rows={1}
                      placeholder={
                        activeConv?.participants.includes(AI_BOT_ID)
                          ? "Ask the assistant anything…"
                          : "Write a message…"
                      }
                      className="input-premium max-h-32 min-h-[2.75rem] flex-1 resize-none py-3"
                    />

                    {draft.trim() ? (
                      <button
                        type="submit"
                        disabled={sending}
                        aria-label="Send message"
                        className="btn-primary inline-flex h-11 w-11 shrink-0 items-center justify-center p-0"
                      >
                        {sending ? (
                          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <Send size={18} aria-hidden="true" />
                        )}
                      </button>
                    ) : activeConv.participants.includes(AI_BOT_ID) && !aiAudioAvailable ? (
                      <button
                        type="button"
                        disabled
                        title="AI voice replies are unavailable until a transcription model is added to the gateway"
                        aria-label="AI voice notes unavailable"
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface-sunken text-subtle opacity-50"
                      >
                        <Mic size={18} aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={startRecording}
                        aria-label="Record a voice note"
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                      >
                        <Mic size={18} aria-hidden="true" />
                      </button>
                    )}
                  </form>
                )}
              </div>
            </>
          )}
        </div>

        {showGroupInfo && activeConv && (
          <aside
            aria-label="Conversation details"
            className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l border-hairline bg-surface lg:flex"
          >
            <div className="flex items-center justify-between border-b border-hairline p-4">
              <h2 className="text-body font-semibold text-foreground">Details</h2>
              <button
                type="button"
                onClick={() => setShowGroupInfo(false)}
                aria-label="Close details"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-3 border-b border-hairline p-6">
              <div className="relative">
                <Avatar
                  name={activeConv.displayName}
                  photo={activeConv.displayPhoto}
                  size="xl"
                />
                {activeConv.type === "group" && isAdmin && (
                  <label className="absolute -bottom-1 -right-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-hairline bg-surface text-muted shadow-sm transition-colors hover:text-accent">
                    {uploading ? (
                      <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Camera size={14} aria-hidden="true" />
                    )}
                    <span className="sr-only">Change the group photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={uploading}
                      onChange={onPickGroupPhoto}
                    />
                  </label>
                )}
              </div>

              {activeConv.type === "group" && isAdmin ? (
                <div className="w-full">
                  <label htmlFor="group-name" className="field-label">
                    Group name
                  </label>
                  <input
                    id="group-name"
                    defaultValue={activeConv.name || ""}
                    onBlur={(event) => void renameGroup(event.target.value)}
                    className="input-premium text-center"
                  />
                  <p className="field-hint">Saved when you click away.</p>
                </div>
              ) : (
                <p className="text-center text-h4 text-foreground">{activeConv.displayName}</p>
              )}
            </div>

            {activeConv.type === "group" && (
              <div className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-overline text-muted">
                    {activeConv.participants.length} members
                  </h3>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setShowAddMember(true)}
                      className="inline-flex items-center gap-1 text-caption font-semibold text-accent transition-colors hover:text-accent-600"
                    >
                      <UserPlus size={12} aria-hidden="true" />
                      Add member
                    </button>
                  )}
                </div>

                <ul className="space-y-1">
                  {activeConv.participants.map((memberId) => {
                    const member = userCache[memberId]
                    const memberIsAdmin = activeConv.admins?.includes(memberId)
                    return (
                      <li
                        key={memberId}
                        className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-hover"
                      >
                        <Avatar
                          name={member?.displayName}
                          photo={member?.photoURL}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-sm font-medium text-foreground">
                            {memberId === uid ? "You" : member?.displayName || "Student"}
                          </p>
                          {memberIsAdmin && (
                            <span className="inline-flex items-center gap-1 text-caption text-accent">
                              <Shield size={10} aria-hidden="true" />
                              Admin
                            </span>
                          )}
                        </div>
                        {isAdmin && !memberIsAdmin && memberId !== uid && (
                          <button
                            type="button"
                            onClick={() => void makeAdmin(memberId)}
                            className="shrink-0 text-caption font-semibold text-accent transition-colors hover:text-accent-600"
                          >
                            Make admin
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>

      {showNewGroup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-group-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-0 sm:items-center sm:p-4"
        >
          <div className="animate-scale-in max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-hairline bg-surface p-6 sm:max-w-lg sm:rounded-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">New group</p>
                <h2 id="new-group-title" className="text-h3 text-foreground">
                  Start a study group
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowNewGroup(false)}
                aria-label="Close"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="mb-4">
              <label htmlFor="new-group-name" className="field-label">
                Group name
              </label>
              <input
                id="new-group-name"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="e.g. Physics revision squad"
                className="input-premium"
              />
            </div>

            <p className="field-label">Members</p>
            <p className="field-hint mb-3">
              Pick from your friends. {groupPicks.length} selected.
            </p>

            {friendPeople.length === 0 ? (
              <p className="rounded-lg border border-hairline bg-surface-sunken px-4 py-6 text-center text-body-sm text-muted">
                You have no friends yet. Add classmates from their profile, then come back to
                build a group.
              </p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-hairline p-2">
                {friendPeople.map((person) => {
                  const picked = groupPicks.some((p) => p.id === person.id)
                  return (
                    <li key={person.id}>
                      <button
                        type="button"
                        aria-pressed={picked}
                        onClick={() =>
                          setGroupPicks((prev) =>
                            picked
                              ? prev.filter((p) => p.id !== person.id)
                              : [...prev, person],
                          )
                        }
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                          picked ? "bg-accent/[0.08]" : "hover:bg-surface-hover",
                        )}
                      >
                        <Avatar name={person.displayName} photo={person.photoURL} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-foreground">
                          {person.displayName}
                        </span>
                        {picked && <Check size={16} className="shrink-0 text-accent" aria-hidden="true" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowNewGroup(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void createGroup()}
                disabled={!groupName.trim() || groupPicks.length === 0}
                className="btn-primary flex-1"
              >
                Create group
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddMember && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-member-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-0 sm:items-center sm:p-4"
        >
          <div className="animate-scale-in max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-hairline bg-surface p-6 sm:max-w-md sm:rounded-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <h2 id="add-member-title" className="text-h3 text-foreground">
                Add a member
              </h2>
              <button
                type="button"
                onClick={() => setShowAddMember(false)}
                aria-label="Close"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={runMemberSearch} className="mb-4">
              <label htmlFor="member-search" className="field-label">
                Search your friends
              </label>
              <div className="relative">
                <Search
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
                />
                <input
                  id="member-search"
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder="Name"
                  className="input-premium pl-9"
                />
              </div>
              <p className="field-hint">Only friends who are not already in the group.</p>
            </form>

            {memberResults.length > 0 ? (
              <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-hairline p-2">
                {memberResults.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      onClick={() => void addMember(person.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-hover"
                    >
                      <Avatar name={person.displayName} photo={person.photoURL} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-foreground">
                        {person.displayName}
                      </span>
                      <UserPlus size={14} className="shrink-0 text-accent" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              memberSearch.trim() && (
                <p className="rounded-lg border border-hairline bg-surface-sunken px-4 py-6 text-center text-body-sm text-muted">
                  No match. Press Enter to search.
                </p>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}
