import { type Db, getDb, withTransaction } from '#/backend/db/client'
import { badRequestError, internalError, notFoundError } from '#/backend/shared/error'
import { resolveObjectStore } from '#/backend/shared/image-storage'
import type {
  Invoice,
  InvoiceList,
  InvoiceRow,
  InvoiceSummary,
} from '#/shared/types/invoice.types'
import {
  DOCUMENT_TITLE,
  settlementOf,
  totalsOf,
  type CorrectionInput,
  type InvoiceKind,
  type InvoiceQueryInput,
  type InvoiceWriteInput,
} from '#/shared/validation/invoice.validation'
import { getClient } from './client.service'
import {
  CLIENT_COLUMNS_ALIASED,
  DATE_TEXT,
  INVOICE_ROW_COLUMNS,
  PAID_CENTS,
  projectClient,
  projectLine,
  projectPayment,
  projectRow,
  TODAY,
  toInt,
  toIsoRequired,
  unaliasClient,
  type ClientAliasedShape,
  type InvoiceRowShape,
  type LineShape,
  type PaymentShape,
} from './invoice.sql'
import { assertPrintable, renderInvoicePdf } from './pdf.service'
import { sellerGaps } from './seller'

/**
 * Invoicing.
 *
 * Three rules hold the whole module together, and every function below is
 * shaped by them rather than by convenience:
 *
 * 1. **A draft is his. An issued invoice is a fact.** There is no code path
 *    that changes the money on an issued document, because there is no such
 *    act — the correction is a second document that points back at the first.
 * 2. **A number is handed out by the same statement that writes it.** Never
 *    before, never in a second round trip. A gap in the series is a question
 *    at an audit that he should never have to answer.
 * 3. **Nothing is summed across the two kinds of money.** Every figure is
 *    filtered by `money_kind`, or is about one document and does not care.
 */

/* -------------------------------------------------------------------------- */
/* What one invoice has been settled by                                       */
/* -------------------------------------------------------------------------- */

/**
 * Credit notes written against an invoice.
 *
 * A `CREDIT_NOTE` reduces what is owed without touching the original, whose
 * paper and totals must stay exactly as they were sent. So "still owed" is
 * `total − paid − credited`, and a client who was credited the difference
 * stops appearing in the overdue list — which is the whole point of writing
 * the credit note.
 */
const CREDITED_CENTS = `(SELECT COALESCE(SUM(n.total_cents), 0)
        FROM invoices n
       WHERE n.corrects_id = i.id AND n.kind = 'CREDIT_NOTE' AND n.status = 'ISSUED')`

/** Money still out with a client: an ordinary invoice, issued, not settled. */
const OWED = `(i.total_cents - ${PAID_CENTS} - ${CREDITED_CENTS})`
const COUNTS = `i.status = 'ISSUED' AND i.kind = 'INVOICE' AND ${OWED} > 0`

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

type RowWithCredit = InvoiceRowShape & { credited_cents: number | string }

const ROW_COLUMNS = `${INVOICE_ROW_COLUMNS}, ${CREDITED_CENTS} AS credited_cents`

/**
 * A row, with credit notes folded into what it has been settled by.
 *
 * `projectRow` does not know about credit notes on purpose — it is shared with
 * anything that only needs the shape of a document. Settlement is recomputed
 * here, where the credited figure exists.
 */
const projectWithCredit = (row: RowWithCredit): InvoiceRow => {
  const base = projectRow(row)
  const credited = toInt(row.credited_cents)

  if (credited === 0) return base

  const settlement = settlementOf({
    status: row.status,
    dueOn: row.due_on,
    totalCents: base.totalCents,
    paidCents: base.paidCents + credited,
    today: row.today,
  })

  return {
    ...base,
    settlement,
    daysLate: settlement === 'OVERDUE' || settlement === 'PART' ? base.daysLate : 0,
  }
}

