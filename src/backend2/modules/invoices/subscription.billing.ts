import { addDays, formatMoney, periodEnd, periodStart } from '../../contracts/invoice.contract'
import type { RichTextDoc } from '../../contracts/rich-text.contract'
import { getDb, withTransaction } from '../../db/client'
import * as clientRepo from '../clients/client.repo'
import { createDraft, patchDraft } from '../inbox/draft.service'
import { today } from './invoice.clock'
import { assertModeAllowed } from './invoice.config'
import { amountDueMinor } from './invoice.money'
import { formatDate } from './invoice.pdf'
import { recordStripePayment } from './invoice.payments'
import * as repo from './invoice.repo'
import { createDraftFrom, issueLocked, storeBaselineDocument } from './invoice.service'
import { sendInvoice } from './invoice.send'
import { resolveStripeGateway } from './stripe.gateway'
import * as subs from './subscription.repo'
import { RETRY_POLICY, decidePeriod, discountFor, priceFor } from './subscription.schedule'

/**
 * `bun run db2:invoices:run-billing` — the subscription job.
 *
 * Three passes, each safe to run as often as a scheduler likes and safe to
 * run twice at once:
 *
 *   1. **Periods.** Each subscription is locked, and every period that has
 *      started and is not yet decided is decided once (see
 *      `subscription.schedule.ts`). The period row's primary key
 *      (subscription, period start) and the unique index on invoices make a
 *      second invoice for the same period impossible, not merely unlikely.
 *      Manual collection leaves a draft for the owner; automatic card
 *      collection issues it and schedules the charge.
 *   2. **Charges.** Due charges are attempted with an idempotency key per
 *      attempt, so a retried run can never charge twice. A payment is
 *      recorded only when Stripe's verified webhook confirms it.
 *   3. **Notices.** Due reminders become Inbox drafts for the customer, or
 *      entries on the owner's attention list.
 *
 * Nothing here ever cancels a subscription.
 */

export type BillingSummary = {
  subscriptions: number
  periodsDecided: number
  draftsCreated: number
  invoicesIssued: number
  chargesAttempted: number
  chargesFailed: number
  noticesPrepared: number
  errors: Array<{ subscriptionId?: string; chargeId?: string; noticeId?: string; message: string }>
}

/** How many days before its period a manual subscription's draft is prepared. */
export const MANUAL_DRAFT_LEAD_DAYS = 7

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 300)

/* ------------------------------------------------------------------ periods */

