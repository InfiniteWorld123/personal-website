import * as v from 'valibot'

/**
 * The three languages the site publishes. Written out here rather than
 * imported so this contract reads on its own; the database enforces the same
 * list in a CHECK, exactly as the booking contract does.
 */
export const LEAD_LANGUAGES = ['de', 'en', 'ar'] as const

export type LeadLanguage = (typeof LEAD_LANGUAGES)[number]

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST'] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_SOURCES = ['CONTACT_FORM', 'BOOKING', 'MANUAL'] as const

export type LeadSource = (typeof LEAD_SOURCES)[number]

export const LEAD_DIRECTIONS = ['IN', 'OUT'] as const

export type LeadDirection = (typeof LEAD_DIRECTIONS)[number]

/**
 * The tabs above the list. `open` is everything still being worked on, which
 * is the default view: filed and junk messages stay out of the way until
 * asked for by name.
 */
export const LEAD_TABS = ['open', 'unread', 'new', 'closed', 'archived', 'junk', 'all'] as const

export type LeadTab = (typeof LEAD_TABS)[number]

export const LEAD_PAGE_SIZE = 50

const trimmed = (message: string, max: number) =>
  v.pipe(v.string(message), v.trim(), v.nonEmpty(message), v.maxLength(max, 'That text is too long'))

const optionalText = (max: number) =>
  v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(max, 'That text is too long'))

/**
 * What the public form may send. The limits match the ones the old mail-only
 * endpoint enforced, because the form on the page has not changed — only
 * where the message lands has.
 */
export const ContactSubmitSchema = v.object({
  name: trimmed('Your name is required', 120),
  email: v.pipe(
    v.string('An email address is required'),
    v.trim(),
    v.nonEmpty('An email address is required'),
    v.maxLength(254, 'That email address is too long'),
    v.email('That email address does not look right'),
  ),
  message: trimmed('A message is required', 5000),
  company: optionalText(160),
  phone: optionalText(40),
  projectType: optionalText(60),
  budget: optionalText(60),
  timeline: optionalText(60),
  language: v.optional(v.picklist(LEAD_LANGUAGES), 'de'),
})

export type ContactSubmitInput = v.InferOutput<typeof ContactSubmitSchema>

export const LeadFilterSchema = v.object({
  tab: v.optional(v.picklist(LEAD_TABS), 'open'),
  search: optionalText(120),
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
})

export type LeadFilterInput = v.InferOutput<typeof LeadFilterSchema>

export const LeadStatusWriteSchema = v.object({ status: v.picklist(LEAD_STATUSES) })

export type LeadStatusWriteInput = v.InferOutput<typeof LeadStatusWriteSchema>

export const LeadNoteWriteSchema = v.object({ body: trimmed('A note cannot be empty', 4000) })

export type LeadNoteWriteInput = v.InferOutput<typeof LeadNoteWriteSchema>

export const LeadReplySchema = v.object({
  subject: optionalText(160),
  body: trimmed('A reply cannot be empty', 8000),
})

export type LeadReplyInput = v.InferOutput<typeof LeadReplySchema>

export const LEAD_BULK_ACTIONS = ['read', 'unread', 'archive', 'unarchive', 'junk', 'notJunk'] as const

export type LeadBulkAction = (typeof LEAD_BULK_ACTIONS)[number]

export const LeadBulkSchema = v.object({
  ids: v.pipe(
    v.array(v.pipe(v.string(), v.uuid('That is not a valid id'))),
    v.minLength(1, 'Nothing was selected'),
    v.maxLength(LEAD_PAGE_SIZE, 'That is more than one page of messages'),
  ),
  action: v.picklist(LEAD_BULK_ACTIONS),
})

export type LeadBulkInput = v.InferOutput<typeof LeadBulkSchema>

/**
 * Every switch the inbox offers, and the shape the settings page writes.
 *
 * The owner's instruction was to ship with everything on and turn off what
 * gets in the way, so every default here is `true`. They are stored as one
 * JSON row rather than a column each: a preference must never cost a
 * migration.
 */
export const INBOX_PREFERENCE_KEYS = [
  'thread',
  'inbound',
  'snippets',
  'signature',
  'languageHint',
  'unreadMarks',
  'initials',
  'relativeTime',
  'snippet',
  'badges',
  'facts',
  'attachment',
  'notes',
  'history',
  'filters',
  'search',
  'unreadCount',
  'keyboard',
  'bulk',
  'junk',
  'bookings',
] as const

export type InboxPreferenceKey = (typeof INBOX_PREFERENCE_KEYS)[number]

export type InboxPreferences = Record<InboxPreferenceKey, boolean>

export const DEFAULT_INBOX_PREFERENCES: InboxPreferences = Object.fromEntries(
  INBOX_PREFERENCE_KEYS.map((key) => [key, true]),
) as InboxPreferences

export const InboxPreferencesSchema = v.object(
  Object.fromEntries(
    INBOX_PREFERENCE_KEYS.map((key) => [key, v.optional(v.boolean(), true)]),
  ) as Record<InboxPreferenceKey, v.OptionalSchema<v.BooleanSchema<undefined>, true>>,
)

/**
 * A stored preferences row may predate a switch, or carry one that was
 * removed. Reading goes through here so the page always receives the full set
 * and never a key the UI does not know.
 */
export const readInboxPreferences = (value: unknown): InboxPreferences => {
  const stored = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

  return Object.fromEntries(
    INBOX_PREFERENCE_KEYS.map((key) => [key, typeof stored[key] === 'boolean' ? stored[key] : true]),
  ) as InboxPreferences
}
