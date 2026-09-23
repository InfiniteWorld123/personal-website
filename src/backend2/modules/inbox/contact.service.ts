import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { enforceRateLimit } from '../../auth/rate-limit'
import {
  CONTACT_FIELDS,
  CONTACT_FILE_TYPES,
  CONTACT_LIMITS,
  CONTACT_MAX_BODY_BYTES,
  PublicContactSchema,
  type PublicContactInput,
  contactFileRules,
} from '../../contracts/contact.contract'
import { PROBE_BYTES } from '../../contracts/media.contract'
import { getDb, withTransaction } from '../../db/client'
import { readLimited } from '../../http/body'
import {
  badRequest,
  fileTooLarge,
  isApiError,
  storageUnavailable,
  unsupportedFileType,
  validationFailed,
} from '../../http/error'
import { parseInput } from '../../http/validate'
import { probeMedia } from '../../media/probe'
import { resolveMediaStore } from '../../media/store'
import { verifyHuman } from '../booking/booking.guard'
import * as mediaRepo from '../media/media.repo'
import { previewOf } from './email-render'
import { sanitizeIncomingName, storeIncomingBytes } from './inbox.files'
import * as repo from './inbox.repo'
import { inboxFromAddress } from './inbox.transport'
import { newReplyToken } from './send.service'

/**
 * The public Contact form, V2 (`docs/v2/inbox.md`, "Public contact form
 * handoff").
 *
 * One submission is one Contact-origin Inbox conversation, written through
 * this path and no other: no Lead, and no owner notification email — the
 * Inbox's unread count is the notification, and a mail to `info@` would come
 * back in as a second conversation.
 *
 * Exactly once, by `submissionId`. The message carries `contact:<id>` in the
 * unique `dedupe_key`, a transaction-scoped advisory lock serialises two
 * copies of the same submission, and the unique index is the last word if
 * anything still races. A repeat always gets the same answer as the first.
 */

/* ------------------------------------------------------------------ limits */

export const CONTACT_RATE_LIMITS = {
  perSource: { limit: 5, windowSeconds: 60 * 60 },
  perEmail: { limit: 3, windowSeconds: 60 * 60 },
} as const

const dedupeKeyFor = (submissionId: string): string => `contact:${submissionId}`

/* ------------------------------------------------------------ the request */

export type ContactUpload = { fileName: string; declaredType: string; bytes: Uint8Array }

export type ContactRequest =
  | { kind: 'honeypot' }
  | { kind: 'submission'; input: PublicContactInput; file: ContactUpload | null }

/** Text fields only: a file posted under a text name is not that text. */
const textField = (form: FormData, name: string): string | undefined => {
  const value = form.get(name)

  return typeof value === 'string' ? value : undefined
}

/**
 * Reads the multipart body under its ceiling, then parses it.
 *
 * The body is counted while it streams, so an oversized upload is refused
 * before it is held in memory. Only the fields the contract names are read;
 * anything else — the removed "What is it about?" and "Budget range" selects
 * included — is never looked at, let alone stored.
 */
export const readContactRequest = async (request: Request): Promise<ContactRequest> => {
  const contentType = request.headers.get('content-type') ?? ''

  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw badRequest('Send the contact form as multipart/form-data')
  }

  const bytes = await readLimited(request, CONTACT_MAX_BODY_BYTES)
  const form = await new Response(bytes as BodyInit, { headers: { 'content-type': contentType } })
    .formData()
    .catch(() => null)

  if (!form) throw badRequest('The contact form could not be read')

  // Filled in by a bot, never by a person. Answered like a success, so the
  // bot learns nothing, and nothing is stored or checked further.
  if ((textField(form, CONTACT_FIELDS.honeypot) ?? '').trim() !== '') return { kind: 'honeypot' }

  const input = parseInput(PublicContactSchema, {
    submissionId: textField(form, CONTACT_FIELDS.submissionId),
    name: textField(form, CONTACT_FIELDS.name),
    email: textField(form, CONTACT_FIELDS.email),
    phone: textField(form, CONTACT_FIELDS.phone),
    company: textField(form, CONTACT_FIELDS.company),
    message: textField(form, CONTACT_FIELDS.message),
    language: textField(form, CONTACT_FIELDS.language),
    turnstileToken: textField(form, CONTACT_FIELDS.turnstileToken),
  })

  const entries = form.getAll(CONTACT_FIELDS.file)

  // A file input with nothing chosen still posts an empty, nameless part.
  const files = entries.filter((entry): entry is File => entry instanceof File && entry.size > 0)

  if (entries.some((entry) => typeof entry === 'string' && entry !== '')) {
    throw validationFailed('Attach the file as a file', {
      issues: [{ field: CONTACT_FIELDS.file, message: 'Attach the file as a file' }],
      missing: [],
    })
  }

  if (files.length > 1) {
    throw validationFailed('Attach one file only', {
      issues: [{ field: CONTACT_FIELDS.file, message: 'Attach one file only' }],
      missing: [],
    })
  }

  const [file] = files

  if (!file) return { kind: 'submission', input, file: null }

  if (file.size > CONTACT_LIMITS.fileBytes) {
    throw fileTooLarge('That file is larger than 10 MB', contactFileRules())
  }

  return {
    kind: 'submission',
    input,
    file: {
      fileName: file.name,
      declaredType: (file.type || '').slice(0, 120),
      bytes: new Uint8Array(await file.arrayBuffer()),
    },
  }
}

