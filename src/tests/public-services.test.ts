import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from './helpers/backend2-db'

/**
 * Public cutover step 2: `/services`, the homepage section and the service
 * pages reading Backend2 behind PUBLIC_V2_MODULES (`docs/v2/public-cutover.md`).
 *
 * The services are created and published through the real owner routes against
 * a PostgreSQL inside this process, then read back through the functions the
 * public pages' server functions call. Nothing here reaches a real database.
 */
process.env.DATABASE_URL = 'postgres://legacy.invalid/legacy'
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
delete process.env.BACKEND2_OWNER_AUTH
delete process.env.PUBLIC_V2_MODULES

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const source = await import('#/frontend/features/services-public/server/services-source')
const { formatCents, priceParts } = await import('#/frontend/features/services/service-display')
const { initialOf } = await import('#/frontend/features/services-public/service-words')
const { parseServicePage } = await import('#/frontend/features/services-public/service-page')

type Json = Record<string, any>
type Language = 'de' | 'en' | 'ar'

const database = await createTestDatabase()
const app = createAppForTest()

beforeEach(async () => {
  await database.reset()
  process.env.PUBLIC_V2_MODULES = 'services'
})

afterEach(() => {
  delete process.env.PUBLIC_V2_MODULES
})

afterAll(async () => {
  await database.close()
})

/* ---------------------------------------------------------------- plumbing */

