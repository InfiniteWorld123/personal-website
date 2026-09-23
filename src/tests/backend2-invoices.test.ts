import { PDFDocument } from 'pdf-lib'
import { unzipSync, strFromU8 } from 'fflate'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryStore, createTestDatabase } from './helpers/backend2-db'

/**
 * Invoices, end to end, against a real PostgreSQL running inside this process.
 *
 * `docs/v2/invoices.md`. Under test: money and rounding, drafts that may be
 * incomplete and issues that may not, gapless numbering per mode and year
 * (including under concurrent issue), test/live separation and the live
 * switch, immutable issued documents in Media with a retention lock, partial
 * payments, overdue in Berlin time, installment plans, refunds, cancellation
 * and correction, sending through an Inbox draft, the yearly export, the
 * exchange-rate proposal, the analytics aggregates, the owner fence and
 * bounded pagination.
 *
 * Every person, company, address and bank account here is fictional.
 */
process.env.DATABASE_URL = 'postgres://legacy.invalid/legacy'
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
process.env.INBOX_REPLY_ADDRESS = 'reply@example.test'
process.env.INBOX_FROM_ADDRESS = 'owner@example.test'
delete process.env.BACKEND2_OWNER_AUTH
delete process.env.INBOX_SEND_MODE
delete process.env.INVOICES_LIVE_ENABLED
delete process.env.STRIPE_SECRET_KEY

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { useMediaStoreForTest } = await import('#/backend2/media/store')
const { useInboxTransportForTest } = await import('#/backend2/modules/inbox/inbox.transport')
const { useInvoiceClockForTest } = await import('#/backend2/modules/invoices/invoice.clock')
const { useEcbSourceForTest, parseEcbDaily } = await import('#/backend2/modules/invoices/invoice.fx')
const { useStripeGatewayForTest, createFakeStripeGateway } = await import(
  '#/backend2/modules/invoices/stripe.gateway'
)
const { ownerInvoicePaths } = await import('#/backend2/modules/invoices/invoice.owner.route')
const analytics = await import('#/backend2/modules/invoices/invoice.analytics')
const contract = await import('#/backend2/contracts/invoice.contract')
const { paymentStateOf } = await import('#/backend2/modules/invoices/invoice.money')
const { toCsv } = await import('#/backend2/modules/invoices/invoice.export')

type Json = Record<string, any>

const database = await createTestDatabase()
const app = createAppForTest()
let storage = createMemoryStore()
let stripe = createFakeStripeGateway('test')
const sentEmails: Array<{ to: string; subject: string; attachments: number }> = []

beforeEach(async () => {
  await database.reset()
  storage = createMemoryStore()
  useMediaStoreForTest(storage.store)
  stripe = createFakeStripeGateway('test')
  useStripeGatewayForTest(stripe.gateway)
  useInvoiceClockForTest('2026-09-23T10:00:00Z')
  useEcbSourceForTest({ latest: async () => ({ rate: '1.0875', date: '2026-09-22' }) })
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
  delete process.env.BACKEND2_OWNER_AUTH
  delete process.env.INVOICES_LIVE_ENABLED
})

afterAll(async () => {
  useMediaStoreForTest(undefined)
  useInboxTransportForTest(undefined)
  useStripeGatewayForTest(undefined)
  useInvoiceClockForTest(undefined)
  useEcbSourceForTest(undefined)
  await database.close()
})

/* ---------------------------------------------------------------- plumbing */

type Db = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> }

