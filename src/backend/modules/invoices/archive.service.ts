import { getDb } from '#/backend/db/client'
import { badRequestError } from '#/backend/shared/error'
import { zip, type ZipEntry } from '#/backend/shared/zip'
import { DOCUMENT_TITLE } from '#/shared/validation/invoice.validation'
import { documentBytes, getInvoice } from './invoice.service'
import { DATE_TEXT, TODAY } from './invoice.sql'

/**
 * Everything, in one file he can put somewhere else.
 *
 * His own words, and the right instinct: the documents live in one Cloudflare
 * bucket and the facts live in one Neon database, both inside one account. R2
 * will not lose them, but an account can be closed, suspended, or simply
 * stopped being paid for — and **German retention law asks him for the
 * invoices, not Cloudflare.** A copy he holds himself is the only thing that
 * survives losing the account.
 *
 * So this is deliberately not a backup system. It is a button that hands him
 * a `.zip` he can drop on a disk and forget, which is the only kind of backup
 * a one-person business actually performs.
 *
 * What is inside:
 *
 *   * Every document of the year that is not a draft — invoices,
 *     cancellations and credit notes alike, because the series has to be
 *     continuous to be worth anything at an audit.
 *   * `Rechnungen.csv` — one row per document, the figures a Steuerberater
 *     reads without opening a single PDF.
 *   * `Zahlungen.csv` — one row per payment, by the day it arrived. This is
 *     the file that proves income under the Zuflussprinzip, and it is the one
 *     the PDFs cannot answer.
 *
 * Both are semicolon-separated with a comma decimal and a byte-order mark,
 * because they will be opened in German Excel and nothing else.
 */

/** A year, or every year there has ever been. */
export type ArchiveScope = { year: number } | { year: 'all' }

/**
 * Guards a request that would build an archive too large to hold in memory.
 *
 * A Worker has 128 MB and this assembles the whole file before sending it. At
 * roughly 19 KB a document, five hundred is under ten megabytes and a year of
 * a one-person business is a few dozen — so this ceiling is unreachable in
 * practice and exists only so that the failure, if it ever comes, is a
 * sentence rather than a Worker killed mid-request.
 */
const MAX_DOCUMENTS = 500

/** German Excel: comma decimal, semicolon columns. */
const euros = (cents: number): string => (cents / 100).toFixed(2).replace('.', ',')

/**
 * One CSV field.
 *
 * Quoted whenever it holds a separator, a quote or a newline — a client
 * called «Müller; Söhne GmbH» would otherwise silently become two columns and
 * shift every figure on the row one place to the left.
 */
const field = (value: string): string =>
  /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value

const csv = (rows: string[][]): Uint8Array => {
  const text = rows.map((row) => row.map(field).join(';')).join('\r\n')

  // The byte-order mark is not decoration: without it Excel reads UTF-8 as
  // Latin-1 and every umlaut in every client name comes out broken.
  return new TextEncoder().encode(`﻿${text}\r\n`)
}

type Row = {
  id: string
  number: string
  kind: 'INVOICE' | 'CANCELLATION' | 'CREDIT_NOTE'
  status: 'ISSUED' | 'CANCELLED'
  language: 'de' | 'en'
  issued_on: string
  due_on: string | null
  client_name: string
  net_cents: number | string
  tax_cents: number | string
  total_cents: number | string
  paid_cents: number | string
  currency: string
}

/**
 * The archive, as bytes and the name to save it under.
 *
 * Drafts are excluded and that is not an oversight: a draft has no number, is
 * not a document, and can still be edited or deleted. Putting one in a folder
 * a Steuerberater opens would be handing them a page that does not exist in
 * the books.
 */
