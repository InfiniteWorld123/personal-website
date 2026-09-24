import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryStore, createTestDatabase } from './helpers/backend2-db'

/**
 * Subscriptions, the billing job and Stripe, end to end, against a real
 * PostgreSQL running inside this process.
 *
 * `docs/v2/invoices.md`. Under test: periods on the anchor day (29/30/31
 * falling back to a month's last day), exactly one invoice per period however
 * often — or however concurrently — the job runs, price and discount changes
 * from the next period only, discounts that count invoiced periods, free
 * periods without a zero invoice, pause/resume/end reaching only the future,
 * automatic card collection (saved card, charge, confirmation only by a
 * verified webhook, failure → overdue, two retries, three reminders, never a
 * cancellation), a missing card, duplicate and forged webhook deliveries, and
 * the live switch.
 *
 * Stripe is an in-memory fake here; no request leaves the process. Every
 * person and company is fictional.
 */
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
process.env.INBOX_REPLY_ADDRESS = 'reply@example.test'
process.env.INBOX_FROM_ADDRESS = 'owner@example.test'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_only_secret'
delete process.env.BACKEND2_OWNER_AUTH
delete process.env.INBOX_SEND_MODE
delete process.env.INVOICES_LIVE_ENABLED
delete process.env.STRIPE_SECRET_KEY

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { useMediaStoreForTest } = await import('#/backend2/media/store')
const { useInboxTransportForTest } = await import('#/backend2/modules/inbox/inbox.transport')
const { useInvoiceClockForTest } = await import('#/backend2/modules/invoices/invoice.clock')
const gatewayModule = await import('#/backend2/modules/invoices/stripe.gateway')
const { signStripePayload, verifyStripeSignature } = await import('#/backend2/modules/invoices/stripe.webhook')
const { runBilling } = await import('#/backend2/modules/invoices/subscription.billing')
const schedule = await import('#/backend2/modules/invoices/subscription.schedule')
const analytics = await import('#/backend2/modules/invoices/invoice.analytics')

const { useStripeGatewayForTest, createFakeStripeGateway, resolveStripeGateway, keyMode, formEncode } = gatewayModule

type Json = Record<string, any>
type Db = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> }

const database = await createTestDatabase()
const app = createAppForTest()
let stripe = createFakeStripeGateway('test')
const sentEmails: Array<{ to: string; subject: string; attachments: number }> = []

beforeEach(async () => {
  await database.reset()
  useMediaStoreForTest(createMemoryStore().store)
  stripe = createFakeStripeGateway('test')
  useStripeGatewayForTest(stripe.gateway)
  useInvoiceClockForTest('2026-01-10T10:00:00Z')
  sentEmails.length = 0
  useInboxTransportForTest({
    mode: 'fake',
    send: async (email) => {
      sentEmails.push({ to: email.to, subject: email.subject, attachments: email.attachments.length })

      return { ok: true, provider: 'fake', providerMessageId: `fake-${sentEmails.length}` }
    },
  })
})

afterEach(() => {
  delete process.env.INVOICES_LIVE_ENABLED
})

afterAll(async () => {
  useMediaStoreForTest(undefined)
  useInboxTransportForTest(undefined)
  useStripeGatewayForTest(undefined)
  useInvoiceClockForTest(undefined)
  await database.close()
})

/* ---------------------------------------------------------------- plumbing */

const call = async (
  method: string,
  path: string,
  body?: unknown,
  options: { headers?: Record<string, string>; raw?: string } = {},
): Promise<{ status: number; body: Json }> => {
  const request = new Request(`http://localhost:3000/api/v2${path}`, {
    method,
    headers: {
      ...(body === undefined && options.raw === undefined
        ? {}
        : { 'content-type': 'application/json', origin: 'http://localhost:3000' }),
      ...options.headers,
    },
    body: options.raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  })
  const response = await runWithDb(database.db, async () => app.fetch(request))
  const text = await response.text()

  return { status: response.status, body: text ? (JSON.parse(text) as Json) : {} }
}