const call = async (
  method: string,
  path: string,
  body?: unknown,
  options: { host?: string; headers?: Record<string, string>; db?: Db } = {},
): Promise<{ status: number; body: Json; bytes: Uint8Array; response: Response }> => {
  const host = options.host ?? 'localhost:3000'
  const request = new Request(`http://${host}/api/v2${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json', origin: `http://${host}` }),
      ...options.headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const response = await runWithDb(options.db ?? database.db, async () => app.fetch(request))
  const bytes = new Uint8Array(await response.clone().arrayBuffer())
  let json: Json = {}

  if ((response.headers.get('content-type') ?? '').includes('json')) {
    try {
      json = JSON.parse(new TextDecoder().decode(bytes)) as Json
    } catch {
      json = {}
    }
  }

  return { status: response.status, body: json, bytes, response }
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

let sequence = 0
const key = () => {
  sequence += 1

  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`
}

const createClient = async (over: Json = {}): Promise<Json> => {
  sequence += 1

  return ok(
    'POST',
    '/owner/clients',
    {
      kind: 'company',
      name: `Mara Beispiel ${sequence}`,
      email: `mara${sequence}@example.org`,
      phone: '',
      country: 'DE',
      companyName: `Beispiel Studio ${sequence}`,
      ...over,
    },
    201,
  )
}

const FAKE_SELLER = {
  sellerName: 'Probe Design',
  sellerAddress: 'Musterweg 1\n10115 Berlin',
  sellerCountry: 'DE',
  sellerEmail: 'hello@example.test',
  sellerPhone: '',
  sellerWebsite: '',
  taxNumber: '12/345/67890',
  vatId: '',
  bankHolder: 'Probe Design',
  bankIban: 'DE89 3704 0044 0532 0130 00',
  bankBic: 'COBADEFFXXX',
  bankName: 'Testbank',
  taxMode: 'kleinunternehmer',
  defaultTaxRateBp: 1900,
  paymentTermsDays: 14,
  defaultLanguage: 'de',
  testRecipientEmail: '',
}

const setSeller = async (over: Json = {}): Promise<Json> => {
  const current = await ok('GET', '/owner/invoices/settings')

  return ok('PUT', '/owner/invoices/settings', { ...FAKE_SELLER, ...over, revision: current.revision })
}

const RECIPIENT = {
  name: 'Mara Beispiel',
  company: 'Beispiel Studio',
  address: 'Probestraße 9\n20095 Hamburg',
  country: 'DE',
  email: 'billing@example.org',
  vatId: '',
}

const draftBody = async (over: Json = {}): Promise<Json> => ({
  mode: 'test',
  clientId: over.clientId ?? (await createClient()).id,
  currency: 'EUR',
  recipient: RECIPIENT,
  lines: [{ description: 'Website redesign', quantityMilli: 1000, unitPriceMinor: 120_000 }],
  ...over,
})

const createDraft = async (over: Json = {}): Promise<Json> =>
  ok('POST', '/owner/invoices', await draftBody(over), 201)

const issue = async (invoice: Json): Promise<Json> =>
  ok('POST', `/owner/invoices/${invoice.id}/issue`, { revision: invoice.revision })

const issued = async (over: Json = {}): Promise<Json> => issue(await createDraft(over))

const pay = (invoiceId: string, over: Json = {}) =>
  call('POST', `/owner/invoices/${invoiceId}/payments`, {
    idempotencyKey: key(),
    method: 'bank',
    amountMinor: 10_000,
    paidOn: '2026-09-23',
    reference: '',
    note: '',
    ...over,
  })

/** One transaction at a time over PGlite's single connection. */
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

/* ============================================================ pure rules */

describe('money, without a database', () => {
  it('rounds half away from zero, once per line and once per tax group', () => {
    expect(contract.mulDivRound(1500, 333, 1000)).toBe(500) // 1.5 × 3.33 = 4.995 → 5.00
    expect(contract.mulDivRound(1000, 1, 3)).toBe(333)
    expect(contract.lineNetMinor({ quantityMilli: 2500, unitPriceMinor: 1999 })).toBe(4998) // 49.975
    expect(contract.mulDivRound(12345, 1900, 10_000)).toBe(2346) // 2345.55
  })

  it('spreads an invoice discount across tax rates so the parts add up exactly', () => {
    const totals = contract.computeTotals({
      lines: [
        { quantityMilli: 1000, unitPriceMinor: 10_000, taxRateBp: 1900 },
        { quantityMilli: 1000, unitPriceMinor: 5_001, taxRateBp: 700 },
        { quantityMilli: 1000, unitPriceMinor: 3_333, taxRateBp: null },
      ],
      discount: { type: 'percent', value: 1000 },
      taxMode: 'standard',
      reverseCharge: false,
      defaultRateBp: 1900,
    })

    expect(totals.subtotalMinor).toBe(18_334)
    expect(totals.discountMinor).toBe(1_833)
    expect(totals.taxGroups.reduce((sum, group) => sum + group.netMinor, 0)).toBe(totals.netMinor)
    expect(totals.netMinor).toBe(16_501)
    expect(totals.totalMinor).toBe(totals.netMinor + totals.taxMinor)
    expect(totals.taxGroups.map((group) => group.rateBp)).toEqual([1900, 700])
  })

  it('charges no tax under Kleinunternehmer, or with reverse charge, whatever a line says', () => {
    const lines = [{ quantityMilli: 1000, unitPriceMinor: 10_000, taxRateBp: 1900 }]
    const small = contract.computeTotals({ lines, discount: { type: 'none', value: 0 }, taxMode: 'kleinunternehmer', reverseCharge: false, defaultRateBp: 1900 })
    const reverse = contract.computeTotals({ lines, discount: { type: 'none', value: 0 }, taxMode: 'standard', reverseCharge: true, defaultRateBp: 1900 })

    expect(small.taxMinor).toBe(0)
    expect(small.totalMinor).toBe(10_000)
    expect(reverse.taxMinor).toBe(0)
  })

  it('caps a fixed discount at the subtotal', () => {
    expect(contract.discountMinor(5_000, { type: 'fixed', value: 9_000 })).toBe(5_000)
  })

  it('checks that an installment plan adds up exactly and moves forward', () => {
    const split = contract.splitByPercent(100_001, [50, 30, 20])

    expect(split).toEqual([50_001, 30_000, 20_000])
    expect(split.reduce((a, b) => a + b, 0)).toBe(100_001)
    expect(contract.installmentProblems([{ dueDate: '2026-10-01', amountMinor: 50_000 }], 100_000)).toHaveLength(1)
    expect(
      contract.installmentProblems(
        [
          { dueDate: '2026-11-01', amountMinor: 50_000 },
          { dueDate: '2026-10-01', amountMinor: 50_000 },
        ],
        100_000,
      ),
    ).toEqual(['Installment dates must not go backwards'])
    expect(
      contract.installmentProblems([{ dueDate: '2026-09-01', amountMinor: 100_000 }], 100_000, '2026-09-23'),
    ).toEqual(['The first installment cannot be due before the invoice date'])
  })

  it('converts EUR to USD exactly, from a rate that is only ever a plain decimal', () => {
    expect(contract.parseRateMicro('1.0875')).toBe(1_087_500)
    expect(contract.parseRateMicro('1e3')).toBeNull()
    expect(contract.parseRateMicro('-1.2')).toBeNull()
    expect(contract.convertMinor(9_999, 1_087_500)).toBe(10_874) // 108.739125 → 108.74
    expect(parseEcbDaily(`<Cube time='2026-09-22'><Cube currency='USD' rate='1.0875'/></Cube>`)).toEqual({
      rate: '1.0875',
      date: '2026-09-22',
    })
  })

  it('formats money the way each language writes it', () => {
    expect(contract.formatMoney(123_456_78, 'EUR', 'de')).toBe('123.456,78 €')
    expect(contract.formatMoney(-5, 'USD', 'en')).toBe('-US$0.05')
    expect(contract.formatMinor(-1234)).toBe('-12.34')
  })
})

describe('dates, without a database', () => {
  it('keeps the anchor day and falls back to the last day of a shorter month', () => {
    expect(contract.periodStart('2026-01-31', 'monthly', 1)).toBe('2026-02-28')
    expect(contract.periodStart('2026-01-31', 'monthly', 2)).toBe('2026-03-31')
    expect(contract.periodStart('2026-01-30', 'monthly', 1)).toBe('2026-02-28')
    expect(contract.periodStart('2028-01-29', 'monthly', 1)).toBe('2028-02-29')
    expect(contract.periodStart('2028-02-29', 'yearly', 1)).toBe('2029-02-28')
    expect(contract.periodStart('2028-02-29', 'yearly', 4)).toBe('2032-02-29')
    expect(contract.periodEnd('2026-01-31', 'monthly', 0)).toBe('2026-02-27')
    expect(contract.firstPeriodOnOrAfter('2026-01-31', 'monthly', '2026-03-01')).toBe(2)
  })

  it("reads Berlin's calendar day across both daylight-saving changes", () => {
    // 29 Mar 2026: clocks go forward at 02:00. 23:30 UTC is already 00:30 CET.
    expect(contract.berlinToday(new Date('2026-03-28T23:30:00Z'))).toBe('2026-03-29')
    // Summer time: 22:30 UTC is 00:30 the next day.
    expect(contract.berlinToday(new Date('2026-10-24T22:30:00Z'))).toBe('2026-10-25')
    // 25 Oct 2026: back to UTC+1, so 22:30 UTC is still the same day.
    expect(contract.berlinToday(new Date('2026-10-25T22:30:00Z'))).toBe('2026-10-25')
    expect(contract.addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(contract.addDays('2026-10-25', 1)).toBe('2026-10-26')
  })

  it('refuses a date that does not exist', () => {
    expect(contract.isCalendarDate('2026-02-29')).toBe(false)
    expect(contract.isCalendarDate('2028-02-29')).toBe(true)
    expect(contract.isCalendarDate('26-2-1')).toBe(false)
  })

  it('computes the payment state, including installments and a failed card charge', () => {
    const base = {
      kind: 'invoice' as const,
      status: 'issued' as const,
      totalMinor: 1000,
      paidMinor: 0,
      refundedMinor: 0,
      dueDate: '2026-10-01',
      installments: [],
      collectionFailed: false,
    }

    expect(paymentStateOf(base, '2026-10-01')).toBe('unpaid')
    expect(paymentStateOf(base, '2026-10-02')).toBe('overdue')
    expect(paymentStateOf({ ...base, paidMinor: 400 }, '2026-09-30')).toBe('partially_paid')
    expect(paymentStateOf({ ...base, paidMinor: 1000 }, '2027-01-01')).toBe('paid')
    expect(paymentStateOf({ ...base, paidMinor: 1000, refundedMinor: 100 }, '2027-01-01')).toBe('overdue')
    expect(paymentStateOf({ ...base, collectionFailed: true }, '2026-09-01')).toBe('overdue')
    expect(paymentStateOf({ ...base, status: 'cancelled' }, '2027-01-01')).toBe('cancelled')
  })

  it('writes CSV a spreadsheet cannot mistake for a formula', () => {
    expect(toCsv(['a', 'b'], [['=SUM(A1)', 'x,y']])).toBe(`a,b\r\n'=SUM(A1),"x,y"\r\n`)
    expect(toCsv(['n'], [['-12.34']])).toBe('n\r\n-12.34\r\n')
  })
})