/* ---------------------------------------------------------------- the file */

const ascii = (bytes: Uint8Array, offset: number, length: number): string =>
  bytes.length < offset + length ? '' : String.fromCharCode(...bytes.subarray(offset, offset + length))

/**
 * HEIC/HEIF — the iPhone's photo format — which the shared probe does not
 * know. Proved the same way as the other ISO-BMFF types: an `ftyp` box whose
 * major brand is one of the HEIF image brands. A brand not listed is refused.
 */
const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs'])
const HEIF_BRANDS = new Set(['mif1', 'msf1', 'heif'])

const probeHeif = (bytes: Uint8Array): string | null => {
  if (ascii(bytes, 4, 4) !== 'ftyp') return null

  const brand = ascii(bytes, 8, 4)

  if (HEIC_BRANDS.has(brand)) return 'image/heic'
  if (HEIF_BRANDS.has(brand)) return 'image/heif'

  return null
}

/** Whether `needle` occurs anywhere in `bytes`. A plain scan: 10 MB at most. */
const contains = (bytes: Uint8Array, needle: number[]): boolean => {
  const first = needle[0]!
  const last = bytes.length - needle.length

  outer: for (let index = bytes.indexOf(first); index !== -1 && index <= last; index = bytes.indexOf(first, index + 1)) {
    for (let offset = 1; offset < needle.length; offset += 1) {
      if (bytes[index + offset] !== needle[offset]) continue outer
    }

    return true
  }

  return false
}

const asciiBytes = (text: string): number[] => [...text].map((character) => character.charCodeAt(0))
const utf16Bytes = (text: string): number[] => [...text].flatMap((character) => [character.charCodeAt(0), 0])

const OOXML_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

const OLE_TYPES = new Set(['application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'])

/**
 * An Office file that carries macros. A `.docm` renamed `.docx` is still a
 * ZIP with `word/` inside, so the name proves nothing; the VBA project is
 * what matters. ZIP entry names sit uncompressed in the central directory,
 * and OLE2 stream names are UTF-16 in the directory sectors, so both are
 * found by a byte scan without unpacking anything.
 */
const carriesMacros = (bytes: Uint8Array, contentType: string): boolean => {
  if (OOXML_TYPES.has(contentType)) {
    return (
      contains(bytes, asciiBytes('vbaProject.bin')) ||
      contains(bytes, asciiBytes('macroEnabled')) ||
      contains(bytes, asciiBytes('vbaData.xml'))
    )
  }

  if (OLE_TYPES.has(contentType)) return contains(bytes, utf16Bytes('_VBA_PROJECT'))

  return false
}

export type AcceptedContactFile = {
  fileName: string
  declaredType: string
  detectedType: string
  byteSize: number
  checksum: string
  bytes: Uint8Array
}

/**
 * Decides what the file is from its bytes, and refuses anything outside the
 * Contact allowlist.
 *
 * The probe is called without the file name on purpose: a name can then
 * never pick a type — not an OLE2 flavour, not "plain text". An executable,
 * a web page, an SVG, a ZIP renamed `.pdf`: none of them match a signature on
 * the list, so all of them get the same answer.
 */
export const checkContactFile = (file: ContactUpload): AcceptedContactFile => {
  const { bytes } = file

  if (bytes.byteLength > CONTACT_LIMITS.fileBytes) {
    throw fileTooLarge('That file is larger than 10 MB', contactFileRules())
  }

  const detected = probeMedia(bytes.subarray(0, PROBE_BYTES))?.contentType ?? probeHeif(bytes)
  const rule = detected ? CONTACT_FILE_TYPES.find((type) => type.contentType === detected) : undefined

  if (!detected || !rule || carriesMacros(bytes, detected)) {
    throw unsupportedFileType(
      'That file type is not accepted. Send a PDF, a photo, a video, or a Word, Excel or PowerPoint file of at most 10 MB.',
      contactFileRules(),
    )
  }

  /*
   * The owner's computer decides what to do with a download by its name, so
   * the name is made to agree with the bytes: `offer.exe` that is really a
   * PDF is kept as `offer.exe.pdf`, and opens as the PDF it is.
   */
  let fileName = sanitizeIncomingName(file.fileName)
  const dot = fileName.lastIndexOf('.')
  const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : ''

  if (!rule.extensions.includes(extension)) {
    fileName = `${fileName.slice(0, 190)}.${rule.extensions[0]}`
  }

  return {
    fileName,
    declaredType: file.declaredType,
    detectedType: detected,
    byteSize: bytes.byteLength,
    checksum: bytesToHex(sha256(bytes)),
    bytes,
  }
}

/* ---------------------------------------------------------- the submission */

const alreadyRecorded = (submissionId: string): Promise<boolean> =>
  repo.dedupeKeyExists(dedupeKeyFor(submissionId))

