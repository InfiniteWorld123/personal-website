import type {
  InvoiceMode,
  InvoicePayment,
  OwnerInvoice,
  PaymentInput,
  RefundInput,
} from '../../contracts/invoice.contract'
import { type Page, toPage } from '../../contracts/pagination.contract'
import { withTransaction } from '../../db/client'
import { badRequest, conflict, notFound, paymentTooLarge, refundTooLarge } from '../../http/error'
import { today } from './invoice.clock'
import { toPayment } from './invoice.mapper'
import { amountDueMinor } from './invoice.money'
import * as repo from './invoice.repo'
import { getInvoice } from './invoice.service'

/**
 * Money in and money out.
 *
 * Manual payments (bank, cash, other) are what the owner saw arrive; a card
 * payment is recorded only from a verified Stripe event (`stripe.webhook.ts`)
 * and never from a form. Every write happens under the invoice's row lock and
 * moves the cached `paid_minor` / `refunded_minor` in the same transaction,
 * and every one carries an idempotency key — so a double click, a retried
 * request or a redelivered event records once.
 *
 * Nothing here marks anything paid by assumption: the state is always derived
 * from what was recorded.
 */

const missing = () => notFound('That invoice does not exist')

const factsOf = async (row: repo.InvoiceRow) => ({
  kind: row.kind,
  status: row.status,
  totalMinor: Number(row.total_minor),
  paidMinor: Number(row.paid_minor),
  refundedMinor: Number(row.refunded_minor),
  dueDate: row.due_date,
  installments: [],
  collectionFailed: row.collection_failed_at !== null,
})

export const recordManualPayment = async (input: {
  invoiceId: string
  payment: PaymentInput
}): Promise<{ invoice: OwnerInvoice; payment: InvoicePayment; duplicate: boolean }> => {
  const outcome = await withTransaction(async () => {
    const earlier = await repo.findPaymentByKey(input.payment.idempotencyKey)

    if (earlier) {
      if (earlier.invoice_id !== input.invoiceId) {
        throw conflict('That idempotency key was already used for another invoice')
      }

      return { paymentId: earlier.id, duplicate: true }
    }

    const row = await repo.lockInvoice(input.invoiceId)

    if (!row) throw missing()
    if (row.kind !== 'invoice') throw badRequest('A cancellation document takes no payments')
    if (row.status === 'draft') throw badRequest('Issue the invoice before recording a payment')
    if (row.status === 'cancelled') {
      throw badRequest('This invoice is cancelled. Record money that went back as a refund.')
    }
    if (input.payment.paidOn > today()) throw badRequest('A payment date cannot be in the future')

    const due = amountDueMinor(await factsOf(row))

    if (input.payment.amountMinor > due) {
      throw paymentTooLarge(undefined, { amountDueMinor: due })
    }

    const paymentId = await repo.insertPayment({
      invoiceId: row.id,
      method: input.payment.method,
      amountMinor: input.payment.amountMinor,
      currency: row.currency,
      paidOn: input.payment.paidOn,
      reference: input.payment.reference,
      note: input.payment.note,
      idempotencyKey: input.payment.idempotencyKey,
      stripeEventId: null,
      stripePaymentIntentId: null,
    })

    await repo.setMoney(row.id, { paid: input.payment.amountMinor })
    await repo.recordEvent({
      invoiceId: row.id,
      kind: 'payment_recorded',
      detail: { paymentId, method: input.payment.method, amountMinor: input.payment.amountMinor },
    })

    return { paymentId, duplicate: false }
  })

  return {
    invoice: await getInvoice(input.invoiceId),
    payment: toPayment((await repo.findPayment(outcome.paymentId))!),
    duplicate: outcome.duplicate,
  }
}

/**
 * A manual entry made by mistake. Kept, marked void with the reason, and no
 * longer counted. A card payment cannot be voided — it happened; money that
 * goes back is a refund.
 */
export const voidPayment = async (input: {
  invoiceId: string
  paymentId: string
  reason: string
}): Promise<OwnerInvoice> => {
  await withTransaction(async () => {
    const row = await repo.lockInvoice(input.invoiceId)

    if (!row) throw missing()

    const payment = await repo.findPayment(input.paymentId)

    if (!payment || payment.invoice_id !== row.id) throw notFound('That payment does not exist')
    if (payment.method === 'stripe') {
      throw badRequest('A card payment confirmed by Stripe cannot be voided. Record a refund instead.')
    }
    if (payment.voided_at) return

    if (Number(row.paid_minor) - Number(payment.amount_minor) < Number(row.refunded_minor)) {
      throw badRequest('Refunds already recorded depend on this payment. It cannot be voided.')
    }

    await repo.voidPaymentRow(payment.id, input.reason)
    await repo.setMoney(row.id, { paid: -Number(payment.amount_minor) })
    await repo.recordEvent({ invoiceId: row.id, kind: 'payment_voided', detail: { paymentId: payment.id } })
  })

  return getInvoice(input.invoiceId)
}