export const listInvoices = async (query: InvoiceQueryInput): Promise<InvoiceList> => {
  const term = query.search.trim()

  const result = await getDb().query<RowWithCredit>(
    `SELECT ${ROW_COLUMNS}
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
      WHERE ($1 = ''
             OR c.company ILIKE '%' || $1 || '%'
             OR c.contact_name ILIKE '%' || $1 || '%'
             OR i.number ILIKE '%' || $1 || '%'
             OR EXISTS (SELECT 1 FROM invoice_lines l
                         WHERE l.invoice_id = i.id AND l.description ILIKE '%' || $1 || '%'))
      ORDER BY i.created_at DESC
      LIMIT $2;`,
    [term, query.limit],
  )

  const rows = result.rows.map(projectWithCredit)

  return {
    // The filter runs here rather than in SQL because the settlements he
    // filters by — overdue, part paid — are derived from today's date and the
    // payments, not stored. Expressing them twice, once in SQL and once in
    // `settlementOf`, is exactly how a list and its own filter start to
    // disagree.
    rows: query.settlement === 'ALL' ? rows : rows.filter((row) => row.settlement === query.settlement),
    summary: await getSummary(),
  }
}

/**
 * The five figures he asked for, and the sixth he switched on.
 *
 * All of them in one round trip, all of them computed from rows. Nothing here
 * is cached, and nothing is stored: the last panel he deleted had figures he
 * could not trace, and every number below can be followed to the invoices and
 * payments that make it.
 */
export const getSummary = async (): Promise<InvoiceSummary> => {
  const db = getDb()

  const [owing, arrived, recurring] = await Promise.all([
    db.query<{
      overdue_cents: string
      overdue_count: string
      open_cents: string
      open_count: string
      month: string
    }>(
      `SELECT
          COALESCE(SUM(${OWED}) FILTER (WHERE ${COUNTS} AND i.due_on < ${TODAY}), 0) AS overdue_cents,
          COUNT(*) FILTER (WHERE ${COUNTS} AND i.due_on < ${TODAY}) AS overdue_count,
          COALESCE(SUM(${OWED}) FILTER (WHERE ${COUNTS}), 0) AS open_cents,
          COUNT(*) FILTER (WHERE ${COUNTS}) AS open_count,
          to_char(${TODAY}, 'YYYY-MM') AS month
         FROM invoices i;`,
    ),

    /*
     * What actually reached him this month, by the day it arrived.
     *
     * His switch, and not only a preference: his own tax return counts income
     * on the day it lands — the Zuflussprinzip — so the honest figure and the
     * legally required one are the same figure and there is only one to get
     * right. Counting by invoice date instead would put money he has not been
     * paid into a month he could spend it in.
     */
    db.query<{ cents: string }>(
      `SELECT COALESCE(SUM(p.amount_cents), 0) AS cents
         FROM payments p
        WHERE date_trunc('month', p.received_on) = date_trunc('month', ${TODAY});`,
    ),

    /*
     * The one number that says whether he can live.
     *
     * There is no `subscriptions` table — he refused to model one on 17 Sep,
     * with no clients and prices still moving, and that was right. So this is
     * measured from what he actually billed: **the latest subscription
     * invoice per client, if it was issued in the last forty days**. Forty,
     * not thirty, because a monthly invoice sent on the 2nd and the next on
     * the 3rd must not leave a gap where a live client disappears.
     *
     * `money_kind = 'SUBSCRIPTION'` is what keeps build money out of it. No
     * setup fee, no instalment and no one-off can reach this figure — by
     * construction, not by remembering to filter.
     */
    db.query<{ cents: string }>(
      `SELECT COALESCE(SUM(latest.total_cents), 0) AS cents
         FROM (SELECT DISTINCT ON (i.client_id) i.client_id, i.total_cents
                 FROM invoices i
                WHERE i.money_kind = 'SUBSCRIPTION'
                  AND i.kind = 'INVOICE'
                  AND i.status = 'ISSUED'
                  AND i.issued_on >= ${TODAY} - 40
                ORDER BY i.client_id, i.issued_on DESC) latest;`,
    ),
  ])

  const thisMonthCents = toInt(arrived.rows[0]?.cents ?? 0)
  const first = owing.rows[0]

  return {
    overdueCents: toInt(first?.overdue_cents ?? 0),
    overdueCount: toInt(first?.overdue_count ?? 0),
    openCents: toInt(first?.open_cents ?? 0),
    openCount: toInt(first?.open_count ?? 0),
    thisMonthCents,
    recurringCents: toInt(recurring.rows[0]?.cents ?? 0),
    // Switch 18, which he turned on knowing what it is. A flat 30 % of what
    // arrived — not a calculation of anything, and the card says so in words.
    taxPotCents: Math.round(thisMonthCents * 0.3),
    currency: 'EUR',
    month: first?.month ?? '',
  }
}

