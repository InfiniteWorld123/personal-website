import { getDb } from '#/backend/db/client'
import { storeAttachmentBytes } from '#/backend/modules/inbox/attachment.service'
import { badRequestError, notFoundError } from '#/backend/shared/error'
import { plainText } from '#/backend/shared/mail'
import type { InvoiceLetter } from '#/shared/types/invoice.types'
import { DOCUMENT_TITLE, type LetterKind } from '#/shared/validation/invoice.validation'
import { documentBytes, getInvoice } from './invoice.service'
import { money } from './pdf.service'
import { SELLER } from './seller'

/**
 * Handing an invoice to the inbox.
 *
 * Nothing here sends anything. It prepares a letter and puts it where his
 * letters are written — his own instruction, and a better design than the
 * direct send it replaced, for a reason he named himself: a letter sent past
 * the inbox never appears in the conversation with the person who received
 * it, so the one document that matters most leaves no trace.
 *
 * Idempotent by construction. Pressing the button twice, going back, or
 * refreshing the composer finds the same person and the same attached file —
 * `lead_attachments_invoice_idx` makes a second copy impossible rather than
 * unlikely.
 */

/* -------------------------------------------------------------------------- */
/* Who the letter goes to                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The person in the inbox this client is.
 *
 * Three cases, in order. The client already points at a conversation. Or
 * somebody with that address has written before, and the invoice belongs in
 * *that* thread rather than in a second one. Or nobody has, and the person is
 * created — silently, on his instruction, because a client he is billing
 * obviously belongs in the mailbox.
 *
 * In the last two cases the link is written back onto the client, so the
 * resolution happens once and every later invoice lands in the same thread.
 */
const personForClient = async (invoiceId: string): Promise<string> => {
  const db = getDb()

  const found = await db.query<{
    client_id: string
    lead_id: string | null
    email: string
    company: string
    contact_name: string
    language: string
  }>(
    `SELECT c.id AS client_id, c.lead_id, c.email, c.company, c.contact_name, c.language
       FROM invoices i JOIN clients c ON c.id = i.client_id
      WHERE i.id = $1;`,
    [invoiceId],
  )

  const client = found.rows[0]

  if (!client) throw notFoundError('That invoice is not here')

  if (client.lead_id) return client.lead_id

  if (client.email.trim() === '') {
    throw badRequestError(
      'That client has no email address, so there is nobody to write to. Add one first.',
    )
  }

  const existing = await db.query<{ id: string }>(
    'SELECT id FROM leads WHERE lower(email) = lower($1) ORDER BY created_at LIMIT 1;',
    [client.email],
  )

  const personId =
    existing.rows[0]?.id ??
    (
      await db.query<{ id: string }>(
        `INSERT INTO leads (source, "name", email, company, "language")
         VALUES ('MANUAL', $1, $2, $3, $4) RETURNING id;`,
        [
          client.contact_name.trim() || client.company.trim(),
          client.email,
          client.company.trim() || null,
          // The inbox speaks three languages, the paper two. A client whose
          // paper is German is written to in German.
          client.language === 'en' ? 'en' : 'de',
        ],
      )
    ).rows[0]!.id

  await db.query('UPDATE clients SET lead_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1;', [
    client.client_id,
    personId,
  ])

  return personId
}

/* -------------------------------------------------------------------------- */
/* The file                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The invoice's PDF, in the person's files, ready for the composer.
 *
 * A **copy**, not a pointer at the frozen object: the inbox lets him remove an
 * attachment, and removing one deletes the object it names. Pointing both rows
 * at the same key would mean deleting a draft attachment silently destroys the
 * frozen invoice — the one file in this system that must never be lost.
 *
 * Nineteen kilobytes per letter, so a client who is reminded twice costs less
 * than a single photograph.
 */
const fileForInvoice = async (
  invoiceId: string,
  personId: string,
): Promise<{ id: string; filename: string; bytes: number }> => {
  const db = getDb()

  // Only a copy that has not gone yet. Once a letter carries it, the next
  // letter — a reminder, most likely — gets its own, so the thread shows what
  // each message actually contained.
  const existing = await db.query<{ id: string; filename: string; bytes: number | string }>(
    `SELECT id, filename, bytes FROM lead_attachments
      WHERE lead_id = $1 AND invoice_id = $2 AND message_id IS NULL LIMIT 1;`,
    [personId, invoiceId],
  )

  const already = existing.rows[0]

  if (already) {
    return { id: already.id, filename: already.filename, bytes: Number(already.bytes) }
  }

  const invoice = await getInvoice(invoiceId)
  const bytes = await documentBytes(invoice)
  const title = DOCUMENT_TITLE[invoice.language][invoice.kind]

  const stored = await storeAttachmentBytes({
    personId,
    filename: `${title}-${invoice.number ?? 'Entwurf'}.pdf`.replace(/[^\w.-]/g, '-'),
    contentType: 'application/pdf',
    bytes: bytes as Uint8Array<ArrayBuffer>,
    direction: 'OUT',
  })

  await db.query('UPDATE lead_attachments SET invoice_id = $2 WHERE id = $1;', [
    stored.id,
    invoiceId,
  ])

  return { id: stored.id, filename: stored.filename, bytes: stored.bytes }
}

