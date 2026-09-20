import { getDb } from '#/backend/db/client'
import { storeAttachmentBytes } from '#/backend/modules/inbox/attachment.service'
import { badRequestError, notFoundError } from '#/backend/shared/error'
import { plainText } from '#/backend/shared/mail'
import type { InvoiceLetter, PersonInvoice } from '#/shared/types/invoice.types'
import {
  balanceOf,
  DOCUMENT_TITLE,
  payLinkUsable,
  settlementOf,
  type InvoiceKind,
  type InvoiceLanguage,
  type InvoiceStatus,
  type LetterKind,
} from '#/shared/validation/invoice.validation'
import { documentBytes, getInvoice } from './invoice.service'
import { CREDITED_CENTS, DATE_TEXT, LETTERS_LAST, PAID_CENTS, TODAY, toInt } from './invoice.sql'
import { money } from './pdf.service'
import { resolveSeller } from './seller'

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
export const fileForInvoice = async (
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

  /*
   * A cancelled invoice is not a letter to write again.
   *
   * The original still has its number and its file, so the button stayed
   * offered — and the letter it prepared read "please find invoice 2026-001
   * attached, payable by …" about a document he had voided. The cancellation
   * is the paper that says what happened; it has its own letter.
   */
  if (invoice.status === 'CANCELLED') {
    const cancellation = invoice.correctedBy.find((c) => c.kind === 'CANCELLATION')

    throw badRequestError(
      `${invoice.number} was cancelled${cancellation?.number ? ` by ${cancellation.number}` : ''}. Send the cancellation instead — it is the document that says so.`,
    )
  }

  const personId = await personForClient(invoiceId)
  const language = invoice.language
  const german = language === 'de'
  const name = invoice.client.contactName.trim()
  const title = DOCUMENT_TITLE[language][invoice.kind]
  const total = money(invoice.totalCents, language, invoice.currency)
  /*
   * What is still owed, with credit notes taken off.
   *
   * Until 20 Sep this was `total − paid`, so a reminder on an invoice he had
   * credited 400 € of asked for the whole 990 € — chasing a client for money
   * he had given back himself, in writing. `balanceOf` is the one subtraction
   * every screen uses; the letter now uses it too.
   */
  const { owed: owedCents } = balanceOf(invoice)
  const owed = money(owedCents, language, invoice.currency)
  /*
   * Only a link that still works.
   *
   * `payUrl` stays on the row after a partial payment while Stripe has been
   * told to switch the link off, so printing it here sent a partly-paid client
   * to a dead page under the words "pay by card". Same rule as Stripe's, from
   * `payLinkUsable`.
   */
  const payUrl = payLinkUsable(invoice) ? invoice.payUrl : null

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
              // On the reminder above all: the one letter whose whole purpose
              // is to make paying take ten seconds rather than ten minutes.
              ...(payUrl ? ['', 'Mit Karte bezahlen:', payUrl] : []),
            ]
          : [
              greeting(name, language),
              '',
              `invoice ${invoice.number} for ${owed} was due on ${readableDay(invoice.dueOn, language)}.`,
              'It has most likely just slipped through — if the payment is already on its way, please ignore this note.',
              '',
              'The invoice is attached again for convenience.',
              ...(payUrl ? ['', 'Pay by card:', payUrl] : []),
            ],
      ),
      attachment,
      kind,
    }
  }

  /*
   * Whether the letter asks for money at all.
   *
   * "Write again" is pressed on a paid invoice too — a client wants the paper
   * for their books after paying by card, or lost the first copy. The letter
   * used to say "payable in full by …" and offer the card link regardless,
   * asking a client who had paid to pay again. Now it says what is true:
   * settled invoices are thanked for, corrections carry no payment sentence
   * at all, and only an open invoice gets a due date and a link.
   */
  const settled = invoice.kind === 'INVOICE' && owedCents === 0 && invoice.paidCents > 0
  const asksForMoney = invoice.kind === 'INVOICE' && owedCents > 0

  return {
    personId,
    subject: `${title} ${invoice.number} · ${resolveSeller().name}`,
    body: plainText(
      german
        ? [
            greeting(name, language),
            '',
            `anbei erhalten Sie die ${title} ${invoice.number} über ${total}.`,
            asksForMoney && invoice.dueOn
              ? `Zahlbar ohne Abzug bis ${readableDay(invoice.dueOn, language)}.`
              : null,
            settled ? 'Die Rechnung ist bereits beglichen — vielen Dank.' : null,
            // Clickable here, where the paper can only print it. The bank
            // details stay on the invoice and stay the first offer.
            ...(asksForMoney && payUrl
              ? ['', 'Sie können auch direkt mit Karte bezahlen:', payUrl]
              : []),
            '',
            invoice.note.trim() || null,
          ]
        : [
            greeting(name, language),
            '',
            `please find ${title.toLowerCase()} ${invoice.number} attached, for ${total}.`,
            asksForMoney && invoice.dueOn
              ? `Payable in full by ${readableDay(invoice.dueOn, language)}.`
              : null,
            settled ? 'This invoice has already been settled — thank you.' : null,
            ...(asksForMoney && payUrl ? ['', 'You can also pay by card:', payUrl] : []),
            '',
            invoice.note.trim() || null,
          ],
    ),
    attachment,
    kind,
  }
}

/* -------------------------------------------------------------------------- */
/* Attaching, without a letter to go with it                                  */
/* -------------------------------------------------------------------------- */

