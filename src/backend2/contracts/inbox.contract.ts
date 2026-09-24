import * as v from 'valibot'
import type { Page } from './pagination.contract'
import {
  type RichTextDoc,
  RichTextNodeSchema,
  richTextToPlainText,
  walkRichText,
} from './rich-text.contract'

/**
 * The Inbox contract, shared by Backend2 and the Dashboard. See
 * `docs/v2/inbox.md`.
 *
 * Pure: valibot and plain TypeScript. What the composer refuses before the
 * owner presses Send is exactly what the server refuses afterwards.
 */

export const INBOX_LANGUAGES = ['de', 'en', 'ar'] as const
export type InboxLanguage = (typeof INBOX_LANGUAGES)[number]

/** Where a conversation lives. Sent and Drafts are views, not folders. */
export const INBOX_FOLDERS = ['inbox', 'archived', 'trash'] as const
export type InboxFolder = (typeof INBOX_FOLDERS)[number]

/** What the list can show: the three folders, plus Sent. */
export const INBOX_VIEWS = ['inbox', 'archived', 'trash', 'sent'] as const
export type InboxView = (typeof INBOX_VIEWS)[number]

export const INBOX_LIMITS = {
  email: 254,
  name: 200,
  subject: 300,
  /** Characters of plain text an email body may hold. */
  bodyCharacters: 50_000,
  searchQuery: 120,
  signature: 2_000,
  snippetTitle: 120,
  snippetBody: 10_000,
  /** Media files one outgoing email may carry. */
  maxAttachments: 10,
  /**
   * Bytes of attachment one outgoing email may carry. Resend refuses an email
   * over 40 MB once encoded, and base64 costs a third on top of the bytes.
   */
  maxAttachmentBytes: 25 * 1024 * 1024,
  /** Messages per page when a long conversation is opened. */
  messagePage: 20,
} as const

/* ------------------------------------------------------------------- shapes */

export type DeliveryStatus = 'sending' | 'accepted' | 'failed'

export type ConversationSummary = {
  id: string
  subject: string
  counterpartEmail: string
  counterpartName: string
  origin: 'incoming' | 'outgoing' | 'contact' | 'booking'
  folder: InboxFolder
  isRead: boolean
  isStarred: boolean
  messageCount: number
  lastMessageAt: string
  lastDirection: 'incoming' | 'outgoing' | null
  lastPreview: string
  /** The newest outgoing message's state, so a failed send shows in the list. */
  hasFailedSend: boolean
  hasDraft: boolean
  trashedAt: string | null
}

export type ConversationFacts = Record<string, string>

export type IncomingAttachment = {
  id: string
  fileName: string
  /** The detected type when the server recognised the bytes, else the claim. */
  contentType: string
  byteSize: number
  status: 'stored' | 'blocked' | 'failed'
  /** Plain sentence, set when the file was blocked or could not be stored. */
  failureReason: string | null
  /** True when Media accepts this type; otherwise the owner downloads it. */
  canSaveToMedia: boolean
  /** Why Save to Media is unavailable, when it is. */
  saveToMediaUnavailableReason: string | null
  savedMediaAssetId: string | null
}

export type OutgoingAttachment = {
  assetId: string
  fileName: string
  contentType: string
  byteSize: number
}

export type InboxMessage = {
  id: string
  direction: 'incoming' | 'outgoing'
  fromEmail: string
  fromName: string
  toEmail: string
  toName: string
  subject: string
  bodyText: string
  /** Outgoing only. */
  bodyDoc: RichTextDoc | null
  /** Incoming only: whether a sandboxed HTML view exists. */
  hasHtml: boolean
  occurredAt: string
  delivery: {
    status: DeliveryStatus
    /** `fake` means local development: nothing left this computer. */
    provider: 'resend' | 'fake' | null
    failureReason: string | null
    attempts: number
    /** Retrying is safe: the provider is given the same idempotency key. */
    canRetry: boolean
  } | null
  incomingAttachments: IncomingAttachment[]
  outgoingAttachments: OutgoingAttachment[]
  language: InboxLanguage | null
}

export type ConversationDetail = {
  conversation: ConversationSummary & { facts: ConversationFacts }
  /** Newest first; the Dashboard reverses a page to read top to bottom. */
  messages: Page<InboxMessage>
  replyDraftId: string | null
}

export type InboxCounts = {
  inbox: number
  inboxUnread: number
  archived: number
  trash: number
  sent: number
  drafts: number
}

export type InboxDraft = {
  id: string
  conversationId: string | null
  toEmail: string
  subject: string
  bodyDoc: RichTextDoc
  language: InboxLanguage
  attachments: OutgoingAttachment[]
  revision: number
  createdAt: string
  updatedAt: string
  /** For the Drafts list: who a reply goes to and what it is about. */
  conversationSubject: string | null
}

