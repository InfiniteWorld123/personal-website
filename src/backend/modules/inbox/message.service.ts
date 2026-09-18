import { getDb } from '#/backend/db/client'
import { notFoundError } from '#/backend/shared/error'
import { escapeHtml, sendMail } from '#/backend/shared/mail'
import { richTextToHtml } from '#/backend/shared/rich-text-html'
import type { RichTextDoc } from '#/shared/validation/rich-text'
import { env } from '#/shared/env'
import type { Attachment, Message } from '#/shared/types/inbox.types'
import type {
  ComposeInput,
  InboxLanguage,
  MessageDirection,
  ReplyInput,
} from '#/shared/validation/inbox.validation'
import {
  attachmentUrl,
  attachmentsForMail,
  checkStorable,
  storeAttachment,
  storeAttachmentBytes,
} from './attachment.service'
import { signatureFor } from './settings.service'
import { TOUCH_PERSON, toInt, toIso, toIsoRequired } from './inbox.sql'

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

type MessageShape = {
  id: string
  direction: MessageDirection
  subject: string
  body: string
  body_rich: unknown | null
  from_email: string | null
  to_email: string | null
  sent_at: Date
  read_at: Date | null
}

export const listMessages = async (personId: string): Promise<Message[]> => {
  const db = getDb()

  const [messages, attachments] = await Promise.all([
    db.query<MessageShape>(
      `SELECT id, direction, subject, body, body_rich, from_email, to_email, sent_at, read_at
         FROM lead_messages WHERE lead_id = $1 ORDER BY sent_at;`,
      [personId],
    ),
    db.query<{
      id: string
      message_id: string | null
      filename: string
      content_type: string
      bytes: number | string
      direction: MessageDirection
    }>(
      `SELECT id, message_id, filename, content_type, bytes, direction
         FROM lead_attachments WHERE lead_id = $1 ORDER BY created_at;`,
      [personId],
    ),
  ])

  const byMessage = new Map<string | null, Attachment[]>()

  for (const row of attachments.rows) {
    const list = byMessage.get(row.message_id) ?? []

    list.push({
      id: row.id,
      filename: row.filename,
      contentType: row.content_type,
      bytes: toInt(row.bytes),
      direction: row.direction,
      url: attachmentUrl(row.id),
    })
    byMessage.set(row.message_id, list)
  }

  return messages.rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    subject: row.subject,
    body: row.body,
    bodyRich: row.body_rich,
    fromEmail: row.from_email,
    toEmail: row.to_email,
    sentAt: toIsoRequired(row.sent_at),
    readAt: toIso(row.read_at),
    attachments: byMessage.get(row.id) ?? [],
  }))
}

export const setMessageRead = async (
  personId: string,
  messageId: string,
  read: boolean,
): Promise<void> => {
  const result = await getDb().query<{ id: string }>(
    `UPDATE lead_messages
        SET read_at = ${read ? 'COALESCE(read_at, CURRENT_TIMESTAMP)' : 'NULL'}
      WHERE id = $1 AND lead_id = $2 RETURNING id;`,
    [messageId, personId],
  )

  if (!result.rows[0]) throw notFoundError('That message no longer exists')
}

/* -------------------------------------------------------------------------- */
/* Answering                                                                  */
/* -------------------------------------------------------------------------- */

type Recipient = {
  id: string
  name: string
  email: string
  language: InboxLanguage
  reply_token: string | null
}

/**
 * The address a client's answer comes back to.
 *
 * Outbound mail carries `reply+<token>@` as its Reply-To and the inbound
 * Worker reads the token back out. Random and per-person, so a guessed address
 * reaches nothing. `null` when no inbound address is configured — the letter
 * still goes, it simply cannot be answered back into the inbox.
 */
const replyToAddress = async (person: Recipient): Promise<string | null> => {
  const address = env.INBOUND_MAIL_ADDRESS

  if (!address || !address.includes('@')) return null

  let token = person.reply_token

  if (!token) {
    token = crypto.randomUUID().replace(/-/g, '')
    await getDb().query('UPDATE leads SET reply_token = $2 WHERE id = $1;', [person.id, token])
  }

  return withToken(address, token)
}

/**
 * `reply@domain` or `reply+@domain`, plus a token, becomes
 * `reply+<token>@domain`.
 *
 * Both spellings are accepted on purpose. The setting used to have to contain
 * a `+` as a placeholder, and a perfectly reasonable `reply@yamanwarda.de`
 * switched the whole inbound path off with nothing but a 503 to say why — a
 * formatting demand on a configuration value, enforced in two places, with no
 * error message anywhere near the person who typed it. Cloudflare matches the
 * rule on the base address either way, so the shape was never load-bearing.
 */