/**
 * Money that went back, as the owner reports it: the amount, the day and how.
 * Cancelling an invoice never records one by itself. A refund can never be
 * more than was kept.
 */
export const recordRefund = async (input: {
  invoiceId: string
  refund: RefundInput
}): Promise<{ invoice: OwnerInvoice; duplicate: boolean }> => {
  const duplicate = await withTransaction(async () => {
    const earlier = await repo.findRefundByKey(input.refund.idempotencyKey)

    if (earlier) {
      if (earlier.invoice_id !== input.invoiceId) {
        throw conflict('That idempotency key was already used for another invoice')
      }

      return true
    }

    const row = await repo.lockInvoice(input.invoiceId)

    if (!row) throw missing()
    if (row.kind !== 'invoice' || row.status === 'draft') {
      throw badRequest('Only an issued invoice that received money can have a refund')
    }
    if (input.refund.refundedOn > today()) throw badRequest('A refund date cannot be in the future')

    const kept = Number(row.paid_minor) - Number(row.refunded_minor)

    if (input.refund.amountMinor > kept) throw refundTooLarge(undefined, { refundableMinor: Math.max(0, kept) })

    await repo.insertRefund({
      invoiceId: row.id,
      method: input.refund.method,
      amountMinor: input.refund.amountMinor,
      currency: row.currency,
      refundedOn: input.refund.refundedOn,
      note: input.refund.note,
      idempotencyKey: input.refund.idempotencyKey,
    })
    await repo.setMoney(row.id, { refunded: input.refund.amountMinor })
    await repo.recordEvent({
      invoiceId: row.id,
      kind: 'refund_recorded',
      detail: { method: input.refund.method, amountMinor: input.refund.amountMinor },
    })

    return false
  })

  return { invoice: await getInvoice(input.invoiceId), duplicate }
}

/**
 * A card payment Stripe confirmed. Called only by the verified webhook,
 * inside its transaction. Idempotent by PaymentIntent: the same payment
 * arriving through two events is recorded once.
 *
 * Money that really arrived is always recorded — even beyond the total, or
 * on an invoice cancelled meanwhile — because refusing it would hide it; the
 * surplus then shows as refundable.
 */
export const recordStripePayment = async (input: {
  invoiceId: string
  amountMinor: number
  currency: string
  paymentIntentId: string
  eventId: string
  livemode: boolean
}): Promise<'recorded' | 'duplicate' | 'ignored'> => {
  if (await repo.findPaymentByIntent(input.paymentIntentId)) return 'duplicate'

  const row = await repo.lockInvoice(input.invoiceId)

  if (!row || row.kind !== 'invoice' || row.status === 'draft') return 'ignored'
  if ((row.mode === 'live') !== input.livemode) return 'ignored'

  if (row.currency !== input.currency.toUpperCase() || input.amountMinor <= 0) {
    // Money that cannot be matched is not silently dropped: it is on the
    // invoice's history for the owner to reconcile by hand.
    await repo.recordEvent({
      invoiceId: row.id,
      kind: 'stripe_payment_unmatched',
      detail: { paymentIntentId: input.paymentIntentId, amountMinor: input.amountMinor, currency: input.currency },
    })

    return 'ignored'
  }

  const paymentId = await repo.insertPayment({
    invoiceId: row.id,
    method: 'stripe',
    amountMinor: input.amountMinor,
    currency: row.currency,
    paidOn: today(),
    reference: input.paymentIntentId,
    note: '',
    idempotencyKey: null,
    stripeEventId: input.eventId,
    stripePaymentIntentId: input.paymentIntentId,
  })

  await repo.setMoney(row.id, { paid: input.amountMinor })
  await repo.setCollectionFailed(row.id, false)
  await repo.recordEvent({
    invoiceId: row.id,
    kind: 'payment_recorded',
    detail: { paymentId, method: 'stripe', amountMinor: input.amountMinor },
  })

  return 'recorded'
}

export const listPayments = async (input: {
  mode: InvoiceMode
  page: number
  pageSize: number
}): Promise<Page<InvoicePayment & { invoiceNumber: string | null }>> => {
  const { rows, total } = await repo.listPayments({
    mode: input.mode,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  })

  return toPage({
    items: rows.map((row) => ({ ...toPayment(row), invoiceNumber: row.invoice_number ?? null })),
    page: input.page,
    pageSize: input.pageSize,
    total,
  })
}
