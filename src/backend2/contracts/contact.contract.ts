import * as v from 'valibot'
import { hasAsciiLocalPart, isSendableEmailAddress } from './email-address.contract'

/**
 * The public Contact form, V2 (`docs/v2/inbox.md`, "Public contact form
 * handoff").
 *
 * One visitor message becomes one Contact-origin Inbox conversation. The
 * "What is it about?" and "Budget range" selects are gone from Contact by the
 * owner's decision, so this contract has no field for them: anything posted
 * under those names is ignored and never stored. Booking keeps its own.
 *
 * Shared with the future public frontend so client-side limits and messages
 * match what the server enforces again.
 */

export const CONTACT_LANGUAGES = ['de', 'en', 'ar'] as const
export type ContactLanguage = (typeof CONTACT_LANGUAGES)[number]

export const CONTACT_LIMITS = {
  name: 120,
  email: 254,
  messageMin: 10,
  message: 5000,
  phone: 40,
  company: 200,
  /** One file, at most 10 MB. A larger video cannot be sent through the form. */
  fileBytes: 10 * 1024 * 1024,
} as const

/**
 * The whole multipart request: the file plus its envelope and the text
 * fields. Enforced while the body is read, before anything is parsed.
 */
export const CONTACT_MAX_BODY_BYTES = 11 * 1024 * 1024

/**
 * The multipart field names.
 *
 * The honeypot has a name and label no browser or password manager fills in
 * by itself. It was `website`, which Safari's and password managers'
 * autofill can fill for a real visitor — whose message was then thrown away
 * while they were shown "sent".
 */
export const CONTACT_FIELDS = {
  submissionId: 'submissionId',
  name: 'name',
  email: 'email',
  phone: 'phone',
  company: 'company',
  message: 'message',
  language: 'language',
  turnstileToken: 'turnstileToken',
  honeypot: 'hp_x9',
  file: 'attachment',
} as const

/**
 * The accepted files, decided from the bytes on the server. The extensions
 * are what the frontend's file picker offers and what a stored file name is
 * made to end in; they never decide whether a file is accepted.
 *
 * Deliberately narrower than the Media library: no SVG, no archives, no
 * OpenDocument/RTF/plain text, and no macro-enabled Office files.
 */
export const CONTACT_FILE_TYPES: ReadonlyArray<{ contentType: string; extensions: readonly string[] }> = [
  { contentType: 'application/pdf', extensions: ['pdf'] },
  { contentType: 'image/jpeg', extensions: ['jpg', 'jpeg'] },
  { contentType: 'image/png', extensions: ['png'] },
  { contentType: 'image/webp', extensions: ['webp'] },
  { contentType: 'image/gif', extensions: ['gif'] },
  { contentType: 'image/heic', extensions: ['heic'] },
  { contentType: 'image/heif', extensions: ['heif', 'heic'] },
  { contentType: 'image/avif', extensions: ['avif'] },
  { contentType: 'video/mp4', extensions: ['mp4', 'm4v'] },
  { contentType: 'video/quicktime', extensions: ['mov'] },
  { contentType: 'video/webm', extensions: ['webm'] },
  {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['docx'],
  },
  {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['xlsx'],
  },
  {
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extensions: ['pptx'],
  },
  { contentType: 'application/msword', extensions: ['doc'] },
  { contentType: 'application/vnd.ms-excel', extensions: ['xls'] },
  { contentType: 'application/vnd.ms-powerpoint', extensions: ['ppt'] },
]

/** For the frontend's `<input accept>`. A hint to the picker, not a check. */
export const CONTACT_FILE_ACCEPT = [
  ...new Set(CONTACT_FILE_TYPES.flatMap((type) => type.extensions.map((extension) => `.${extension}`))),
].join(',')

/** What a rejected file's error carries, so the form can say what is allowed. */
export const contactFileRules = () => ({
  field: CONTACT_FIELDS.file,
  maxBytes: CONTACT_LIMITS.fileBytes,
  allowed: ['pdf', 'image', 'video', 'word', 'excel', 'powerpoint'] as const,
  extensions: CONTACT_FILE_ACCEPT,
})