const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; body: Json }> => {
  const request = new Request(`http://localhost:3000/api/v2${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const response = await runWithDb(database.db, async () => app.fetch(request))
  const text = await response.text()

  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Json) }
}

/** Reads the way the public server functions do, against this test's database. */
const read = <T>(fn: () => Promise<T>): Promise<T> => runWithDb(database.db, fn)

const texts = (name: string) =>
  Object.fromEntries(
    (['de', 'en', 'ar'] as Language[]).map((language) => [
      language,
      {
        name: `${name} ${language}`,
        summary: `Summary ${name} ${language}`,
        included: [`First ${language}`, `Second ${language}`],
        body: `Body ${language}`,
        promotionLabel: `Offer ${language}`,
        seoTitle: '',
        seoDescription: '',
      },
    ]),
  )

const price = (over: Json = {}) => ({
  mode: 'from',
  amountCents: 99_000,
  period: 'one_time',
  promotion: { active: false, amountCents: null },
  ...over,
})

const load = async (id: string) => (await call('GET', `/owner/services/${id}`)).body.data

const edit = async (id: string, patch: Json) => {
  const saved = await call('PATCH', `/owner/services/${id}`, { draftRevision: (await load(id)).draftRevision, ...patch })

  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
}

const publish = async (id: string) => {
  const published = await call('POST', `/owner/services/${id}/publish`, { draftRevision: (await load(id)).draftRevision })

  expect(published.status, JSON.stringify(published.body)).toBe(200)
}

/** A service saved complete; published unless `live` is false. */
const service = async (slug: string, options: { live?: boolean; featured?: boolean; price?: Json } = {}) => {
  const created = await call('POST', '/owner/services', { name: slug, language: 'en' })

  expect(created.status, JSON.stringify(created.body)).toBe(201)

  const id = created.body.data.id as string

  await edit(id, { slug, price: price(options.price), texts: texts(slug), featured: options.featured ?? false })

  if (options.live !== false) await publish(id)

  return id
}

/* =================================================================== switch */

describe('with the switch off', () => {
  it('keeps every page on the legacy source, even while Backend2 has live services', async () => {
    await service('websites', { featured: true })
    delete process.env.PUBLIC_V2_MODULES

    expect(await read(() => source.loadServicesPage({ language: 'de', page: 1 }))).toEqual({ source: 'legacy' })
    expect(await read(() => source.loadHomeServices({ language: 'de' }))).toEqual({ source: 'legacy' })
    // Legacy has no service pages: every address is a 404, as today.
    expect(await read(() => source.loadPublishedService({ language: 'de', slug: 'websites' }))).toBeNull()
    expect(await read(() => source.loadPublishedServiceSlugs())).toEqual([])
  })

  it('stays on legacy when only another module is switched', async () => {
    process.env.PUBLIC_V2_MODULES = 'content,projects'

    expect(await read(() => source.loadServicesPage({ language: 'en', page: 1 }))).toEqual({ source: 'legacy' })
  })
})

/* ================================================================= the list */

describe('/services from Backend2', () => {
  it('lists only published services, in the owner order, in one language', async () => {
    await service('websites')
    await service('draft-only', { live: false })
    const down = await service('taken-down')
    await service('shopify')
    await call('POST', `/owner/services/${down}/unpublish`, {})

    const page = await read(() => source.loadServicesPage({ language: 'ar', page: 1 }))

    expect(page).toMatchObject({ source: 'v2', status: 'ok', total: 2 })
    if (page.source !== 'v2' || page.status !== 'ok') throw new Error('unreachable')
    expect(page.items.map((item) => item.slug)).toEqual(['websites', 'shopify'])
    expect(page.items[0]!.name).toBe('websites ar')
    // Only the language asked for, and no internal id.
    expect(JSON.stringify(page.items)).not.toContain('websites de')
    expect(page.items[0]).not.toHaveProperty('id')
  })

  it('pages in batches of six and still shows every earlier batch', async () => {
    for (let index = 1; index <= 7; index += 1) await service(`service-${index}`)

    const first = await read(() => source.loadServicesPage({ language: 'en', page: 1 }))
    const second = await read(() => source.loadServicesPage({ language: 'en', page: 2 }))

    expect(first).toMatchObject({ total: 7 })
    if (first.source !== 'v2' || first.status !== 'ok') throw new Error('unreachable')
    expect(first.items).toHaveLength(6)
    if (second.source !== 'v2' || second.status !== 'ok') throw new Error('unreachable')
    expect(second.items.map((item) => item.slug)).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => `service-${n}`))
  })

  it('reads an empty catalogue as an empty list, not an error', async () => {
    expect(await read(() => source.loadServicesPage({ language: 'de', page: 1 }))).toEqual({
      source: 'v2',
      status: 'ok',
      items: [],
      total: 0,
    })
  })

  it('answers a failed read with the error state for the page to explain', async () => {
    const broken = { query: async () => Promise.reject(new Error('connection refused')) }
    const quiet = console.error
    console.error = () => {}

    try {
      expect(await runWithDb(broken, () => source.loadServicesPage({ language: 'de', page: 1 }))).toEqual({
        source: 'v2',
        status: 'error',
      })
      // The homepage hides its section instead of showing an error.
      expect(await runWithDb(broken, () => source.loadHomeServices({ language: 'de' }))).toEqual({
        source: 'v2',
        items: [],
      })
    } finally {
      console.error = quiet
    }
  })

  it('reads `?page=` as a bounded whole number', () => {
    expect(parseServicePage('3')).toBe(3)
    expect(parseServicePage('0')).toBe(1)
    expect(parseServicePage('abc')).toBe(1)
    expect(parseServicePage(1.5)).toBe(1)
    expect(parseServicePage(999)).toBe(100)
  })
})

/* ============================================================ the homepage */

describe('the homepage section from Backend2', () => {
  it('shows only starred, published services, in the owner order, at most six', async () => {
    for (let index = 1; index <= 8; index += 1) await service(`star-${index}`, { featured: true })
    await service('no-star')
    await service('starred-draft', { live: false, featured: true })

    const home = await read(() => source.loadHomeServices({ language: 'de' }))

    if (home.source !== 'v2') throw new Error('unreachable')
    expect(home.items.map((item) => item.slug)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `star-${n}`))
  })

  it('has nothing to show when no live service is starred', async () => {
    await service('websites')

    expect(await read(() => source.loadHomeServices({ language: 'en' }))).toEqual({ source: 'v2', items: [] })
  })

  it('waits for Publish update before a star on a live service counts', async () => {
    const id = await service('websites')

    await edit(id, { featured: true })
    expect(await read(() => source.loadHomeServices({ language: 'en' }))).toEqual({ source: 'v2', items: [] })

    await publish(id)
    const home = await read(() => source.loadHomeServices({ language: 'en' }))
    if (home.source !== 'v2') throw new Error('unreachable')
    expect(home.items.map((item) => item.slug)).toEqual(['websites'])
  })

  it('draws the first letter of the name on each card, in every script', () => {
    expect(initialOf('websites', 'en')).toBe('W')
    expect(initialOf('  online-Shops', 'de')).toBe('O')
    expect(initialOf('مواقع', 'ar')).toBe('م')
    expect(initialOf('', 'en')).toBe('·')
  })
})

/* ======================================================== the service page */

describe('a service page from Backend2', () => {
  it('answers a published service with its page and its search words', async () => {
    await service('websites')

    const page = await read(() => source.loadPublishedService({ language: 'de', slug: 'websites' }))

    expect(page).toMatchObject({
      slug: 'websites',
      canonicalSlug: 'websites',
      name: 'websites de',
      body: 'Body de',
      seo: { title: 'websites de', description: 'Summary websites de' },
    })
  })

  it('answers a draft, a taken-down, a deleted and an unknown address with 404', async () => {
    await service('draft-only', { live: false })
    const down = await service('taken-down')
    const gone = await service('deleted')
    await call('POST', `/owner/services/${down}/unpublish`, {})
    const deleted = await call('DELETE', `/owner/services/${gone}`, { confirm: gone })
    expect(deleted.status).toBe(200)

    for (const slug of ['draft-only', 'taken-down', 'deleted', 'never-existed', '../etc']) {
      expect(await read(() => source.loadPublishedService({ language: 'en', slug }))).toBeNull()
    }
  })

  it('finds a service by an earlier address and names the current one', async () => {
    const id = await service('webseiten')

    await edit(id, { slug: 'websites' })
    await publish(id)

    const page = await read(() => source.loadPublishedService({ language: 'en', slug: 'webseiten' }))
    expect(page?.canonicalSlug).toBe('websites')
  })

  it('gives the sitemap every published address and nothing else', async () => {
    await service('websites')
    await service('draft-only', { live: false })
    await service('shopify')

    expect(await read(() => source.loadPublishedServiceSlugs())).toEqual(['websites', 'shopify'])
  })
})

/* ========================================================== the price words */

describe('the approved price words on the public pages', () => {
  const fromOneTime = { mode: 'from', currency: 'EUR', amountCents: 99_000, period: 'one_time', promotion: null } as const
  const monthlyOffer = {
    mode: 'fixed',
    currency: 'EUR',
    amountCents: 4_990,
    period: 'monthly',
    promotion: { amountCents: 3_990, label: 'Angebot' },
  } as const

  it('reads "from 990 €, one-time" in each language, the caption for the service page only', () => {
    expect(priceParts(fromOneTime, 'de')).toMatchObject({ lead: 'ab', amount: '990\u00a0€', period: null, caption: 'einmalig' })
    expect(priceParts(fromOneTime, 'en')).toMatchObject({ lead: 'from', amount: '€990', caption: 'one-time' })
    expect(priceParts(fromOneTime, 'ar')).toMatchObject({ lead: 'من', amount: '990\u00a0€', caption: 'دفعة واحدة' })
  })

  it('reads a monthly offer with the regular price struck and the label', () => {
    expect(priceParts(monthlyOffer, 'de')).toMatchObject({
      lead: null,
      regular: '49,90\u00a0€',
      amount: '39,90\u00a0€',
      period: '/ Monat',
      label: 'Angebot',
    })
    expect(priceParts(monthlyOffer, 'ar')).toMatchObject({ period: 'شهرياً', amount: '39,90\u00a0€' })
    expect(priceParts({ ...monthlyOffer, period: 'yearly' }, 'en')).toMatchObject({ period: '/ year', amount: '€39.90' })
  })

  it('reads a quote as its own sentence with no number', () => {
    expect(priceParts({ mode: 'quote' }, 'de').amount).toBe('Preis auf Anfrage')
    expect(priceParts({ mode: 'quote' }, 'en').amount).toBe('Price on request')
    expect(priceParts({ mode: 'quote' }, 'ar').amount).toBe('السعر عند الطلب')
  })

  it('carries a published price through to the page unchanged', async () => {
    await service('care', { price: { mode: 'fixed', amountCents: 4_990, period: 'monthly', promotion: { active: true, amountCents: 3_990 } } })

    const page = await read(() => source.loadServicesPage({ language: 'ar', page: 1 }))
    if (page.source !== 'v2' || page.status !== 'ok') throw new Error('unreachable')

    expect(page.items[0]!.price).toEqual({
      mode: 'fixed',
      currency: 'EUR',
      amountCents: 4_990,
      period: 'monthly',
      promotion: { amountCents: 3_990, label: 'Offer ar' },
    })
    expect(formatCents(4_990, 'ar')).toBe('49,90\u00a0€')
  })
})