export const withToken = (address: string, token: string): string => {
  const at = address.indexOf('@')
  const local = address.slice(0, at).split('+')[0]

  return `${local}+${token}${address.slice(at)}`
}

const paragraphs = (text: string): string =>
  text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')

const bodyHtml = (input: { body: string; bodyRich?: unknown }, signature: string): string => {
  let html = ''

  if (input.bodyRich) {
    try {
      html = richTextToHtml(input.bodyRich as RichTextDoc)
    } catch {
      // A document the renderer refuses is not worth failing a reply over; the
      // plain text below is the same letter.
    }
  }

  if (html === '') html = paragraphs(input.body)

  return signature === '' ? html : `${html}<hr>${paragraphs(signature)}`
}

const loadRecipient = async (personId: string): Promise<Recipient> => {
  const result = await getDb().query<Recipient>(
    'SELECT id, name, email, language, reply_token FROM leads WHERE id = $1;',
    [personId],
  )

  const row = result.rows[0]

  if (!row) throw notFoundError('That person is not in the inbox')

  return row
}

/**
 * Answering somebody.
 *
 * **Stored first, then sent** — the order matters. A send that succeeds while
 * the write fails leaves a letter the client has read and the inbox has never
 * heard of; a write that succeeds while the send fails leaves a visible record
 * saying so. The second is recoverable, the first is not.
 *
 * The one thing read *before* the write is the attachments. If the bytes
 * cannot be fetched there is no letter worth storing — sending "please find
 * the offer attached" with nothing attached is a wrong letter, and storing a
 * record of it makes the wrong letter look sent.
 */
export const reply = async (
  personId: string,
  input: ReplyInput,
): Promise<{ messageId: string; sent: boolean }> => {
  const db = getDb()
  const person = await loadRecipient(personId)
  const subject = input.subject.trim() === '' ? `Re: ${person.name}` : input.subject
  const signature = await signatureFor(person.language)
  const files = await attachmentsForMail(personId, input.attachmentIds)

  const stored = await db.query<{ id: string }>(
    `INSERT INTO lead_messages (lead_id, direction, subject, body, body_rich, from_email, to_email)
     VALUES ($1, 'OUT', $2, $3, $4, $5, $6) RETURNING id;`,
    [
      personId,
      subject,
      signature === '' ? input.body : `${input.body}\n\n—\n${signature}`,
      input.bodyRich ?? null,
      env.EMAIL_FROM ?? null,
      person.email,
    ],
  )

  const messageId = stored.rows[0]?.id

  if (!messageId) throw notFoundError('The reply could not be stored')

  if (input.attachmentIds.length > 0) {
    await db.query(
      `UPDATE lead_attachments SET message_id = $2
        WHERE id = ANY($1::uuid[]) AND lead_id = $3 AND message_id IS NULL;`,
      [input.attachmentIds, messageId, personId],
    )
  }

  await db.query(TOUCH_PERSON, [personId])
  await db.query(
    'UPDATE leads SET first_replied_at = COALESCE(first_replied_at, CURRENT_TIMESTAMP) WHERE id = $1;',
    [personId],
  )

  const replyTo = await replyToAddress(person)

  const { accepted, id } = await sendMail(
    {
      to: person.email,
      subject,
      html: bodyHtml(input, signature),
      text: signature === '' ? input.body : `${input.body}\n\n—\n${signature}`,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(files.length > 0 ? { attachments: files } : {}),
    },
    'inbox-reply',
  )

  if (id) {
    await db.query('UPDATE lead_messages SET external_id = $2 WHERE id = $1;', [messageId, id])
  }

  return { messageId, sent: accepted }
}

/**
 * The person behind an address, created if this is the first letter to them.
 *
 * Its own step, and not only an implementation detail of `compose`, because a
 * file belongs to a person: writing to a new address means the person has to
 * exist *before* the attachment can be stored, and therefore before the letter
 * is sent. The alternative — uploading afterwards — is how a file used to be
 * lost silently on the compose page.
 */