export const getInvoice = async (invoiceId: string): Promise<Invoice> => {
  const db = getDb()

  const [head, lines, payments, corrections, letters] = await Promise.all([
    db.query<RowWithCredit & ClientAliasedShape & { deal_id: string | null; language: 'de' | 'en' } & {
      service_from: string | null
      service_to: string | null
      note: string
      net_cents: string | number
      tax_cents: string | number
      corrects_id: string | null
      corrects_number: string | null
    }>(
      `SELECT ${ROW_COLUMNS}, ${CLIENT_COLUMNS_ALIASED},
              i.deal_id, i.language, i.note, i.net_cents, i.tax_cents, i.corrects_id,
              ${DATE_TEXT('i.service_from')} AS service_from,
              ${DATE_TEXT('i.service_to')} AS service_to,
              (SELECT o.number FROM invoices o WHERE o.id = i.corrects_id) AS corrects_number
         FROM invoices i
         JOIN clients c ON c.id = i.client_id
        WHERE i.id = $1;`,
      [invoiceId],
    ),

    db.query<LineShape>(
      `SELECT id, position, description, detail, quantity, unit_cents, tax_rate
         FROM invoice_lines WHERE invoice_id = $1 ORDER BY position;`,
      [invoiceId],
    ),

    db.query<PaymentShape>(
      `SELECT id, amount_cents, method, ${DATE_TEXT('received_on')} AS received_on,
              reference, note, created_at
         FROM payments WHERE invoice_id = $1 ORDER BY received_on, created_at;`,
      [invoiceId],
    ),

    db.query<{ id: string; number: string | null; kind: InvoiceKind }>(
      `SELECT id, number, kind FROM invoices
        WHERE corrects_id = $1 ORDER BY created_at;`,
      [invoiceId],
    ),

    /*
     * The letters that carried this document.
     *
     * Read from the messages themselves rather than from a flag on the
     * invoice. He may send it, then send a reminder, then send it again after
     * a client loses it — and the honest answer to "did this go out?" is the
     * list of times it did.
     */
    db.query<{ message_id: string; sent_at: Date; subject: string }>(
      `SELECT m.id AS message_id, m.sent_at, m.subject
         FROM lead_attachments a
         JOIN lead_messages m ON m.id = a.message_id
        WHERE a.invoice_id = $1 AND m.direction = 'OUT'
        ORDER BY m.sent_at DESC;`,
      [invoiceId],
    ),
  ])

  const row = head.rows[0]

  if (!row) throw notFoundError('That invoice is not here')

  return {
    ...projectWithCredit(row),
    client: projectClient(unaliasClient(row)),
    dealId: row.deal_id,
    language: row.language,
    serviceFrom: row.service_from,
    serviceTo: row.service_to,
    note: row.note,
    netCents: toInt(row.net_cents),
    taxCents: toInt(row.tax_cents),
    lines: lines.rows.map(projectLine),
    payments: payments.rows.map(projectPayment),
    correctsId: row.corrects_id,
    correctsNumber: row.corrects_number,
    correctedBy: corrections.rows,
    letters: letters.rows.map((row) => ({
      messageId: row.message_id,
      sentAt: toIsoRequired(row.sent_at),
      subject: row.subject,
    })),
  }
}