/* ============================================================ the fence */

describe('the owner boundary', () => {
  it('answers 404 — never 401 — on every Invoices route from a non-local host', async () => {
    const invoice = await createDraft()

    for (const route of ownerInvoicePaths) {
      const path = route.path.replace('/api/v2', '').replaceAll('11111111-1111-4111-8111-111111111111', invoice.id)
      const refused = await call(route.method, path, route.method === 'GET' ? undefined : { revision: 1 }, {
        host: 'yamanwarda.de',
      })

      expect(refused.status, `${route.method} ${path}`).toBe(404)
    }

    expect(await count('v2_invoices', "WHERE status <> 'draft'")).toBe(0)
  })

  it('demands a real owner session once V2 sign-in is switched on', async () => {
    process.env.BACKEND2_OWNER_AUTH = 'required'

    expect((await call('GET', '/owner/invoices')).status).toBe(401)
    expect((await call('GET', '/owner/invoices/settings')).status).toBe(401)
    expect((await call('GET', '/owner/invoices/exports/2026')).status).toBe(401)
  })

  it('does not exist at all without the local opt-in', async () => {
    const previous = process.env.BACKEND2_OWNER_API

    delete process.env.BACKEND2_OWNER_API

    const closed = createAppForTest()
    const response = await runWithDb(database.db, async () =>
      closed.fetch(new Request('http://localhost:3000/api/v2/owner/invoices')),
    )

    process.env.BACKEND2_OWNER_API = previous
    expect(response.status).toBe(404)
  })

  it('has no public invoice route, and every owner reply is no-store', async () => {
    expect((await call('GET', '/invoices')).status).toBe(404)

    const listed = await call('GET', '/owner/invoices')

    expect(listed.response.headers.get('cache-control')).toContain('no-store')
  })
})

/* ============================================================ settings */

describe('seller settings', () => {
  it('starts empty, reports what a real invoice still needs, and saves with a revision', async () => {
    const empty = await ok('GET', '/owner/invoices/settings')

    expect(empty.taxMode).toBe('kleinunternehmer')
    expect(empty.readiness.liveReady).toBe(false)
    expect(empty.readiness.missing).toEqual(
      expect.arrayContaining(['sellerName', 'sellerAddress', 'taxNumberOrVatId', 'bankIban']),
    )
    expect(empty.readiness.liveEnabled).toBe(false)

    const saved = await setSeller()

    expect(saved.bankIban).toBe('DE89370400440532013000')
    expect(saved.readiness).toEqual({ liveReady: true, missing: [], liveEnabled: false })

    const stale = await call('PUT', '/owner/invoices/settings', { ...FAKE_SELLER, revision: empty.revision })

    expect(stale.status).toBe(409)

    const invalid = await call('PUT', '/owner/invoices/settings', { ...FAKE_SELLER, bankIban: 'nope', revision: saved.revision })

    expect(invalid.status).toBe(422)
  })
})

/* ============================================================ drafts and issue */