const ok = async (method: string, path: string, body?: unknown, status = 200): Promise<Json> => {
  const result = await call(method, path, body)

  expect(result.status, `${method} ${path}: ${JSON.stringify(result.body)}`).toBe(status)

  return result.body.data
}

const count = async (table: string, where = ''): Promise<number> => {
  const { rows } = await database.db.query(`SELECT count(*) AS total FROM ${table} ${where}`)

  return Number(rows[0].total)
}

const at = (date: string) => useInvoiceClockForTest(`${date}T10:00:00Z`)
const bill = () => runWithDb(database.db, () => runBilling())

let sequence = 0

const createClient = async (): Promise<Json> => {
  sequence += 1

  return ok(
    'POST',
    '/owner/clients',
    {
      kind: 'company',
      name: `Timo Probe ${sequence}`,
      email: `timo${sequence}@example.org`,
      country: 'DE',
      companyName: `Probe Werkstatt ${sequence}`,
    },
    201,
  )
}

const RECIPIENT = {
  name: 'Timo Probe',
  company: 'Probe Werkstatt',
  address: 'Werkstattweg 3\n50667 Köln',
  country: 'DE',
  email: 'billing@example.org',
  vatId: '',
}

const createSubscription = async (over: Json = {}): Promise<Json> =>
  ok(
    'POST',
    '/owner/invoices/subscriptions',
    {
      mode: 'test',
      clientId: (await createClient()).id,
      collection: 'manual',
      interval: 'monthly',
      startDate: '2026-01-31',
      currency: 'EUR',
      description: 'Website care',
      amountMinor: 4_900,
      recipient: RECIPIENT,
      ...over,
    },
    201,
  )

const invoicesOf = async (subscriptionId: string): Promise<Json[]> => {
  const { rows } = await database.db.query(
    `SELECT id, status, number, period_start::text AS period_start, total_minor, discount_minor
       FROM v2_invoices WHERE subscription_id = $1 ORDER BY period_start`,
    [subscriptionId],
  )

  return rows
}

const periodsOf = async (subscriptionId: string): Promise<Array<[string, string]>> => {
  const { rows } = await database.db.query(
    `SELECT period_start::text AS start, outcome FROM v2_subscription_periods
      WHERE subscription_id = $1 ORDER BY period_start`,
    [subscriptionId],
  )

  return rows.map((row: Json) => [row.start, row.outcome])
}

const serialized = (db: Db): Db => {
  let chain: Promise<void> = Promise.resolve()
  let release: (() => void) | null = null

  return {
    query: async (text, values) => {
      if (/^\s*BEGIN/iu.test(text)) {
        const previous = chain
        let unlock!: () => void

        chain = new Promise<void>((resolve) => {
          unlock = resolve
        })
        await previous
        release = unlock
      }

      try {
        return await db.query(text, values)
      } finally {
        if (/^\s*(COMMIT|ROLLBACK)/iu.test(text)) {
          const done = release

          release = null
          done?.()
        }
      }
    },
  }
}

const webhook = async (event: Json, options: { secret?: string; timestamp?: number } = {}) => {
  const payload = JSON.stringify(event)
  const signature = await signStripePayload({
    secret: options.secret ?? 'whsec_test_only_secret',
    payload,
    timestamp: options.timestamp ?? Math.floor(Date.now() / 1000),
  })

  return call('POST', '/stripe/webhook', undefined, { raw: payload, headers: { 'stripe-signature': signature } })
}

let eventCounter = 0
const eventId = () => `evt_test_${(eventCounter += 1)}`

/** Save a card for an automatic subscription, the way Stripe reports it. */
const saveCard = async (subscription: Json): Promise<void> => {
  await ok('POST', `/owner/invoices/subscriptions/${subscription.id}/card-setup`)

  const saved = await webhook({
    id: eventId(),
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: { mode: 'setup', setup_intent: 'seti_1', metadata: { v2_subscription_id: subscription.id } },
    },
  })

  expect(saved.body.data.outcome).toBe('card_saved')
}

