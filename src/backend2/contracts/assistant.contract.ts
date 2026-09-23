import * as v from 'valibot'
import { PageQuerySchema, type Page } from './pagination.contract'

/**
 * Public AI Assistant V2 (`docs/v2/ai-assistant.md`).
 *
 * Shared by Backend2, the public widget and the Dashboard's transcript
 * viewer. It imports nothing but Valibot and the pagination envelope, so the
 * browser can run the same length rules the server enforces.
 *
 * The assistant answers questions from the owner's published website content
 * and nothing else. It does not collect contact details, create a Lead, book
 * anything or quote a price that is not published.
 */

export const ASSISTANT_LANGUAGES = ['de', 'en', 'ar'] as const
export type AssistantLanguage = (typeof ASSISTANT_LANGUAGES)[number]

export const ASSISTANT_LIMITS = {
  /** One visitor question. */
  message: 1000,
  /** Visitor questions in one conversation before a fresh one is started. */
  questionsPerConversation: 40,
  /** A search term in the owner's list. */
  search: 120,
  /** Automatic deletion, when chosen: between one day and ten years. */
  retentionDaysMin: 1,
  retentionDaysMax: 3650,
  /** The usage view: at most this many days back. */
  usageDaysMax: 90,
} as const

/**
 * How a reply was reached.
 *
 * - `answered` — published content matched and was quoted or summarised.
 * - `fallback` — nothing on the website answers it: an honest "I don't know"
 *   with the Contact and Booking links. This is the "unanswered" count.
 * - `handoff` — the visitor asked to reach the owner: Contact and Booking.
 * - `smalltalk` — a greeting or thanks, with a hint of what can be asked.
 */
export const ASSISTANT_OUTCOMES = ['answered', 'fallback', 'handoff', 'smalltalk'] as const
export type AssistantOutcome = (typeof ASSISTANT_OUTCOMES)[number]

/** Who wrote a reply: the extractive composer, or the optional model. */
export const ASSISTANT_PROVIDERS = ['none', 'workers-ai'] as const
export type AssistantProvider = (typeof ASSISTANT_PROVIDERS)[number]

export const ASSISTANT_SOURCE_KINDS = ['service', 'project', 'post', 'faq', 'page'] as const
export type AssistantSourceKind = (typeof ASSISTANT_SOURCE_KINDS)[number]

export const RETENTION_MODES = ['manual', 'days'] as const
export type RetentionMode = (typeof RETENTION_MODES)[number]

/* ------------------------------------------------------------ the inputs */

/**
 * The conversation handle the browser keeps: 32 random bytes, base64url.
 * Only its hash is stored; an unknown one simply starts a new conversation.
 */
export const ConversationTokenSchema = v.pipe(
  v.string(),
  v.regex(/^[A-Za-z0-9_-]{43}$/u, 'That conversation handle is not valid'),
)

// Control characters other than tab and newline have no place in a question.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu

/** Trims, normalises line endings and removes control characters. */
export const normaliseQuestion = (value: string): string =>
  value.replace(/\r\n?/gu, '\n').replace(CONTROL, '').trim()

export const AskSchema = v.object({
  conversationId: v.optional(v.nullable(ConversationTokenSchema), null),
  message: v.pipe(
    v.string('Write a question'),
    v.transform(normaliseQuestion),
    v.minLength(1, 'Write a question'),
    v.maxLength(ASSISTANT_LIMITS.message, `A question can be at most ${ASSISTANT_LIMITS.message} characters`),
  ),
  /** The language of the page the widget is on. A hint only: the answer follows the question. */
  locale: v.optional(v.nullable(v.picklist(ASSISTANT_LANGUAGES)), null),
})

export type AskInput = v.InferOutput<typeof AskSchema>

export const StatusQuerySchema = v.object({
  language: v.optional(v.picklist(ASSISTANT_LANGUAGES), 'de'),
})

const DateString = v.pipe(
  v.string(),
  v.trim(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/u, 'Use a date like 2026-09-23'),
  v.check((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'That is not a real date'),
)

export const ConversationListQuerySchema = v.pipe(
  v.object({
    ...PageQuerySchema.entries,
    language: v.optional(v.picklist(['all', ...ASSISTANT_LANGUAGES] as const), 'all'),
    /** Started on or after this UTC day. */
    from: v.optional(v.union([v.literal(''), DateString]), ''),
    /** Started on or before this UTC day. */
    to: v.optional(v.union([v.literal(''), DateString]), ''),
    /** Any message in the conversation contains this text. */
    search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(ASSISTANT_LIMITS.search)), ''),
    outcome: v.optional(v.picklist(['all', 'fallback'] as const), 'all'),
  }),
  v.check(
    (query) => query.from === '' || query.to === '' || query.from <= query.to,
    'The start date is after the end date',
  ),
)