export const processSubscription = async (
  subscriptionId: string,
  summary: BillingSummary,
): Promise<void> => {
  const deliver: string[] = []

  await withTransaction(async () => {
    const sub = await subs.lockSubscription(subscriptionId)

    if (!sub) return

    const day = today()
    /*
     * Owner decision (24 Sep 2026): a manual subscription's draft is prepared
     * seven days before its period, so there is time to check and send it.
     * An automatic-card period is still decided on its first day, when it is
     * charged. A draft stays editable, so a pause or price change made in
     * those seven days is applied by editing or deleting it.
     */
    const horizon = sub.collection === 'automatic_card' ? day : addDays(day, MANUAL_DRAFT_LEAD_DAYS)
    const terms = await subs.termsOf(sub.id)
    const pauses = await subs.pausesOf(sub.id)
    const freePeriods = await subs.freePeriodsOf(sub.id)
    const discounts = await subs.discountsOf(sub.id)
    let index = sub.next_period_index

    // Bounded: ten years of monthly periods is the most one run will catch up.
    for (let guard = 0; guard < 120; guard += 1) {
      const start = periodStart(sub.start_date, sub.billing_interval, index)

      if (start > horizon) break
      if (sub.ends_on !== null && start > sub.ends_on) break

      const end = periodEnd(sub.start_date, sub.billing_interval, index)
      const outcome = decidePeriod({ start, endsOn: sub.ends_on, pauses, freePeriods })
      const decided = await subs.insertPeriod({
        subscriptionId: sub.id,
        index,
        start,
        end,
        outcome,
        invoiceId: null,
        amountMinor: 0,
        discountMinor: 0,
      })

      index += 1

      if (!decided) continue

      summary.periodsDecided += 1

      if (outcome !== 'invoiced') continue

      const amount = priceFor(terms, start)
      const discount = discountFor(discounts, start)
      const recipient = sub.recipient as Record<string, string>
      const automatic = sub.collection === 'automatic_card'
      const invoiceId = await createDraftFrom({
        mode: sub.mode,
        columns: {
          client_id: sub.client_id,
          currency: sub.currency,
          language: sub.language,
          title: '',
          recipient_name: recipient.name ?? '',
          recipient_company: recipient.company ?? '',
          recipient_address: recipient.address ?? '',
          recipient_country_code: recipient.country ?? '',
          recipient_email: recipient.email ?? '',
          recipient_vat_id: recipient.vatId ?? '',
          service_date_from: start,
          service_date_to: end,
          // An automatic charge is due on the day it is taken.
          payment_terms_days: automatic ? 0 : sub.payment_terms_days,
          discount_type: discount ? discount.discount_type : 'none',
          discount_value: discount ? Number(discount.value) : 0,
          tax_mode: (await repo.readSettings()).tax_mode,
          reverse_charge: false,
          allow_bank: automatic ? false : sub.allow_bank,
          allow_stripe: automatic ? false : sub.allow_stripe,
          notes: automatic
            ? sub.language === 'de'
              ? 'Der Betrag wird von Ihrer hinterlegten Karte eingezogen.'
              : 'The amount is charged to your saved card.'
            : '',
          internal_note: '',
          fx: sub.fx,
        },
        lines: [
          {
            description: sub.description,
            unit: '',
            quantityMilli: 1000,
            unitPriceMinor: amount,
            taxRateBp: sub.tax_rate_bp,
            serviceId: sub.service?.id ?? null,
            serviceName: sub.service?.name ?? null,
            servicePriceMinor: sub.service?.priceMinor ?? null,
          },
        ],
        subscriptionId: sub.id,
        periodStart: start,
        periodEnd: end,
      })

      if (discount) {
        await subs.countDiscountUse(discount.id)
        discount.applied_count += 1
      }

      const invoice = (await repo.lockInvoice(invoiceId))!

      await repo.recordEvent({ invoiceId, subscriptionId: sub.id, kind: 'created', detail: { periodStart: start } })
      summary.draftsCreated += 1

      if (automatic) {
        await issueLocked(invoice)
        await subs.insertCharge({ subscriptionId: sub.id, invoiceId, attempt: 1, scheduledOn: start })
        summary.invoicesIssued += 1
        deliver.push(invoiceId)
      }

      const issued = (await repo.findInvoice(invoiceId))!

      await subsSetPeriodInvoice(sub.id, start, invoiceId, amount, Number(issued.discount_minor))
    }

    if (index !== sub.next_period_index) {
      await subs.setCursor(sub.id, index)
    }

    if (sub.collection === 'automatic_card' && sub.status !== 'ended') {
      await scheduleFirstChargeNotice(sub, index, pauses, freePeriods)
    }
  })

  // After the commit: store each issued document and send it — the owner
  // chose no monthly review for automatic collection.
  for (const invoiceId of deliver) {
    await storeBaselineDocument(invoiceId)

    try {
      await sendInvoice({ id: invoiceId, autoSend: true })
    } catch (error) {
      await repo.recordEvent({ invoiceId, kind: 'send_failed', detail: { reason: message(error) } }).catch(() => {})
      summary.errors.push({ subscriptionId, message: `Invoice created, but not sent: ${message(error)}` })
    }
  }
}

