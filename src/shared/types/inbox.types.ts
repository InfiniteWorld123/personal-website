import type {
  InboxLanguage,
  MessageDirection,
  PersonSource,
} from '#/shared/validation/inbox.validation'

/**
 * What the inbox reads. Every one of these is an explicit projection built in
 * a service — never a table row handed out — so a column added tomorrow is not
 * published by accident.
 */

export type Attachment = {
  id: string
  filename: string
  contentType: string
  bytes: number
  direction: MessageDirection
  /** An admin-guarded route, never the bucket's public URL. */
  url: string
}

export type Message = {
  id: string
  direction: MessageDirection
  subject: string
  body: string
  bodyRich: unknown | null
  fromEmail: string | null
  toEmail: string | null
  sentAt: string
  readAt: string | null
  attachments: Attachment[]
}

export type Note = {
  id: string
  body: string
  createdAt: string
  updatedAt: string
}

/** One row of the list. Small on purpose: the list renders hundreds. */
export type InboxRow = {
  id: string
  name: string
  email: string
  company: string | null
  language: InboxLanguage
  source: PersonSource
  subject: string
  preview: string
  lastMessageAt: string
  unreadCount: number
  attachmentCount: number
  starred: boolean
  archived: boolean
  /** True when the last word was the owner's. Drives the "replied" mark. */
  replied: boolean
}

/** Everything one person's page needs, in one request. */
export type Person = {
  id: string
  name: string
  email: string
  phone: string | null
  company: string | null
  language: InboxLanguage
  source: PersonSource
  /** What they typed into the form. The first thing the thread shows. */
  firstMessage: string
  /** The three qualifying answers the contact form collects, when it did. */
  facts: Array<{ label: string; value: string }>
  createdAt: string
  starred: boolean
  archived: boolean
  unread: boolean
  messages: Message[]
  notes: Note[]
}

export type Snippet = { label: string; body: string; language: InboxLanguage }

export type InboxSettings = {
  signature: Record<InboxLanguage, string>
  snippets: Snippet[]
}
