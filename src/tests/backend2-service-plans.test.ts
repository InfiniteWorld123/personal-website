import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from './helpers/backend2-db'

/**
 * The instalment and rent payment models of a fixed-price package, against a
 * real PostgreSQL inside this process (see `backend2-services.test.ts` for why).
 *
 * What matters is the rule the rest of Services already keeps, carried over to
 * the new fields: saving a plan cannot change what a visitor reads, only
 * **Publish update** can; the totals are computed, never stored; and the plans
 * of a package that is not a fixed one-time price are kept but never offered.
 */
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
delete process.env.BACKEND2_OWNER_AUTH

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const contract = await import('#/backend2/contracts/service.contract')
const { PACKAGE_PLAN_SEEDS, seedPaymentPlans } = await import('#/backend2/modules/services/service.seed-plans')

type Json = Record<string, any>
type Language = 'de' | 'en' | 'ar'

const database = await createTestDatabase()
const app = createAppForTest()

beforeEach(async () => {
  await database.reset()
})

afterEach(() => {
  delete process.env.BACKEND2_OWNER_AUTH
})

afterAll(async () => {
  await database.close()
})

/* ---------------------------------------------------------------- plumbing */

const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; body: Json }> => {
  const host = 'localhost:3000'
  const request = new Request(`http://${host}/api/v2${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json', origin: `http://${host}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const response = await runWithDb(database.db, async () => app.fetch(request))
  const text = await response.clone().text()

  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Json) }
}

const LANGUAGES: Language[] = ['de', 'en', 'ar']

const texts = () =>
  Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      {
        name: `Name ${language}`,
        summary: `Summary ${language}`,
        included: [`First ${language}`],
        body: '',
        promotionLabel: `Offer ${language}`,
        seoTitle: '',
        seoDescription: '',
      },
    ]),
  )

const load = async (id: string): Promise<Json> => (await call('GET', `/owner/services/${id}`)).body.data

const edit = async (id: string, patch: Json) => {
  const current = await load(id)

  return call('PATCH', `/owner/services/${id}`, { draftRevision: current.draftRevision, ...patch })
}

const publish = async (id: string) => {
  const current = await load(id)

  return call('POST', `/owner/services/${id}/publish`, { draftRevision: current.draftRevision })
}

const fixed = (over: Json = {}) => ({
  mode: 'fixed',
  amountCents: 99_900,
  period: 'one_time',
  promotion: { active: false, amountCents: null },
  ...over,
})

const PLANS = {
  instalment: { monthlyCents: 9_900, months: 12 },
  rent: { monthlyCents: 3_499, minTermMonths: 12 },
}

/** A live fixed-price package, with plans if given. */
const makeLive = async (slug = 'gefunden-werden', price: Json = fixed(PLANS)): Promise<string> => {
  const created = await call('POST', '/owner/services', { name: 'Gefunden werden', language: 'de' })
  const id = created.body.data.id as string

  const saved = await edit(id, { slug, price, texts: texts() })

  expect(saved.status, JSON.stringify(saved.body)).toBe(200)

  const published = await publish(id)

  expect(published.status, JSON.stringify(published.body)).toBe(200)

  return id
}

const publicCard = async (slug: string, language: Language = 'de'): Promise<Json> =>
  (await call('GET', `/services/${slug}?language=${language}`)).body.data

/* =============================================================== the rules */

