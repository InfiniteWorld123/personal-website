import { type OwnerInvoice, yearOf } from '../../contracts/invoice.contract'
import { getDb, withTransaction } from '../../db/client'
import { badRequest, invoiceLocked, notFound } from '../../http/error'
import { today } from './invoice.clock'
import { assertModeAllowed } from './invoice.config'
import { buildCancellation, formatNumber, readSnapshot } from './invoice.document'
import { refundableMinor } from './invoice.money'
import * as repo from './invoice.repo'
import { createDraftFrom, getInvoice, storeBaselineDocument } from './invoice.service'

/**
 * Corrections. An issued invoice is never rewritten.
 *
 * Cancelling creates a cancellation document (Stornorechnung) with a number
 * of its own from the same gapless sequence, reversing the original line by
 * line and pointing back at it; the original is marked cancelled and its
 * document stays exactly as it was. A correction is a cancellation plus a new
 * draft copied from the original and linked to it, which the owner edits and
 * issues like any other.
 *
 * If the invoice had received money, the answer carries the amount that could
 * go back. Recording the actual refund is the owner's separate action.
 */

const missing = () => notFound('That invoice does not exist')

export type CancelResult = {
  invoice: OwnerInvoice
  cancellation: OwnerInvoice
  refundableMinor: number
}

/** Inside the caller's transaction, with the original locked. Idempotent. */
const cancelLocked = async (row: repo.InvoiceRow, reason: string): Promise<string> => {
  if (row.kind === 'cancellation') {
    throw invoiceLocked('A cancellation document cannot itself be cancelled')
  }
  if (row.status === 'draft') throw badRequest('A draft has no number. Delete it instead of cancelling it.')

  const existing = await repo.findCancellationOf(row.id)

  if (existing) return existing.id

  // A live cancellation document is a live document: the same switch applies.
  assertModeAllowed(row.mode)

  const issueDate = today()
  const year = yearOf(issueDate)
  const seq = await repo.takeNumber(row.mode, year)
  const number = formatNumber(row.mode, year, seq)
  const snapshot = buildCancellation({ original: readSnapshot(row.snapshot), number, issueDate, reason })
  const cancellationId = await repo.insertCancellation({ original: row, number, year, seq, issueDate, snapshot })

  await repo.markCancelled(row.id, reason)

  // Nothing more is collected for a cancelled invoice.
  await getDb().query(
    `UPDATE v2_subscription_charges SET status = 'cancelled'
      WHERE invoice_id = $1 AND status IN ('scheduled', 'waiting_for_card')`,
    [row.id],
  )
  await getDb().query(
    `UPDATE v2_invoice_notices SET status = 'cancelled' WHERE invoice_id = $1 AND status = 'pending'`,
    [row.id],
  )
  await repo.recordEvent({ invoiceId: row.id, kind: 'cancelled', detail: { cancellationNumber: number, reason } })
  await repo.recordEvent({ invoiceId: cancellationId, kind: 'issued', detail: { number, cancels: row.number } })

  return cancellationId
}

export const cancelInvoice = async (input: { id: string; reason: string }): Promise<CancelResult> => {
  const cancellationId = await withTransaction(async () => {
    const row = await repo.lockInvoice(input.id)

    if (!row) throw missing()

    return cancelLocked(row, input.reason)
  })

  await storeBaselineDocument(cancellationId)

  const invoice = await getInvoice(input.id)
  const facts = await repo.findInvoice(input.id)

  return {
    invoice,
    cancellation: await getInvoice(cancellationId),
    refundableMinor: refundableMinor({
      kind: facts!.kind,
      status: facts!.status,
      totalMinor: Number(facts!.total_minor),
      paidMinor: Number(facts!.paid_minor),
      refundedMinor: Number(facts!.refunded_minor),
      dueDate: facts!.due_date,
      installments: [],
      collectionFailed: false,
    }),
  }
}

/**
 * Cancel and start again: the original is cancelled (if it was not already)
 * and a new draft is copied from it, linked as its replacement. Asking twice
 * returns the same replacement draft rather than a second one.
 */
export const correctInvoice = async (input: {
  id: string
  reason: string
}): Promise<CancelResult & { draft: OwnerInvoice }> => {
  const ids = await withTransaction(async () => {
    const row = await repo.lockInvoice(input.id)

    if (!row) throw missing()

    const cancellationId = await cancelLocked(row, input.reason)
    const existing = await repo.findReplacementOf(row.id)

    if (existing) return { cancellationId, draftId: existing.id }

    const lines = await repo.linesOf(row.id)
    const installments = await repo.installmentsOf(row.id)
    const draftId = await createDraftFrom({
      mode: row.mode,
      columns: {
        client_id: row.client_id,
        currency: row.currency,
        language: row.language,
        title: row.title,
        recipient_name: row.recipient_name,
        recipient_company: row.recipient_company,
        recipient_address: row.recipient_address,
        recipient_country_code: row.recipient_country_code,
        recipient_email: row.recipient_email,
        recipient_vat_id: row.recipient_vat_id,
        service_date_from: row.service_date_from,
        service_date_to: row.service_date_to,
        payment_terms_days: row.payment_terms_days,
        discount_type: row.discount_type,
        discount_value: Number(row.discount_value),
        tax_mode: row.tax_mode,
        reverse_charge: row.reverse_charge,
        allow_bank: row.allow_bank,
        allow_stripe: row.allow_stripe,
        notes: row.notes,
        internal_note: row.internal_note,
        fx: row.fx,
      },
      lines: lines.map((line) => ({
        description: line.description,
        unit: line.unit,
        quantityMilli: Number(line.quantity_milli),
        unitPriceMinor: Number(line.unit_price_minor),
        taxRateBp: line.tax_rate_bp,
        serviceId: line.service_id,
        serviceName: line.service_name,
        servicePriceMinor: line.service_price_minor === null ? null : Number(line.service_price_minor),
      })),
      installments: installments.map((part) => ({
        dueDate: part.due_date,
        amountMinor: Number(part.amount_minor),
        label: part.label,
      })),
      subscriptionId: row.subscription_id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      replacesInvoiceId: row.id,
    })

    await repo.recordEvent({ invoiceId: draftId, kind: 'created', detail: { replaces: row.number } })

    return { cancellationId, draftId }
  })

  await storeBaselineDocument(ids.cancellationId)

  const result = await cancelInvoice({ id: input.id, reason: input.reason })

  return { ...result, draft: await getInvoice(ids.draftId) }
}
