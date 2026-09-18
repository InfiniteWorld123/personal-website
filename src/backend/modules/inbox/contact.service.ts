import { getDb } from '#/backend/db/client'
import { internalError } from '#/backend/shared/error'
import { button, escapeHtml, layout, plainText, sendMail, type MailLanguage } from '#/backend/shared/mail'
import { env } from '#/shared/env'
import type { ContactInput } from '#/shared/validation/inbox.validation'
import { storeAttachmentBytes } from './attachment.service'
import { TOUCH_PERSON } from './inbox.sql'

/**
 * What the form actually sends, bytes included.
 *
 * `content` is the file itself. It is here because keeping only `name` and
 * `bytes` — which is what this took until 18 Sep 2026 — meant every document
 * a client attached was read once for the type check and then thrown away.
 */
export type ContactAttachment = {
  name: string
  bytes: number
  contentType: string
  content: Uint8Array<ArrayBuffer>
}

/**
 * A message from the website's own form — one of the two doors into the inbox.
 *
 * **Stored first, announced second.** A notification mail the provider rejects
 * used to mean a message that never existed; storing first turns a failed send
 * into a line in the log instead of a lost client.
 */
export const recordContactMessage = async (
  input: ContactInput,
  attachment: ContactAttachment | null,
): Promise<{ personId: string; notified: boolean }> => {
  const db = getDb()

  const existing = await db.query<{ id: string }>(
    'SELECT id FROM leads WHERE lower(email) = lower($1) ORDER BY created_at LIMIT 1;',
    [input.email],
  )

  const found = existing.rows[0]?.id
  let personId = found
  /*
   * The letter this file belongs to, when there is one. A first enquiry has
   * no row in `lead_messages` — its words live on the person and the thread
   * renders them itself — so its file is filed against the person alone and
   * the conversation shows it beside that first message.
   */
  let messageId: string | null = null

  if (found) {
    /*
     * The same person writing again, not a second row — the whole point of one
     * row per person is that their history stays together. Their new words
     * become a letter in the thread rather than overwriting the first enquiry,
     * and the row returns to the top even if it had been filed.
     */
    await db.query(
      `UPDATE leads
          SET name    = CASE WHEN btrim(name) = '' THEN $2 ELSE name END,
              phone   = COALESCE(NULLIF(phone, ''), NULLIF($3, '')),
              company = COALESCE(NULLIF(company, ''), NULLIF($4, '')),
              service_interest = CASE WHEN btrim(service_interest) = '' THEN $5 ELSE service_interest END,
              budget_band      = CASE WHEN btrim(budget_band) = '' THEN $6 ELSE budget_band END,
              timeline         = CASE WHEN btrim(timeline) = '' THEN $7 ELSE timeline END,
              language = $8, read_at = NULL, archived_at = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1;`,
      [
        found,
        input.name,
        input.phone,
        input.company,
        input.projectType,
        input.budget,
        input.timeline,
        input.language,
      ],
    )

    const written = await db.query<{ id: string }>(
      `INSERT INTO lead_messages (lead_id, direction, subject, body, from_email, to_email)
       VALUES ($1, 'IN', 'New message from the contact form', $2, $3, $4)
       RETURNING id;`,
      [found, input.message, input.email, env.CONTACT_TO_EMAIL ?? null],
    )

    messageId = written.rows[0]?.id ?? null
  } else {
    const created = await db.query<{ id: string }>(
      `INSERT INTO leads
         (source, name, email, phone, company, service_interest, budget_band, timeline,
          message, language, attachment_name, attachment_bytes, last_message_at)
       VALUES ('CONTACT_FORM', $1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6, $7, $8, $9, $10, $11,
               CURRENT_TIMESTAMP)
       RETURNING id;`,
      [
        input.name,
        input.email,
        input.phone,
        input.company,
        input.projectType,
        input.budget,
        input.timeline,
        input.message,
        input.language,
        attachment?.name ?? null,
        attachment?.bytes ?? null,
      ],
    )

    personId = created.rows[0]?.id
  }

  if (!personId) throw internalError('The message could not be stored')

  if (attachment) await keepContactFile(personId, messageId, attachment, input.message)

  await db.query(TOUCH_PERSON, [personId])

  const notified = await notifyOwner(input, attachment, personId)

  if (notified) {
    await db.query('UPDATE leads SET notified_at = CURRENT_TIMESTAMP WHERE id = $1;', [personId])
  }

  return { personId, notified }
}

/**
 * Keeps the document the sender attached.
 *
 * **Never allowed to fail the message.** The words are already stored by the
 * time this runs, and a file the store refuses must cost a line in the letter,
 * not the enquiry itself — so a failure is written into the body the same way
 * an arriving mail records a refused attachment.
 */
const keepContactFile = async (
  personId: string,
  messageId: string | null,
  attachment: ContactAttachment,
  message: string,
): Promise<void> => {
  const db = getDb()

  try {
    await storeAttachmentBytes({
      personId,
      ...(messageId ? { messageId } : {}),
      filename: attachment.name,
      contentType: attachment.contentType,
      bytes: attachment.content,
      direction: 'IN',
    })
  } catch (error) {
    console.error('[contact-attachment] refused', {
      filename: attachment.name,
      reason: error instanceof Error ? error.message : 'unknown',
    })

    const note = `${message}\n\n[Could not be kept: ${attachment.name}]`

    if (messageId) {
      await db.query('UPDATE lead_messages SET body = $2 WHERE id = $1;', [messageId, note])
    } else {
      await db.query('UPDATE leads SET message = $2 WHERE id = $1;', [personId, note])
    }
  }
}

/**
 * A short letter telling the owner to go and look, never the whole message:
 * the inbox is where an enquiry is answered, and a mail carrying everything
 * invites answering from a mailbox the system cannot see.
 */
const notifyOwner = async (
  input: ContactInput,
  attachment: { name: string; bytes: number } | null,
  personId: string,
): Promise<boolean> => {
  const to = env.CONTACT_TO_EMAIL

  if (!to) return false

  const rows = [
    { label: 'From', value: `${input.name} <${input.email}>` },
    ...(input.company ? [{ label: 'Company', value: input.company }] : []),
    ...(input.phone ? [{ label: 'Phone', value: input.phone }] : []),
    ...(input.projectType ? [{ label: 'Service', value: input.projectType }] : []),
    ...(input.budget ? [{ label: 'Budget', value: input.budget }] : []),
    ...(input.timeline ? [{ label: 'Timeline', value: input.timeline }] : []),
    ...(attachment ? [{ label: 'Attachment', value: attachment.name }] : []),
  ]

  const { accepted } = await sendMail(
    {
      to,
      subject: `New message — ${input.name}`,
      html: layout({
        language: (input.language as MailLanguage) ?? 'de',
        heading: 'A new message',
        intro: `${escapeHtml(input.name)} wrote through the contact form.`,
        rows,
        body: `<p>${escapeHtml(input.message).replace(/\n/g, '<br>')}</p>`,
        actions: button(
          `${env.BASE_URL.replace(/\/$/, '')}/admin/inbox/${personId}`,
          'Open in the inbox',
          'left',
          true,
        ),
        signOff: 'yamanwarda.de',
      }),
      text: plainText([
        `${input.name} <${input.email}>`,
        ...rows.map((row) => `${row.label}: ${row.value}`),
        '',
        input.message,
      ]),
      reply_to: input.email,
    },
    'contact-notify',
  )

  return accepted
}
