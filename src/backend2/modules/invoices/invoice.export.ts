import { strToU8, zipSync } from 'fflate'
import { formatMinor } from '../../contracts/invoice.contract'
import type { MediaStore } from '../../media/store'
import { ensureDocument, readAssetBytes } from './invoice.files'
import * as repo from './invoice.repo'

/**
 * `Download 2026 invoices` — the package for a tax adviser.
 *
 * One ZIP, built on request and handed to the owner's browser; nothing is
 * emailed. It holds every **live** document issued in the year — invoices,
 * cancelled invoices and their cancellation documents — as the stored PDFs in
 * their baseline language, plus three CSV files: documents, payments and
 * refunds. Drafts and everything in test mode are left out by the query
 * itself, not filtered afterwards.
 *
 * Grouping: a document belongs to the year of its issue date; a payment or
 * refund to the year it happened. Amounts in CSV are decimal strings with a
 * separate currency column — never summed across currencies.
 */

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value)

  // A leading = + - @ would be read as a formula by a spreadsheet.
  const safe = /^[=+\-@\t\r]/u.test(text) && !/^-?\d+(\.\d+)?$/u.test(text) ? `'${text}` : text

  return /[",\n\r;]/u.test(safe) ? `"${safe.replace(/"/gu, '""')}"` : safe
}

export const toCsv = (header: string[], rows: unknown[][]): string =>
  `${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`

export const buildYearExport = async (
  year: number,
  store?: MediaStore,
): Promise<{ bytes: Uint8Array; fileName: string; documents: number }> => {
  const documents = await repo.liveDocumentsOfYear(year)
  const files: Record<string, Uint8Array> = {}

  for (const row of documents) {
    const { assetId } = await ensureDocument({ invoiceId: row.id, language: row.language, store })
    const folder = row.kind === 'cancellation' ? 'cancellations' : 'invoices'

    files[`${year}/${folder}/${row.number}.pdf`] = await readAssetBytes(assetId, store)
  }

  files[`${year}/documents.csv`] = strToU8(
    toCsv(
      [
        'number',
        'kind',
        'status',
        'issue_date',
        'due_date',
        'service_from',
        'service_to',
        'client',
        'recipient',
        'currency',
        'net',
        'tax',
        'total',
        'paid',
        'refunded',
        'cancels',
        'cancel_reason',
      ],
      documents.map((row) => {
        const snapshot = row.snapshot as { cancels?: { number?: string } | null } | null

        return [
          row.number,
          row.kind,
          row.status,
          row.issue_date,
          row.due_date,
          row.service_date_from,
          row.service_date_to,
          row.client_name,
          row.recipient_company || row.recipient_name,
          row.currency,
          formatMinor(Number(row.net_minor)),
          formatMinor(Number(row.tax_minor)),
          formatMinor(Number(row.total_minor)),
          formatMinor(Number(row.paid_minor)),
          formatMinor(Number(row.refunded_minor)),
          snapshot?.cancels?.number ?? '',
          row.cancel_reason,
        ]
      }),
    ),
  )

  const payments = await repo.livePaymentsOfYear(year)

  files[`${year}/payments.csv`] = strToU8(
    toCsv(
      ['paid_on', 'invoice', 'method', 'currency', 'amount', 'reference', 'voided', 'void_reason'],
      payments.map((row) => [
        row.paid_on,
        row.invoice_number,
        row.method,
        row.currency,
        formatMinor(Number(row.amount_minor)),
        row.reference,
        row.voided_at ? 'yes' : 'no',
        row.void_reason,
      ]),
    ),
  )

  const refunds = await repo.liveRefundsOfYear(year)

  files[`${year}/refunds.csv`] = strToU8(
    toCsv(
      ['refunded_on', 'invoice', 'method', 'currency', 'amount', 'note'],
      refunds.map((row) => [
        row.refunded_on,
        row.invoice_number,
        row.method,
        row.currency,
        formatMinor(Number(row.amount_minor)),
        row.note,
      ]),
    ),
  )

  return {
    bytes: zipSync(files, { level: 6, mtime: new Date(`${year}-12-31T12:00:00Z`) }),
    fileName: `invoices-${year}.zip`,
    documents: documents.length,
  }
}