export const resolveRecipient = async (input: {
  to: string
  name: string
  language: InboxLanguage
}): Promise<{ personId: string }> => {
  const db = getDb()

  const existing = await db.query<{ id: string }>(
    'SELECT id FROM leads WHERE lower(email) = lower($1) ORDER BY created_at LIMIT 1;',
    [input.to],
  )

  let personId = existing.rows[0]?.id

  if (!personId) {
    const created = await db.query<{ id: string }>(
      `INSERT INTO leads (source, name, email, message, language, read_at, last_message_at)
       VALUES ('MANUAL', $1, $2, '', $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id;`,
      [input.name.trim() === '' ? input.to : input.name, input.to, input.language],
    )

    personId = created.rows[0]?.id

    if (!personId) throw notFoundError('The person could not be created')
  }

  return { personId }
}

/**
 * Writing to somebody who has never written, files and all, in one act.
 *
 * Creates the person if the address is new, so a letter is never sent into a
 * conversation the inbox cannot show afterwards.
 *
 * **Every file is checked before the person is created, and stored before the
 * letter is written.** The compose page used to upload *after* sending and
 * swallow whatever went wrong, so a document simply never arrived and nothing
 * said so. Checking first is what keeps a refused file from leaving behind a
 * person he never wrote to.
 */
export const compose = async (
  input: ComposeInput,
  files: File[] = [],
): Promise<{ personId: string; messageId: string; sent: boolean }> => {
  for (const file of files) await checkStorable(file)

  const { personId } = await resolveRecipient(input)

  const stored = []

  for (const file of files) {
    stored.push(await storeAttachment({ personId, file, direction: 'OUT' }))
  }

  const result = await reply(personId, {
    subject: input.subject,
    body: input.body,
    bodyRich: input.bodyRich,
    attachmentIds: [...input.attachmentIds, ...stored.map((file) => file.id)],
  })

  return { personId, ...result }
}

/* -------------------------------------------------------------------------- */
/* What comes back                                                            */
/* -------------------------------------------------------------------------- */

/** A file as the mail Worker hands it over: bytes in base64, inside the JSON. */
export type IncomingFile = { filename: string; contentType: string; content: string }

/**
 * Exported for one test, which is the point of it.
 *
 * The Worker encodes and this decodes, and the two live in different
 * deployables that may never be built together — so the only thing keeping a
 * PDF from arriving as rubble is a test that runs both halves over the same
 * bytes. `src/tests/inbound-attachments.test.ts` is that test.
 */
export const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))

  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)

  return bytes
}

/**
 * Keeps the files that arrived with a letter, and says so when it cannot.
 *
 * A file is refused for good reasons — a type that would run as a page on the
 * admin's own origin, more than ten megabytes, no bucket on this machine — and
 * each of them used to end in silence. The letter is worth more than the file,
 * so a refusal never costs the letter; but it is written into the body,
 * because a client who says "the contract is attached" and an inbox that shows
 * no contract is exactly the quiet wrongness that makes a panel untrustworthy.
 */