describe('the plans in the contract', () => {
  it('computes the total of the instalments, never stores it', () => {
    expect(contract.instalmentTotalCents(9_900, 12)).toBe(118_800)
    expect(contract.instalmentTotalCents(3_499, 3)).toBe(10_497)
  })

  it('starts with no plans and twelve months', () => {
    const price = contract.emptyServicePrice()

    expect(price.instalment).toEqual({ monthlyCents: null, months: 12 })
    expect(price.rent).toEqual({ monthlyCents: null, minTermMonths: 12 })
  })

  it('merges a patch field by field, so a monthly price can change without the term', () => {
    const draft = contract.emptyServiceDraft()
    const first = contract.mergeServiceDraft(draft, { price: { instalment: { monthlyCents: 9_900 } } })
    const second = contract.mergeServiceDraft(first, { price: { instalment: { months: 6 }, rent: { monthlyCents: 3_499 } } })

    expect(second.price.instalment).toEqual({ monthlyCents: 9_900, months: 6 })
    expect(second.price.rent).toEqual({ monthlyCents: 3_499, minTermMonths: 12 })
  })

  it('notices a changed plan, so a save of one is not mistaken for no change', () => {
    const draft = contract.emptyServiceDraft()
    const changed = contract.mergeServiceDraft(draft, { price: { rent: { monthlyCents: 3_499 } } })

    expect(contract.canonicalServiceDraft(changed)).not.toBe(contract.canonicalServiceDraft(draft))
  })

  it('offers plans only for a fixed price paid once', () => {
    const base = { ...contract.emptyServicePrice(), amountCents: 99_900, ...PLANS }

    expect(contract.publicPlansOf({ ...base, mode: 'fixed', period: 'one_time' })).toEqual({
      instalment: { monthlyCents: 9_900, months: 12, totalCents: 118_800 },
      rent: { monthlyCents: 3_499, minTermMonths: 12 },
    })
    expect(contract.publicPlansOf({ ...base, mode: 'from', period: 'one_time' })).toBeNull()
    expect(contract.publicPlansOf({ ...base, mode: 'fixed', period: 'monthly' })).toBeNull()
    expect(contract.publicPlansOf({ ...base, mode: 'quote', period: null })).toBeNull()
    expect(contract.publicPlansOf({ ...base, mode: null, period: null })).toBeNull()
  })

  it('offers one model without the other', () => {
    const price = { ...contract.emptyServicePrice(), mode: 'fixed' as const, amountCents: 99_900, period: 'one_time' as const }

    expect(contract.publicPlansOf({ ...price, rent: { monthlyCents: 3_499, minTermMonths: 12 } })).toEqual({
      instalment: null,
      rent: { monthlyCents: 3_499, minTermMonths: 12 },
    })
    expect(contract.publicPlansOf(price)).toBeNull()
  })

  it('leaves the key out of the public price when there is nothing to offer', () => {
    const price = { ...contract.emptyServicePrice(), mode: 'fixed' as const, amountCents: 99_900, period: 'one_time' as const }

    expect(contract.publicPriceOf(price, '')).not.toHaveProperty('plans')
    expect(contract.publicPriceOf({ ...price, ...PLANS }, '')).toHaveProperty('plans')
  })
})

/* =========================================================== the owner API */