export type InboxSnippet = {
  id: string
  title: string
  language: InboxLanguage | null
  body: string
  updatedAt: string
}

export type InboxSettings = {
  signatures: Record<InboxLanguage, string>
  /** Where outgoing mail says it is from. Configuration, not a setting. */
  fromAddress: string
  /** `fake` in development: Send records the message and sends nothing. */
  sendMode: 'live' | 'fake'
}

/* ------------------------------------------------------------------ schemas */

const Uuid = v.pipe(v.string(), v.uuid('That is not a valid id'))

/**
 * One address. Deliberately plain: a display name, a list, or anything with a
 * comma is refused, because this mailbox writes to one person at a time.
 */
export const EmailAddressSchema = v.pipe(
  v.string('Enter an email address'),
  v.trim(),
  v.toLowerCase(),
  v.minLength(1, 'Enter an email address'),
  v.maxLength(INBOX_LIMITS.email, 'That email address is too long'),
  v.email('Enter one valid email address'),
  v.check((value) => !/[,;<>\s]/u.test(value), 'Enter one address only'),
)

export const SubjectSchema = v.pipe(
  v.string(),
  // One line: a newline in a subject is a header-injection attempt.
  v.transform((value) => value.replace(/[\r\n]+/gu, ' ')),
  v.trim(),
  v.maxLength(INBOX_LIMITS.subject, `Keep the subject under ${INBOX_LIMITS.subject} characters`),
)

/**
 * The body of an email.
 *
 * The same validated tree as a case study, minus what an email cannot carry:
 * an inline library image (attachments are chosen separately) and tables,
 * which many mail clients render unreadably.
 */
export const EmailDocSchema = v.pipe(
  v.object({
    type: v.literal('doc'),
    content: v.pipe(v.array(RichTextNodeSchema), v.maxLength(2000, 'That email is too long')),
  }),
  v.check((doc) => {
    let allowed = true

    walkRichText(doc as RichTextDoc, (node) => {
      if (node.type === 'image' || node.type.startsWith('table')) allowed = false
    })

    return allowed
  }, 'Images and tables cannot go into the body. Attach files instead.'),
  v.check(
    (doc) => richTextToPlainText(doc as RichTextDoc).length <= INBOX_LIMITS.bodyCharacters,
    `An email may hold at most ${INBOX_LIMITS.bodyCharacters} characters`,
  ),
) as v.GenericSchema<RichTextDoc>

const CountFromQuery = (fallback: number, max: number) =>
  v.pipe(
    v.optional(v.union([v.string(), v.number()]), fallback),
    v.transform((value) => (typeof value === 'number' ? value : Number(value.trim()))),
    v.number('That is not a number'),
    v.integer('That is not a whole number'),
    v.minValue(1, 'That is below the smallest allowed value'),
    v.maxValue(max, 'That is above the largest allowed value'),
  )

const BooleanFromQuery = v.optional(
  v.pipe(
    v.union([v.literal('true'), v.literal('false'), v.boolean()]),
    v.transform((value) => value === true || value === 'true'),
  ),
)

export const ConversationListQuerySchema = v.object({
  view: v.optional(v.picklist(INBOX_VIEWS), 'inbox'),
  unread: BooleanFromQuery,
  starred: BooleanFromQuery,
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(INBOX_LIMITS.searchQuery))),
  page: CountFromQuery(1, 100_000),
  pageSize: CountFromQuery(25, 100),
})

export type ConversationListQuery = v.InferOutput<typeof ConversationListQuerySchema>

export const ConversationDetailQuerySchema = v.object({
  page: CountFromQuery(1, 100_000),
  pageSize: CountFromQuery(INBOX_LIMITS.messagePage, 50),
})

export const ConversationPatchSchema = v.pipe(
  v.object({
    isRead: v.optional(v.boolean()),
    isStarred: v.optional(v.boolean()),
    archived: v.optional(v.boolean()),
  }),
  v.check(
    (input) =>
      input.isRead !== undefined || input.isStarred !== undefined || input.archived !== undefined,
    'Nothing to change',
  ),
)

/** Permanent deletion asks for the conversation's own id back. */
export const ConversationDeleteSchema = v.object({ confirm: Uuid })

export const EMPTY_TRASH_CONFIRMATION = 'EMPTY TRASH'

export const EmptyTrashSchema = v.object({
  confirm: v.literal(EMPTY_TRASH_CONFIRMATION, `Type ${EMPTY_TRASH_CONFIRMATION} to confirm`),
})