/* -------------------------------------------------------------------------- */
/* Drafting                                                                   */
/* -------------------------------------------------------------------------- */

const assertDraft = async (invoiceId: string): Promise<void> => {
  const result = await getDb().query<{ status: string; number: string | null }>(
    'SELECT status, number FROM invoices WHERE id = $1;',
    [invoiceId],
  )

  const row = result.rows[0]

  if (!row) throw notFoundError('That invoice is not here')

  if (row.status !== 'DRAFT') {
    // Switch 20. Said in a sentence rather than left to a database error,
    // because the reply is what he needs: the correction exists, it is just a
    // different button.
    throw badRequestError(
      `${row.number ?? 'That invoice'} has been issued, so it cannot be edited. Cancel it or write a credit note instead.`,
    )
  }
}

/**
 * Replaces a draft's lines with what the form now says.
 *
 * Delete-then-insert rather than a diff: a draft's lines have no identity
 * anybody refers to, and matching them up would be code that exists only to
 * avoid two cheap statements on a table with at most forty rows.
 */
const writeLines = async (
  invoiceId: string,
  input: InvoiceWriteInput,
  db: Db = getDb(),
): Promise<void> => {
  await db.query('DELETE FROM invoice_lines WHERE invoice_id = $1;', [invoiceId])

  let position = 0

  for (const line of input.lines) {
    position += 1

    await db.query(
      `INSERT INTO invoice_lines
         (invoice_id, position, description, detail, quantity, unit_cents, tax_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7);`,
      [invoiceId, position, line.description, line.detail, line.quantity, line.unitEuros, line.taxRate],
    )
  }

  const totals = totalsOf(input.lines)

  await db.query(
    `UPDATE invoices SET net_cents = $2, tax_cents = $3, total_cents = $4,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;`,
    [invoiceId, totals.netCents, totals.taxCents, totals.totalCents],
  )
}

export const createInvoice = async (input: InvoiceWriteInput): Promise<Invoice> => {
  // Checked rather than left to the foreign key, so a stale client id reads as
  // a sentence instead of a constraint name.
  await getClient(input.clientId)

  const result = await getDb().query<{ id: string }>(
    `INSERT INTO invoices
       (client_id, deal_id, money_kind, language, service_from, service_to, note, due_days)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id;`,
    [
      input.clientId,
      input.dealId ?? null,
      input.moneyKind,
      input.language,
      input.serviceFrom ?? null,
      input.serviceTo ?? null,
      input.note,
      input.dueDays,
    ],
  )

  const invoiceId = result.rows[0]!.id

  await writeLines(invoiceId, input)

  return getInvoice(invoiceId)
}

/**
 * Editing a draft, under the lock issuing takes.
 *
 * The three statements below used to run loose, and only the middle one
 * carried `AND status = 'DRAFT'`. Between the check and `writeLines` the
 * invoice could be issued by a second tab — the header update would then
 * match nothing, correctly, while `writeLines` went on to delete the lines of
 * a numbered invoice and write a new `total_cents` over it. A document already
 * sent to a client, quietly holding a different amount.
 *
 * `FOR UPDATE` is the same row lock `allocateAndIssue` takes, so an edit and
 * an issue can no longer overlap: whichever arrives second finds the status it
 * was not expecting and is refused. Correcting an issued invoice is what
 * `correctInvoice` is for, and it leaves both documents standing.
 */