const subsSetPeriodInvoice = async (
  subscriptionId: string,
  start: string,
  invoiceId: string,
  amount: number,
  discount: number,
): Promise<void> => {
  await getDb().query(
    `UPDATE v2_subscription_periods SET invoice_id = $3, amount_minor = $4, discount_minor = $5
      WHERE subscription_id = $1 AND period_start = $2`,
    [subscriptionId, start, invoiceId, amount, discount],
  )
}

/**
 * Seven days before the first card charge after a free start, the customer
 * is reminded of the amount and date. Only while nothing has been charged.
 */
const scheduleFirstChargeNotice = async (
  sub: subs.SubscriptionRow,
  fromIndex: number,
  pauses: subs.RangeRow[],
  freePeriods: subs.RangeRow[],
): Promise<void> => {
  if (freePeriods.length === 0 || (await subs.countInvoicedPeriods(sub.id)) > 0) return

  for (let index = fromIndex; index < fromIndex + 36; index += 1) {
    const start = periodStart(sub.start_date, sub.billing_interval, index)
    const outcome = decidePeriod({ start, endsOn: sub.ends_on, pauses, freePeriods })

    if (outcome === 'after_end') return
    if (outcome !== 'invoiced') continue

    const noticeDay = addDays(start, -RETRY_POLICY.firstChargeNoticeDays)
    const due = noticeDay < today() ? today() : noticeDay
    const terms = await subs.termsOf(sub.id)

    await subs.scheduleNotice({
      invoiceId: null,
      subscriptionId: sub.id,
      kind: 'first_charge_reminder',
      audience: 'customer',
      dueOn: due,
      message: JSON.stringify({ chargeDate: start, amountMinor: priceFor(terms, start) }),
      dedupeKey: `first-charge:${sub.id}:${start}`,
    })

    return
  }
}

/* ------------------------------------------------------------------ charges */

/**
 * A charge failed — synchronously, or through a verified webhook. The period
 * becomes overdue (never paid), the next retry is scheduled within the two
 * allowed, and the first failure schedules the owner's notice and the
 * customer's three reminders. Nothing ends the subscription.
 */
export const chargeFailed = async (input: {
  chargeId: string
  paymentIntentId: string | null
  message: string
  livemode: boolean
}): Promise<string> =>
  withTransaction(async () => {
    const charge = await subs.lockCharge(input.chargeId)

    if (!charge) return 'ignored'

    const sub = await subs.findSubscription(charge.subscription_id)

    if (!sub || (sub.mode === 'live') !== input.livemode) return 'ignored'
    if (charge.status === 'failed' || charge.status === 'succeeded' || charge.status === 'cancelled') {
      return 'duplicate'
    }

    await subs.setChargeStatus({
      id: charge.id,
      status: 'failed',
      paymentIntentId: input.paymentIntentId,
      message: input.message,
    })
    await repo.setCollectionFailed(charge.invoice_id, true)

    const day = today()
    const attempts = await subs.chargesOfInvoice(charge.invoice_id)
    const firstFailure = charge.attempt === 1 ? day : addDays(attempts[1]?.scheduled_on ?? day, -RETRY_POLICY.retryAfterDays[0])

    if (charge.attempt < 3) {
      await subs.insertCharge({
        subscriptionId: sub.id,
        invoiceId: charge.invoice_id,
        attempt: charge.attempt + 1,
        scheduledOn: addDays(firstFailure, RETRY_POLICY.retryAfterDays[charge.attempt - 1]!),
      })
    }

    if (charge.attempt === 1) {
      await subs.scheduleNotice({
        invoiceId: charge.invoice_id,
        subscriptionId: sub.id,
        kind: 'charge_failed_owner',
        audience: 'owner',
        dueOn: day,
        message: input.message,
        dedupeKey: `charge-failed:${charge.invoice_id}:owner`,
      })

      for (const [position, offset] of RETRY_POLICY.reminderDays.entries()) {
        await subs.scheduleNotice({
          invoiceId: charge.invoice_id,
          subscriptionId: sub.id,
          kind: 'charge_failed_customer_reminder',
          audience: 'customer',
          dueOn: addDays(day, offset),
          message: String(position + 1),
          dedupeKey: `charge-failed:${charge.invoice_id}:customer:${position + 1}`,
        })
      }
    }

    await repo.recordEvent({
      invoiceId: charge.invoice_id,
      subscriptionId: sub.id,
      kind: 'charge_failed',
      detail: { attempt: charge.attempt, reason: input.message },
    })

    return 'charge_failed'
  })