export const DraftListQuerySchema = v.object({
  page: CountFromQuery(1, 100_000),
  pageSize: CountFromQuery(25, 100),
})

/**
 * A new draft. A reply names its conversation and inherits the recipient and
 * subject; a new message may start completely empty.
 */
export const CreateDraftSchema = v.object({
  conversationId: v.optional(v.nullable(Uuid), null),
  toEmail: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(INBOX_LIMITS.email)), ''),
  subject: v.optional(SubjectSchema, ''),
  language: v.optional(v.picklist(INBOX_LANGUAGES), 'en'),
})

/**
 * An autosave. Deliberately lenient about the address: an incomplete private
 * draft must stay saveable. Sending is where every rule applies.
 */
export const DraftPatchSchema = v.pipe(
  v.object({
    revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
    toEmail: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(INBOX_LIMITS.email))),
    subject: v.optional(SubjectSchema),
    bodyDoc: v.optional(EmailDocSchema),
    language: v.optional(v.picklist(INBOX_LANGUAGES)),
    attachmentAssetIds: v.optional(
      v.pipe(
        v.array(Uuid),
        v.maxLength(INBOX_LIMITS.maxAttachments, `Attach at most ${INBOX_LIMITS.maxAttachments} files`),
      ),
    ),
  }),
)

export const SendDraftSchema = v.object({
  revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
  /** A blank subject is allowed only once the owner has confirmed it. */
  confirmBlankSubject: v.optional(v.boolean(), false),
})

export const SaveToMediaSchema = v.object({
  folderId: v.optional(v.nullable(Uuid), null),
})

export const SignatureSchema = v.pipe(
  v.string(),
  v.maxLength(INBOX_LIMITS.signature, `Keep a signature under ${INBOX_LIMITS.signature} characters`),
)

export const SettingsPutSchema = v.object({
  signatures: v.object({ de: SignatureSchema, en: SignatureSchema, ar: SignatureSchema }),
})

export const SnippetInputSchema = v.object({
  title: v.pipe(
    v.string('Give the ready reply a title'),
    v.trim(),
    v.minLength(1, 'Give the ready reply a title'),
    v.maxLength(INBOX_LIMITS.snippetTitle, `Keep the title under ${INBOX_LIMITS.snippetTitle} characters`),
  ),
  language: v.optional(v.nullable(v.picklist(INBOX_LANGUAGES)), null),
  body: v.pipe(
    v.string('Write the ready reply'),
    v.trim(),
    v.minLength(1, 'Write the ready reply'),
    v.maxLength(INBOX_LIMITS.snippetBody, `Keep it under ${INBOX_LIMITS.snippetBody} characters`),
  ),
})

export const SnippetListQuerySchema = v.object({
  page: CountFromQuery(1, 100_000),
  pageSize: CountFromQuery(25, 100),
})

/* ------------------------------------------------------------------ ingress */

/**
 * What the Cloudflare inbound Worker (`workers/inbound-email`) posts.
 */
export type InboundPayload = {
  to: string[]
  from: string
  fromName?: string
  subject?: string
  text?: string
  html?: string
  messageId?: string
  inReplyTo?: string
  references?: string
  files?: Array<{ filename: string; contentType: string; content: string }>
  /**
   * Files the letter had but the Worker could not carry (over 10 MB, or more
   * than one delivery may hold). No bytes — only enough to show each one as
   * missing. The full letter is in the copy forwarded to the owner's mailbox.
   */
  omittedFiles?: Array<{
    filename: string
    contentType: string
    byteSize: number
    reason: 'too-large' | 'letter-too-large'
  }>
}

/** The request headers of a signed delivery. */
export const INGRESS_HEADERS = {
  signature: 'x-inbox-signature',
  timestamp: 'x-inbox-timestamp',
} as const

/** How far a delivery's timestamp may be from the server's clock. */
export const INGRESS_TOLERANCE_SECONDS = 5 * 60

/** The body a delivery may carry: letter and base64 files together. */
export const INGRESS_MAX_BODY_BYTES = 30 * 1024 * 1024

/** Per incoming file, matching what the Worker already forwards. */
export const INGRESS_MAX_FILE_BYTES = 10 * 1024 * 1024

/** The HTML part of one letter, stored for the sandboxed view. */
export const INGRESS_MAX_HTML_CHARACTERS = 1_000_000

/**
 * The string that is signed: `<unix seconds>.<raw body>`, HMAC-SHA-256, hex.
 *
 * The timestamp inside the signature is what makes a captured delivery
 * useless after five minutes; the Message-ID deduplication covers the
 * minutes before that.
 */
export const ingressSigningInput = (timestamp: string, rawBody: string): string =>
  `${timestamp}.${rawBody}`
