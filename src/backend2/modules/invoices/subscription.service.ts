import * as v from 'valibot'
import {
  type CreateSubscriptionInput,
  type FreePeriodSchema,
  type InvoiceNotice,
  type OwnerSubscription,
  type PriceChangeSchema,
  type SubscriptionDiscountSchema,
  type SubscriptionListQuery,
  type SubscriptionPatchSchema,
  type SubscriptionPeriod,
  addDays,
  firstPeriodOnOrAfter,
  periodEnd,
  periodStart,
} from '../../contracts/invoice.contract'
import { type Page, toPage } from '../../contracts/pagination.contract'
import { withTransaction } from '../../db/client'
import { badRequest, clientInTrash, conflict, notFound, subscriptionLocked } from '../../http/error'
import * as clientRepo from '../clients/client.repo'
import { today } from './invoice.clock'
import { findRate } from './invoice.fx'
import * as repo from './invoice.repo'
import { serviceSnapshot } from './invoice.service'
import { resolveStripeGateway, returnUrls } from './stripe.gateway'
import * as subs from './subscription.repo'
import { priceFor } from './subscription.schedule'

/**
 * Subscriptions: the owner's agreed terms, and every change to them dated
 * into the future.
 *
 * Only the owner creates one, after agreeing terms with the customer. Every
 * change — pause, resume, end, a new price, a discount, a free range — takes
 * a date on or after today (Berlin) and can therefore reach only periods the
 * billing job has not decided yet. Invoices already made keep their terms.
 * Nothing here cancels a subscription on its own, and a Services catalogue
 * edit never reaches one: the Service is copied once, at creation.
 */

const missing = () => notFound('That subscription does not exist')

type Row = subs.SubscriptionRow

/** The first day of the next billing period after today. "From next period." */
const nextPeriodAfterToday = (sub: Pick<Row, 'start_date' | 'billing_interval'>): string =>
  periodStart(
    sub.start_date,
    sub.billing_interval,
    firstPeriodOnOrAfter(sub.start_date, sub.billing_interval, addDays(today(), 1)),
  )

const assertFuture = (date: string, what: string): void => {
  if (date < today()) throw subscriptionLocked(`${what} cannot be in the past — past periods are not rewritten`)
}

const toSubscription = async (row: Row): Promise<OwnerSubscription> => {
  const terms = await subs.termsOf(row.id)
  const discounts = await subs.discountsOf(row.id)
  const free = await subs.freePeriodsOf(row.id)
  const pauses = await subs.pausesOf(row.id)
  const nextStart = periodStart(row.start_date, row.billing_interval, row.next_period_index)
  const next = row.ends_on !== null && nextStart > row.ends_on ? null : nextStart
  const iso = (value: Date | null) => (value ? new Date(value).toISOString() : null)
  const recipient = row.recipient ?? {}

  return {
    id: row.id,
    mode: row.mode,
    client: { id: row.client_id, displayName: row.client_name ?? '' },
    status: row.status,
    collection: row.collection,
    interval: row.billing_interval,
    startDate: row.start_date,
    endsOn: row.ends_on,
    pausedFrom: row.paused_from,
    currency: row.currency,
    language: row.language,
    description: row.description,
    taxRateBp: row.tax_rate_bp,
    service: row.service,
    fx: (row.fx as OwnerSubscription['fx']) ?? null,
    recipient: {
      name: recipient.name ?? '',
      company: recipient.company ?? '',
      address: recipient.address ?? '',
      country: recipient.country ?? '',
      email: recipient.email ?? '',
      vatId: recipient.vatId ?? '',
    },
    paymentTermsDays: row.payment_terms_days,
    allowBank: row.allow_bank,
    allowStripe: row.allow_stripe,
    currentAmountMinor: priceFor(terms, next ?? today()),
    terms: terms.map((term) => ({
      effectiveFrom: term.effective_from,
      amountMinor: Number(term.amount_minor),
      note: term.note,
    })),
    discounts: discounts.map((discount) => ({
      id: discount.id,
      discountType: discount.discount_type,
      value: Number(discount.value),
      startsOn: discount.starts_on,
      periods: discount.periods,
      appliedCount: discount.applied_count,
      endedAt: iso(discount.ended_at),
      note: discount.note,
    })),
    freePeriods: free.map((range) => ({
      id: range.id,
      startsOn: range.starts_on,
      endsOn: range.ends_on,
      note: range.note ?? '',
    })),
    pauses: pauses.map((pause) => ({ startsOn: pause.starts_on, endsOn: pause.ends_on })),
    nextPeriodStart: row.status === 'ended' && next === null ? null : next,
    card: { status: row.card_status, label: row.card_label, consentAt: iso(row.card_consent_at) },
    revision: row.revision,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  }
}