/** The message the owner reads: the visitor's words, then any extra detail as plain lines. */
export const contactBodyText = (input: PublicContactInput): string => {
  const extras = [
    input.phone ? `Phone: ${input.phone}` : null,
    input.company ? `Company: ${input.company}` : null,
  ].filter((line): line is string => line !== null)

  return extras.length > 0 ? `${input.message}\n\n${extras.join('\n')}` : input.message
}

export const contactSubject = (name: string): string => `Website contact — ${name}`

/**
 * Files one submission. Returns nothing a visitor could learn from: the same
 * resolved promise whether this call wrote the conversation or a previous
 * copy of it already had.
 */
export const submitContact = async (options: {
  input: PublicContactInput
  file: ContactUpload | null
  ip: string
}): Promise<void> => {
  const { input, ip } = options

  // Cheap refusals first: the file's type is known before any limit is spent.
  const file = options.file ? checkContactFile(options.file) : null

  await enforceRateLimit({ scope: 'contact:create', identity: ip, rule: CONTACT_RATE_LIMITS.perSource })

  /*
   * A retry of a submission that already arrived — a double-click, or a
   * network timeout after the server had answered. Recognised before the
   * human check, because a Turnstile token is single-use: the retry's copy
   * would fail it, and the visitor would be told their message was lost.
   */
  if (await alreadyRecorded(input.submissionId)) return

  await enforceRateLimit({ scope: 'contact:create-email', identity: input.email, rule: CONTACT_RATE_LIMITS.perEmail })

  try {
    await verifyHuman(input.turnstileToken, ip)
  } catch (error) {
    // Two copies racing share one token; the loser is still a success if
    // the winner got there.
    if (isApiError(error) && error.code === 'VERIFICATION_FAILED' && (await alreadyRecorded(input.submissionId))) {
      return
    }

    throw error
  }

  /*
   * The bytes first, outside the transaction, the same way inbound mail does
   * it: the key goes into the pending ledger before the bytes, so a crash
   * before the row exists leaves something the sweep knows to collect.
   *
   * Unlike an email, a visitor is still on the page, so a file that cannot be
   * stored fails the whole submission with a clear error and nothing written.
   * The same `submissionId` can simply be sent again.
   */
  const store = file ? await resolveMediaStore() : undefined
  let storageKey: string | null = null

  if (file) {
    if (!store) throw storageUnavailable('The file could not be stored right now. Try again, or send the message without it.')

    try {
      storageKey = await storeIncomingBytes({ store, bytes: file.bytes })
    } catch {
      throw storageUnavailable('The file could not be stored right now. Try again, or send the message without it.')
    }
  }

  const dedupeKey = dedupeKeyFor(input.submissionId)

  try {
    const wrote = await withTransaction(async () => {
      await getDb().query('SELECT pg_advisory_xact_lock(hashtext($1))', [dedupeKey])

      if (await repo.dedupeKeyExists(dedupeKey)) return false

      const now = new Date()
      const subject = contactSubject(input.name)
      const bodyText = contactBodyText(input)

      const conversation = await repo.insertConversation({
        subject,
        counterpartEmail: input.email,
        counterpartName: input.name,
        origin: 'contact',
        originRef: input.submissionId,
        replyToken: newReplyToken(),
        isRead: false,
        occurredAt: now,
      })

      const messageId = await repo.insertMessage({
        conversationId: conversation.id,
        direction: 'incoming',
        fromEmail: input.email,
        fromName: input.name,
        toEmail: inboxFromAddress(),
        toName: '',
        subject,
        bodyText,
        bodyHtml: null,
        messageIdHeader: null,
        inReplyTo: null,
        referencesHeader: null,
        occurredAt: now,
        dedupeKey,
        language: input.language,
      })

      if (file && storageKey) {
        await repo.insertAttachment({
          messageId,
          position: 0,
          fileName: file.fileName,
          declaredType: file.declaredType,
          detectedType: file.detectedType,
          byteSize: file.byteSize,
          checksum: file.checksum,
          storageKey,
          status: 'stored',
          failureReason: null,
        })
      }

      await repo.recordMessageOnConversation({
        conversationId: conversation.id,
        direction: 'incoming',
        occurredAt: now,
        preview: previewOf(bodyText),
      })

      if (storageKey) await mediaRepo.clearPendingObject(storageKey)

      return true
    })

    // Another copy won the lock; these bytes are pointed at by nothing.
    if (!wrote && storageKey) await discardBytes(store, storageKey)
  } catch (error) {
    if (storageKey) await discardBytes(store, storageKey)

    // The unique key is the last word on a race: the loser is a success.
    if ((error as { code?: string })?.code === '23505' && (await repo.dedupeKeyExists(dedupeKey))) return

    throw error
  }
}

const discardBytes = async (
  store: Awaited<ReturnType<typeof resolveMediaStore>>,
  storageKey: string,
): Promise<void> => {
  await store?.remove(storageKey).catch(() => {})
  await mediaRepo.clearPendingObject(storageKey).catch(() => {})
}