/* -------------------------------------------------------------------------- */
/* The words                                                                  */
/* -------------------------------------------------------------------------- */

const greeting = (name: string, language: 'de' | 'en'): string =>
  language === 'de'
    ? `Guten Tag${name ? ` ${name}` : ''},`
    : `Hello${name ? ` ${name}` : ''},`

/** `2026-10-02` the way the letter's language writes a date. */
const readableDay = (iso: string | null, language: 'de' | 'en'): string => {
  if (!iso) return ''

  const [year, month, day] = iso.split('-')

  return language === 'de' ? `${day}.${month}.${year}` : `${day}/${month}/${year}`
}

/**
 * A draft he will read before it goes.
 *
 * Deliberately plain and short. It is a covering note for an attachment, not a
 * sales letter, and every extra sentence is one he has to delete. The inbox
 * adds his signature at the moment of sending, so there is none here.
 */
export const prepareLetter = async (
  invoiceId: string,
  kind: LetterKind,
): Promise<InvoiceLetter> => {
  const invoice = await getInvoice(invoiceId)

  if (invoice.status === 'DRAFT') {
    throw badRequestError('Issue it first — a draft has no number to write about.')
  }

  if (kind === 'REMINDER' && invoice.settlement !== 'OVERDUE' && invoice.settlement !== 'PART') {
    throw badRequestError('Nothing is overdue on that invoice')
  }

  const personId = await personForClient(invoiceId)
  const language = invoice.language
  const german = language === 'de'
  const name = invoice.client.contactName.trim()
  const title = DOCUMENT_TITLE[language][invoice.kind]
  const total = money(invoice.totalCents, language, invoice.currency)
  const owed = money(invoice.totalCents - invoice.paidCents, language, invoice.currency)

  const attachment = await fileForInvoice(invoiceId, personId)

  if (kind === 'REMINDER') {
    return {
      personId,
      // Switch 22 — a reminder, never a Mahnung. The second word in German is
      // the opening move of a legal process, and his first client has done
      // nothing to deserve it.
      subject: german
        ? `Zahlungserinnerung · Rechnung ${invoice.number}`
        : `Payment reminder · Invoice ${invoice.number}`,
      body: plainText(
        german
          ? [
              greeting(name, language),
              '',
              `die Rechnung ${invoice.number} über ${owed} war am ${readableDay(invoice.dueOn, language)} fällig.`,
              'Wahrscheinlich ist sie schlicht untergegangen — falls die Zahlung schon unterwegs ist, betrachten Sie diese Nachricht bitte als gegenstandslos.',
              '',
              'Die Rechnung liegt zur Sicherheit noch einmal bei.',
            ]
          : [
              greeting(name, language),
              '',
              `invoice ${invoice.number} for ${owed} was due on ${readableDay(invoice.dueOn, language)}.`,
              'It has most likely just slipped through — if the payment is already on its way, please ignore this note.',
              '',
              'The invoice is attached again for convenience.',
            ],
      ),
      attachment,
      kind,
    }
  }

  return {
    personId,
    subject: `${title} ${invoice.number} · ${SELLER.name}`,
    body: plainText(
      german
        ? [
            greeting(name, language),
            '',
            `anbei erhalten Sie die ${title} ${invoice.number} über ${total}.`,
            invoice.dueOn
              ? `Zahlbar ohne Abzug bis ${readableDay(invoice.dueOn, language)}.`
              : null,
            '',
            invoice.note.trim() || null,
          ]
        : [
            greeting(name, language),
            '',
            `please find ${title.toLowerCase()} ${invoice.number} attached, for ${total}.`,
            invoice.dueOn ? `Payable in full by ${readableDay(invoice.dueOn, language)}.` : null,
            '',
            invoice.note.trim() || null,
          ],
    ),
    attachment,
    kind,
  }
}