export const getSubscription = async (id: string): Promise<OwnerSubscription> => {
  const row = await subs.findSubscription(id)

  if (!row) throw missing()

  return toSubscription(row)
}

export const listSubscriptions = async (query: SubscriptionListQuery): Promise<Page<OwnerSubscription>> => {
  const { rows, total } = await subs.listSubscriptions(query)
  const items: OwnerSubscription[] = []

  for (const row of rows) items.push(await toSubscription(row))

  return toPage({ items, page: query.page, pageSize: query.pageSize, total })
}

const fxOf = async (fx: { rateId: string } | null | undefined) => {
  if (!fx) return null

  const rate = await findRate(fx.rateId)

  if (!rate) throw badRequest('That exchange rate is not on file')

  return { rateId: rate.id, rate: rate.rate, rateDate: rate.rateDate, source: rate.source }
}

export const createSubscription = async (input: CreateSubscriptionInput): Promise<OwnerSubscription> => {
  const id = await withTransaction(async () => {
    const client = await clientRepo.findClient(input.clientId)

    if (!client) throw notFound('That client does not exist')
    if (client.trashed_at) throw clientInTrash('That client is in Trash. Restore it first.')
    if (input.startDate < today()) throw badRequest('The first collection date cannot be in the past')

    const previous = await repo.lastRecipientFor(client.id)
    const recipient = input.recipient ?? {
      name: previous?.recipient_name ?? client.name,
      company: previous?.recipient_company ?? client.company_name,
      address: previous?.recipient_address ?? '',
      country: previous?.recipient_country_code ?? client.country_code,
      email: previous?.recipient_email ?? client.email,
      vatId: previous?.recipient_vat_id ?? '',
    }
    const service = input.serviceId ? await serviceSnapshot(input.serviceId, input.language) : null
    const fx = await fxOf(input.fx)
    const subscriptionId = await subs.insertSubscription({
      mode: input.mode,
      clientId: client.id,
      collection: input.collection,
      interval: input.interval,
      startDate: input.startDate,
      currency: input.currency,
      language: input.language,
      description: input.description,
      taxRateBp: input.taxRateBp,
      service,
      fx,
      recipient,
      paymentTermsDays: input.paymentTermsDays,
      allowBank: input.allowBank,
      allowStripe: input.allowStripe,
    })

    await subs.upsertTerms({
      subscriptionId,
      effectiveFrom: input.startDate,
      amountMinor: input.amountMinor,
      note: 'Agreed at creation',
      fx,
    })

    if (input.freePeriods === null) {
      await subs.insertFreePeriod({ subscriptionId, startsOn: input.startDate, endsOn: null, note: 'Free' })
    } else if (input.freePeriods > 0) {
      await subs.insertFreePeriod({
        subscriptionId,
        startsOn: input.startDate,
        endsOn: periodEnd(input.startDate, input.interval, input.freePeriods - 1),
        note: `First ${input.freePeriods} period${input.freePeriods === 1 ? '' : 's'} free`,
      })
    }

    await repo.recordEvent({ subscriptionId, kind: 'created', detail: { amountMinor: input.amountMinor } })

    return subscriptionId
  })

  return getSubscription(id)
}

/** Runs `fn` with the subscription locked and not ended. */
const change = async (
  id: string,
  fn: (row: Row) => Promise<void>,
  options: { allowEnded?: boolean; revision?: number } = {},
): Promise<OwnerSubscription> => {
  await withTransaction(async () => {
    const row = await subs.lockSubscription(id)

    if (!row) throw missing()
    if (row.status === 'ended' && !options.allowEnded) throw subscriptionLocked('This subscription has ended')
    if (options.revision !== undefined && row.revision !== options.revision) {
      throw conflict('This subscription was changed somewhere else. Reload to see the newer version.')
    }

    await fn(row)
  })

  return getSubscription(id)
}

