import type {
  InvoicePayment,
  InvoiceRefund,
  InvoiceSettings,
  OwnerInvoice,
  OwnerInvoiceListItem,
  PaymentState,
} from '../../contracts/invoice.contract'
import { allocateInstallments, amountDueMinor, type MoneyFacts, paymentStateOf, refundableMinor } from './invoice.money'
import type {
  FileRow,
  InstallmentRow,
  InvoiceRow,
  LineRow,
  PaymentRow,
  RefundRow,
  SettingsRow,
} from './invoice.repo'
import { readSnapshot } from './invoice.document'

/** Rows into the shapes the Dashboard reads. Nothing else crosses the wire. */

const iso = (value: Date | string | null): string | null => (value ? new Date(value).toISOString() : null)

export const toSettings = (
  row: SettingsRow,
  readiness: InvoiceSettings['readiness'],
): InvoiceSettings => ({
  sellerName: row.seller_name,
  sellerAddress: row.seller_address,
  sellerCountry: row.seller_country_code,
  sellerEmail: row.seller_email,
  sellerPhone: row.seller_phone,
  sellerWebsite: row.seller_website,
  taxNumber: row.tax_number,
  vatId: row.vat_id,
  bankHolder: row.bank_holder,
  bankIban: row.bank_iban,
  bankBic: row.bank_bic,
  bankName: row.bank_name,
  taxMode: row.tax_mode,
  defaultTaxRateBp: row.default_tax_rate_bp as InvoiceSettings['defaultTaxRateBp'],
  paymentTermsDays: row.payment_terms_days,
  defaultLanguage: row.default_language,
  testRecipientEmail: row.test_recipient_email,
  revision: row.revision,
  updatedAt: iso(row.updated_at)!,
  readiness,
})

export const moneyFacts = (row: InvoiceRow, installments: InstallmentRow[]): MoneyFacts => ({
  kind: row.kind,
  status: row.status,
  totalMinor: Number(row.total_minor),
  paidMinor: Number(row.paid_minor),
  refundedMinor: Number(row.refunded_minor),
  dueDate: row.due_date,
  installments: installments.map((part) => ({ dueDate: part.due_date, amountMinor: Number(part.amount_minor) })),
  collectionFailed: row.collection_failed_at !== null,
})

export const toListItem = (row: InvoiceRow, paymentState: PaymentState): OwnerInvoiceListItem => ({
  id: row.id,
  mode: row.mode,
  kind: row.kind,
  status: row.status,
  paymentState,
  number: row.number,
  client: { id: row.client_id, displayName: row.client_name ?? '' },
  recipientName: row.recipient_company || row.recipient_name,
  currency: row.currency,
  language: row.language,
  issueDate: row.issue_date,
  dueDate: row.due_date,
  totalMinor: Number(row.total_minor),
  amountDueMinor:
    row.kind === 'invoice' && row.status === 'issued'
      ? Math.max(0, Number(row.total_minor) - Number(row.paid_minor) + Number(row.refunded_minor))
      : 0,
  subscriptionId: row.subscription_id,
  createdAt: iso(row.created_at)!,
  updatedAt: iso(row.updated_at)!,
})

export const toPayment = (row: PaymentRow): InvoicePayment => ({
  id: row.id,
  invoiceId: row.invoice_id,
  method: row.method,
  amountMinor: Number(row.amount_minor),
  currency: row.currency,
  paidOn: row.paid_on,
  reference: row.reference,
  note: row.note,
  voided: row.voided_at !== null,
  voidReason: row.void_reason,
  receiptAvailable: row.method === 'cash' && row.voided_at === null,
  createdAt: iso(row.created_at)!,
})

export const toRefund = (row: RefundRow): InvoiceRefund => ({
  id: row.id,
  invoiceId: row.invoice_id,
  method: row.method,
  amountMinor: Number(row.amount_minor),
  currency: row.currency,
  refundedOn: row.refunded_on,
  note: row.note,
  createdAt: iso(row.created_at)!,
})

type Link = { id: string; number: string | null } | null