/* ============================================================ pure rules */

describe('the period rules, without a database', () => {
  it('decides a period: after the end, paused, free, or invoiced — in that order', () => {
    const base = { endsOn: null, pauses: [], freePeriods: [] }

    expect(schedule.decidePeriod({ ...base, start: '2026-03-01' })).toBe('invoiced')
    expect(schedule.decidePeriod({ ...base, start: '2026-03-01', endsOn: '2026-02-28' })).toBe('after_end')
    expect(
      schedule.decidePeriod({ ...base, start: '2026-03-01', pauses: [{ starts_on: '2026-02-15', ends_on: '2026-03-01' }] }),
    ).toBe('invoiced') // the resume day is billed again
    expect(
      schedule.decidePeriod({ ...base, start: '2026-03-01', pauses: [{ starts_on: '2026-02-15', ends_on: null }] }),
    ).toBe('paused')
    expect(
      schedule.decidePeriod({ ...base, start: '2026-03-01', freePeriods: [{ starts_on: '2026-01-01', ends_on: '2026-03-01' }] }),
    ).toBe('free') // a free range's end day is still free
  })

  it('picks the price in effect on the first day, and a discount with periods left', () => {
    const terms = [
      { effective_from: '2026-01-31', amount_minor: 4_900 },
      { effective_from: '2026-04-30', amount_minor: 5_900 },
    ]

    expect(schedule.priceFor(terms, '2026-03-31')).toBe(4_900)
    expect(schedule.priceFor(terms, '2026-04-30')).toBe(5_900)

    const discounts = [
      { id: 'a', discount_type: 'percent' as const, value: 1000, starts_on: '2026-02-01', periods: 2, applied_count: 2, ended_at: null },
      { id: 'b', discount_type: 'fixed' as const, value: 500, starts_on: '2026-02-01', periods: null, applied_count: 9, ended_at: null },
    ]

    expect(schedule.discountFor(discounts, '2026-03-01')?.id).toBe('b')
    expect(schedule.discountFor(discounts, '2026-01-15')).toBeNull()
  })
})

/* ============================================================ manual */