export const patchSubscription = async (
  id: string,
  input: v.InferOutput<typeof SubscriptionPatchSchema>,
): Promise<OwnerSubscription> =>
  change(
    id,
    async (row) => {
      const fields: Record<string, unknown> = {}

      if (input.description !== undefined) fields.description = input.description
      if (input.language !== undefined) fields.language = input.language
      if (input.recipient !== undefined) fields.recipient = input.recipient
      if (input.paymentTermsDays !== undefined) fields.payment_terms_days = input.paymentTermsDays
      if (input.allowBank !== undefined) fields.allow_bank = input.allowBank
      if (input.allowStripe !== undefined) fields.allow_stripe = input.allowStripe
      if (input.taxRateBp !== undefined) fields.tax_rate_bp = input.taxRateBp

      await subs.updateSubscription(row.id, fields)
    },
    { revision: input.revision },
  )

export const pauseSubscription = async (id: string, date: string | null): Promise<OwnerSubscription> =>
  change(id, async (row) => {
    if (row.status !== 'active') throw subscriptionLocked('Only an active subscription can be paused')

    const from = date ?? today()

    assertFuture(from, 'A pause')
    await subs.openPause(row.id, from)
    await subs.updateSubscription(row.id, { status: 'paused', paused_from: from })
    await repo.recordEvent({ subscriptionId: row.id, kind: 'paused', detail: { from } })
  })

export const resumeSubscription = async (id: string, date: string | null): Promise<OwnerSubscription> =>
  change(id, async (row) => {
    if (row.status !== 'paused') throw subscriptionLocked('Only a paused subscription can be resumed')

    const from = date ?? today()

    assertFuture(from, 'Resuming')
    if (from < row.paused_from!) throw badRequest('Resume on or after the day the pause began')

    await subs.closePause(row.id, from)
    await subs.updateSubscription(row.id, { status: 'active', paused_from: null })
    await repo.recordEvent({ subscriptionId: row.id, kind: 'resumed', detail: { from } })
  })

/**
 * Ends the subscription after `date` (its last day of service). By default
 * the current period runs out and the next one is not billed. Never
 * automatic: only the owner ends a subscription.
 */
export const endSubscription = async (id: string, date: string | null): Promise<OwnerSubscription> =>
  change(id, async (row) => {
    const endsOn = date ?? addDays(nextPeriodAfterToday(row), -1)

    assertFuture(endsOn, 'The end date')

    if (row.status === 'paused') await subs.closePause(row.id, endsOn < row.paused_from! ? row.paused_from! : endsOn)

    await subs.updateSubscription(row.id, { status: 'ended', ends_on: endsOn, ended_at: new Date(), paused_from: null })
    await repo.recordEvent({ subscriptionId: row.id, kind: 'ended', detail: { endsOn } })
  })

/** A new agreed price, from the next billing period unless a later one is named. */
export const changePrice = async (
  id: string,
  input: v.InferOutput<typeof PriceChangeSchema>,
): Promise<OwnerSubscription> =>
  change(id, async (row) => {
    const effectiveFrom = input.effectiveFrom ?? nextPeriodAfterToday(row)

    assertFuture(effectiveFrom, 'A price change')

    const index = firstPeriodOnOrAfter(row.start_date, row.billing_interval, effectiveFrom)

    if (periodStart(row.start_date, row.billing_interval, index) !== effectiveFrom) {
      throw badRequest('A price change starts on the first day of a billing period')
    }

    await subs.upsertTerms({
      subscriptionId: row.id,
      effectiveFrom,
      amountMinor: input.amountMinor,
      note: input.note,
      fx: await fxOf(input.fx),
    })
    await repo.recordEvent({
      subscriptionId: row.id,
      kind: 'price_changed',
      detail: { effectiveFrom, amountMinor: input.amountMinor },
    })
  })

export const addDiscount = async (
  id: string,
  input: v.InferOutput<typeof SubscriptionDiscountSchema>,
): Promise<OwnerSubscription> =>
  change(id, async (row) => {
    if (input.discountType === 'percent' && input.value > 10_000) {
      throw badRequest('A percentage discount cannot exceed 100 %')
    }

    const startsOn = input.startsOn ?? nextPeriodAfterToday(row)

    assertFuture(startsOn, 'A discount')
    await subs.insertDiscount({
      subscriptionId: row.id,
      discountType: input.discountType,
      value: input.value,
      startsOn,
      periods: input.periods,
      note: input.note,
    })
    await repo.recordEvent({ subscriptionId: row.id, kind: 'discount_added', detail: { ...input, startsOn } })
  })