export const updateInvoice = async (
  invoiceId: string,
  input: InvoiceWriteInput,
): Promise<Invoice> => {
  await getClient(input.clientId)

  await withTransaction(async (db) => {
    const draft = await db.query<{ status: string }>(
      'SELECT status FROM invoices WHERE id = $1 FOR UPDATE;',
      [invoiceId],
    )

    const status = draft.rows[0]?.status

    if (status === undefined) throw notFoundError('That invoice is not here')

    if (status !== 'DRAFT') {
      throw badRequestError(
        'That invoice has been issued, so its figures can no longer change. Cancel it with a credit note and issue a corrected one.',
      )
    }

    await db.query(
      `UPDATE invoices
          SET client_id = $2, deal_id = $3, money_kind = $4, language = $5,
              service_from = $6, service_to = $7, note = $8, due_days = $9,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'DRAFT';`,
      [
        invoiceId,
        input.clientId,
        input.dealId ?? null,
        input.moneyKind,
        input.language,
        input.serviceFrom ?? null,
        input.serviceTo ?? null,
        input.note,
        input.dueDays,
      ],
    )

    await writeLines(invoiceId, input, db)
  })

  return getInvoice(invoiceId)
}

/**
 * Deleting a draft.
 *
 * Only a draft, and that is not a policy that can be relaxed: an issued
 * invoice has a number in a gapless series, and deleting it would leave the
 * hole the whole numbering scheme exists to prevent.
 */
export const deleteInvoice = async (invoiceId: string): Promise<void> => {
  await assertDraft(invoiceId)

  await getDb().query("DELETE FROM invoices WHERE id = $1 AND status = 'DRAFT';", [invoiceId])
}

/* -------------------------------------------------------------------------- */
/* Issuing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Hands out the next number **and** stamps it onto the invoice, under a lock
 * that only one request can hold at a time.
 *
 * The draft is taken with `FOR UPDATE` first, and that lock — not the `target`
 * CTE — is what makes the act safe. Two clicks on `Issue`, or one click and one
 * retry, arrive as two overlapping requests; under `READ COMMITTED` both would
 * otherwise see the row as a draft, and a data-modifying CTE is not undone by
 * the outer `UPDATE` matching nothing. Both would take a number, the second
 * would overwrite the first's on the row, and the first number would belong to
 * no document for ever — the one hole a gapless series cannot survive. Worse,
 * the file frozen by the first request would still be sitting in the bucket
 * under `pdf_key`, printing a number the row no longer holds.
 *
 * Blocked on the lock, the second request waits for the first to commit, then
 * re-reads the row, finds it is no longer a draft, and returns without
 * reaching the allocation at all. The caller sees `null` and says so.
 *
 * The `target` CTE stays, so the statement is still correct on its own: when
 * the invoice is not a draft the select finds nothing, the insert gets no row,
 * and no number is consumed. And allocation and stamping remain one statement,
 * because split in two a failure in between would burn a number for ever.
 *
 * Exported for the concurrency test, which is the only way to prove the lock
 * is doing the work the comment claims it does.
 */
export const allocateAndIssue = async (
  invoiceId: string,
  dated: boolean,
): Promise<string | null> =>
  withTransaction(async (db) => {
    const draft = await db.query<{ id: string }>(
      "SELECT id FROM invoices WHERE id = $1 AND status = 'DRAFT' FOR UPDATE;",
      [invoiceId],
    )

    if (draft.rows.length === 0) return null

    const result = await db.query<{ number: string }>(
      `WITH target AS (
          SELECT i.id, EXTRACT(YEAR FROM ${TODAY})::int AS year
            FROM invoices i WHERE i.id = $1 AND i.status = 'DRAFT'
       ), allocated AS (
          INSERT INTO invoice_numbers (year, next)
          SELECT t.year, 2 FROM target t
          ON CONFLICT (year) DO UPDATE SET next = invoice_numbers.next + 1
          RETURNING year, next - 1 AS seq
       )
       UPDATE invoices i
          SET number = a.year || '-' || lpad(a.seq::text, 3, '0'),
              number_year = a.year,
              status = 'ISSUED',
              issued_on = ${TODAY},
              -- The term comes off the row being issued, never from anything
              -- held in memory: a Worker does not keep module state between
              -- requests, so a draft written on Monday and issued on Thursday
              -- would silently fall back to the default.
              due_on = CASE WHEN $2 THEN ${TODAY} + i.due_days ELSE NULL END,
              updated_at = CURRENT_TIMESTAMP
         FROM allocated a
        WHERE i.id = $1
        RETURNING i.number;`,
      [invoiceId, dated],
    )

    return result.rows[0]?.number ?? null
  })