describe('drafts and issuing', () => {
  it('saves an incomplete draft, lists what blocks issuing, and refuses to issue it', async () => {
    const client = await createClient()
    const draft = await ok('POST', '/owner/invoices', { mode: 'test', clientId: client.id }, 201)

    expect(draft.status).toBe('draft')
    expect(draft.number).toBeNull()
    // Prefilled from the Client.
    expect(draft.recipient.email).toBe(client.email)
    expect(draft.issueProblems).toEqual(
      expect.arrayContaining(["Enter the recipient's full address", 'Add at least one line']),
    )

    const refused = await call('POST', `/owner/invoices/${draft.id}/issue`, { revision: draft.revision })

    expect(refused.status).toBe(422)
    expect(refused.body.code).toBe('INVOICE_NOT_READY')
    expect(refused.body.details.issues.length).toBeGreaterThan(1)
    expect(await count('v2_invoice_number_counters')).toBe(0)
  })

  it('requires a client, and can create one in the same step', async () => {
    const without = await call('POST', '/owner/invoices', { mode: 'test' })

    expect(without.status).toBe(422)

    const quick = await ok(
      'POST',
      '/owner/invoices',
      {
        mode: 'test',
        newClient: { kind: 'person', name: 'Ola Neu', email: 'ola@example.org', country: 'AT' },
      },
      201,
    )

    expect(quick.client.displayName).toBe('Ola Neu')
    expect(await count('v2_clients')).toBe(1)

    const duplicate = await call('POST', '/owner/invoices', {
      mode: 'test',
      newClient: { kind: 'person', name: 'Ola Zwei', email: 'ola@example.org', country: 'AT' },
    })

    expect(duplicate.status).toBe(409)
    expect(duplicate.body.code).toBe('CLIENT_DUPLICATE')
    expect(await count('v2_invoices')).toBe(1)
  })

  it('edits a draft with a revision, recomputing totals on every save', async () => {
    const draft = await createDraft()

    expect(draft.money.totalMinor).toBe(120_000)

    const edited = await ok('PATCH', `/owner/invoices/${draft.id}`, {
      revision: draft.revision,
      lines: [
        { description: 'Design', quantityMilli: 1500, unitPriceMinor: 8_000 },
        { description: 'Hosting', quantityMilli: 12_000, unitPriceMinor: 999 },
      ],
      discountType: 'fixed',
      discountValue: 1_000,
    })

    expect(edited.lines.map((line: Json) => line.netMinor)).toEqual([12_000, 11_988])
    expect(edited.money).toMatchObject({ subtotalMinor: 23_988, discountMinor: 1_000, totalMinor: 22_988 })

    const stale = await call('PATCH', `/owner/invoices/${draft.id}`, { revision: draft.revision, title: 'x' })

    expect(stale.status).toBe(409)
  })

  it('issues once: a number from the test sequence, a frozen snapshot, and no second number', async () => {
    const draft = await createDraft()
    const first = await issue(draft)

    expect(first.status).toBe('issued')
    expect(first.number).toBe('TEST-2026-0001')
    expect(first.issueDate).toBe('2026-09-23')
    expect(first.dueDate).toBe('2026-10-07')
    expect(first.paymentState).toBe('unpaid')

    const again = await issue(draft)

    expect(again.number).toBe('TEST-2026-0001')
    expect(await count('v2_invoices', "WHERE number IS NOT NULL")).toBe(1)

    // Issued documents never change.
    const edit = await call('PATCH', `/owner/invoices/${draft.id}`, { revision: first.revision, title: 'Changed' })

    expect(edit.status).toBe(409)
    expect(edit.body.code).toBe('INVOICE_LOCKED')
    expect((await call('DELETE', `/owner/invoices/${draft.id}`)).body.code).toBe('INVOICE_LOCKED')

    // A later settings change does not reach the issued document.
    await setSeller({ sellerName: 'Renamed Studio' })

    const { rows } = await database.db.query('SELECT snapshot FROM v2_invoices WHERE id = $1', [draft.id])

    expect(rows[0].snapshot.seller.name).toBe('')
  })

  it('refuses to issue a draft that changed after it was previewed', async () => {
    const draft = await createDraft()

    await ok('PATCH', `/owner/invoices/${draft.id}`, { revision: draft.revision, title: 'New title' })

    const stale = await call('POST', `/owner/invoices/${draft.id}/issue`, { revision: draft.revision })

    expect(stale.status).toBe(409)
    expect(await count('v2_invoice_number_counters')).toBe(0)
  })

  it('deletes drafts freely without leaving a gap in the numbers', async () => {
    const doomed = await createDraft()

    await ok('DELETE', `/owner/invoices/${doomed.id}`)
    expect(await count('v2_invoices')).toBe(0)

    expect((await issued()).number).toBe('TEST-2026-0001')
    expect((await issued()).number).toBe('TEST-2026-0002')
  })

  it('refuses a draft whose client is in Trash', async () => {
    const client = await createClient()
    const draft = await createDraft({ clientId: client.id })

    await ok('POST', `/owner/clients/${client.id}/trash`)

    const refused = await call('POST', `/owner/invoices/${draft.id}/issue`, { revision: draft.revision })

    expect(refused.body.code).toBe('INVOICE_NOT_READY')
  })

  it('keeps a Client with invoices from being deleted permanently', async () => {
    const client = await createClient()

    await issued({ clientId: client.id })
    await ok('POST', `/owner/clients/${client.id}/trash`)

    const refused = await call('DELETE', `/owner/clients/${client.id}`, { confirm: client.id })

    expect(refused.body.code).toBe('CLIENT_DELETE_BLOCKED')
  })

  it('copies a Service name and price once, and keeps it when the Service changes', async () => {
    const service = await ok('POST', '/owner/services', { name: 'Website care', language: 'de' }, 201)

    await ok('PATCH', `/owner/services/${service.id}`, {
      draftRevision: service.draftRevision,
      price: { mode: 'fixed', amountCents: 4_900, period: 'monthly' },
    })

    const draft = await createDraft({
      lines: [{ description: 'Care, September', unitPriceMinor: 4_500, serviceId: service.id }],
    })

    expect(draft.lines[0].service).toEqual({ id: service.id, name: 'Website care', priceMinor: 4_900 })

    const reread = await ok('GET', `/owner/services/${service.id}`)

    await ok('PATCH', `/owner/services/${service.id}`, {
      draftRevision: reread.draftRevision,
      price: { amountCents: 9_900 },
    })

    // A later save of the same line keeps the first snapshot.
    const saved = await ok('PATCH', `/owner/invoices/${draft.id}`, {
      revision: draft.revision,
      lines: [{ description: 'Care, September', unitPriceMinor: 4_500, serviceId: service.id }],
    })

    expect(saved.lines[0].service.priceMinor).toBe(4_900)
    expect(saved.money.totalMinor).toBe(4_500)
  })
})

/* ============================================================ test vs live */