const keepIncomingFiles = async (
  personId: string,
  messageId: string,
  files: IncomingFile[],
): Promise<string[]> => {
  const refused: string[] = []

  for (const file of files) {
    try {
      await storeAttachmentBytes({
        personId,
        messageId,
        filename: file.filename,
        contentType: file.contentType,
        bytes: fromBase64(file.content),
        direction: 'IN',
      })
    } catch (error) {
      refused.push(file.filename)
      console.error('[inbound-attachment] refused', {
        filename: file.filename,
        reason: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  return refused
}

const recordIncoming = async (input: {
  personId: string
  from: string
  to: string
  subject: string
  text: string
  messageId: string | null
  inReplyTo: string | null
  files?: IncomingFile[]
}): Promise<void> => {
  const db = getDb()

  const stored = await db.query<{ id: string }>(
    `INSERT INTO lead_messages
       (lead_id, direction, subject, body, from_email, to_email, external_id, in_reply_to)
     VALUES ($1, 'IN', $2, $3, $4, $5, $6, $7) RETURNING id;`,
    [
      input.personId,
      input.subject,
      input.text,
      input.from,
      input.to,
      input.messageId,
      input.inReplyTo,
    ],
  )

  const id = stored.rows[0]?.id

  if (id && input.files && input.files.length > 0) {
    const refused = await keepIncomingFiles(input.personId, id, input.files)

    if (refused.length > 0) {
      await db.query('UPDATE lead_messages SET body = $2 WHERE id = $1;', [
        id,
        `${input.text}\n\n[Could not be kept: ${refused.join(', ')}]`,
      ])
    }
  }

  // Back to the top, and unread again. Somebody who has written is waiting,
  // even if their last letter had been filed.
  await db.query(
    `UPDATE leads SET archived_at = NULL, read_at = NULL,
            last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;`,
    [input.personId],
  )
}

const alreadySeen = async (messageId: string | null): Promise<boolean> => {
  if (!messageId) return false

  const result = await getDb().query<{ id: string }>(
    'SELECT id FROM lead_messages WHERE external_id = $1;',
    [messageId],
  )

  return Boolean(result.rows[0])
}

/**
 * A client's answer, matched by the token in the address it was sent to.
 *
 * Idempotent on `external_id`: every mail provider eventually fires a webhook
 * twice, and answering the second one with "already recorded" is honest where
 * writing the reply again is not.
 */
export const recordReply = async (input: {
  token: string
  from: string
  to: string
  subject: string
  text: string
  messageId: string | null
  inReplyTo: string | null
  files?: IncomingFile[]
}): Promise<{ recorded: boolean; matched: boolean }> => {
  const found = await getDb().query<{ id: string }>(
    'SELECT id FROM leads WHERE reply_token = $1;',
    [input.token],
  )

  const personId = found.rows[0]?.id

  // Accepted and dropped rather than refused, so the forwarder does not retry
  // a letter addressed to a token that matches nothing until the end of time.
  if (!personId) return { recorded: false, matched: false }
  if (await alreadySeen(input.messageId)) return { recorded: false, matched: true }

  await recordIncoming({ ...input, personId })

  return { recorded: true, matched: true }
}

/**
 * A letter to the owner's own address that belongs to no conversation.
 *
 * An invoice, a newsletter, a stranger writing for the first time. It becomes
 * a person with `source = 'MAIL'` — because he chose that **every** letter to
 * his address enters the inbox, not only the ones from his website.
 */
/**
 * Was this letter sent by the site itself?
 *
 * The site writes to its own address: the contact form sends a "go and look"
 * notification to `CONTACT_TO_EMAIL`, which is `info@`. Once `info@` was
 * pointed at the mail Worker on 18 Sep 2026 that notification came straight
 * back in, matched no conversation, and was filed as a brand-new person —
 * named after the provider's own bounce address, one junk row per enquiry,
 * sitting in the inbox next to the real client it was telling him about.
 *
 * Matched on the domain, not just the address, because the envelope sender of
 * a provider-sent mail is a per-message bounce address on a sending subdomain
 * (`…@send.yamanwarda.de`) and never the `From:` header the reader sees.
 *
 * Nobody is lost to this: a letter from the site's own domain is the site, or
 * it is the owner writing to himself.
 */
const isOurOwnMail = (address: string): boolean => {
  const domain = address.slice(address.lastIndexOf('@') + 1)

  if (domain === '') return false

  const ours = [env.EMAIL_FROM, env.CONTACT_TO_EMAIL, env.INBOUND_MAIL_ADDRESS]
    .map((value) => value?.trim().toLowerCase() ?? '')
    .filter((value) => value.includes('@'))
    .map((value) => value.slice(value.lastIndexOf('@') + 1))

  return ours.some((own) => domain === own || domain.endsWith(`.${own}`))
}

export const recordMail = async (input: {
  from: string
  fromName: string
  to: string
  subject: string
  text: string
  messageId: string | null
  inReplyTo: string | null
  files?: IncomingFile[]
}): Promise<{ recorded: boolean }> => {
  const db = getDb()
  const address = input.from.trim().toLowerCase()

  // Without a sender there is nobody to file it under, and a row keyed on
  // nothing would collect every unattributable letter into one fake person.
  if (address === '' || !address.includes('@')) return { recorded: false }
  if (isOurOwnMail(address)) return { recorded: false }
  if (await alreadySeen(input.messageId)) return { recorded: false }

  const existing = await db.query<{ id: string }>(
    'SELECT id FROM leads WHERE lower(email) = lower($1) ORDER BY created_at LIMIT 1;',
    [address],
  )

  let personId = existing.rows[0]?.id

  if (!personId) {
    const created = await db.query<{ id: string }>(
      `INSERT INTO leads (source, name, email, message, language, last_message_at)
       VALUES ('MAIL', $1, $2, '', 'de', CURRENT_TIMESTAMP) RETURNING id;`,
      [input.fromName.trim() === '' ? address : input.fromName.trim(), address],
    )

    personId = created.rows[0]?.id

    if (!personId) return { recorded: false }
  }

  await recordIncoming({ ...input, personId })

  return { recorded: true }
}