const storeKeyFor = (invoiceId: string, number: string): string =>
  `invoices/${number.replace(/[^\w-]/g, '')}-${invoiceId.slice(0, 8)}.pdf`

/**
 * Renders the paper and freezes it in the bucket.
 *
 * His answer to question 15: the file is written once and never regenerated,
 * so a new logo next year cannot rewrite every invoice he has ever sent —
 * which would be both a `GoBD` breach and, worse, would mean he does not hold
 * a copy of what he actually sent.
 *
 * Returns `null` when there is no bucket, which is the ordinary state of the
 * Node dev server. The invoice is still issued and still correct; the file is
 * drawn on demand by `readInvoicePdf` until a bucket exists.
 */
const freezePdf = async (invoice: Invoice): Promise<string | null> => {
  const store = await resolveObjectStore()

  if (!store || !invoice.number) return null

  const bytes = await renderInvoicePdf(invoice, invoice.client)
  const key = storeKeyFor(invoice.id, invoice.number)

  await store.put({ key, body: bytes as Uint8Array<ArrayBuffer>, contentType: 'application/pdf' })

  await getDb().query('UPDATE invoices SET pdf_key = $2 WHERE id = $1;', [invoice.id, key])

  return key
}

/**
 * Issuing.
 *
 * The order matters and is deliberate:
 *
 *   1. Everything that can refuse, refuses **before** a number is consumed —
 *      the seller's own details, a glyph the font cannot draw, an empty
 *      document. A number burned on a refused invoice is a permanent gap.
 *   2. The number, the status and the dates land in one statement.
 *   3. The file is drawn and frozen afterwards. If that fails the invoice is
 *      still issued and still lawful; it simply has no stored copy yet, and
 *      the download route draws it.
 */
export const issueInvoice = async (invoiceId: string): Promise<Invoice> => {
  const invoice = await getInvoice(invoiceId)

  if (invoice.status !== 'DRAFT') {
    throw badRequestError(`${invoice.number ?? 'That invoice'} has already been issued`)
  }

  if (invoice.lines.length === 0) throw badRequestError('An invoice needs at least one line')

  const gaps = sellerGaps()

  if (gaps.length > 0) {
    throw badRequestError(
      `Your own details are still placeholders: ${gaps.join(', ')}. Fill them in seller.ts before sending anything to a client.`,
    )
  }

  // Draws nothing; only checks that every string on the page can be set in the
  // embedded face, so a client never receives a document full of empty boxes.
  assertPrintable(invoice, invoice.client)

  const number = await allocateAndIssue(invoiceId, invoice.kind === 'INVOICE')

  if (!number) throw internalError('The invoice could not be numbered')

  const issued = await getInvoice(invoiceId)

  await freezePdf(issued).catch((error: unknown) => {
    // Not rethrown: the invoice is issued, numbered and correct, and losing
    // the whole act because a bucket hiccupped would leave a numbered document
    // in a state nothing can reach. The download route draws it instead.
    console.error('[invoices] the PDF could not be frozen', {
      invoice: number,
      name: error instanceof Error ? error.name : 'UnknownError',
    })
  })

  return getInvoice(invoiceId)
}