describe('test mode and live mode', () => {
  it('refuses to issue anything real unless the switch is on and the seller is complete', async () => {
    const live = await createDraft({ mode: 'live' })

    expect(live.issueProblems).toEqual(expect.arrayContaining(['Real invoicing is switched off here']))

    const off = await call('POST', `/owner/invoices/${live.id}/issue`, { revision: live.revision })

    expect(off.status).toBe(409)
    expect(off.body.code).toBe('LIVE_INVOICING_DISABLED')

    process.env.INVOICES_LIVE_ENABLED = 'true'

    const incomplete = await call('POST', `/owner/invoices/${live.id}/issue`, { revision: live.revision })

    expect(incomplete.body.code).toBe('SELLER_NOT_READY')
    expect(incomplete.body.details.missing).toContain('sellerName')

    await setSeller()

    const real = await issue(live)

    expect(real.number).toBe('2026-0001')

    // The test sequence is separate and still starts at 1.
    expect((await issued()).number).toBe('TEST-2026-0001')
    expect(await count('v2_invoice_number_counters')).toBe(2)
  })

  it('numbers gaplessly when many drafts are issued at the same moment', async () => {
    const drafts: Json[] = []

    for (let index = 0; index < 8; index += 1) drafts.push(await createDraft())

    const db = serialized(database.db)
    const results = await Promise.all([
      ...drafts.map((draft) => call('POST', `/owner/invoices/${draft.id}/issue`, { revision: draft.revision }, { db })),
      // The same draft, five more times at once: still one number.
      ...Array.from({ length: 5 }, () =>
        call('POST', `/owner/invoices/${drafts[0]!.id}/issue`, { revision: drafts[0]!.revision }, { db }),
      ),
    ])

    for (const result of results) expect(result.status).toBe(200)

    const { rows } = await database.db.query(
      `SELECT number_seq FROM v2_invoices WHERE number IS NOT NULL ORDER BY number_seq`,
    )

    expect(rows.map((row: Json) => Number(row.number_seq))).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

/* ============================================================ documents */

describe('documents in Media', () => {
  it('previews a draft as a PDF marked DRAFT, without a number', async () => {
    const draft = await createDraft()
    const preview = await call('GET', `/owner/invoices/${draft.id}/preview`)

    expect(preview.status).toBe(200)
    expect(preview.response.headers.get('content-type')).toBe('application/pdf')
    expect(preview.response.headers.get('content-disposition')).toContain('attachment')
    expect(new TextDecoder().decode(preview.bytes.slice(0, 5))).toBe('%PDF-')
    expect(await count('v2_media_assets')).toBe(0)
  })

  it('stores the issued PDF privately under Invoices/<year>, locked against deletion', async () => {
    await setSeller()

    const invoice = await issued()

    expect(invoice.documents).toHaveLength(1)

    const assetId = invoice.documents[0].assetId
    const { rows } = await database.db.query(
      `SELECT a.display_name, f.name AS folder, p.name AS parent
         FROM v2_media_assets a
         JOIN v2_media_folders f ON f.id = a.folder_id
         JOIN v2_media_folders p ON p.id = f.parent_id
        WHERE a.id = $1`,
      [assetId],
    )

    expect(rows[0]).toEqual({ display_name: 'Rechnung-TEST-2026-0001.pdf', folder: '2026', parent: 'Invoices' })

    const pdf = await call('GET', `/owner/invoices/${invoice.id}/pdf`)
    const loaded = await PDFDocument.load(pdf.bytes)

    expect(loaded.getTitle()).toBe('Rechnung TEST-2026-0001')

    // The retention lock: Media refuses to delete it.
    const deletion = await call('DELETE', `/owner/media/files/${assetId}`)

    expect(deletion.body.code).toBe('DELETE_BLOCKED_BY_REFERENCES')

    // Renaming the folder breaks nothing, and the next invoice follows it.
    const folders = await database.db.query(`SELECT id FROM v2_media_folders WHERE name = 'Invoices'`)

    await ok('PATCH', `/owner/media/folders/${folders.rows[0].id}`, { name: 'Rechnungen' })

    const second = await issued()
    const again = await call('GET', `/owner/invoices/${invoice.id}/pdf`)

    expect(again.status).toBe(200)
    expect(await count('v2_media_folders', `WHERE name IN ('Invoices', 'Rechnungen')`)).toBe(1)

    const placed = await database.db.query(
      `SELECT p.name FROM v2_media_assets a JOIN v2_media_folders f ON f.id = a.folder_id
         JOIN v2_media_folders p ON p.id = f.parent_id WHERE a.id = $1`,
      [second.documents[0].assetId],
    )

    expect(placed.rows[0].name).toBe('Rechnungen')
  })

  it('makes an English copy of the same invoice, and refuses Arabic honestly', async () => {
    const invoice = await issued()
    const english = await call('GET', `/owner/invoices/${invoice.id}/pdf?language=en`)

    expect(english.status).toBe(200)
    expect((await PDFDocument.load(english.bytes)).getTitle()).toBe('Invoice TEST-2026-0001')
    expect((await ok('GET', `/owner/invoices/${invoice.id}`)).documents).toHaveLength(2)
    // A copy, not a second bill: no new number.
    expect(await count('v2_invoices', 'WHERE number IS NOT NULL')).toBe(1)

    const arabic = await call('GET', `/owner/invoices/${invoice.id}/pdf?language=ar`)

    expect(arabic.status).toBe(422)
    expect(arabic.body.code).toBe('LANGUAGE_NOT_SUPPORTED')
  })

  it('renders a long invoice over several pages', async () => {
    const lines = Array.from({ length: 60 }, (_, index) => ({
      description: `Item ${index + 1}: ${'a detailed description of the work '.repeat(3)}`,
      quantityMilli: 1000,
      unitPriceMinor: 1_000,
    }))
    const invoice = await issued({ lines })
    const pdf = await call('GET', `/owner/invoices/${invoice.id}/pdf`)

    expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBeGreaterThan(1)
  })
})

/* ============================================================ payments */

describe('payments', () => {
  it('records partial payments, refuses overpayment, and is idempotent', async () => {
    const invoice = await issued()
    const idempotencyKey = key()
    const first = await pay(invoice.id, { idempotencyKey, amountMinor: 40_000 })

    expect(first.status).toBe(201)
    expect(first.body.data.invoice.paymentState).toBe('partially_paid')
    expect(first.body.data.invoice.money.amountDueMinor).toBe(80_000)

    const retried = await pay(invoice.id, { idempotencyKey, amountMinor: 40_000 })

    expect(retried.status).toBe(200)
    expect(retried.body.data.duplicate).toBe(true)
    expect(await count('v2_invoice_payments')).toBe(1)

    const tooMuch = await pay(invoice.id, { amountMinor: 80_001 })

    expect(tooMuch.body.code).toBe('PAYMENT_TOO_LARGE')

    const future = await pay(invoice.id, { paidOn: '2026-09-24' })

    expect(future.status).toBe(400)

    const card = await pay(invoice.id, { method: 'stripe' })

    expect(card.status).toBe(422)

    const rest = await pay(invoice.id, { amountMinor: 80_000, method: 'cash' })

    expect(rest.body.data.invoice.paymentState).toBe('paid')
    expect(rest.body.data.invoice.money.amountDueMinor).toBe(0)
  })

  it('voids a mistaken manual payment without deleting it', async () => {
    const invoice = await issued()
    const paid = await pay(invoice.id, { amountMinor: 120_000 })
    const voided = await ok(
      'POST',
      `/owner/invoices/${invoice.id}/payments/${paid.body.data.payment.id}/void`,
      { reason: 'Entered twice' },
    )

    expect(voided.paymentState).toBe('unpaid')
    expect(voided.payments[0]).toMatchObject({ voided: true, voidReason: 'Entered twice' })
  })

  it('offers a receipt for a cash payment only, stored like a document', async () => {
    const invoice = await issued()
    const cash = await pay(invoice.id, { method: 'cash', amountMinor: 20_000 })
    const bank = await pay(invoice.id, { method: 'bank', amountMinor: 20_000 })
    const receipt = await call(
      'GET',
      `/owner/invoices/${invoice.id}/payments/${cash.body.data.payment.id}/receipt`,
    )

    expect(receipt.status).toBe(200)
    expect((await PDFDocument.load(receipt.bytes)).getTitle()).toBe('Quittung TEST-2026-0001')
    expect(await count('v2_invoice_files', `WHERE kind = 'receipt'`)).toBe(1)

    // Asking again returns the stored one.
    await call('GET', `/owner/invoices/${invoice.id}/payments/${cash.body.data.payment.id}/receipt`)
    expect(await count('v2_invoice_files', `WHERE kind = 'receipt'`)).toBe(1)

    const refused = await call('GET', `/owner/invoices/${invoice.id}/payments/${bank.body.data.payment.id}/receipt`)

    expect(refused.status).toBe(400)
  })

  it('turns overdue the day after the due date, in Berlin time', async () => {
    const invoice = await issued()

    // 7 Oct is the due date; just before midnight in Berlin it is not overdue.
    useInvoiceClockForTest('2026-10-07T21:59:00Z')
    expect((await ok('GET', `/owner/invoices/${invoice.id}`)).paymentState).toBe('unpaid')

    // 22:00 UTC on 7 Oct is already 8 Oct in Berlin (summer time).
    useInvoiceClockForTest('2026-10-07T22:00:00Z')
    expect((await ok('GET', `/owner/invoices/${invoice.id}`)).paymentState).toBe('overdue')

    const listed = await ok('GET', '/owner/invoices?status=overdue')

    expect(listed.items.map((item: Json) => item.id)).toEqual([invoice.id])
  })

  it('follows an installment plan of any size and reports each part', async () => {
    const draft = await createDraft()
    const bad = await ok('PATCH', `/owner/invoices/${draft.id}`, {
      revision: draft.revision,
      installments: [
        { dueDate: '2026-09-30', amountMinor: 60_000 },
        { dueDate: '2026-10-31', amountMinor: 36_000 },
      ],
    })

    expect(bad.issueProblems.join(' ')).toContain('add up to 960.00')

    const good = await ok('PATCH', `/owner/invoices/${draft.id}`, {
      revision: bad.revision,
      installments: [
        { dueDate: '2026-09-30', amountMinor: 60_000, label: 'Deposit' },
        { dueDate: '2026-10-31', amountMinor: 36_000 },
        { dueDate: '2026-11-30', amountMinor: 24_000 },
      ],
    })

    expect(good.issueProblems).toEqual([])

    const invoice = await issue(good)

    expect(invoice.dueDate).toBe('2026-11-30')

    await pay(invoice.id, { amountMinor: 70_000 })
    useInvoiceClockForTest('2026-10-15T10:00:00Z')

    const midway = await ok('GET', `/owner/invoices/${invoice.id}`)

    expect(midway.paymentState).toBe('partially_paid')
    expect(midway.installments.map((part: Json) => [part.paidMinor, part.state])).toEqual([
      [60_000, 'paid'],
      [10_000, 'partially_paid'],
      [0, 'open'],
    ])

    useInvoiceClockForTest('2026-11-01T10:00:00Z')

    const late = await ok('GET', `/owner/invoices/${invoice.id}`)

    expect(late.paymentState).toBe('overdue')
    expect(late.installments[1].state).toBe('overdue')
  })
})

/* ============================================================ corrections */

describe('cancellation, correction and refunds', () => {
  it('cancels with a numbered cancellation document and shows what could go back', async () => {
    const invoice = await issued()

    await pay(invoice.id, { amountMinor: 50_000 })

    const result = await ok('POST', `/owner/invoices/${invoice.id}/cancel`, { reason: 'Wrong address' })

    expect(result.invoice.status).toBe('cancelled')
    expect(result.invoice.paymentState).toBe('cancelled')
    expect(result.invoice.cancelledBy.number).toBe('TEST-2026-0002')
    expect(result.cancellation).toMatchObject({ kind: 'cancellation', number: 'TEST-2026-0002', totalMinor: -120_000 })
    expect(result.cancellation.cancels.number).toBe('TEST-2026-0001')
    expect(result.refundableMinor).toBe(50_000)
    expect(result.invoice.money.refundableMinor).toBe(50_000)
    // Cancelling does not record a refund by itself.
    expect(await count('v2_invoice_refunds')).toBe(0)

    const pdf = await call('GET', `/owner/invoices/${result.cancellation.id}/pdf`)

    expect((await PDFDocument.load(pdf.bytes)).getTitle()).toBe('Stornorechnung TEST-2026-0002')

    // Idempotent, and a cancellation cannot itself be cancelled.
    const again = await ok('POST', `/owner/invoices/${invoice.id}/cancel`, { reason: 'Again' })

    expect(again.cancellation.id).toBe(result.cancellation.id)
    expect((await call('POST', `/owner/invoices/${result.cancellation.id}/cancel`, { reason: 'x' })).body.code).toBe(
      'INVOICE_LOCKED',
    )
    expect((await pay(invoice.id)).status).toBe(400)

    const tooMuch = await call('POST', `/owner/invoices/${invoice.id}/refunds`, {
      idempotencyKey: key(),
      method: 'bank',
      amountMinor: 50_001,
      refundedOn: '2026-09-23',
      note: '',
    })

    expect(tooMuch.body.code).toBe('REFUND_TOO_LARGE')

    const refundKey = key()
    const refunded = await ok(
      'POST',
      `/owner/invoices/${invoice.id}/refunds`,
      { idempotencyKey: refundKey, method: 'bank', amountMinor: 50_000, refundedOn: '2026-09-23', note: 'Returned' },
      201,
    )

    expect(refunded.invoice.money.refundableMinor).toBe(0)

    await ok(
      'POST',
      `/owner/invoices/${invoice.id}/refunds`,
      { idempotencyKey: refundKey, method: 'bank', amountMinor: 50_000, refundedOn: '2026-09-23', note: 'Returned' },
    )
    expect(await count('v2_invoice_refunds')).toBe(1)
  })

  it('refuses to cancel a draft, and a live cancellation needs the live switch', async () => {
    const draft = await createDraft()

    expect((await call('POST', `/owner/invoices/${draft.id}/cancel`, { reason: 'x' })).status).toBe(400)

    process.env.INVOICES_LIVE_ENABLED = 'true'
    await setSeller()

    const live = await issued({ mode: 'live' })

    delete process.env.INVOICES_LIVE_ENABLED

    const refused = await call('POST', `/owner/invoices/${live.id}/cancel`, { reason: 'x' })

    expect(refused.body.code).toBe('LIVE_INVOICING_DISABLED')
    expect((await ok('GET', `/owner/invoices/${live.id}`)).status).toBe('issued')
  })

  it('corrects: cancels and opens one linked replacement draft', async () => {
    const invoice = await issued()
    const result = await ok('POST', `/owner/invoices/${invoice.id}/correct`, { reason: 'Price was wrong' })

    expect(result.invoice.status).toBe('cancelled')
    expect(result.draft).toMatchObject({ status: 'draft', number: null })
    expect(result.draft.replaces).toEqual({ id: invoice.id, number: 'TEST-2026-0001' })
    expect(result.draft.lines).toHaveLength(1)

    const again = await ok('POST', `/owner/invoices/${invoice.id}/correct`, { reason: 'Price was wrong' })

    expect(again.draft.id).toBe(result.draft.id)

    const fixed = await issue(
      await ok('PATCH', `/owner/invoices/${result.draft.id}`, {
        revision: result.draft.revision,
        lines: [{ description: 'Website redesign', unitPriceMinor: 110_000 }],
      }),
    )

    expect(fixed.number).toBe('TEST-2026-0003')
    expect((await ok('GET', `/owner/invoices/${invoice.id}`)).replacedBy.id).toBe(fixed.id)
  })
})

/* ============================================================ sending */

describe('sending', () => {
  it('opens one Inbox draft with the PDF attached, and never sends by itself', async () => {
    await setSeller({ testRecipientEmail: 'me@example.test' })

    const invoice = await issued({ allowStripe: true })
    const sent = await ok('POST', `/owner/invoices/${invoice.id}/send`, {})

    expect(sent.sent).toBe(false)
    expect(sent.draft.toEmail).toBe('me@example.test')
    expect(sent.draft.subject).toBe('[TEST] Rechnung TEST-2026-0001')
    expect(sent.paymentLinkIncluded).toBe(true)
    expect(sentEmails).toHaveLength(0)

    const draft = await ok('GET', `/owner/inbox/drafts/${sent.draft.id}`)

    expect(draft.attachments).toHaveLength(1)
    expect(JSON.stringify(draft.bodyDoc)).toContain('https://checkout.stripe.test/')

    const again = await ok('POST', `/owner/invoices/${invoice.id}/send`, { language: 'en' })

    expect(again.draft.id).toBe(sent.draft.id)
    expect(again.draft.subject).toBe('[TEST] Invoice TEST-2026-0001')
    expect(await count('v2_inbox_drafts')).toBe(1)
    // The same balance reuses the same Stripe session.
    expect(stripe.calls.filter((c) => c.kind === 'checkout')).toHaveLength(1)
  })

  it('refuses to send a draft', async () => {
    const draft = await createDraft()

    expect((await call('POST', `/owner/invoices/${draft.id}/send`, {})).status).toBe(400)
  })

  it('creates a payment link for what is still due, and refuses one for a live invoice with a test key', async () => {
    const invoice = await issued()

    await pay(invoice.id, { amountMinor: 20_000 })

    const link = await ok('POST', `/owner/invoices/${invoice.id}/payment-link`)

    expect(link.amountMinor).toBe(100_000)

    process.env.INVOICES_LIVE_ENABLED = 'true'
    await setSeller()

    const live = await issued({ mode: 'live' })
    const refused = await call('POST', `/owner/invoices/${live.id}/payment-link`)

    expect(refused.body.code).toBe('STRIPE_UNAVAILABLE')
  })
})

/* ============================================================ export */

describe('the yearly export', () => {
  it('packs live documents and records only — no drafts, no test mode', async () => {
    process.env.INVOICES_LIVE_ENABLED = 'true'
    await setSeller()

    const live = await issued({ mode: 'live' })
    const cancelled = await issued({ mode: 'live' })

    await pay(live.id, { amountMinor: 120_000 })
    await ok('POST', `/owner/invoices/${cancelled.id}/cancel`, { reason: 'Duplicate' })
    await issued({ mode: 'test' })
    await createDraft({ mode: 'live' })

    const response = await call('GET', '/owner/invoices/exports/2026')

    expect(response.status).toBe(200)
    expect(response.response.headers.get('content-type')).toBe('application/zip')

    const files = unzipSync(response.bytes)
    const names = Object.keys(files).sort()

    expect(names).toEqual([
      '2026/cancellations/2026-0003.pdf',
      '2026/documents.csv',
      '2026/invoices/2026-0001.pdf',
      '2026/invoices/2026-0002.pdf',
      '2026/payments.csv',
      '2026/refunds.csv',
    ])

    const documents = strFromU8(files['2026/documents.csv']!)

    expect(documents).not.toContain('TEST-')
    expect(documents).toContain('2026-0003,cancellation,issued')
    expect(strFromU8(files['2026/payments.csv']!)).toContain('2026-09-23,2026-0001,bank,EUR,1200.00')

    const empty = unzipSync((await call('GET', '/owner/invoices/exports/2025')).bytes)

    expect(Object.keys(empty).sort()).toEqual(['2025/documents.csv', '2025/payments.csv', '2025/refunds.csv'])
  })
})

/* ============================================================ lists */

describe('bounded lists', () => {
  it('pages invoices in a stable order, clamps a page past the end, and filters', async () => {
    const client = await createClient()

    for (let index = 0; index < 5; index += 1) await createDraft({ clientId: client.id })

    await issued({ clientId: client.id })

    const first = await ok('GET', '/owner/invoices?pageSize=2')
    const second = await ok('GET', '/owner/invoices?pageSize=2&page=2')
    const beyond = await ok('GET', '/owner/invoices?pageSize=2&page=99')

    expect(first).toMatchObject({ total: 6, pageCount: 3, hasMore: true })
    expect(first.items.map((i: Json) => i.id)).not.toEqual(second.items.map((i: Json) => i.id))
    expect(beyond.page).toBe(3)
    expect((await ok('GET', '/owner/invoices?status=draft')).total).toBe(5)
    expect((await ok('GET', '/owner/invoices?status=unpaid')).total).toBe(1)
    expect((await ok('GET', '/owner/invoices?mode=live')).total).toBe(0)
    expect((await ok('GET', '/owner/invoices?search=TEST-2026')).total).toBe(1)
    expect((await call('GET', '/owner/invoices?pageSize=1000')).status).toBe(422)
  })

  it('pages payments per mode', async () => {
    const invoice = await issued()

    for (let index = 0; index < 3; index += 1) await pay(invoice.id, { amountMinor: 1_000 })

    const page = await ok('GET', '/owner/invoices/payments?mode=test&pageSize=2')

    expect(page).toMatchObject({ total: 3, pageCount: 2 })
    expect(page.items[0].invoiceNumber).toBe('TEST-2026-0001')
    expect((await ok('GET', '/owner/invoices/payments')).total).toBe(0)
  })
})

/* ============================================================ exchange rates */

describe('EUR → USD proposals', () => {
  it('proposes from the ECB rate, records it, and accepts the owner’s own rate', async () => {
    const proposal = await ok('POST', '/owner/invoices/fx/proposal', { amountMinor: 49_900 })

    expect(proposal).toMatchObject({ rate: '1.0875', rateDate: '2026-09-22', source: 'ecb', toMinor: 54_266 })

    const manual = await ok('POST', '/owner/invoices/fx/proposal', { amountMinor: 49_900, rate: '1.1' })

    expect(manual).toMatchObject({ source: 'manual', toMinor: 54_890 })
    expect((await ok('GET', '/owner/invoices/fx/rates')).total).toBe(2)

    const draft = await createDraft({ currency: 'USD', fx: { rateId: manual.rateId } })

    expect(draft.fx).toMatchObject({ rate: '1.1', source: 'manual' })
  })

  it('falls back to a recent stored rate, and asks for one when there is none', async () => {
    useEcbSourceForTest({
      latest: async () => {
        throw new Error('offline')
      },
    })

    expect((await call('POST', '/owner/invoices/fx/proposal', { amountMinor: 100 })).body.code).toBe('FX_UNAVAILABLE')

    await database.db.query(
      `INSERT INTO v2_exchange_rates (base_currency, quote_currency, rate, rate_date, source, fetched_at)
       VALUES ('EUR', 'USD', 1.05, '2026-09-20', 'ecb', '2026-09-20T15:00:00Z')`,
    )

    const stale = await ok('POST', '/owner/invoices/fx/proposal', { amountMinor: 10_000 })

    expect(stale).toMatchObject({ rateDate: '2026-09-20', toMinor: 10_500 })
  })
})

/* ============================================================ analytics */

describe('analytics aggregates', () => {
  it('reports live money per currency, excluding test mode unless asked', async () => {
    process.env.INVOICES_LIVE_ENABLED = 'true'
    await setSeller()

    const euro = await issued({ mode: 'live' })
    const dollar = await issued({ mode: 'live', currency: 'USD' })
    const practice = await issued({ mode: 'test' })

    await pay(euro.id, { amountMinor: 120_000 })
    await pay(dollar.id, { amountMinor: 30_000 })
    await pay(practice.id, { amountMinor: 5_000 })
    await ok('POST', `/owner/invoices/${euro.id}/refunds`, {
      idempotencyKey: key(),
      method: 'bank',
      amountMinor: 20_000,
      refundedOn: '2026-09-23',
      note: '',
    }, 201)

    const range = { from: '2026-09-01', to: '2026-09-30' }
    const live = await runWithDb(database.db, () => analytics.receivedPayments(range))

    expect(live.includesTest).toBe(false)
    expect(live.received).toEqual([
      { currency: 'EUR', amountMinor: 120_000 },
      { currency: 'USD', amountMinor: 30_000 },
    ])
    expect(live.net).toEqual([
      { currency: 'EUR', amountMinor: 100_000 },
      { currency: 'USD', amountMinor: 30_000 },
    ])

    const withTest = await runWithDb(database.db, () => analytics.receivedPayments({ ...range, includeTest: true }))

    expect(withTest.received[0]).toEqual({ currency: 'EUR', amountMinor: 125_000 })

    useInvoiceClockForTest('2026-12-01T10:00:00Z')

    const overdue = await runWithDb(database.db, () => analytics.overdueInvoices())

    expect(overdue.byCurrency).toEqual([
      { currency: 'EUR', count: 1, amountDueMinor: 20_000 },
      { currency: 'USD', count: 1, amountDueMinor: 90_000 },
    ])

    const mix = await runWithDb(database.db, () => analytics.invoiceStatusMix())

    expect(mix.states).toMatchObject({ overdue: 2, paid: 0 })

    const subs = await runWithDb(database.db, () => analytics.subscriptionCounts({ includeTest: true }))

    expect(subs).toMatchObject({ active: 0, paused: 0, ended: 0 })
  })
})