describe('saving the plans', () => {
  it('stores euro cents and the terms in the draft and reads them back', async () => {
    const created = await call('POST', '/owner/services', { name: 'Paket', language: 'de' })
    const id = created.body.data.id as string

    expect(created.body.data.draft.price.instalment).toEqual({ monthlyCents: null, months: 12 })
    expect(created.body.data.draft.price.rent).toEqual({ monthlyCents: null, minTermMonths: 12 })

    const saved = await edit(id, { price: fixed(PLANS) })

    expect(saved.status).toBe(200)
    expect(saved.body.data.draft.price.instalment).toEqual({ monthlyCents: 9_900, months: 12 })
    expect(saved.body.data.draft.price.rent).toEqual({ monthlyCents: 3_499, minTermMonths: 12 })

    const row = await database.db.query(
      `SELECT instalment_monthly_cents, instalment_months, rent_monthly_cents, rent_min_term_months
         FROM v2_service_versions WHERE service_id = $1 AND kind = 'draft'`,
      [id],
    )

    expect(row.rows[0]).toEqual({
      instalment_monthly_cents: 9_900,
      instalment_months: 12,
      rent_monthly_cents: 3_499,
      rent_min_term_months: 12,
    })
  })

  it('lets the owner empty a plan again — empty means "not offered"', async () => {
    const id = await makeLive()
    const saved = await edit(id, { price: { instalment: { monthlyCents: null }, rent: { monthlyCents: null } } })

    expect(saved.status).toBe(200)
    expect(saved.body.data.draft.price.instalment.monthlyCents).toBeNull()
    expect(saved.body.data.draft.price.rent.monthlyCents).toBeNull()
  })

  it.each([
    ['a monthly price of 0', { instalment: { monthlyCents: 0 } }],
    ['a fraction of a cent', { rent: { monthlyCents: 34.5 } }],
    ['a price above the limit', { rent: { monthlyCents: 100_000_000 } }],
    ['one instalment', { instalment: { months: 1 } }],
    ['more than sixty instalments', { instalment: { months: 61 } }],
    ['a fractional number of instalments', { instalment: { months: 12.5 } }],
    ['a rental term of zero months', { rent: { minTermMonths: 0 } }],
    ['a rental term above sixty months', { rent: { minTermMonths: 61 } }],
  ])('refuses %s', async (_label, price) => {
    const created = await call('POST', '/owner/services', { name: 'Paket', language: 'de' })
    const refused = await edit(created.body.data.id, { price })

    expect(refused.status).toBe(422)
  })

  it('allows a one-month term: cancellable monthly from the start', async () => {
    const created = await call('POST', '/owner/services', { name: 'Paket', language: 'de' })
    const saved = await edit(created.body.data.id, { price: { rent: { monthlyCents: 3_499, minTermMonths: 1 } } })

    expect(saved.status).toBe(200)
    expect(saved.body.data.draft.price.rent.minTermMonths).toBe(1)
  })

  it('shows the plans on the owner list, beside the price', async () => {
    await makeLive()

    const list = await call('GET', '/owner/services')

    expect(list.body.data.items[0].price.instalment).toEqual({ monthlyCents: 9_900, months: 12 })
    expect(list.body.data.items[0].price.rent).toEqual({ monthlyCents: 3_499, minTermMonths: 12 })
  })

  it('refuses a stale save of the plans like any other, without writing them', async () => {
    const created = await call('POST', '/owner/services', { name: 'Paket', language: 'de' })
    const id = created.body.data.id as string

    await edit(id, { price: fixed() })

    const stale = await call('PATCH', `/owner/services/${id}`, {
      draftRevision: created.body.data.draftRevision,
      price: { rent: { monthlyCents: 1 } },
    })

    expect(stale.status).toBe(409)
    expect((await load(id)).draft.price.rent.monthlyCents).toBeNull()
  })
})

/* ============================================ saving versus what visitors see */