/* -------------------------------------------------------------------------- */
/* Correcting                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Cancellation and credit note — his answer to question 4, both from day one.
 *
 * A **cancellation** voids the original whole: the original moves to
 * `CANCELLED`, keeps its number and its file, and stops counting anywhere. A
 * **credit note** leaves the original standing and reduces what is owed on it
 * by its own total.
 *
 * Both are new documents that take the next number in the series. Neither
 * edits a single byte of what was already sent, which is the entire point.
 *
 * The whole act is one transaction, and it opens by locking **the original**.
 * The lock inside `allocateAndIssue` cannot help here: the row it takes is the
 * correction this request inserted a moment ago, which no other request can
 * even see, so it serialises nothing. Without a lock on the original, two
 * clicks on `Credit note` both read `correctedBy` as empty, both pass the
 * guard below, and both are numbered — two documents in a gapless series for
 * one correction he made once, and `CREDITED_CENTS` then sums both, so an
 * invoice nobody has paid a cent of quietly leaves the overdue list.
 *
 * One transaction also means a failure anywhere takes the correction row with
 * it. Written outside one, a correction whose numbering failed stayed behind
 * as a draft that the `already been cancelled` guard would match for ever —
 * an invoice that could then never be cancelled at all.
 */
export const correctInvoice = async (
  invoiceId: string,
  input: CorrectionInput,
): Promise<Invoice> => {
  const correctionId = await withTransaction(async (db) => {
    const held = await db.query<{ id: string }>(
      'SELECT id FROM invoices WHERE id = $1 FOR UPDATE;',
      [invoiceId],
    )

    if (held.rows.length === 0) throw notFoundError('That invoice is not here')

    // Read only once the row is held, so what the guards below see is what is
    // still true when they act on it.
    const original = await getInvoice(invoiceId)

    // Said before the general rule below, because it is the answer he needs.
    // Once the lock serialises two clicks, the loser arrives here and finds
    // the invoice already voided — and `Only an issued invoice can be
    // cancelled` would be true and useless.
    if (original.status === 'CANCELLED') {
      throw badRequestError(`${original.number} has already been cancelled`)
    }

    if (original.status !== 'ISSUED') {
      throw badRequestError('Only an issued invoice can be cancelled or credited')
    }

    if (original.kind !== 'INVOICE') {
      throw badRequestError('A correction cannot itself be corrected')
    }

    if (
      input.kind === 'CANCELLATION' &&
      original.correctedBy.some((c) => c.kind === 'CANCELLATION')
    ) {
      throw badRequestError(`${original.number} has already been cancelled`)
    }

    // A cancellation mirrors the original exactly — it is the same document,
    // voided — so its lines are the original's lines rather than anything typed
    // again. A credit note carries only what is actually being given back.
    const lines =
      input.kind === 'CANCELLATION'
        ? original.lines.map((line) => ({
            description: line.description,
            detail: line.detail,
            quantity: line.quantity,
            unitEuros: line.unitCents,
            taxRate: line.taxRate,
          }))
        : input.lines

    const totals = totalsOf(lines)

    const created = await db.query<{ id: string }>(
      `INSERT INTO invoices
         (client_id, deal_id, kind, corrects_id, money_kind, language, note,
          net_cents, tax_cents, total_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id;`,
      [
        original.clientId,
        original.dealId,
        input.kind,
        original.id,
        original.moneyKind,
        original.language,
        input.reason,
        totals.netCents,
        totals.taxCents,
        totals.totalCents,
      ],
    )

    const draftId = created.rows[0]!.id

    let position = 0

    for (const line of lines) {
      position += 1

      await db.query(
        `INSERT INTO invoice_lines
           (invoice_id, position, description, detail, quantity, unit_cents, tax_rate)
         VALUES ($1, $2, $3, $4, $5, $6, $7);`,
        [
          draftId,
          position,
          line.description,
          line.detail,
          line.quantity,
          line.unitEuros,
          line.taxRate,
        ],
      )
    }

    // A correction has no payment term: nobody owes anything on it.
    const number = await allocateAndIssue(draftId, false)

    if (!number) throw internalError('The correction could not be numbered')

    if (input.kind === 'CANCELLATION') {
      await db.query("UPDATE invoices SET status = 'CANCELLED' WHERE id = $1;", [original.id])
    }

    return draftId
  })

  const correction = await getInvoice(correctionId)

  // Outside the transaction on purpose: the correction is a fact the moment it
  // is committed, and holding a row lock while a bucket in another datacentre
  // is written would block every other correction for the length of a network
  // round trip. A freeze that fails leaves the document reachable anyway —
  // `documentBytes` draws it.
  await freezePdf(correction).catch(() => {})

  return correction
}