export const toOwnerInvoice = (input: {
  row: InvoiceRow
  lines: LineRow[]
  installments: InstallmentRow[]
  payments: PaymentRow[]
  refunds: RefundRow[]
  files: FileRow[]
  today: string
  issueProblems: string[]
  draftTotals: {
    subtotalMinor: number
    discountMinor: number
    netMinor: number
    taxMinor: number
    totalMinor: number
    lineNetMinor: number[]
    taxGroups: Array<{ rateBp: number; netMinor: number; taxMinor: number }>
  } | null
  links: { cancels: Link; cancelledBy: Link; replaces: Link; replacedBy: Link }
}): OwnerInvoice => {
  const { row } = input
  const facts = moneyFacts(row, input.installments)
  const state = paymentStateOf(facts, input.today)
  const snapshot = row.snapshot ? readSnapshot(row.snapshot) : null
  const totals = snapshot
    ? { ...snapshot.totals, lineNetMinor: snapshot.lines.map((line) => line.netMinor) }
    : input.draftTotals!
  const effectivePaid = Number(row.paid_minor) - Number(row.refunded_minor)
  const fx = row.fx as OwnerInvoice['fx']

  return {
    ...toListItem(row, state),
    title: row.title,
    recipient: {
      name: row.recipient_name,
      company: row.recipient_company,
      address: row.recipient_address,
      country: row.recipient_country_code,
      email: row.recipient_email,
      vatId: row.recipient_vat_id,
    },
    serviceDateFrom: row.service_date_from,
    serviceDateTo: row.service_date_to,
    paymentTermsDays: row.payment_terms_days,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    taxMode: row.tax_mode,
    reverseCharge: row.reverse_charge,
    allowBank: row.allow_bank,
    allowStripe: row.allow_stripe,
    notes: row.notes,
    internalNote: row.internal_note,
    fx: fx ?? null,
    lines: input.lines.map((line, index) => ({
      position: index + 1,
      description: line.description,
      unit: line.unit,
      quantityMilli: Number(line.quantity_milli),
      unitPriceMinor: Number(line.unit_price_minor),
      taxRateBp: line.tax_rate_bp,
      netMinor: totals.lineNetMinor[index] ?? 0,
      service: line.service_id
        ? {
            id: line.service_id,
            name: line.service_name ?? '',
            priceMinor: line.service_price_minor === null ? null : Number(line.service_price_minor),
          }
        : null,
    })),
    installments: allocateInstallments(
      input.installments.map((part, index) => ({
        position: index + 1,
        dueDate: part.due_date,
        amountMinor: Number(part.amount_minor),
        label: part.label,
      })),
      row.status === 'draft' ? 0 : effectivePaid,
      input.today,
    ),
    money: {
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.discountMinor,
      netMinor: totals.netMinor,
      taxMinor: totals.taxMinor,
      totalMinor: totals.totalMinor,
      paidMinor: Number(row.paid_minor),
      refundedMinor: Number(row.refunded_minor),
      amountDueMinor: amountDueMinor(facts),
      refundableMinor: refundableMinor(facts),
    },
    taxGroups: totals.taxGroups,
    totalMinor: totals.totalMinor,
    issueProblems: input.issueProblems,
    payments: input.payments.map(toPayment),
    refunds: input.refunds.map(toRefund),
    documents: input.files
      .filter((file) => file.kind === 'document')
      .map((file) => ({ language: file.language, assetId: file.asset_id })),
    cancels: input.links.cancels,
    cancelledBy: input.links.cancelledBy,
    replaces: input.links.replaces,
    replacedBy: input.links.replacedBy,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    stripeCheckoutUrl: row.stripe_checkout_url,
    collectionFailed: row.collection_failed_at !== null,
    inboxDraftId: row.inbox_draft_id,
    sentAt: iso(row.sent_at),
    issuedAt: iso(row.issued_at),
    cancelledAt: iso(row.cancelled_at),
    cancelReason: row.cancel_reason,
    revision: row.revision,
  }
}
