export interface Note {
  id?: string
  classLevel: string
  subject: string
  topic: string
  title: string
  content: NoteBlock[]
  isPublished: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface NoteBlock {
  type: "heading" | "paragraph" | "list" | "formula" | "example" | "tip" | "summary"
  content: string
  level?: number
}