/**
 * This person's invoices, for the composer's attach panel.
 *
 * His own request, 20 Sep 2026: writing a reply and wanting to attach an
 * invoice he already made, without going to the invoice, pressing *Write the
 * letter*, and losing the words he had typed. `prepareLetter` opens a letter;
 * this only lists what could go in one.
 *
 * Scoped to the person by `THIS_PERSONS`, which is the whole safety argument
 * for the panel: with a list of everyone's invoices it would take one
 * mis-click to send one client another client's figures, and there is no
 * taking that back.
 *
 * Drafts are listed and marked unattachable rather than filtered out. A draft
 * has no frozen file, so there is genuinely nothing to send — but dropping it
 * silently would leave him looking for an invoice he knows he wrote.
 */
/**
 * Which invoices belong to the person a conversation is with.
 *
 * Two ways, and the second one is not a convenience.
 *
 * `clients.lead_id` is the stored link, written once by `personForClient` and
 * true from then on. But it is **null until the first letter**, so a client he
 * typed in by hand and has never written to has no link at all — and the panel
 * scoped on that column alone came back empty for a client whose email matched
 * the conversation exactly. He would have seen "0 you can attach" beside a
 * client he had just invoiced, with nothing on screen explaining why.
 *
 * So an unlinked client also matches on its email address, which is how
 * `personForClient` resolves one in the first place. Only when the link is
 * genuinely absent: a client already pointed at another person stays pointed
 * there, and never gets pulled into a second conversation by a shared mailbox.
 */
const THIS_PERSONS = `(
        c.lead_id = $1
        OR (c.lead_id IS NULL
            AND btrim(c.email) <> ''
            AND lower(c.email) = (SELECT lower(l.email) FROM leads l WHERE l.id = $1))
      )`

export const listInvoicesForPerson = async (personId: string): Promise<PersonInvoice[]> => {
  const result = await getDb().query<{
    id: string
    number: string | null
    kind: InvoiceKind
    status: InvoiceStatus
    language: InvoiceLanguage
    title: string | null
    issued_on: string | null
    due_on: string | null
    total_cents: number | string
    paid_cents: number | string
    credited_cents: number | string
    currency: string
    last_sent_at: Date | null
    today: string
  }>(
    `SELECT i.id, i.number, i.kind, i.status, i.language,
            (SELECT l.description FROM invoice_lines l
              WHERE l.invoice_id = i.id ORDER BY l.position LIMIT 1) AS title,
            ${DATE_TEXT('i.issued_on')} AS issued_on,
            ${DATE_TEXT('i.due_on')} AS due_on,
            i.total_cents,
            ${PAID_CENTS} AS paid_cents,
            ${CREDITED_CENTS} AS credited_cents,
            i.currency,
            ${LETTERS_LAST} AS last_sent_at,
            ${DATE_TEXT(TODAY)} AS today
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
      WHERE ${THIS_PERSONS}
      ORDER BY i.created_at DESC;`,
    [personId],
  )

  return result.rows.map((row) => {
    const totalCents = toInt(row.total_cents)

    return {
      id: row.id,
      number: row.number,
      kind: row.kind,
      // Credit notes settle an invoice as surely as payments do. Without them
      // here, an invoice he had credited in full read **Overdue** in the
      // composer while the list beside it said **Paid**.
      settlement: settlementOf({
        status: row.status,
        kind: row.kind,
        dueOn: row.due_on,
        totalCents,
        paidCents: toInt(row.paid_cents) + toInt(row.credited_cents),
        today: row.today,
      }),
      title: row.title ?? '',
      issuedOn: row.issued_on,
      totalCents,
      currency: row.currency,
      // A draft is the only document with no file behind it.
      attachable: row.status !== 'DRAFT',
      filename: `${DOCUMENT_TITLE[row.language][row.kind]}-${row.number ?? ''}.pdf`.replace(
        /[^\w.-]/g,
        '-',
      ),
      lastSentAt: row.last_sent_at ? row.last_sent_at.toISOString() : null,
    }
  })
}

/**
 * Copies one invoice's PDF into this person's files, for the composer.
 *
 * The check is the point. Without it, an id typed into the request would
 * attach any client's invoice to any conversation — one client reading
 * another's figures, with no way to take it back. So the invoice must belong
 * to this person by `THIS_PERSONS`, the same rule the panel lists by, and a
 * mismatch reads as "not here" rather than as a permission error: from the
 * composer's side it genuinely is not.
 */
export const attachInvoiceToPerson = async (
  personId: string,
  invoiceId: string,
): Promise<{ id: string; filename: string; bytes: number }> => {
  const db = getDb()

  const owned = await db.query<{ status: InvoiceStatus; client_id: string; lead_id: string | null }>(
    `SELECT i.status, c.id AS client_id, c.lead_id FROM invoices i
       JOIN clients c ON c.id = i.client_id
      WHERE i.id = $2 AND ${THIS_PERSONS};`,
    [personId, invoiceId],
  )

  const invoice = owned.rows[0]

  if (!invoice) throw notFoundError('That invoice is not one of this person\'s')

  if (invoice.status === 'DRAFT') {
    throw badRequestError('A draft has no final document yet. Issue it first.')
  }

  /*
   * Matched on the email, so write the link down.
   *
   * The same thing `personForClient` does after resolving one, and for the
   * same reason: the resolution happens once, and every later invoice for this
   * client lands in this conversation without depending on the address staying
   * the same. A client who changes mailbox afterwards keeps their thread.
   */
  if (!invoice.lead_id) {
    await db.query(
      'UPDATE clients SET lead_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1;',
      [invoice.client_id, personId],
    )
  }

  return fileForInvoice(invoiceId, personId)
}