/** A charge Stripe confirmed. The payment is recorded here and nowhere else. */
export const chargeSucceeded = async (input: {
  chargeId: string
  paymentIntentId: string
  amountMinor: number
  currency: string
  eventId: string
  livemode: boolean
}): Promise<string> =>
  withTransaction(async () => {
    const charge = await subs.lockCharge(input.chargeId)

    if (!charge) return 'ignored'

    const outcome = await recordStripePayment({
      invoiceId: charge.invoice_id,
      amountMinor: input.amountMinor,
      currency: input.currency,
      paymentIntentId: input.paymentIntentId,
      eventId: input.eventId,
      livemode: input.livemode,
    })

    if (outcome === 'ignored') return 'ignored'

    await subs.setChargeStatus({ id: charge.id, status: 'succeeded', paymentIntentId: input.paymentIntentId })

    // The remaining retries and reminders are no longer needed.
    for (const other of await subs.chargesOfInvoice(charge.invoice_id)) {
      if (other.id !== charge.id && (other.status === 'scheduled' || other.status === 'waiting_for_card')) {
        await subs.setChargeStatus({ id: other.id, status: 'cancelled' })
      }
    }

    await subs.cancelPendingNotices(charge.invoice_id)

    return outcome === 'duplicate' ? 'duplicate' : 'charge_succeeded'
  })

export const processCharge = async (chargeId: string, summary: BillingSummary): Promise<void> => {
  const prepared = await withTransaction(async () => {
    const charge = await subs.lockCharge(chargeId)

    if (!charge || (charge.status !== 'scheduled' && charge.status !== 'waiting_for_card')) return null

    const invoice = await repo.lockInvoice(charge.invoice_id)
    const sub = await subs.findSubscription(charge.subscription_id)

    if (!invoice || !sub) return null

    const due = amountDueMinor({
      kind: invoice.kind,
      status: invoice.status,
      totalMinor: Number(invoice.total_minor),
      paidMinor: Number(invoice.paid_minor),
      refundedMinor: Number(invoice.refunded_minor),
      dueDate: invoice.due_date,
      installments: [],
      collectionFailed: false,
    })

    if (invoice.status !== 'issued' || due <= 0) {
      await subs.setChargeStatus({ id: charge.id, status: 'cancelled' })

      return null
    }

    if (sub.card_status !== 'valid' || !sub.stripe_customer_id || !sub.stripe_payment_method_id) {
      // No silent switch to bank transfer and no cancellation: wait for a card.
      if (charge.status !== 'waiting_for_card') {
        await subs.setChargeStatus({ id: charge.id, status: 'waiting_for_card' })
        await repo.setCollectionFailed(invoice.id, true)

        for (const audience of ['owner', 'customer'] as const) {
          await subs.scheduleNotice({
            invoiceId: invoice.id,
            subscriptionId: sub.id,
            kind: 'card_missing',
            audience,
            dueOn: today(),
            message: '',
            dedupeKey: `card-missing:${invoice.id}:${audience}`,
          })
        }
      }

      return null
    }

    assertModeAllowed(sub.mode)
    await subs.setChargeStatus({ id: charge.id, status: 'processing', attempted: true })

    return { charge, invoice, sub, due }
  })

  if (!prepared) return

  summary.chargesAttempted += 1

  const { charge, invoice, sub, due } = prepared
  let result: Awaited<ReturnType<ReturnType<typeof resolveStripeGateway>['chargeOffSession']>>

  try {
    result = await resolveStripeGateway(sub.mode).chargeOffSession({
      customerId: sub.stripe_customer_id!,
      paymentMethodId: sub.stripe_payment_method_id!,
      amountMinor: due,
      currency: invoice.currency,
      description: `${invoice.language === 'de' ? 'Rechnung' : 'Invoice'} ${invoice.number}`,
      metadata: { v2_charge_id: charge.id, v2_invoice_id: invoice.id },
      // One key per attempt: a crashed or repeated run can never charge twice.
      idempotencyKey: `v2-charge-${charge.id}`,
    })
  } catch (error) {
    // Stripe unreachable: not a decline. Try again on the next run.
    await withTransaction(() => subs.setChargeStatus({ id: charge.id, status: 'scheduled' }))
    summary.errors.push({ chargeId, message: message(error) })

    return
  }

  if (result.status === 'failed') {
    summary.chargesFailed += 1
    await chargeFailed({
      chargeId: charge.id,
      paymentIntentId: result.paymentIntentId,
      message: result.message,
      livemode: sub.mode === 'live',
    })

    return
  }

  // Succeeded or processing: recorded as paid only when the webhook confirms.
  await withTransaction(() =>
    subs.setChargeStatus({ id: charge.id, status: 'processing', paymentIntentId: result.paymentIntentId }),
  )
}