describe('manual subscriptions and the billing job', () => {
  it('prepares one draft per period, on the anchor day or the month’s last day', async () => {
    const subscription = await createSubscription()

    at('2026-01-31')
    await bill()
    at('2026-02-28')
    await bill()
    at('2026-03-31')
    await bill()

    const invoices = await invoicesOf(subscription.id)

    expect(invoices.map((i) => [i.period_start, i.status])).toEqual([
      ['2026-01-31', 'draft'],
      ['2026-02-28', 'draft'],
      ['2026-03-31', 'draft'],
    ])

    const first = await ok('GET', `/owner/invoices/${invoices[0].id}`)

    expect(first).toMatchObject({ periodStart: '2026-01-31', periodEnd: '2026-02-27', totalMinor: 4_900 })
    expect(first.lines[0].description).toBe('Website care')
    // Never sent, never issued, until the owner does it.
    expect(sentEmails).toHaveLength(0)

    // The job is idempotent: running it again changes nothing.
    await bill()
    await bill()
    expect(await invoicesOf(subscription.id)).toHaveLength(3)
  })

  it('prepares a manual draft seven days ahead, and an automatic period only on its day', async () => {
    const manual = await createSubscription({ startDate: '2026-02-10' })
    const automatic = await createSubscription({ startDate: '2026-02-10', collection: 'automatic_card' })

    at('2026-02-02')
    await bill()
    expect(await invoicesOf(manual.id)).toHaveLength(0)

    at('2026-02-03')
    await bill()
    expect((await invoicesOf(manual.id)).map((i) => i.period_start)).toEqual(['2026-02-10'])
    expect(await invoicesOf(automatic.id)).toHaveLength(0)
  })

  it('catches up missed periods without doubling any, even when two runs overlap', async () => {
    const subscription = await createSubscription({ startDate: '2026-01-15' })

    at('2026-04-20')

    const db = serialized(database.db)

    await Promise.all([
      runWithDb(db, () => runBilling()),
      runWithDb(db, () => runBilling()),
      runWithDb(db, () => runBilling()),
    ])

    expect((await invoicesOf(subscription.id)).map((i) => i.period_start)).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
    ])
    expect(await count('v2_subscription_periods')).toBe(4)
  })

  it('changes the price from the next period only, and refuses a date in the past', async () => {
    const subscription = await createSubscription({ startDate: '2026-01-10' })

    await bill()

    const changed = await ok('POST', `/owner/invoices/subscriptions/${subscription.id}/price`, {
      amountMinor: 5_900,
      note: 'Agreed by email on 9 Jan',
    })

    expect(changed.terms.map((t: Json) => [t.effectiveFrom, t.amountMinor])).toEqual([
      ['2026-01-10', 4_900],
      ['2026-02-10', 5_900],
    ])

    const past = await call('POST', `/owner/invoices/subscriptions/${subscription.id}/price`, {
      amountMinor: 1,
      effectiveFrom: '2026-01-01',
      note: '',
    })

    expect(past.body.code).toBe('SUBSCRIPTION_LOCKED')

    const notAPeriodStart = await call('POST', `/owner/invoices/subscriptions/${subscription.id}/price`, {
      amountMinor: 1,
      effectiveFrom: '2026-02-11',
      note: '',
    })

    expect(notAPeriodStart.status).toBe(400)

    at('2026-02-10')
    await bill()

    expect((await invoicesOf(subscription.id)).map((i) => Number(i.total_minor))).toEqual([4_900, 5_900])
  })

  it('applies a discount to a number of invoiced periods, skipping free ones', async () => {
    const subscription = await createSubscription({ startDate: '2026-01-10' })

    await ok('POST', `/owner/invoices/subscriptions/${subscription.id}/discounts`, {
      discountType: 'percent',
      value: 2000,
      periods: 2,
      startsOn: '2026-01-10',
      note: 'Welcome',
    })
    await ok('POST', `/owner/invoices/subscriptions/${subscription.id}/free-periods`, {
      startsOn: '2026-02-10',
      endsOn: '2026-02-10',
      note: 'One month free',
    })

    for (const day of ['2026-01-10', '2026-02-10', '2026-03-10', '2026-04-10']) {
      at(day)
      await bill()
    }

    expect(await periodsOf(subscription.id)).toEqual([
      ['2026-01-10', 'invoiced'],
      ['2026-02-10', 'free'],
      ['2026-03-10', 'invoiced'],
      ['2026-04-10', 'invoiced'],
    ])
    // No zero-value invoice for the free month; the discount lasts two invoices.
    expect((await invoicesOf(subscription.id)).map((i) => Number(i.total_minor))).toEqual([3_920, 3_920, 4_900])

    const read = await ok('GET', `/owner/invoices/subscriptions/${subscription.id}`)

    expect(read.discounts[0].appliedCount).toBe(2)
  })

  it('starts free for the agreed number of periods, and forever when asked', async () => {
    const trial = await createSubscription({ startDate: '2026-01-10', freePeriods: 2 })
    const forever = await createSubscription({ startDate: '2026-01-10', freePeriods: null })

    at('2026-03-10')
    await bill()

    expect(await periodsOf(trial.id)).toEqual([
      ['2026-01-10', 'free'],
      ['2026-02-10', 'free'],
      ['2026-03-10', 'invoiced'],
    ])
    expect(await invoicesOf(forever.id)).toHaveLength(0)
  })

  it('pauses and resumes the future only, and ends without billing further', async () => {
    const subscription = await createSubscription({ startDate: '2026-01-10' })

    await bill()
    await ok('POST', `/owner/invoices/subscriptions/${subscription.id}/pause`, { date: '2026-01-20' })

    const past = await call('POST', `/owner/invoices/subscriptions/${subscription.id}/resume`, { date: '2026-01-05' })

    expect(past.body.code).toBe('SUBSCRIPTION_LOCKED')

    at('2026-03-15')
    await bill()
    await ok('POST', `/owner/invoices/subscriptions/${subscription.id}/resume`, { date: '2026-03-15' })

    at('2026-04-10')
    await bill()

    const ended = await ok('POST', `/owner/invoices/subscriptions/${subscription.id}/end`, {})

    expect(ended).toMatchObject({ status: 'ended', endsOn: '2026-05-09' })

    at('2026-07-10')
    await bill()

    expect(await periodsOf(subscription.id)).toEqual([
      ['2026-01-10', 'invoiced'],
      ['2026-02-10', 'paused'],
      ['2026-03-10', 'paused'],
      ['2026-04-10', 'invoiced'],
    ])

    // An ended subscription takes no more changes; only the owner ended it.
    expect((await call('POST', `/owner/invoices/subscriptions/${subscription.id}/pause`, {})).body.code).toBe(
      'SUBSCRIPTION_LOCKED',
    )
  })

  it('pages subscriptions and their periods', async () => {
    const subscription = await createSubscription({ startDate: '2026-01-10' })

    await createSubscription({ startDate: '2026-01-10' })
    at('2026-05-10')
    await bill()

    expect(await ok('GET', '/owner/invoices/subscriptions?pageSize=1')).toMatchObject({ total: 2, pageCount: 2 })

    const periods = await ok('GET', `/owner/invoices/subscriptions/${subscription.id}/periods?pageSize=2`)

    expect(periods).toMatchObject({ total: 5, pageCount: 3 })
    expect(periods.items.map((p: Json) => p.periodStart)).toEqual(['2026-05-10', '2026-04-10'])
  })

  it('copies a Service once and never reprices from the catalogue', async () => {
    const service = await ok('POST', '/owner/services', { name: 'Hosting', language: 'de' }, 201)

    await ok('PATCH', `/owner/services/${service.id}`, {
      draftRevision: service.draftRevision,
      price: { mode: 'fixed', amountCents: 1_500, period: 'monthly' },
    })

    const subscription = await createSubscription({ serviceId: service.id, amountMinor: 1_200 })

    expect(subscription.service).toEqual({ id: service.id, name: 'Hosting', priceMinor: 1_500 })
    expect(subscription.currentAmountMinor).toBe(1_200)
  })
})

