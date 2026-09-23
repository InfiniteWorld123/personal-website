import {
  type Currency,
  type DocumentLanguage,
  type InvoiceMode,
  type TaxMode,
  computeTotals,
  effectiveRateBp,
  installmentProblems,
  isCalendarDate,
} from '../../contracts/invoice.contract'
import type { InstallmentRow, InvoiceRow, LineRow, SettingsRow } from './invoice.repo'

/**
 * The invoice as a document: what is printed, frozen at issue, and exported.
 *
 * `InvoiceDocument` is exactly what goes into `v2_invoices.snapshot`. Every
 * language copy and every re-download is rendered from it, never from the
 * live rows — so a seller address edited next year, a Client renamed, or a
 * Service repriced cannot change a document that was already issued.
 */

export type SellerSnapshot = {
  name: string
  address: string
  country: string
  email: string
  phone: string
  website: string
  taxNumber: string
  vatId: string
  bank: { holder: string; iban: string; bic: string; name: string }
}

export type InvoiceDocument = {
  version: 1
  kind: 'invoice' | 'cancellation'
  mode: InvoiceMode
  number: string | null
  issueDate: string
  dueDate: string | null
  serviceDateFrom: string | null
  serviceDateTo: string | null
  currency: Currency
  /** The baseline language. Other languages are copies of this document. */
  language: DocumentLanguage
  title: string
  seller: SellerSnapshot
  recipient: {
    clientId: string
    name: string
    company: string
    address: string
    country: string
    email: string
    vatId: string
  }
  lines: Array<{
    position: number
    description: string
    unit: string
    quantityMilli: number
    unitPriceMinor: number
    taxRateBp: number
    netMinor: number
    service: { id: string; name: string; priceMinor: number | null } | null
  }>
  discount: { type: 'none' | 'percent' | 'fixed'; value: number; amountMinor: number }
  totals: {
    subtotalMinor: number
    discountMinor: number
    netMinor: number
    taxMinor: number
    totalMinor: number
    taxGroups: Array<{ rateBp: number; netMinor: number; taxMinor: number }>
  }
  taxMode: TaxMode
  reverseCharge: boolean
  installments: Array<{ position: number; dueDate: string; amountMinor: number; label: string }>
  payment: { allowBank: boolean; allowStripe: boolean; paymentTermsDays: number }
  notes: string
  period: { start: string; end: string } | null
  /** On a cancellation document: the invoice it reverses. */
  cancels: { number: string; issueDate: string; reason: string } | null
  /** On a correction: the cancelled invoice it replaces. */
  replaces: { number: string } | null
}

export const sellerSnapshot = (settings: SettingsRow): SellerSnapshot => ({
  name: settings.seller_name,
  address: settings.seller_address,
  country: settings.seller_country_code,
  email: settings.seller_email,
  phone: settings.seller_phone,
  website: settings.seller_website,
  taxNumber: settings.tax_number,
  vatId: settings.vat_id,
  bank: {
    holder: settings.bank_holder,
    iban: settings.bank_iban,
    bic: settings.bank_bic,
    name: settings.bank_name,
  },
})

/**
 * What a real invoice needs from the seller before one may be issued.
 *
 * The name and full address (§ 14 (4) Nr. 1 UStG), a tax number or VAT id
 * (Nr. 2), an email to be reached at, and bank details when bank transfer is
 * the way to pay. Test mode needs none of it — fake details are fine there.
 */
export const sellerMissing = (settings: SettingsRow): string[] => {
  const missing: string[] = []

  if (settings.seller_name.trim() === '') missing.push('sellerName')
  if (settings.seller_address.trim() === '') missing.push('sellerAddress')
  if (settings.seller_email.trim() === '') missing.push('sellerEmail')
  if (settings.tax_number.trim() === '' && settings.vat_id.trim() === '') missing.push('taxNumberOrVatId')
  if (settings.bank_iban.trim() === '') missing.push('bankIban')
  if (settings.bank_holder.trim() === '') missing.push('bankHolder')

  return missing
}

export const toCalcLines = (lines: LineRow[]) =>
  lines.map((line) => ({
    quantityMilli: Number(line.quantity_milli),
    unitPriceMinor: Number(line.unit_price_minor),
    taxRateBp: line.tax_rate_bp,
  }))

export const totalsFor = (row: InvoiceRow, lines: LineRow[], settings: SettingsRow) =>
  computeTotals({
    lines: toCalcLines(lines),
    discount: { type: row.discount_type, value: Number(row.discount_value) },
    taxMode: settings.tax_mode,
    reverseCharge: settings.tax_mode === 'standard' && row.reverse_charge,
    defaultRateBp: settings.default_tax_rate_bp,
  })

/**
 * Why this draft cannot be issued, as sentences. Empty when it can.
 * Computed on every read so the Dashboard's checklist is never stale.
 */