export const endDiscount = async (id: string, discountId: string): Promise<OwnerSubscription> =>
  change(id, async (row) => {
    if (!(await subs.endDiscount(row.id, discountId))) throw notFound('That discount does not exist')

    await repo.recordEvent({ subscriptionId: row.id, kind: 'discount_ended', detail: { discountId } })
  })

export const addFreePeriod = async (
  id: string,
  input: v.InferOutput<typeof FreePeriodSchema>,
): Promise<OwnerSubscription> =>
  change(id, async (row) => {
    const startsOn = input.startsOn ?? nextPeriodAfterToday(row)

    assertFuture(startsOn, 'A free period')
    if (input.endsOn !== null && input.endsOn < startsOn) throw badRequest('A free period cannot end before it starts')

    await subs.insertFreePeriod({ subscriptionId: row.id, startsOn, endsOn: input.endsOn, note: input.note })
    await repo.recordEvent({ subscriptionId: row.id, kind: 'free_period_added', detail: { startsOn, endsOn: input.endsOn } })
  })

/**
 * The link the owner sends the customer to save a card, with their explicit
 * consent, on Stripe's own page. Card details never touch this server.
 */
export const startCardSetup = async (id: string): Promise<{ url: string; subscription: OwnerSubscription }> => {
  const row = await subs.findSubscription(id)

  if (!row) throw missing()
  if (row.collection !== 'automatic_card') throw badRequest('Only automatic card collection needs a saved card')
  if (row.status === 'ended') throw subscriptionLocked('This subscription has ended')

  const gateway = resolveStripeGateway(row.mode)
  const client = await clientRepo.findClient(row.client_id)
  const recipient = row.recipient ?? {}
  let customerId = row.stripe_customer_id

  if (!customerId) {
    customerId = (
      await gateway.createCustomer({
        email: recipient.email || client?.email || '',
        name: recipient.company || recipient.name || client?.name || '',
        subscriptionId: row.id,
        idempotencyKey: `v2-sub-customer-${row.id}`,
      })
    ).id
  }

  const { successUrl, cancelUrl } = returnUrls('setup')
  const session = await gateway.createSetupCheckout({
    customerId,
    subscriptionId: row.id,
    currency: row.currency,
    successUrl,
    cancelUrl,
    idempotencyKey: `v2-sub-setup-${row.id}-${row.revision}-${today()}`,
  })

  await withTransaction(async () => {
    await subs.updateSubscription(row.id, {
      stripe_customer_id: customerId,
      card_status: row.card_status === 'valid' ? 'valid' : 'pending',
    })
    await repo.recordEvent({ subscriptionId: row.id, kind: 'card_setup_started' })
  })

  return { url: session.url, subscription: await getSubscription(id) }
}

export const listPeriods = async (input: {
  subscriptionId: string
  page: number
  pageSize: number
}): Promise<Page<SubscriptionPeriod>> => {
  if (!(await subs.findSubscription(input.subscriptionId))) throw missing()

  const { rows, total } = await subs.periodsOf({
    subscriptionId: input.subscriptionId,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  })

  return toPage({
    items: rows.map((row) => ({
      index: row.period_index,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      outcome: row.outcome,
      invoiceId: row.invoice_id,
      amountMinor: Number(row.amount_minor),
      discountMinor: Number(row.discount_minor),
      createdAt: new Date(row.created_at).toISOString(),
    })),
    page: input.page,
    pageSize: input.pageSize,
    total,
  })
}

export const listNotices = async (input: {
  status: 'pending' | 'prepared' | 'cancelled' | 'all'
  page: number
  pageSize: number
}): Promise<Page<InvoiceNotice>> => {
  const { rows, total } = await subs.listNotices({
    status: input.status,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  })

  return toPage({
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      audience: row.audience,
      dueOn: row.due_on,
      status: row.status,
      invoiceId: row.invoice_id,
      subscriptionId: row.subscription_id,
      inboxDraftId: row.inbox_draft_id,
      message: row.message,
      createdAt: new Date(row.created_at).toISOString(),
    })),
    page: input.page,
    pageSize: input.pageSize,
    total,
  })
}