/* ============================================================ automatic */

describe('automatic card collection', () => {
  it('saves a card through Stripe, issues and charges on the day, and records payment only from the webhook', async () => {
    const subscription = await createSubscription({ collection: 'automatic_card', startDate: '2026-01-10' })

    await saveCard(subscription)

    const read = await ok('GET', `/owner/invoices/subscriptions/${subscription.id}`)

    expect(read.card).toMatchObject({ status: 'valid', label: 'visa •••• 4242' })

    const summary = await bill()

    expect(summary).toMatchObject({ invoicesIssued: 1, chargesAttempted: 1, chargesFailed: 0 })

    const [invoice] = await invoicesOf(subscription.id)

    expect(invoice.status).toBe('issued')
    expect(invoice.number).toBe('TEST-2026-0001')
    // Sent by itself — the owner chose no monthly review — with the PDF.
    expect(sentEmails).toEqual([{ to: 'billing@example.org', subject: '[TEST] Rechnung TEST-2026-0001', attachments: 1 }])

    // Charged, but not yet paid: only Stripe's confirmation records a payment.
    expect((await ok('GET', `/owner/invoices/${invoice.id}`)).paymentState).toBe('unpaid')

    const charge = stripe.calls.find((c) => c.kind === 'charge')!.input as Json
    const { rows } = await database.db.query('SELECT id, stripe_payment_intent_id FROM v2_subscription_charges')
    const event = {
      id: eventId(),
      type: 'payment_intent.succeeded',
      livemode: false,
      data: {
        object: {
          id: rows[0].stripe_payment_intent_id,
          amount_received: charge.amountMinor,
          currency: 'eur',
          metadata: { v2_charge_id: rows[0].id, v2_invoice_id: invoice.id },
        },
      },
    }

    expect((await webhook(event)).body.data.outcome).toBe('charge_succeeded')
    // The same event again: nothing new.
    expect((await webhook(event)).body.data.outcome).toBe('duplicate')
    // The same payment through a different event id: still one payment.
    expect((await webhook({ ...event, id: eventId() })).body.data.outcome).toBe('duplicate')
    expect(await count('v2_invoice_payments')).toBe(1)
    expect((await ok('GET', `/owner/invoices/${invoice.id}`)).paymentState).toBe('paid')

    // The next run charges nothing more.
    await bill()
    expect(stripe.calls.filter((c) => c.kind === 'charge')).toHaveLength(1)
  })

  it('marks a failed charge overdue, retries twice, reminds three times over 14 days, and never cancels', async () => {
    stripe.state.chargeOutcome = 'failed'

    const subscription = await createSubscription({ collection: 'automatic_card', startDate: '2026-01-10' })

    await saveCard(subscription)
    await bill()

    const [invoice] = await invoicesOf(subscription.id)
    const afterFirst = await ok('GET', `/owner/invoices/${invoice.id}`)

    expect(afterFirst.paymentState).toBe('overdue')
    expect(afterFirst.collectionFailed).toBe(true)

    const scheduled = async () =>
      (
        await database.db.query(
          `SELECT attempt, status, scheduled_on::text AS on FROM v2_subscription_charges ORDER BY attempt`,
        )
      ).rows.map((row: Json) => [row.attempt, row.status, row.on])

    expect(await scheduled()).toEqual([
      [1, 'failed', '2026-01-10'],
      [2, 'scheduled', '2026-01-13'],
    ])

    at('2026-01-13')
    await bill()
    at('2026-01-17')
    await bill()

    expect(await scheduled()).toEqual([
      [1, 'failed', '2026-01-10'],
      [2, 'failed', '2026-01-13'],
      [3, 'failed', '2026-01-17'],
    ])

    at('2026-01-24')
    await bill()
    at('2026-02-09')
    await bill()

    // Exactly three attempts, however long it runs.
    expect(stripe.calls.filter((c) => c.kind === 'charge')).toHaveLength(3)

    const notices = await database.db.query(
      `SELECT kind, audience, due_on::text AS due, status, inbox_draft_id FROM v2_invoice_notices ORDER BY due_on, audience DESC`,
    )

    expect(notices.rows.map((row: Json) => [row.kind, row.audience, row.due, row.status])).toEqual([
      ['charge_failed_owner', 'owner', '2026-01-10', 'prepared'],
      ['charge_failed_customer_reminder', 'customer', '2026-01-10', 'prepared'],
      ['charge_failed_customer_reminder', 'customer', '2026-01-17', 'prepared'],
      ['charge_failed_customer_reminder', 'customer', '2026-01-24', 'prepared'],
    ])
    expect(notices.rows.filter((row: Json) => row.inbox_draft_id)).toHaveLength(3)
    expect((await ok('GET', '/owner/invoices/notices?status=prepared')).total).toBe(4)

    // Never paid, never cancelled.
    expect(await count('v2_invoice_payments')).toBe(0)
    expect((await ok('GET', `/owner/invoices/subscriptions/${subscription.id}`)).status).toBe('active')
    expect((await ok('GET', `/owner/invoices/${invoice.id}`)).paymentState).toBe('overdue')
  })

  it('waits for a card instead of switching to bank transfer, then charges once one is saved', async () => {
    const subscription = await createSubscription({ collection: 'automatic_card', startDate: '2026-01-10' })

    await bill()

    const [invoice] = await invoicesOf(subscription.id)

    expect((await ok('GET', `/owner/invoices/${invoice.id}`)).paymentState).toBe('overdue')
    expect(await count('v2_subscription_charges', `WHERE status = 'waiting_for_card'`)).toBe(1)
    expect(await count('v2_invoice_notices', `WHERE kind = 'card_missing'`)).toBe(2)
    expect(stripe.calls.filter((c) => c.kind === 'charge')).toHaveLength(0)

    await saveCard(subscription)
    await bill()

    expect(stripe.calls.filter((c) => c.kind === 'charge')).toHaveLength(1)
    expect(await count('v2_subscription_charges', `WHERE status = 'processing'`)).toBe(1)
  })

  it('reminds the customer seven days before the first charge after a free start', async () => {
    const subscription = await createSubscription({
      collection: 'automatic_card',
      startDate: '2026-01-10',
      freePeriods: 1,
    })

    await bill()

    const { rows } = await database.db.query(
      `SELECT kind, due_on::text AS due, status FROM v2_invoice_notices WHERE subscription_id = $1`,
      [subscription.id],
    )

    expect(rows).toEqual([{ kind: 'first_charge_reminder', due: '2026-02-03', status: 'pending' }])

    at('2026-02-03')
    await bill()

    expect(await count('v2_invoice_notices', `WHERE status = 'prepared'`)).toBe(1)
  })

  it('refuses to bill a live automatic subscription while real invoicing is off', async () => {
    const subscription = await createSubscription({ mode: 'live', collection: 'automatic_card', startDate: '2026-01-10' })
    const summary = await bill()

    expect(summary.errors[0]?.message).toContain('Real invoicing is switched off')
    expect(await invoicesOf(subscription.id)).toHaveLength(0)
    expect(await count('v2_subscription_periods')).toBe(0)
  })
})