/* ------------------------------------------------------------------ notices */

const noticeText = (kind: string, language: 'de' | 'en', details: Record<string, string>): { subject: string; lines: string[] } => {
  const de = language === 'de'

  switch (kind) {
    case 'first_charge_reminder':
      return {
        subject: de ? 'Hinweis: bevorstehende Kartenzahlung' : 'Reminder: upcoming card payment',
        lines: [
          de
            ? `am ${details.chargeDate} wird Ihr Abonnement über ${details.amount} von Ihrer gespeicherten Karte abgebucht.`
            : `on ${details.chargeDate} your subscription of ${details.amount} will be charged to your saved card.`,
        ],
      }
    case 'card_missing':
      return {
        subject: de ? 'Bitte hinterlegen Sie eine Karte' : 'Please add a card',
        lines: [
          de
            ? `für die Rechnung ${details.number} liegt keine gültige Karte vor. Bitte hinterlegen Sie eine neue Karte.`
            : `there is no valid card for invoice ${details.number}. Please add a new card.`,
        ],
      }
    default:
      return {
        subject: de ? `Zahlungserinnerung ${details.number}` : `Payment reminder ${details.number}`,
        lines: [
          de
            ? `die Kartenzahlung für die Rechnung ${details.number} ist fehlgeschlagen. Bitte aktualisieren Sie Ihre Karte oder überweisen Sie den offenen Betrag.`
            : `the card payment for invoice ${details.number} failed. Please update your card or pay the open amount.`,
        ],
      }
  }
}