describe('what a visitor reads', () => {
  it('computes the total from the two numbers and sends it with the plans', async () => {
    await makeLive()

    const card = await publicCard('gefunden-werden')

    expect(card.price).toEqual({
      mode: 'fixed',
      currency: 'EUR',
      amountCents: 99_900,
      period: 'one_time',
      promotion: null,
      plans: {
        instalment: { monthlyCents: 9_900, months: 12, totalCents: 118_800 },
        rent: { monthlyCents: 3_499, minTermMonths: 12 },
      },
    })
  })

  it('answers a package without plans exactly as before — no new key', async () => {
    await makeLive('einfach', fixed())

    expect((await publicCard('einfach')).price).toEqual({
      mode: 'fixed',
      currency: 'EUR',
      amountCents: 99_900,
      period: 'one_time',
      promotion: null,
    })
  })

  it('carries the plans on the public list too', async () => {
    await makeLive()

    const list = await call('GET', '/services?language=en')

    expect(list.body.data.items[0].price.plans.rent).toEqual({ monthlyCents: 3_499, minTermMonths: 12 })
  })

  it('keeps a saved change private until Publish update', async () => {
    const id = await makeLive()

    const saved = await edit(id, { price: { rent: { monthlyCents: 2_999 }, instalment: { months: 6 } } })

    expect(saved.status).toBe(200)
    expect(saved.body.data.state).toBe('published_with_pending_changes')

    // The draft has the new numbers; the live version has not moved.
    expect(saved.body.data.draft.price.rent.monthlyCents).toBe(2_999)
    expect(saved.body.data.published.price.rent.monthlyCents).toBe(3_499)
    expect((await publicCard('gefunden-werden')).price.plans).toEqual({
      instalment: { monthlyCents: 9_900, months: 12, totalCents: 118_800 },
      rent: { monthlyCents: 3_499, minTermMonths: 12 },
    })

    const updated = await publish(id)

    expect(updated.status).toBe(200)
    expect((await publicCard('gefunden-werden')).price.plans).toEqual({
      instalment: { monthlyCents: 9_900, months: 6, totalCents: 59_400 },
      rent: { monthlyCents: 2_999, minTermMonths: 12 },
    })
  })

  it('copies the plans into the live version in the database', async () => {
    const id = await makeLive()
    const row = await database.db.query(
      `SELECT instalment_monthly_cents, instalment_months, rent_monthly_cents, rent_min_term_months
         FROM v2_service_versions WHERE service_id = $1 AND kind = 'published'`,
      [id],
    )

    expect(row.rows[0]).toEqual({
      instalment_monthly_cents: 9_900,
      instalment_months: 12,
      rent_monthly_cents: 3_499,
      rent_min_term_months: 12,
    })
  })

  it('does not offer plans on a "starting from" price, and keeps what was typed', async () => {
    const id = await makeLive('ab-preis', fixed({ ...PLANS, mode: 'from' }))

    expect((await publicCard('ab-preis')).price).not.toHaveProperty('plans')
    expect((await load(id)).draft.price.rent.monthlyCents).toBe(3_499)
  })

  it('does not offer plans on a monthly price', async () => {
    await makeLive('pflege', fixed({ ...PLANS, period: 'monthly' }))

    expect((await publicCard('pflege')).price).not.toHaveProperty('plans')
  })

  it('keeps the plans through "on request" and offers them again when the price is fixed again', async () => {
    const id = await makeLive()
    const toQuote = await edit(id, { price: { mode: 'quote' } })

    expect(toQuote.status).toBe(200)
    expect(toQuote.body.data.draft.price).toMatchObject({
      mode: 'quote',
      amountCents: null,
      instalment: { monthlyCents: 9_900, months: 12 },
      rent: { monthlyCents: 3_499, minTermMonths: 12 },
    })

    const back = await edit(id, { price: { mode: 'fixed', amountCents: 99_900, period: 'one_time' } })

    expect(back.status).toBe(200)
    expect(contract.publicPlansOf(back.body.data.draft.price)?.rent).toEqual({ monthlyCents: 3_499, minTermMonths: 12 })
  })

  it('goes back to "Live" when the plans are changed and changed back', async () => {
    const id = await makeLive()

    await edit(id, { price: { rent: { monthlyCents: 2_999 } } })

    const reverted = await edit(id, { price: { rent: { monthlyCents: 3_499 } } })

    expect(reverted.body.data.state).toBe('published')
  })

  it('discards pending plan changes with the other pending edits', async () => {
    const id = await makeLive()

    await edit(id, { price: { rent: { monthlyCents: 2_999 } } })

    const current = await load(id)
    const discarded = await call('POST', `/owner/services/${id}/discard-pending`, { draftRevision: current.draftRevision })

    expect(discarded.status).toBe(200)
    expect(discarded.body.data.draft.price.rent.monthlyCents).toBe(3_499)
    expect(discarded.body.data.state).toBe('published')
  })
})

/* ============================================================ the database */

describe('the database refuses nonsense on its own', () => {
  it('rejects a term outside its range even if the application forgot', async () => {
    const id = await makeLive()

    await expect(
      database.db.query(`UPDATE v2_service_versions SET instalment_months = 1 WHERE service_id = $1`, [id]),
    ).rejects.toThrow()
    await expect(
      database.db.query(`UPDATE v2_service_versions SET rent_min_term_months = 61 WHERE service_id = $1`, [id]),
    ).rejects.toThrow()
    await expect(
      database.db.query(`UPDATE v2_service_versions SET rent_monthly_cents = 0 WHERE service_id = $1`, [id]),
    ).rejects.toThrow()
  })

  it('gave every existing version the defaults, with no plan', async () => {
    const created = await call('POST', '/owner/services', { name: 'Paket', language: 'de' })
    const row = await database.db.query(
      `SELECT instalment_monthly_cents, instalment_months, rent_monthly_cents, rent_min_term_months
         FROM v2_service_versions WHERE service_id = $1`,
      [created.body.data.id],
    )

    expect(row.rows[0]).toEqual({
      instalment_monthly_cents: null,
      instalment_months: 12,
      rent_monthly_cents: null,
      rent_min_term_months: 12,
    })
  })
})

/* ========================================================== the seed script */