/* ============================================================ webhook */

describe('the Stripe webhook', () => {
  it('records a Checkout payment once, and only for the matching mode', async () => {
    const client = await createClient()
    const draft = await ok(
      'POST',
      '/owner/invoices',
      {
        mode: 'test',
        clientId: client.id,
        recipient: RECIPIENT,
        allowStripe: true,
        lines: [{ description: 'Logo', unitPriceMinor: 30_000 }],
      },
      201,
    )
    const invoice = await ok('POST', `/owner/invoices/${draft.id}/issue`, { revision: draft.revision })
    const session = {
      mode: 'payment',
      payment_status: 'paid',
      amount_total: 30_000,
      currency: 'eur',
      payment_intent: 'pi_checkout_1',
      metadata: { v2_invoice_id: invoice.id },
    }

    const liveEvent = await webhook({ id: eventId(), type: 'checkout.session.completed', livemode: true, data: { object: session } })

    expect(liveEvent.body.data.outcome).toBe('ignored')

    const event = { id: eventId(), type: 'checkout.session.completed', livemode: false, data: { object: session } }

    expect((await webhook(event)).body.data.outcome).toBe('recorded')
    expect((await webhook(event)).body.data.outcome).toBe('duplicate')
    expect(await count('v2_invoice_payments')).toBe(1)

    const paid = await ok('GET', `/owner/invoices/${invoice.id}`)

    expect(paid.paymentState).toBe('paid')
    expect(paid.payments[0]).toMatchObject({ method: 'stripe', amountMinor: 30_000 })

    // A card payment cannot be voided; it is refunded instead.
    const voided = await call('POST', `/owner/invoices/${invoice.id}/payments/${paid.payments[0].id}/void`, {
      reason: 'x',
    })

    expect(voided.status).toBe(400)
  })

  it('refuses a forged, stale or unsigned delivery, and takes nothing without a secret', async () => {
    const event = { id: eventId(), type: 'checkout.session.completed', livemode: false, data: { object: {} } }

    expect((await webhook(event, { secret: 'whsec_wrong' })).status).toBe(401)
    expect((await webhook(event, { timestamp: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(401)
    expect((await call('POST', '/stripe/webhook', undefined, { raw: JSON.stringify(event) })).status).toBe(401)
    expect(await count('v2_stripe_events')).toBe(0)

    const secret = process.env.STRIPE_WEBHOOK_SECRET

    delete process.env.STRIPE_WEBHOOK_SECRET
    expect((await webhook(event)).status).toBe(503)
    process.env.STRIPE_WEBHOOK_SECRET = secret
  })

  it('verifies a signature exactly as Stripe computes it', async () => {
    const payload = '{"id":"evt_1"}'
    const header = await signStripePayload({ secret: 'whsec_x', payload, timestamp: 1_700_000_000 })

    expect(await verifyStripeSignature({ secret: 'whsec_x', payload, header, nowSeconds: 1_700_000_100 })).toBe(true)
    expect(await verifyStripeSignature({ secret: 'whsec_x', payload: `${payload} `, header, nowSeconds: 1_700_000_100 })).toBe(false)
    expect(await verifyStripeSignature({ secret: 'whsec_x', payload, header, nowSeconds: 1_700_000_400 })).toBe(false)
    expect(
      await verifyStripeSignature({
        secret: 'whsec_x',
        payload,
        header: `${header},v1=${'0'.repeat(64)}`,
        nowSeconds: 1_700_000_000,
      }),
    ).toBe(true)
  })
})

/* ============================================================ gateway */

describe('the Stripe gateway', () => {
  it('lets a key serve only its own mode, and a live key only with the live switch', () => {
    useStripeGatewayForTest(undefined)

    try {
      expect(keyMode('sk_test_abc')).toBe('test')
      expect(keyMode('rk_live_abc')).toBe('live')
      expect(keyMode('pk_test_abc')).toBeNull()
      expect(() => resolveStripeGateway('test', {})).toThrow('not configured')
      expect(resolveStripeGateway('test', { STRIPE_SECRET_KEY: 'sk_test_abc' }).mode).toBe('test')
      expect(() => resolveStripeGateway('live', { STRIPE_SECRET_KEY: 'sk_test_abc' })).toThrow('live Stripe key')
      expect(() => resolveStripeGateway('live', { STRIPE_SECRET_KEY: 'sk_live_abc' })).toThrow('switched off')
      expect(() => resolveStripeGateway('test', { STRIPE_SECRET_KEY: 'sk_live_abc' })).toThrow('switched off')
      expect(
        resolveStripeGateway('live', { STRIPE_SECRET_KEY: 'sk_live_abc', INVOICES_LIVE_ENABLED: 'true' }).mode,
      ).toBe('live')
    } finally {
      useStripeGatewayForTest(stripe.gateway)
    }
  })

  it('encodes nested parameters the way Stripe reads them', () => {
    expect(
      formEncode({ mode: 'payment', line_items: [{ quantity: 1, price_data: { currency: 'eur' } }], skip: undefined }),
    ).toEqual(['mode=payment', 'line_items%5B0%5D%5Bquantity%5D=1', 'line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=eur'])
  })
})

/* ============================================================ analytics */

describe('subscription analytics', () => {
  it('counts subscriptions by status and collection, live only unless asked', async () => {
    await createSubscription({ startDate: '2026-01-10' })
    await createSubscription({ startDate: '2026-01-10', collection: 'automatic_card' })

    const paused = await createSubscription({ startDate: '2026-01-10', mode: 'live' })

    await ok('POST', `/owner/invoices/subscriptions/${paused.id}/pause`, {})

    const live = await runWithDb(database.db, () => analytics.subscriptionCounts())
    const all = await runWithDb(database.db, () => analytics.subscriptionCounts({ includeTest: true }))

    expect(live).toMatchObject({ active: 0, paused: 1, byCollection: { manual: 1, automatic_card: 0 } })
    expect(all).toMatchObject({ active: 2, paused: 1, byCollection: { manual: 2, automatic_card: 1 } })
  })
})