export const processNotice = async (noticeId: string, summary: BillingSummary): Promise<void> => {
  await withTransaction(async () => {
    const notice = await subs.lockNotice(noticeId)

    if (!notice || notice.status !== 'pending') return

    const invoice = notice.invoice_id ? await repo.findInvoice(notice.invoice_id) : null

    if (invoice && notice.kind !== 'first_charge_reminder') {
      const due = amountDueMinor({
        kind: invoice.kind,
        status: invoice.status,
        totalMinor: Number(invoice.total_minor),
        paidMinor: Number(invoice.paid_minor),
        refundedMinor: Number(invoice.refunded_minor),
        dueDate: invoice.due_date,
        installments: [],
        collectionFailed: false,
      })

      if (due <= 0) {
        await subs.setNoticeStatus({ id: notice.id, status: 'cancelled' })

        return
      }
    }

    if (notice.audience === 'owner') {
      // The owner's attention list is the notice itself.
      await subs.setNoticeStatus({ id: notice.id, status: 'prepared' })
      summary.noticesPrepared += 1

      return
    }

    const sub = notice.subscription_id ? await subs.findSubscription(notice.subscription_id) : null
    const clientId = invoice?.client_id ?? sub?.client_id
    const client = clientId ? await clientRepo.findClient(clientId) : null
    const settings = await repo.readSettings()
    const mode = invoice?.mode ?? sub?.mode ?? 'test'
    const language = invoice?.language ?? sub?.language ?? 'de'
    const recipient = (sub?.recipient ?? {}) as Record<string, string>
    const email =
      mode === 'test' && settings.test_recipient_email
        ? settings.test_recipient_email
        : invoice?.recipient_email || recipient.email || client?.email || ''

    if (email === '') {
      await subs.setNoticeStatus({ id: notice.id, status: 'cancelled' })

      return
    }

    const details: Record<string, string> = { number: invoice?.number ?? '' }

    if (notice.kind === 'first_charge_reminder') {
      const parsed = JSON.parse(notice.message || '{}') as { chargeDate?: string; amountMinor?: number }
      details.chargeDate = parsed.chargeDate ? formatDate(parsed.chargeDate, language) : ''
      details.amount = formatMoney(parsed.amountMinor ?? 0, sub?.currency ?? 'EUR', language)
    }

    const text = noticeText(notice.kind, language, details)
    const name = invoice?.recipient_name || recipient.name || client?.name || ''
    const body: RichTextDoc = {
      type: 'doc',
      content: [
        ...(mode === 'test' ? [language === 'de' ? 'TEST – keine echte Zahlungsaufforderung.' : 'TEST – not a real payment request.'] : []),
        language === 'de' ? `Guten Tag ${name},` : `Hello ${name},`,
        ...text.lines,
        language === 'de' ? 'Freundliche Grüße' : 'Kind regards',
      ].map((line) => ({ type: 'paragraph' as const, content: [{ type: 'text' as const, text: line }] })),
    }
    const { draft } = await createDraft({
      conversationId: null,
      toEmail: email,
      subject: `${mode === 'test' ? '[TEST] ' : ''}${text.subject}`,
      language,
    })

    await patchDraft({ id: draft.id, revision: draft.revision, bodyDoc: body })
    await subs.setNoticeStatus({ id: notice.id, status: 'prepared', inboxDraftId: draft.id })
    summary.noticesPrepared += 1
  })
}

/* ---------------------------------------------------------------------- run */

export const runBilling = async (options: { batch?: number } = {}): Promise<BillingSummary> => {
  const batch = options.batch ?? 100
  const summary: BillingSummary = {
    subscriptions: 0,
    periodsDecided: 0,
    draftsCreated: 0,
    invoicesIssued: 0,
    chargesAttempted: 0,
    chargesFailed: 0,
    noticesPrepared: 0,
    errors: [],
  }

  let after: string | null = null

  for (;;) {
    const ids = await subs.subscriptionIdsAfter(after, batch)

    if (ids.length === 0) break

    for (const id of ids) {
      summary.subscriptions += 1

      try {
        await processSubscription(id, summary)
      } catch (error) {
        summary.errors.push({ subscriptionId: id, message: message(error) })
      }
    }

    after = ids.at(-1)!
  }

  for (const id of await subs.dueChargeIds(today(), 500)) {
    try {
      await processCharge(id, summary)
    } catch (error) {
      summary.errors.push({ chargeId: id, message: message(error) })
    }
  }

  for (const id of await subs.dueNoticeIds(today(), 500)) {
    try {
      await processNotice(id, summary)
    } catch (error) {
      summary.errors.push({ noticeId: id, message: message(error) })
    }
  }

  return summary
}