export type ConversationListQuery = v.InferOutput<typeof ConversationListQuerySchema>

export const UsageQuerySchema = v.object({
  days: v.pipe(
    v.optional(v.union([v.string(), v.number()]), 30),
    v.transform((value) => (typeof value === 'number' ? value : Number(String(value).trim()))),
    v.number('That is not a number'),
    v.integer('That is not a whole number'),
    v.minValue(1, 'At least one day'),
    v.maxValue(ASSISTANT_LIMITS.usageDaysMax, `At most ${ASSISTANT_LIMITS.usageDaysMax} days`),
  ),
})

export const SettingsPatchSchema = v.pipe(
  v.object({
    enabled: v.optional(v.boolean()),
    retentionMode: v.optional(v.picklist(RETENTION_MODES)),
    retentionDays: v.optional(
      v.nullable(
        v.pipe(
          v.number(),
          v.integer('Use a whole number of days'),
          v.minValue(ASSISTANT_LIMITS.retentionDaysMin, 'At least one day'),
          v.maxValue(ASSISTANT_LIMITS.retentionDaysMax, 'At most 3650 days'),
        ),
      ),
    ),
  }),
  v.check(
    (patch) => patch.retentionMode !== 'days' || typeof patch.retentionDays === 'number',
    'Choose after how many days conversations are deleted',
  ),
)

export type SettingsPatch = v.InferOutput<typeof SettingsPatchSchema>

/* ---------------------------------------------------------- the responses */

export type AssistantSource = {
  kind: AssistantSourceKind
  title: string
  /** A path on this website, such as `/en/services#website`. */
  url: string
}

export type AssistantLink = {
  kind: 'contact' | 'booking' | 'privacy'
  label: string
  url: string
}

export type AssistantAnswer = {
  text: string
  language: AssistantLanguage
  outcome: AssistantOutcome
  provider: AssistantProvider
  sources: AssistantSource[]
  /** Contact / Booking, offered on a fallback, a handoff, or a price question. */
  links: AssistantLink[]
}

export type AskResult = {
  /** Keep it and send it with the next question to continue this conversation. */
  conversationId: string
  answer: AssistantAnswer
}

export type AssistantStatus = {
  enabled: boolean
  /** `extractive` quotes the website; `generative` may reword it with a model. */
  mode: 'extractive' | 'generative'
  notice: { key: string; text: string }
  links: AssistantLink[]
  limits: { messageMaxLength: number }
}

export type OwnerConversationListItem = {
  id: string
  language: AssistantLanguage
  pageLocale: AssistantLanguage | null
  /** The first question, shortened, so the list can be scanned. */
  preview: string
  messageCount: number
  fallbackCount: number
  createdAt: string
  lastMessageAt: string
}

export type OwnerConversationPage = Page<OwnerConversationListItem>

export type OwnerMessage = {
  id: string
  position: number
  role: 'visitor' | 'assistant'
  language: AssistantLanguage
  body: string
  outcome: AssistantOutcome | null
  provider: AssistantProvider | null
  sources: AssistantSource[]
  offeredContact: boolean
  createdAt: string
}

export type OwnerConversation = Omit<OwnerConversationListItem, 'preview'> & {
  messages: OwnerMessage[]
}

export type AssistantUsageDay = {
  day: string
  conversations: number
  questions: number
  answered: number
  fallbacks: number
  handoffs: number
  contactOffers: number
  providerCalls: number
  providerFallbacks: number
  rateLimited: number
  capped: number
}

export type AssistantUsage = {
  /** Oldest first, one entry per UTC day, zeros included. */
  days: AssistantUsageDay[]
  provider: {
    configured: AssistantProvider
    /** Calls allowed per UTC day. 0 means the model is never called. */
    dailyCap: number
    usedToday: number
    /** Whether the next answer may use the model. */
    active: boolean
  }
  /** Questions the whole site may ask per UTC day. */
  dailyQuestionLimit: number
  /** Always 0: the application never makes a paid call. */
  estimatedCostCents: number
}

export type AssistantSettings = {
  enabled: boolean
  retentionMode: RetentionMode
  retentionDays: number | null
  updatedAt: string | null
}