/* -------------------------------------------------------------------------- */
/* Money arriving                                                             */
/* -------------------------------------------------------------------------- */

export const addPayment = async (
  invoiceId: string,
  input: {
    amountEuros: number
    method: 'TRANSFER' | 'CARD' | 'CASH' | 'PAYPAL' | 'OTHER'
    receivedOn: string
    reference: string
    note: string
  },
): Promise<Invoice> => {
  const invoice = await getInvoice(invoiceId)

  if (invoice.status === 'DRAFT') {
    throw badRequestError('Nobody can pay a draft. Issue it first.')
  }

  await getDb().query(
    `INSERT INTO payments (invoice_id, amount_cents, method, received_on, reference, note)
     VALUES ($1, $2, $3, $4, $5, $6);`,
    [invoiceId, input.amountEuros, input.method, input.receivedOn, input.reference, input.note],
  )

  return getInvoice(invoiceId)
}

export const deletePayment = async (invoiceId: string, paymentId: string): Promise<Invoice> => {
  await getDb().query('DELETE FROM payments WHERE id = $1 AND invoice_id = $2;', [
    paymentId,
    invoiceId,
  ])

  return getInvoice(invoiceId)
}

/* -------------------------------------------------------------------------- */
/* The letter                                                                 */
/* -------------------------------------------------------------------------- */

export const documentBytes = async (invoice: Invoice): Promise<Uint8Array> => {
  const store = await resolveObjectStore()

  if (store && invoice.hasPdf) {
    // The key as it was written, not as it would be computed today. Rebuilding
    // it from the number would mean the day the naming rule changes, every
    // stored invoice quietly becomes unreachable.
    const stored = await getDb().query<{ pdf_key: string | null }>(
      'SELECT pdf_key FROM invoices WHERE id = $1;',
      [invoice.id],
    )

    const key = stored.rows[0]?.pdf_key
    const object = key ? await store.get(key) : null

    if (object?.body) {
      return new Uint8Array(await new Response(object.body).arrayBuffer())
    }
  }

  /*
   * Drawn now, because the frozen copy does not exist.
   *
   * Only reachable in two situations: the dev server, which has no bucket at
   * all, and an issued invoice whose freeze failed. In both the data behind
   * the document is already locked — an issued invoice cannot be edited — so
   * what is drawn here is the same document that would have been frozen.
   */
  return renderInvoicePdf(invoice, invoice.client)
}

const filenameFor = (invoice: Invoice): string =>
  `${DOCUMENT_TITLE[invoice.language][invoice.kind]}-${invoice.number ?? 'Entwurf'}.pdf`.replace(
    /[^\w.-]/g,
    '-',
  )

/**
 * Hands the document back, behind the admin guard.
 *
 * A draft may be downloaded too, and is drawn fresh every time — that is what
 * makes it a draft. It carries no number, so nothing about it can be mistaken
 * for something that was sent.
 */
export const readInvoicePdf = async (invoiceId: string): Promise<Response> => {
  const invoice = await getInvoice(invoiceId)
  const bytes = await documentBytes(invoice)

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(bytes.byteLength),
      'content-disposition': `inline; filename="${filenameFor(invoice)}"`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    },
  })
}