/**
 * PostgreSQL cannot store the character U+0000 in text: a message carrying
 * one would fail to save, and the visitor would be told it was lost. It never
 * belongs in what a person typed, so it is taken out.
 */
// eslint-disable-next-line no-control-regex
const withoutNul = (value: string): string => value.replace(/\u0000/gu, '')

/**
 * Arabic-Indic (٠–٩) and Persian (۰–۹) digits as the ASCII digits they are, so
 * a phone number typed on an Arabic keyboard is accepted as one.
 */
export const toAsciiDigits = (value: string): string =>
  value.replace(/[\u0660-\u0669\u06f0-\u06f9]/gu, (digit) => String(digit.charCodeAt(0) & 0xf))

/** One line: a newline or tab inside a name would reach a subject line. */
const OneLine = v.pipe(
  v.string(),
  v.transform((value) => withoutNul(value).replace(/\s+/gu, ' ')),
  v.trim(),
)

/**
 * The email field's one message, chosen for what is wrong: a list, letters
 * outside A–Z before the `@` (the email service cannot deliver there, and
 * `jürgen@` is usually a typo for `juergen@`), or anything else.
 */
const emailProblem = (value: string): string =>
  /[,;\s]/u.test(value)
    ? 'Enter one email address'
    : value.includes('@') && !hasAsciiLocalPart(value)
      ? 'Use only the letters A–Z, digits and . _ - + before the @'
      : 'Enter a valid email address'

export const PublicContactSchema = v.object({
  submissionId: v.pipe(v.string('Missing submission id'), v.uuid('That is not a valid submission id')),
  name: v.pipe(
    v.string('Enter your name'),
    v.transform((value) => withoutNul(value).replace(/\s+/gu, ' ')),
    v.trim(),
    v.minLength(1, 'Enter your name'),
    v.maxLength(CONTACT_LIMITS.name, `Keep your name under ${CONTACT_LIMITS.name} characters`),
  ),
  email: v.pipe(
    v.string('Enter your email address'),
    v.trim(),
    v.toLowerCase(),
    v.minLength(1, 'Enter your email address'),
    v.maxLength(CONTACT_LIMITS.email, 'That email address is too long'),
    // The rule the browser applies too, and one the Inbox can answer.
    v.check(
      (value) => value.length > CONTACT_LIMITS.email || isSendableEmailAddress(value),
      (issue) => emailProblem(String(issue.input)),
    ),
  ),
  phone: v.optional(
    v.pipe(
      OneLine,
      v.transform(toAsciiDigits),
      v.maxLength(CONTACT_LIMITS.phone, 'That phone number is too long'),
      v.check((value) => value === '' || /^[+()\d\s./-]{5,}$/u.test(value), 'Enter a valid phone number'),
    ),
    '',
  ),
  company: v.optional(
    v.pipe(OneLine, v.maxLength(CONTACT_LIMITS.company, `Keep the company under ${CONTACT_LIMITS.company} characters`)),
    '',
  ),
  message: v.pipe(
    v.string('Write a message'),
    // Line endings normalised so the length counts what the visitor sees.
    v.transform((value) => withoutNul(value).replace(/\r\n?/gu, '\n')),
    v.trim(),
    v.minLength(CONTACT_LIMITS.messageMin, `Write at least ${CONTACT_LIMITS.messageMin} characters`),
    v.maxLength(CONTACT_LIMITS.message, `Keep the message under ${CONTACT_LIMITS.message} characters`),
  ),
  language: v.picklist(CONTACT_LANGUAGES, 'Choose a language'),
  turnstileToken: v.optional(v.pipe(v.string(), v.maxLength(4096)), ''),
})

export type PublicContactInput = v.InferOutput<typeof PublicContactSchema>

/** The only thing a visitor learns: that it arrived. No id, nothing private. */
export type PublicContactResponse = { received: true }
