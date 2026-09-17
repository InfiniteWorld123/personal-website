import * as v from 'valibot'

/**
 * The contract for the inbox.
 *
 * One idea runs through it: **a row is a person, not a letter.** The owner
 * settled that before anything was built — he opens a name and reads the whole
 * correspondence, the way a messaging app works rather than the way a mail
 * client does.
 */

export const INBOX_LANGUAGES = ['de', 'en', 'ar'] as const

export type InboxLanguage = (typeof INBOX_LANGUAGES)[number]

/** Which door this person came through. */
export const PERSON_SOURCES = ['CONTACT_FORM', 'BOOKING', 'MANUAL', 'MAIL'] as const

export type PersonSource = (typeof PERSON_SOURCES)[number]

export const MESSAGE_DIRECTIONS = ['IN', 'OUT'] as const

export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number]

/**
 * The four tabs above the list. Not folders: a person is in exactly one state,
 * and these are four questions asked of the same list.
 */
export const INBOX_LENSES = ['inbox', 'unread', 'starred', 'archived'] as const

export type InboxLens = (typeof INBOX_LENSES)[number]

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

const trimmed = (message: string, max: number) =>
  v.pipe(v.string(message), v.trim(), v.nonEmpty(message), v.maxLength(max, 'That text is too long'))

const optionalText = (max: number) =>
  v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(max, 'That text is too long'))

const emailField = v.pipe(
  v.string('An email address is required'),
  v.trim(),
  v.toLowerCase(),
  v.email('That is not a valid email address'),
  v.maxLength(320, 'That email address is too long'),
)

export const IdSchema = v.pipe(v.string(), v.uuid('That is not a valid id'))

/* -------------------------------------------------------------------------- */
/* The list                                                                   */
/* -------------------------------------------------------------------------- */

/** A query string arrives as text, so the number is coerced before it is checked. */
export const InboxQuerySchema = v.object({
  lens: v.optional(v.picklist(INBOX_LENSES), 'inbox'),
  search: optionalText(120),
  limit: v.pipe(
    v.optional(v.union([v.string(), v.number()]), 100),
    v.transform((value) => Number(value)),
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(300),
  ),
})

export type InboxQueryInput = v.InferOutput<typeof InboxQuerySchema>

/* -------------------------------------------------------------------------- */
/* The person                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What the owner may edit about somebody.
 *
 * Deliberately five fields. He asked for "name, email, phone and some
 * information about him", and said the rest — what they spent, which service —
 * comes later if he ever wants it.
 */
export const PersonWriteSchema = v.object({
  name: trimmed('A name is required', 120),
  email: emailField,
  phone: optionalText(40),
  company: optionalText(160),
  language: v.optional(v.picklist(INBOX_LANGUAGES), 'de'),
})

export type PersonWriteInput = v.InferOutput<typeof PersonWriteSchema>

export const NoteSchema = v.object({ body: trimmed('Write something first', 4000) })

export type NoteInput = v.InferOutput<typeof NoteSchema>

/* -------------------------------------------------------------------------- */
/* Letters                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `bodyRich` is a ProseMirror document, the shape the blog settled on in D24:
 * a closed schema has no markup to sanitise, which matters on Workers where
 * DOM-based sanitisers cannot run at all. `body` is the same letter as plain
 * text — search reads it, the list previews it, and a client whose mail
 * program refuses HTML still gets the words.
 */
export const ReplySchema = v.object({
  subject: optionalText(240),
  body: trimmed('Write something first', 20_000),
  bodyRich: v.nullish(v.any()),
  attachmentIds: v.optional(v.array(IdSchema), []),
})

export type ReplyInput = v.InferOutput<typeof ReplySchema>

/** A letter to somebody who has never written. Creates the person. */
export const ComposeSchema = v.object({
  to: emailField,
  name: optionalText(120),
  language: v.optional(v.picklist(INBOX_LANGUAGES), 'de'),
  subject: optionalText(240),
  body: trimmed('Write something first', 20_000),
  bodyRich: v.nullish(v.any()),
  attachmentIds: v.optional(v.array(IdSchema), []),
})

export type ComposeInput = v.InferOutput<typeof ComposeSchema>

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A signature per language, and the canned replies.
 *
 * Both live in `app_settings` as one JSON row rather than as columns: a new
 * snippet must never be a migration, and the owner adds and drops them as his
 * wording changes.
 */
export const SignatureSchema = v.object({
  de: optionalText(600),
  en: optionalText(600),
  ar: optionalText(600),
})

export type SignatureInput = v.InferOutput<typeof SignatureSchema>

export const SnippetsSchema = v.object({
  items: v.pipe(
    v.array(
      v.object({
        label: trimmed('Give it a short name', 60),
        body: trimmed('Write the text', 2000),
        language: v.picklist(INBOX_LANGUAGES),
      }),
    ),
    v.maxLength(30, 'That is more snippets than anyone reads'),
  ),
})

export type SnippetsInput = v.InferOutput<typeof SnippetsSchema>

/* -------------------------------------------------------------------------- */
/* The public contact form                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The three qualifying answers arrive as the words the visitor read, not as
 * the option ids behind them — the form looks the labels up before posting, so
 * the inbox shows "Website" rather than "website".
 */
export const ContactSchema = v.object({
  name: trimmed('A name is required', 120),
  email: emailField,
  company: optionalText(160),
  phone: optionalText(40),
  projectType: optionalText(120),
  budget: optionalText(120),
  timeline: optionalText(120),
  message: v.pipe(
    v.string('Write a message'),
    v.trim(),
    v.minLength(10, 'Write a little more'),
    v.maxLength(8000, 'That message is too long'),
  ),
  language: v.optional(v.picklist(INBOX_LANGUAGES), 'de'),
})

export type ContactInput = v.InferOutput<typeof ContactSchema>