describe('seeding the two live packages', () => {
  const seed = () => runWithDb(database.db, () => seedPaymentPlans(PACKAGE_PLAN_SEEDS))

  const liveWithoutPlans = async () => {
    const first = await makeLive('gefunden-werden', fixed())
    const second = await makeLive('vertrauen-gewinnen', fixed({ amountCents: 149_900 }))

    return { first, second }
  }

  it('fills the plans of both packages in the draft and the live version', async () => {
    const { first, second } = await liveWithoutPlans()

    const results = await seed()

    expect(results.map((result) => [result.slug, result.outcome])).toEqual([
      ['gefunden-werden', 'seeded'],
      ['vertrauen-gewinnen', 'seeded'],
    ])

    expect((await publicCard('gefunden-werden')).price.plans).toEqual({
      instalment: { monthlyCents: 9_900, months: 12, totalCents: 118_800 },
      rent: { monthlyCents: 3_499, minTermMonths: 12 },
    })
    expect((await publicCard('vertrauen-gewinnen')).price.plans).toEqual({
      instalment: { monthlyCents: 14_900, months: 12, totalCents: 178_800 },
      rent: { monthlyCents: 4_999, minTermMonths: 12 },
    })

    // Draft and live agree, so neither service looks "edited".
    for (const id of [first, second]) {
      const service = await load(id)

      expect(service.state).toBe('published')
      expect(service.draft.price).toEqual(service.published.price)
    }
  })

  it('does not change a price', async () => {
    await liveWithoutPlans()
    await seed()

    expect((await publicCard('gefunden-werden')).price.amountCents).toBe(99_900)
    expect((await publicCard('vertrauen-gewinnen')).price.amountCents).toBe(149_900)
  })

  it('is safe to run twice', async () => {
    await liveWithoutPlans()
    await seed()

    const again = await seed()

    expect(again.map((result) => result.outcome)).toEqual(['already-set', 'already-set'])
  })

  it('never overwrites a plan the owner already typed', async () => {
    const id = await makeLive('gefunden-werden', fixed({ rent: { monthlyCents: 2_999, minTermMonths: 24 } }))

    await makeLive('vertrauen-gewinnen', fixed({ amountCents: 149_900 }))
    await seed()

    const card = await publicCard('gefunden-werden')

    expect(card.price.plans.rent).toEqual({ monthlyCents: 2_999, minTermMonths: 24 })
    // The group that was empty is filled.
    expect(card.price.plans.instalment.monthlyCents).toBe(9_900)
    expect((await load(id)).state).toBe('published')
  })

  it('leaves other pending edits pending', async () => {
    const { first } = await liveWithoutPlans()

    await edit(first, { texts: { de: { summary: 'Neuer Text, noch nicht veröffentlicht' } } })
    await seed()

    const service = await load(first)

    expect(service.state).toBe('published_with_pending_changes')
    expect(service.draft.texts.de.summary).toBe('Neuer Text, noch nicht veröffentlicht')
    expect(service.published.texts.de.summary).toBe('Summary de')
    // The plans are live and also in the draft.
    expect(service.published.price.rent.monthlyCents).toBe(3_499)
    expect(service.draft.price.rent.monthlyCents).toBe(3_499)
  })

  it('reports a price that is not the expected one and leaves it alone', async () => {
    await makeLive('gefunden-werden', fixed({ amountCents: 79_000 }))
    await makeLive('vertrauen-gewinnen', fixed({ amountCents: 149_900 }))

    const [first] = await seed()

    expect(first!.outcome).toBe('seeded')
    expect(first!.notes.join(' ')).toContain('79000')
    expect((await publicCard('gefunden-werden')).price.amountCents).toBe(79_000)
  })

  it('skips a package that is not live — a draft, or one that was taken down', async () => {
    const draftOnly = await call('POST', '/owner/services', { name: 'Entwurf', language: 'de' })

    await edit(draftOnly.body.data.id, { slug: 'gefunden-werden', price: fixed() })

    const takenDown = await makeLive('vertrauen-gewinnen', fixed({ amountCents: 149_900 }))
    const current = await load(takenDown)

    await call('POST', `/owner/services/${takenDown}/unpublish`, { draftRevision: current.draftRevision })

    const results = await seed()

    expect(results.map((result) => result.outcome)).toEqual(['not-found', 'not-found'])
    expect((await load(takenDown)).draft.price.rent.monthlyCents).toBeNull()
  })
})