export const buildArchive = async (
  scope: ArchiveScope,
): Promise<{ bytes: Uint8Array; filename: string }> => {
  const db = getDb()
  const everything = scope.year === 'all'
  const year = everything ? 0 : scope.year

  const documents = await db.query<Row>(
    `SELECT i.id, i.number, i.kind, i.status, i.language,
            ${DATE_TEXT('i.issued_on')} AS issued_on,
            ${DATE_TEXT('i.due_on')} AS due_on,
            COALESCE(NULLIF(btrim(c.company), ''), c.contact_name) AS client_name,
            i.net_cents, i.tax_cents, i.total_cents, i.currency,
            (SELECT COALESCE(SUM(p.amount_cents), 0)
               FROM payments p WHERE p.invoice_id = i.id) AS paid_cents
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
      WHERE i.status <> 'DRAFT'
        AND ($1 OR i.number_year = $2)
      ORDER BY i.number;`,
    [everything, year],
  )

  if (documents.rows.length === 0) {
    throw badRequestError(
      everything
        ? 'There are no issued documents yet. Issue an invoice first — a draft is not a document.'
        : `Nothing was issued in ${year}.`,
    )
  }

  if (documents.rows.length > MAX_DOCUMENTS) {
    throw badRequestError(
      `${documents.rows.length} documents is more than one archive can carry. Ask for a single year instead.`,
    )
  }

  const payments = await db.query<{
    received_on: string
    number: string
    client_name: string
    amount_cents: number | string
    method: string
    reference: string
    currency: string
  }>(
    `SELECT ${DATE_TEXT('p.received_on')} AS received_on,
            i.number,
            COALESCE(NULLIF(btrim(c.company), ''), c.contact_name) AS client_name,
            p.amount_cents, p.method, p.reference, i.currency
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       JOIN clients c ON c.id = i.client_id
      WHERE $1 OR EXTRACT(YEAR FROM p.received_on)::int = $2
      ORDER BY p.received_on, i.number;`,
    [everything, year],
  )

  const entries: ZipEntry[] = []

  /* ── One PDF per document ─────────────────────────────────────────────── */

  for (const row of documents.rows) {
    /*
     * Drawn through `documentBytes`, which prefers the frozen copy and falls
     * back to redrawing. That fallback matters here more than anywhere: an
     * invoice issued from his laptop has no frozen file at all, and an
     * archive that silently skipped it would be missing a number from a
     * series whose whole value is being continuous.
     */
    const invoice = await getInvoice(row.id)
    const bytes = await documentBytes(invoice)
    const title = DOCUMENT_TITLE[row.language][row.kind]

    entries.push({
      name: `${row.number}-${title}.pdf`.replace(/[^\w.-]/g, '-'),
      bytes,
    })
  }

  /* ── The two indexes ──────────────────────────────────────────────────── */

  entries.push({
    name: 'Rechnungen.csv',
    bytes: csv([
      [
        'Nummer',
        'Art',
        'Status',
        'Datum',
        'Faellig',
        'Kunde',
        'Netto',
        'Steuer',
        'Brutto',
        'Bezahlt',
        'Waehrung',
      ],
      ...documents.rows.map((row) => [
        row.number,
        DOCUMENT_TITLE.de[row.kind],
        row.status === 'CANCELLED' ? 'Storniert' : 'Ausgestellt',
        row.issued_on,
        row.due_on ?? '',
        row.client_name,
        euros(Number(row.net_cents)),
        euros(Number(row.tax_cents)),
        euros(Number(row.total_cents)),
        euros(Number(row.paid_cents)),
        row.currency,
      ]),
    ]),
  })

  entries.push({
    name: 'Zahlungen.csv',
    bytes: csv([
      ['Eingang', 'Rechnung', 'Kunde', 'Betrag', 'Art', 'Referenz', 'Waehrung'],
      ...payments.rows.map((row) => [
        row.received_on,
        row.number,
        row.client_name,
        euros(Number(row.amount_cents)),
        row.method,
        row.reference,
        row.currency,
      ]),
    ]),
  })

  /*
   * A page saying what this is, for the version of him that opens the folder
   * in four years having forgotten every decision in this file.
   */
  entries.push({
    name: 'LIESMICH.txt',
    bytes: new TextEncoder().encode(
      [
        `Rechnungsarchiv — ${everything ? 'alle Jahre' : year}`,
        `Erstellt am ${new Date().toISOString().slice(0, 10)} von yamanwarda.de`,
        '',
        `${documents.rows.length} Dokument(e), ${payments.rows.length} Zahlung(en).`,
        '',
        'Rechnungen.csv — ein Eintrag je Dokument, mit Netto, Steuer und Brutto.',
        'Zahlungen.csv  — ein Eintrag je Zahlungseingang, nach dem Tag des Eingangs',
        '                 (Zuflussprinzip).',
        '',
        'Entwuerfe sind nicht enthalten: ein Entwurf hat keine Nummer und ist',
        'kein Dokument.',
        '',
        'Die Nummerierung ist fortlaufend. Fehlt eine Nummer in diesem Ordner,',
        'fehlt sie auch im System — das waere ein Fehler und kein Zufall.',
      ].join('\r\n'),
    ),
  })

  return {
    bytes: zip(entries),
    filename: `Rechnungen-${everything ? 'alle' : year}.zip`,
  }
}

/** The years that actually have documents, newest first, for the screen. */
export const archiveYears = async (): Promise<number[]> => {
  const result = await getDb().query<{ year: number }>(
    `SELECT DISTINCT i.number_year AS year
       FROM invoices i
      WHERE i.status <> 'DRAFT' AND i.number_year IS NOT NULL
      ORDER BY year DESC;`,
  )

  return result.rows.map((row) => Number(row.year))
}

/** Which year to build when he asked for none: the one he is living in. */
export const thisYear = async (): Promise<number> => {
  const result = await getDb().query<{ today: string }>(`SELECT ${DATE_TEXT(TODAY)} AS today;`)

  return Number(result.rows[0]!.today.slice(0, 4))
}

export const readArchive = async (scope: ArchiveScope): Promise<Response> => {
  const { bytes, filename } = await buildArchive(scope)

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'content-type': 'application/zip',
      'content-length': String(bytes.byteLength),
      // `attachment`, not `inline`: a browser has nothing useful to do with a
      // zip on screen, and the point of the button is a file on his disk.
      'content-disposition': `attachment; filename="${filename}"`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    },
  })
}