export const issueProblems = (input: {
  row: InvoiceRow
  lines: LineRow[]
  installments: InstallmentRow[]
  settings: SettingsRow
  issueDate: string
  clientUsable: boolean
}): string[] => {
  const { row, lines, installments, settings } = input
  const problems: string[] = []

  if (!input.clientUsable) problems.push('The client is in Trash. Restore it or choose another client.')
  if (row.recipient_name.trim() === '' && row.recipient_company.trim() === '') {
    problems.push("Enter the recipient's name or company")
  }
  if (row.recipient_address.trim() === '') problems.push("Enter the recipient's full address")
  if (lines.length === 0) problems.push('Add at least one line')
  if (lines.some((line) => line.description.trim() === '')) problems.push('Every line needs a description')
  if (lines.some((line) => Number(line.quantity_milli) <= 0)) problems.push('Every line needs a quantity above zero')

  const totals = totalsFor(row, lines, settings)

  if (lines.length > 0 && totals.totalMinor <= 0) problems.push('The invoice total must be above zero')
  if (row.discount_type === 'fixed' && Number(row.discount_value) > totals.subtotalMinor) {
    problems.push('The discount is larger than the subtotal')
  }

  if (row.reverse_charge) {
    if (settings.tax_mode !== 'standard') {
      problems.push('Reverse charge applies only with standard taxation')
    } else if (row.recipient_vat_id.trim() === '') {
      problems.push("Reverse charge needs the recipient's VAT id")
    }
  }

  if (
    row.service_date_from &&
    row.service_date_to &&
    row.service_date_to < row.service_date_from
  ) {
    problems.push('The service period ends before it starts')
  }

  problems.push(
    ...installmentProblems(
      installments.map((part) => ({ dueDate: part.due_date, amountMinor: Number(part.amount_minor) })),
      totals.totalMinor,
      input.issueDate,
    ),
  )

  return problems
}

/** The number as printed: `2026-0007`, or `TEST-2026-0007` in test mode. */
export const formatNumber = (mode: InvoiceMode, year: number, seq: number): string =>
  `${mode === 'test' ? 'TEST-' : ''}${year}-${String(seq).padStart(4, '0')}`

export const buildDocument = (input: {
  row: InvoiceRow
  lines: LineRow[]
  installments: InstallmentRow[]
  settings: SettingsRow
  number: string | null
  issueDate: string
  dueDate: string | null
  replaces: { number: string } | null
}): InvoiceDocument => {
  const { row, lines, settings } = input
  const totals = totalsFor(row, lines, settings)
  const reverseCharge = settings.tax_mode === 'standard' && row.reverse_charge
  const context = { taxMode: settings.tax_mode, reverseCharge, defaultRateBp: settings.default_tax_rate_bp }

  return {
    version: 1,
    kind: 'invoice',
    mode: row.mode,
    number: input.number,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    serviceDateFrom: row.service_date_from ?? input.issueDate,
    serviceDateTo: row.service_date_to,
    currency: row.currency,
    language: row.language,
    title: row.title,
    seller: sellerSnapshot(settings),
    recipient: {
      clientId: row.client_id,
      name: row.recipient_name,
      company: row.recipient_company,
      address: row.recipient_address,
      country: row.recipient_country_code,
      email: row.recipient_email,
      vatId: row.recipient_vat_id,
    },
    lines: lines.map((line, index) => ({
      position: index + 1,
      description: line.description,
      unit: line.unit,
      quantityMilli: Number(line.quantity_milli),
      unitPriceMinor: Number(line.unit_price_minor),
      taxRateBp: effectiveRateBp({ taxRateBp: line.tax_rate_bp }, context),
      netMinor: totals.lineNetMinor[index]!,
      service: line.service_id
        ? {
            id: line.service_id,
            name: line.service_name ?? '',
            priceMinor: line.service_price_minor === null ? null : Number(line.service_price_minor),
          }
        : null,
    })),
    discount: {
      type: row.discount_type,
      value: Number(row.discount_value),
      amountMinor: totals.discountMinor,
    },
    totals: {
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.discountMinor,
      netMinor: totals.netMinor,
      taxMinor: totals.taxMinor,
      totalMinor: totals.totalMinor,
      taxGroups: totals.taxGroups,
    },
    taxMode: settings.tax_mode,
    reverseCharge,
    installments: input.installments.map((part, index) => ({
      position: index + 1,
      dueDate: part.due_date,
      amountMinor: Number(part.amount_minor),
      label: part.label,
    })),
    payment: {
      allowBank: row.allow_bank,
      allowStripe: row.allow_stripe,
      paymentTermsDays: row.payment_terms_days,
    },
    notes: row.notes,
    period: row.period_start && row.period_end ? { start: row.period_start, end: row.period_end } : null,
    cancels: null,
    replaces: input.replaces,
  }
}

/**
 * The cancellation document (Stornorechnung): the original's lines and
 * totals, negated, under a number of its own, pointing back at the invoice it
 * reverses. The original document itself is never touched.
 */
export const buildCancellation = (input: {
  original: InvoiceDocument
  number: string
  issueDate: string
  reason: string
}): InvoiceDocument => {
  const o = input.original

  return {
    ...o,
    kind: 'cancellation',
    number: input.number,
    issueDate: input.issueDate,
    dueDate: null,
    lines: o.lines.map((line) => ({ ...line, quantityMilli: -line.quantityMilli, netMinor: -line.netMinor })),
    discount: { ...o.discount, amountMinor: -o.discount.amountMinor },
    totals: {
      subtotalMinor: -o.totals.subtotalMinor,
      discountMinor: -o.totals.discountMinor,
      netMinor: -o.totals.netMinor,
      taxMinor: -o.totals.taxMinor,
      totalMinor: -o.totals.totalMinor,
      taxGroups: o.totals.taxGroups.map((group) => ({
        rateBp: group.rateBp,
        netMinor: -group.netMinor,
        taxMinor: -group.taxMinor,
      })),
    },
    installments: [],
    payment: { ...o.payment, allowBank: false, allowStripe: false },
    cancels: { number: o.number ?? '', issueDate: o.issueDate, reason: input.reason },
    replaces: null,
  }
}

/** A snapshot read back from the database, checked just enough to trust. */
export const readSnapshot = (value: unknown): InvoiceDocument => {
  const document = value as InvoiceDocument

  if (!document || document.version !== 1 || !isCalendarDate(document.issueDate)) {
    throw new Error('Invoice snapshot is unreadable')
  }

  return document
}
