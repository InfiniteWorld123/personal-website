import { readFile, readdir } from 'node:fs/promises'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from './helpers/backend2-db'

/**
 * Services, end to end, against a real PostgreSQL running inside this process.
 *
 * What is under test is mostly restraint, as in Projects: that saving cannot
 * change a price a visitor is reading, that a failed publish writes nothing,
 * that a star on a live service waits for **Publish update**, that a service
 * that was taken down answers exactly like one that never existed, and that
 * the catalogue touches nothing outside itself — no lead, no invoice, no
 * charge.
 *
 * The environment is set before Backend2 is imported, because the application
 * decides at start-up whether the owner routes exist at all.
 */
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
delete process.env.BACKEND2_OWNER_AUTH

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { createSession } = await import('#/backend2/auth/session')
const { ownerServicePaths } = await import('#/backend2/modules/services/service.owner.route')
const contract = await import('#/backend2/contracts/service.contract')
const v = await import('valibot')

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

const call = async (
  method: string,
  path: string,
  body?: unknown,
  options: { host?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Json; response: Response }> => {
  const host = options.host ?? 'localhost:3000'
  const request = new Request(`http://${host}/api/v2${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json', origin: `http://${host}` }),
      ...options.headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const response = await runWithDb(database.db, async () => app.fetch(request))
  const text = await response.clone().text()

  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Json), response }
}

const LANGUAGES: Language[] = ['de', 'en', 'ar']

/** A language written out completely, in its own words so a leak is visible. */
const complete = (language: Language, over: Json = {}) => ({
  name: `Name ${language}`,
  summary: `Summary ${language}`,
  included: [`First ${language}`, `Second ${language}`],
  body: `Body ${language}`,
  promotionLabel: `Offer ${language}`,
  seoTitle: '',
  seoDescription: '',
  ...over,
})

const allLanguages = (over: Partial<Record<Language, Json>> = {}) => ({
  de: complete('de', over.de),
  en: complete('en', over.en),
  ar: complete('ar', over.ar),
})

const fixedPrice = (amountCents = 149_000, over: Json = {}) => ({
  mode: 'fixed',
  amountCents,
  period: 'one_time',
  promotion: { active: false, amountCents: null },
  ...over,
})

const create = async (body: Json = {}): Promise<Json> => {
  const created = await call('POST', '/owner/services', body)

  expect(created.status, JSON.stringify(created.body)).toBe(201)

  return created.body.data
}

const load = async (id: string): Promise<Json> => {
  const loaded = await call('GET', `/owner/services/${id}`)

  expect(loaded.status, JSON.stringify(loaded.body)).toBe(200)

  return loaded.body.data
}

/** A pending edit, sent with whatever revision the service is at now. */
const edit = async (id: string, patch: Json) => {
  const current = await load(id)

  return call('PATCH', `/owner/services/${id}`, { draftRevision: current.draftRevision, ...patch })
}

const publish = async (id: string) => {
  const current = await load(id)

  return call('POST', `/owner/services/${id}/publish`, { draftRevision: current.draftRevision })
}

/** A service with everything publication needs, not yet published. */
const makePublishable = async (slug = 'website', over: Json = {}): Promise<string> => {
  const service = await create({ name: 'Website', language: 'en' })
  const saved = await edit(service.id, {
    slug,
    price: fixedPrice(),
    texts: allLanguages(),
    ...over,
  })

  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
  expect(saved.body.data.publishBlockers).toEqual([])

  return service.id
}

const makeLive = async (slug = 'website', over: Json = {}): Promise<string> => {
  const id = await makePublishable(slug, over)
  const published = await publish(id)

  expect(published.status, JSON.stringify(published.body)).toBe(200)

  return id
}

/** Row counts of every V2 table outside the catalogue. */
const outsideCatalogue = async (): Promise<Record<string, number>> => {
  const { rows } = await database.db.query(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename LIKE 'v2\\_%'
        AND tablename NOT LIKE 'v2\\_service%'
      ORDER BY tablename`,
  )

  const counts: Record<string, number> = {}

  for (const { tablename } of rows as Array<{ tablename: string }>) {
    const counted = await database.db.query(`SELECT count(*)::int AS n FROM ${tablename}`)

    counts[tablename] = counted.rows[0].n
  }

  return counts
}

/* ============================================================== pure rules */

describe('the rules that need no database', () => {
  it('lets an empty draft save and names everything publication needs', () => {
    const parsed = v.parse(contract.ServiceDraftSchema, {})
    const blockers = contract.publishBlockers(parsed)

    expect(blockers).toContain('The web address is empty')
    expect(blockers).toContain('Choose how the price is shown')

    for (const label of ['DE', 'EN', 'AR']) {
      expect(blockers).toContain(`${label}: the name is empty`)
      expect(blockers).toContain(`${label}: the short description is empty`)
      expect(blockers).toContain(`${label}: nothing is listed as included`)
    }
  })

  it('has nothing to say about a complete service', () => {
    const parsed = v.parse(contract.ServiceDraftSchema, {
      slug: 'website',
      price: fixedPrice(),
      texts: allLanguages(),
    })

    expect(contract.publishBlockers(parsed)).toEqual([])
  })

  it('asks a fixed or starting-from price for an amount and a period', () => {
    for (const mode of ['fixed', 'from']) {
      const blockers = contract.publishBlockers(
        v.parse(contract.ServiceDraftSchema, {
          slug: 'website',
          price: { mode },
          texts: allLanguages(),
        }),
      )

      expect(blockers).toEqual([
        'The price is missing',
        'Choose whether the price is one-time, monthly or yearly',
      ])
    }
  })

  it('takes the number and the offer away from a price on request', () => {
    const parsed = v.parse(contract.ServiceDraftSchema, {
      slug: 'website',
      price: {
        mode: 'quote',
        amountCents: 99_000,
        period: 'monthly',
        promotion: { active: true, amountCents: 50_000 },
      },
      texts: allLanguages(),
    })

    expect(parsed.price).toEqual({
      mode: 'quote',
      amountCents: null,
      period: null,
      promotion: { active: false, amountCents: null },
    })
    expect(contract.publishBlockers(parsed)).toEqual([])
  })

  it('wants an offer lower than the price, and labelled in all three languages', () => {
    const higher = contract.publishBlockers(
      v.parse(contract.ServiceDraftSchema, {
        slug: 'website',
        price: fixedPrice(100_000, { promotion: { active: true, amountCents: 100_000 } }),
        texts: allLanguages(),
      }),
    )

    expect(higher).toEqual(['The promotional price must be lower than the normal price'])

    const unlabelled = contract.publishBlockers(
      v.parse(contract.ServiceDraftSchema, {
        slug: 'website',
        price: fixedPrice(100_000, { promotion: { active: true, amountCents: 80_000 } }),
        texts: allLanguages({ ar: { promotionLabel: '' } }),
      }),
    )

    expect(unlabelled).toEqual(['AR: the promotion label is empty'])

    // Switched off, the offer asks for nothing — it is simply not shown.
    const off = contract.publishBlockers(
      v.parse(contract.ServiceDraftSchema, {
        slug: 'website',
        price: fixedPrice(100_000, { promotion: { active: false, amountCents: 120_000 } }),
        texts: allLanguages({ de: { promotionLabel: '' } }),
      }),
    )

    expect(off).toEqual([])
  })

  it('refuses a price that is not a positive whole number of cents', () => {
    for (const amountCents of [0, -100, 12.5, 100_000_000, '1490']) {
      const parsed = v.safeParse(contract.ServiceDraftSchema, {
        price: { mode: 'fixed', amountCents },
      })

      expect(parsed.success, `amountCents ${String(amountCents)}`).toBe(false)
    }
  })

  it('changes only what a patch names', () => {
    const current = v.parse(contract.ServiceDraftSchema, {
      slug: 'website',
      price: fixedPrice(),
      texts: allLanguages(),
    })

    const merged = contract.mergeServiceDraft(current, {
      featured: true,
      texts: { de: { name: 'Neu' } },
      price: { promotion: { active: true } },
    })

    expect(merged.featured).toBe(true)
    expect(merged.texts.de.name).toBe('Neu')
    // Everything not named is exactly as it was.
    expect(merged.texts.de.summary).toBe('Summary de')
    expect(merged.texts.en).toEqual(current.texts.en)
    expect(merged.price.amountCents).toBe(149_000)
    expect(merged.price.promotion).toEqual({ active: true, amountCents: null })
    expect(merged.slug).toBe('website')

    // A null is a value, not an omission.
    expect(contract.mergeServiceDraft(current, { price: { amountCents: null } }).price.amountCents).toBe(
      null,
    )
  })

  it('drops blank included lines and caps the list', () => {
    const parsed = v.parse(contract.ServiceDraftSchema, {
      texts: { de: { included: ['  Hosting ', '', '   ', 'Domain'] } },
    })

    expect(parsed.texts.de.included).toEqual(['Hosting', 'Domain'])

    const tooMany = v.safeParse(contract.ServiceDraftSchema, {
      texts: { de: { included: Array.from({ length: 21 }, (_, index) => `Item ${index}`) } },
    })

    expect(tooMany.success).toBe(false)
  })

  it('pulls in nothing from the database, the network or another module', async () => {
    const source = await readFile(
      new URL('../backend2/contracts/service.contract.ts', import.meta.url),
      'utf8',
    )
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1])

    // valibot, and the language/address rule it shares with Projects.
    expect(imports).toEqual(['valibot', './project.contract'])
  })
})

/* ====================================================== the security fence */

describe('the owner boundary', () => {
  it('answers 404 — never 401 — on every owner route from a non-local host', async () => {
    const id = await makePublishable()

    for (const route of ownerServicePaths) {
      const path = route.path
        .replace('/api/v2', '')
        .replace('11111111-1111-4111-8111-111111111111', id)
      const refused = await call(
        route.method,
        path,
        route.method === 'GET' ? undefined : { draftRevision: 1, confirm: id, position: 1 },
        { host: 'yamanwarda.de' },
      )

      expect(refused.status, `${route.method} ${path}`).toBe(404)
      expect(refused.body.code, `${route.method} ${path}`).toBe('NOT_FOUND')
    }

    // Nothing reached the database: the service is still there, unpublished.
    const after = await load(id)
    expect(after.state).toBe('draft')
  })

  it('demands a real owner session once V2 sign-in is switched on', async () => {
    const id = await makePublishable()

    process.env.BACKEND2_OWNER_AUTH = 'required'

    const refused = await call('GET', '/owner/services')
    expect(refused.status).toBe(401)
    expect(refused.body.code).toBe('UNAUTHORIZED')

    const write = await call('POST', `/owner/services/${id}/publish`, { draftRevision: 1 })
    expect(write.status).toBe(401)

    const { rows } = await database.db.query(
      `INSERT INTO v2_owner (email, password_hash, totp_confirmed_at, recovery_codes_issued_at)
       VALUES ('owner@example.de', 'not-a-real-hash', now(), now()) RETURNING id`,
    )
    const session = await runWithDb(database.db, () =>
      createSession({ ownerId: rows[0].id, method: 'password_totp' }),
    )
    const cookie = `v2_owner_session=${encodeURIComponent(session.token)}; v2_csrf=${encodeURIComponent(session.csrfToken)}`

    const allowed = await call('GET', '/owner/services', undefined, { headers: { cookie } })
    expect(allowed.status).toBe(200)
    expect(allowed.body.data.items).toHaveLength(1)

    // A write without the CSRF header is refused even with the cookie.
    const forged = await call('POST', '/owner/services', {}, { headers: { cookie } })
    expect(forged.status).toBe(401)

    const created = await call('POST', '/owner/services', {}, {
      headers: { cookie, 'x-v2-csrf': session.csrfToken },
    })
    expect(created.status).toBe(201)

    // The session never makes the owner API answer a stranger's host.
    const remote = await call('GET', '/owner/services', undefined, {
      host: 'yamanwarda.de',
      headers: { cookie },
    })
    expect(remote.status).toBe(404)
  })

  it('leaves the public reads reachable from anywhere', async () => {
    await makeLive()

    const list = await call('GET', '/services', undefined, { host: 'yamanwarda.de' })
    expect(list.status).toBe(200)
    expect(list.body.data.items).toHaveLength(1)
  })
})

/* ==================================================== drafts and publishing */

describe('a private draft', () => {
  it('starts empty, in one language, at the end of the order', async () => {
    const first = await create({ name: 'Webseite', language: 'de' })
    const second = await create({ name: 'تطبيق', language: 'ar' })

    expect(first.state).toBe('draft')
    expect(first.position).toBe(1)
    expect(second.position).toBe(2)

    // The name is where it was written, and nowhere else.
    expect(first.draft.texts.de.name).toBe('Webseite')
    expect(first.draft.texts.en.name).toBe('')
    expect(first.draft.texts.ar.name).toBe('')

    // An address is suggested from a Latin name; Arabic alone suggests none.
    expect(first.draft.slug).toBe('webseite')
    expect(second.draft.slug).toBe('')

    expect(first.draft.price.mode).toBeNull()
    expect(first.draft.featured).toBe(false)
    expect(first.published).toBeNull()
  })

  it('saves an incomplete, one-language draft that no visitor can reach', async () => {
    const service = await create({ name: 'Online-Shop', language: 'de' })
    const saved = await edit(service.id, {
      slug: 'online-shop',
      texts: { de: { summary: 'Nur Deutsch, noch nicht fertig' } },
    })

    expect(saved.status).toBe(200)
    expect(saved.body.data.publishBlockers).toContain('EN: the name is empty')
    expect(saved.body.data.publishBlockers).toContain('Choose how the price is shown')

    expect((await call('GET', '/services')).body.data.items).toHaveLength(0)
    expect((await call('GET', '/services/online-shop')).status).toBe(404)
  })

  it('refuses a stale revision instead of overwriting', async () => {
    const id = await makePublishable()

    const stale = await call('PATCH', `/owner/services/${id}`, {
      draftRevision: 1,
      texts: { en: { name: 'Overwritten' } },
    })

    expect(stale.status).toBe(409)
    expect((await load(id)).draft.texts.en.name).toBe('Name en')
  })

  it('keeps the revision when a save changes nothing', async () => {
    const id = await makePublishable()
    const before = await load(id)

    const same = await call('PATCH', `/owner/services/${id}`, {
      draftRevision: before.draftRevision,
      texts: { en: { name: 'Name en' } },
    })

    expect(same.status).toBe(200)
    expect(same.body.data.draftRevision).toBe(before.draftRevision)
  })

  it('answers 404 for a service that does not exist, and 422 for a malformed id', async () => {
    expect((await call('GET', '/owner/services/11111111-1111-4111-8111-111111111111')).status).toBe(
      404,
    )
    expect((await call('GET', '/owner/services/not-an-id')).status).toBe(422)
  })

  it('refuses values the contract does not allow', async () => {
    const service = await create()

    const cases: Json[] = [
      { price: { mode: 'free' } },
      { price: { amountCents: 0 } },
      { price: { period: 'weekly' } },
      { slug: 'Not A Slug' },
      { texts: { de: { name: 'x'.repeat(121) } } },
      { featured: 'yes' },
    ]

    for (const patch of cases) {
      const refused = await edit(service.id, patch)

      expect(refused.status, JSON.stringify(patch)).toBe(422)
      expect(refused.body.code).toBe('VALIDATION_ERROR')
    }
  })
})

describe('publishing', () => {
  it('explains every missing requirement and writes nothing', async () => {
    // Arabic only, so no address is suggested either.
    const service = await create({ name: 'خدمة', language: 'ar' })
    const attempt = await publish(service.id)

    expect(attempt.status).toBe(422)
    expect(attempt.body.details.missing).toContain('EN: the name is empty')
    expect(attempt.body.details.missing).toContain('DE: the name is empty')
    expect(attempt.body.details.missing).not.toContain('AR: the name is empty')
    expect(attempt.body.details.missing).toContain('The web address is empty')

    const after = await load(service.id)
    expect(after.state).toBe('draft')
    expect(after.published).toBeNull()

    const { rows } = await database.db.query(
      `SELECT count(*)::int AS n FROM v2_service_versions WHERE kind = 'published'`,
    )
    expect(rows[0].n).toBe(0)
  })

  it('publishes a complete trilingual service, one language per request', async () => {
    const id = await makeLive('website')
    const service = await load(id)

    expect(service.state).toBe('published')
    expect(service.publishedSlug).toBe('website')
    expect(service.firstPublishedAt).not.toBeNull()

    for (const language of LANGUAGES) {
      const detail = await call('GET', `/services/website?language=${language}`)

      expect(detail.status).toBe(200)
      expect(detail.body.data.name).toBe(`Name ${language}`)
      expect(detail.body.data.included).toEqual([`First ${language}`, `Second ${language}`])
      expect(detail.body.data.body).toBe(`Body ${language}`)
      expect(detail.body.data.canonicalSlug).toBe('website')
    }
  })

  it('refuses a second service on an address already in use', async () => {
    const first = await makeLive('website')
    const second = await makePublishable('website')

    const secondView = await load(second)
    expect(secondView.slugAvailable).toBe(false)

    const available = await call(
      'GET',
      `/owner/services/slug-available?slug=website&serviceId=${second}`,
    )
    expect(available.body.data.available).toBe(false)

    const attempt = await publish(second)
    expect(attempt.status).toBe(409)
    expect(attempt.body.code).toBe('CONFLICT')

    // Nothing moved: the first keeps its address, the second stays private.
    expect((await load(second)).state).toBe('draft')
    expect((await call('GET', '/services/website?language=en')).body.data.name).toBe('Name en')
    expect((await load(first)).publishedSlug).toBe('website')
  })

  it('refuses to publish from a stale revision', async () => {
    const id = await makePublishable()

    const attempt = await call('POST', `/owner/services/${id}/publish`, { draftRevision: 1 })

    expect(attempt.status).toBe(409)
    expect((await load(id)).state).toBe('draft')
  })
})

/* ============================================= pending edits, the live copy */

describe('pending edits', () => {
  it('leave every word and the price visitors see untouched until Publish update', async () => {
    const id = await makeLive('website')
    const live = await call('GET', '/services/website?language=de')

    const saved = await edit(id, {
      texts: { de: { name: 'Ein neuer Name, noch nicht freigegeben' } },
      price: { amountCents: 99_000, period: 'monthly' },
    })

    expect(saved.body.data.state).toBe('published_with_pending_changes')
    expect(saved.body.data.hasPendingChanges).toBe(true)

    const stillLive = await call('GET', '/services/website?language=de')
    expect(stillLive.body.data).toEqual(live.body.data)
    expect(stillLive.body.data.price.amountCents).toBe(149_000)
    expect(stillLive.body.data.price.period).toBe('one_time')

    // The pending edit is kept, beside what is live.
    const service = await load(id)
    expect(service.draft.price.amountCents).toBe(99_000)
    expect(service.published.price.amountCents).toBe(149_000)
  })

  it('keep the live version and the pending edits when Publish update fails', async () => {
    const id = await makeLive('website')
    const live = await call('GET', '/services/website?language=ar')

    await edit(id, { texts: { ar: { summary: '' } }, price: { amountCents: 120_000 } })

    const attempt = await publish(id)
    expect(attempt.status).toBe(422)
    expect(attempt.body.details.missing).toEqual(['AR: the short description is empty'])

    expect((await call('GET', '/services/website?language=ar')).body.data).toEqual(live.body.data)

    const after = await load(id)
    expect(after.draft.texts.ar.summary).toBe('')
    expect(after.draft.price.amountCents).toBe(120_000)
    expect(after.published.texts.ar.summary).toBe('Summary ar')
    expect(after.state).toBe('published_with_pending_changes')
  })

  it('replace the live version in one step on a valid Publish update', async () => {
    const id = await makeLive('website')

    await edit(id, { texts: { en: { name: 'The approved name' } }, price: { amountCents: 99_000 } })

    const update = await publish(id)
    expect(update.status).toBe(200)
    expect(update.body.data.state).toBe('published')
    expect(update.body.data.hasPendingChanges).toBe(false)

    const live = await call('GET', '/services/website?language=en')
    expect(live.body.data.name).toBe('The approved name')
    expect(live.body.data.price.amountCents).toBe(99_000)

    const { rows } = await database.db.query(
      `SELECT count(*)::int AS n FROM v2_service_versions WHERE kind = 'published'`,
    )
    expect(rows[0].n).toBe(1)
  })

  it('go back to Live when an edit is undone by hand', async () => {
    const id = await makeLive('website')

    const starred = await edit(id, { featured: true })
    expect(starred.body.data.state).toBe('published_with_pending_changes')

    const unstarred = await edit(id, { featured: false })
    expect(unstarred.body.data.state).toBe('published')
    expect(unstarred.body.data.hasPendingChanges).toBe(false)
  })

  it('can be thrown away, giving the draft back what is live', async () => {
    const id = await makeLive('website')

    await edit(id, { texts: { en: { name: 'Regret' } }, price: { mode: 'quote' } })

    const pending = await load(id)
    const discarded = await call('POST', `/owner/services/${id}/discard-pending`, {
      draftRevision: pending.draftRevision,
    })

    expect(discarded.status).toBe(200)
    expect(discarded.body.data.draft.texts.en.name).toBe('Name en')
    expect(discarded.body.data.draft.price.amountCents).toBe(149_000)
    expect(discarded.body.data.state).toBe('published')
  })

  it('cannot be thrown away on a service that is not live', async () => {
    const id = await makePublishable()
    const current = await load(id)

    const attempt = await call('POST', `/owner/services/${id}/discard-pending`, {
      draftRevision: current.draftRevision,
    })

    expect(attempt.status).toBe(422)
    expect((await load(id)).draft.texts.en.name).toBe('Name en')
  })
})

/* ================================================================== prices */

describe('prices and offers', () => {
  it('shows each mode as it is, and never a number for a price on request', async () => {
    await makeLive('fixed-service', { price: fixedPrice(149_000) })
    await makeLive('from-service', { price: fixedPrice(4990, { mode: 'from', period: 'monthly' }) })
    await makeLive('quote-service', { price: { mode: 'quote' } })

    const fixed = await call('GET', '/services/fixed-service?language=de')
    expect(fixed.body.data.price).toEqual({
      mode: 'fixed',
      currency: 'EUR',
      amountCents: 149_000,
      period: 'one_time',
      promotion: null,
    })

    const from = await call('GET', '/services/from-service?language=de')
    expect(from.body.data.price).toEqual({
      mode: 'from',
      currency: 'EUR',
      amountCents: 4990,
      period: 'monthly',
      promotion: null,
    })

    const quote = await call('GET', '/services/quote-service?language=de')
    expect(quote.body.data.price).toEqual({ mode: 'quote' })
  })

  it('shows the offer only while it is on, in the reader’s language', async () => {
    const id = await makeLive('website', {
      price: fixedPrice(149_000, { promotion: { active: false, amountCents: 119_000 } }),
    })

    const off = await call('GET', '/services/website?language=ar')
    expect(off.body.data.price.promotion).toBeNull()
    expect(JSON.stringify(off.body)).not.toContain('119000')

    await edit(id, { price: { promotion: { active: true } } })

    // Switched on, but not published: still off for visitors.
    expect((await call('GET', '/services/website?language=ar')).body.data.price.promotion).toBeNull()

    await publish(id)

    const on = await call('GET', '/services/website?language=ar')
    expect(on.body.data.price.promotion).toEqual({ amountCents: 119_000, label: 'Offer ar' })
    expect(on.body.data.price.amountCents).toBe(149_000)

    // Switched off again: gone at the next Publish update, and only then.
    await edit(id, { price: { promotion: { active: false } } })
    expect((await call('GET', '/services/website?language=ar')).body.data.price.promotion).not.toBeNull()

    await publish(id)
    expect((await call('GET', '/services/website?language=ar')).body.data.price.promotion).toBeNull()
  })

  it('refuses to publish an offer that is not lower, or not labelled everywhere', async () => {
    const id = await makeLive('website')

    await edit(id, { price: { promotion: { active: true, amountCents: 149_000 } } })

    const notLower = await publish(id)
    expect(notLower.status).toBe(422)
    expect(notLower.body.details.missing).toEqual([
      'The promotional price must be lower than the normal price',
    ])

    await edit(id, {
      price: { promotion: { amountCents: 129_000 } },
      texts: { de: { promotionLabel: '' } },
    })

    const unlabelled = await publish(id)
    expect(unlabelled.status).toBe(422)
    expect(unlabelled.body.details.missing).toEqual(['DE: the promotion label is empty'])

    // Neither attempt reached the live page.
    expect((await call('GET', '/services/website')).body.data.price.promotion).toBeNull()
  })

  it('is refused by the database itself if a live price were ever incomplete', async () => {
    const id = await makeLive('website')

    // Straight to the table, past every check the application makes: the
    // last line of defence for "no wrong price on the live page".
    await expect(
      database.db.query(
        `UPDATE v2_service_versions SET price_amount_cents = NULL
          WHERE service_id = $1 AND kind = 'published'`,
        [id],
      ),
    ).rejects.toThrow()

    await expect(
      database.db.query(
        `UPDATE v2_service_versions SET promotion_active = true, promotion_amount_cents = 200000
          WHERE service_id = $1 AND kind = 'published'`,
        [id],
      ),
    ).rejects.toThrow()

    // A draft, by contrast, may be anything the owner is halfway through.
    await database.db.query(
      `UPDATE v2_service_versions SET price_amount_cents = NULL
        WHERE service_id = $1 AND kind = 'draft'`,
      [id],
    )
  })

  it('writes nothing outside the catalogue: a monthly price is a label, not a subscription', async () => {
    const before = await outsideCatalogue()

    const id = await makeLive('care-plan', {
      price: fixedPrice(4900, { period: 'monthly', promotion: { active: true, amountCents: 3900 } }),
    })
    await edit(id, { price: { period: 'yearly', amountCents: 49_000 } })
    await publish(id)
    await call('POST', `/owner/services/${id}/unpublish`)
    await publish(id)
    await call('DELETE', `/owner/services/${id}`, { confirm: id })

    expect(await outsideCatalogue()).toEqual(before)
  })
})

/* ============================================================ what is public */

describe('what a visitor receives', () => {
  it('carries no internal id, no revision, no draft and no other language', async () => {
    const id = await makeLive('website')

    await edit(id, {
      texts: { de: { name: 'Geheimer Entwurf' } },
      price: { amountCents: 777_777 },
    })

    for (const path of ['/services/website?language=de', '/services?language=de']) {
      const response = await call('GET', path)
      const serialised = JSON.stringify(response.body)

      expect(serialised).not.toContain(id)
      expect(serialised).not.toContain('Geheimer Entwurf')
      expect(serialised).not.toContain('777777')
      expect(serialised).not.toMatch(/draftRevision|position|serviceId|"id"/)
      expect(serialised).not.toContain('Name en')
      expect(serialised).not.toContain('Name ar')
      expect(serialised).not.toContain('Offer')
    }
  })

  it('answers 404 for a draft, a taken-down and a deleted service, exactly as for none', async () => {
    const draft = await makePublishable('draft-only')
    const takenDown = await makeLive('taken-down')
    const deleted = await makeLive('deleted')

    await call('POST', `/owner/services/${takenDown}/unpublish`)
    await call('DELETE', `/owner/services/${deleted}`, { confirm: deleted })

    const never = await call('GET', '/services/never-existed')

    for (const slug of ['draft-only', 'taken-down', 'deleted']) {
      const gone = await call('GET', `/services/${slug}`)

      expect(gone.status, slug).toBe(404)
      expect(gone.body).toEqual(never.body)
    }

    expect((await call('GET', '/services/NOT..valid')).status).toBe(404)
    expect((await load(draft)).state).toBe('draft')
  })

  it('removes a taken-down service from the list and the homepage, and brings it back as it was', async () => {
    const id = await makeLive('website', { featured: true })

    expect((await call('GET', '/services?featured=only')).body.data.total).toBe(1)

    const down = await call('POST', `/owner/services/${id}/unpublish`)
    expect(down.body.data.state).toBe('unpublished')
    expect(down.body.data.publishedSlug).toBeNull()

    expect((await call('GET', '/services')).body.data.total).toBe(0)
    expect((await call('GET', '/services?featured=only')).body.data.total).toBe(0)

    // Kept privately, whole.
    const kept = await load(id)
    expect(kept.draft.texts.en.name).toBe('Name en')
    expect(kept.published).toBeNull()

    // Republished: the same identity and the same address.
    const again = await publish(id)
    expect(again.body.data.id).toBe(id)
    expect(again.body.data.state).toBe('published')
    expect(again.body.data.publishedSlug).toBe('website')
    expect((await call('GET', '/services/website')).status).toBe(200)
  })

  it('keeps an old address working after the address changes, and names the new one', async () => {
    const id = await makeLive('website')

    await edit(id, { slug: 'websites' })

    // Pending: the old address is still the live one.
    expect((await call('GET', '/services/website')).body.data.canonicalSlug).toBe('website')
    expect((await call('GET', '/services/websites')).status).toBe(404)

    await publish(id)

    const old = await call('GET', '/services/website?language=en')
    // 200 with the address to redirect to — the API itself never redirects.
    expect(old.status).toBe(200)
    expect(old.body.data.canonicalSlug).toBe('websites')
    expect((await call('GET', '/services/websites')).body.data.canonicalSlug).toBe('websites')

    // Nobody else may take the retired address over while this service exists.
    const other = await makePublishable('website')
    expect((await publish(other)).status).toBe(409)

    // Deleting the service frees every address it held.
    await call('DELETE', `/owner/services/${id}`, { confirm: id })
    expect((await publish(other)).status).toBe(200)
  })

  it('gives each language its own search title and description, or falls back', async () => {
    await makeLive('website', {
      texts: allLanguages({
        de: { seoTitle: 'Webseiten für kleine Firmen', seoDescription: 'Schnell und klar.' },
      }),
    })

    const de = await call('GET', '/services/website?language=de')
    expect(de.body.data.seo).toEqual({
      title: 'Webseiten für kleine Firmen',
      description: 'Schnell und klar.',
    })

    const en = await call('GET', '/services/website?language=en')
    expect(en.body.data.seo).toEqual({ title: 'Name en', description: 'Summary en' })

    expect((await call('GET', '/services/website?language=fr')).status).toBe(422)
  })

  it('is cached briefly in public and never in private', async () => {
    const id = await makeLive('website')

    for (const path of ['/services', '/services/website']) {
      const cacheControl = (await call('GET', path)).response.headers.get('cache-control') ?? ''
      const seconds = Number(/max-age=(\d+)/.exec(cacheControl)?.[1] ?? '0')

      expect(seconds, `${path} sent ${cacheControl}`).toBeGreaterThan(0)
      expect(seconds, `${path} sent ${cacheControl}`).toBeLessThanOrEqual(60)
    }

    for (const path of ['/owner/services', `/owner/services/${id}`, `/owner/services/${id}/preview`]) {
      expect((await call('GET', path)).response.headers.get('cache-control')).toContain('no-store')
    }
  })
})

/* ============================================================= the preview */

describe('the owner’s preview', () => {
  it('shows the pending draft in the public shape, which visitors do not get', async () => {
    const id = await makeLive('website')

    await edit(id, {
      texts: { ar: { name: 'اسم جديد' } },
      price: { promotion: { active: true, amountCents: 99_000 } },
    })

    const preview = await call('GET', `/owner/services/${id}/preview?language=ar`)
    expect(preview.status).toBe(200)
    expect(preview.body.data.name).toBe('اسم جديد')
    expect(preview.body.data.price.promotion).toEqual({ amountCents: 99_000, label: 'Offer ar' })

    const live = await call('GET', '/services/website?language=ar')
    expect(live.body.data.name).toBe('Name ar')

    // The same projection: apart from the pending edits, identical fields.
    expect(Object.keys(preview.body.data).sort()).toEqual(Object.keys(live.body.data).sort())
  })

  it('shows an unfinished price as missing rather than inventing one', async () => {
    const service = await create({ name: 'Später', language: 'de' })

    const preview = await call('GET', `/owner/services/${service.id}/preview?language=de`)

    expect(preview.status).toBe(200)
    expect(preview.body.data.price).toBeNull()
    expect(preview.body.data.name).toBe('Später')
  })
})

/* ======================================================= stars and homepage */

describe('the homepage stars', () => {
  it('list only starred live services, in the one manual order, bounded', async () => {
    const a = await makeLive('a-service', { featured: true })
    await makeLive('b-service')
    const c = await makeLive('c-service', { featured: true })
    const d = await makePublishable('d-service', { featured: true })

    const home = await call('GET', '/services?featured=only&limit=6')
    expect(home.body.data.items.map((item: Json) => item.slug)).toEqual(['a-service', 'c-service'])
    expect(home.body.data.total).toBe(2)

    // A star on a private draft never reaches the homepage.
    expect((await load(d)).draft.featured).toBe(true)

    // The homepage follows the one order, not a second one.
    await call('POST', `/owner/services/${c}/position`, { position: 1 })
    const reordered = await call('GET', '/services?featured=only')
    expect(reordered.body.data.items.map((item: Json) => item.slug)).toEqual([
      'c-service',
      'a-service',
    ])

    // Bounded like every public list.
    expect((await call('GET', '/services?featured=only&limit=37')).status).toBe(422)
    expect((await load(a)).published.featured).toBe(true)
  })

  it('change on a live service only with Publish update', async () => {
    const id = await makeLive('website')

    await edit(id, { featured: true })

    expect((await call('GET', '/services?featured=only')).body.data.total).toBe(0)

    const listed = await call('GET', '/owner/services')
    expect(listed.body.data.items[0].featured).toBe(true)
    expect(listed.body.data.items[0].featuredLive).toBe(false)

    await publish(id)

    expect((await call('GET', '/services?featured=only')).body.data.total).toBe(1)
  })

  it('can be switched from the list without opening the service', async () => {
    const id = await makePublishable('website')
    const row = (await call('GET', '/owner/services')).body.data.items[0]

    const starred = await call('PATCH', `/owner/services/${id}`, {
      draftRevision: row.draftRevision,
      featured: true,
    })

    expect(starred.status).toBe(200)
    expect(starred.body.data.draft.featured).toBe(true)
    // Nothing else in the draft moved.
    expect(starred.body.data.draft.texts).toEqual((await load(id)).draft.texts)
    expect(starred.body.data.draft.price.amountCents).toBe(149_000)
  })
})

/* ====================================================== order, pagination */

describe('the manual order and the pages', () => {
  const makeMany = async (count: number, publishWhen: (index: number) => boolean) => {
    const ids: string[] = []

    for (let index = 0; index < count; index += 1) {
      const id = await makePublishable(`service-${index}`)

      ids.push(id)
      if (publishWhen(index)) expect((await publish(id)).status).toBe(200)
    }

    return ids
  }

  it('is one global order that the public list follows, across dashboard pages', async () => {
    const ids = await makeMany(5, (index) => index % 2 === 0)

    const before = await call('GET', '/services?limit=6')
    expect(before.body.data.items.map((item: Json) => item.slug)).toEqual([
      'service-0',
      'service-2',
      'service-4',
    ])

    // Page 3 of a two-per-page dashboard holds the last service.
    const page3 = await call('GET', '/owner/services?page=3&pageSize=2')
    expect(page3.body.data.items.map((item: Json) => item.id)).toEqual([ids[4]])

    const moved = await call('POST', `/owner/services/${ids[4]}/position`, { position: 1 })
    expect(moved.status).toBe(200)
    expect(moved.body.data).toEqual({ id: ids[4], position: 1, total: 5 })

    const after = await call('GET', '/services?limit=6')
    expect(after.body.data.items.map((item: Json) => item.slug)).toEqual([
      'service-4',
      'service-0',
      'service-2',
    ])

    const page1 = await call('GET', '/owner/services?page=1&pageSize=2')
    expect(page1.body.data.items.map((item: Json) => item.id)).toEqual([ids[4], ids[0]])

    const { rows } = await database.db.query('SELECT position FROM v2_services ORDER BY position')
    expect(rows.map((row: Json) => row.position)).toEqual([1, 2, 3, 4, 5])
  })

  it('clamps a move past the end, and refuses a service that does not exist', async () => {
    const ids = await makeMany(3, () => false)

    const far = await call('POST', `/owner/services/${ids[0]}/position`, { position: 99 })
    expect(far.body.data.position).toBe(3)

    const unknown = await call(
      'POST',
      '/owner/services/11111111-1111-4111-8111-111111111111/position',
      { position: 1 },
    )
    expect(unknown.status).toBe(404)

    expect((await call('POST', `/owner/services/${ids[0]}/position`, { position: 0 })).status).toBe(422)
  })

  it('closes the gap when a service is deleted', async () => {
    const ids = await makeMany(3, () => false)

    await call('DELETE', `/owner/services/${ids[1]}`, { confirm: ids[1] })

    const { rows } = await database.db.query('SELECT id, position FROM v2_services ORDER BY position')
    expect(rows.map((row: Json) => [row.id, row.position])).toEqual([
      [ids[0], 1],
      [ids[2], 2],
    ])
  })

  it('pages the dashboard on the server, with a filter and a search', async () => {
    const ids = await makeMany(5, (index) => index < 2)

    const first = await call('GET', '/owner/services?page=1&pageSize=2')
    expect(first.body.data).toMatchObject({ page: 1, pageSize: 2, total: 5, pageCount: 3, hasMore: true })
    expect(first.body.data.items).toHaveLength(2)

    const last = await call('GET', '/owner/services?page=3&pageSize=2')
    expect(last.body.data.items).toHaveLength(1)
    expect(last.body.data.hasMore).toBe(false)

    // A page past the end is the last page, not an empty one.
    const far = await call('GET', '/owner/services?page=9&pageSize=2')
    expect(far.body.data.page).toBe(3)
    expect(far.body.data.items).toHaveLength(1)

    const live = await call('GET', '/owner/services?state=published')
    expect(live.body.data.items.map((item: Json) => item.id)).toEqual([ids[0], ids[1]])

    const drafts = await call('GET', '/owner/services?state=draft')
    expect(drafts.body.data.total).toBe(3)

    await edit(ids[3], { texts: { ar: { name: 'خدمة خاصة' } } })
    const found = await call('GET', `/owner/services?search=${encodeURIComponent('خاصة')}`)
    expect(found.body.data.items.map((item: Json) => item.id)).toEqual([ids[3]])

    // A wildcard typed by the owner is a character to find, not "everything".
    expect((await call('GET', '/owner/services?search=%25')).body.data.total).toBe(0)

    expect((await call('GET', '/owner/services?pageSize=51')).status).toBe(422)
  })

  it('serves the public list one bounded batch at a time', async () => {
    await makeMany(8, () => true)

    const first = await call('GET', '/services?offset=0&limit=6')
    expect(first.body.data.items).toHaveLength(6)
    expect(first.body.data.total).toBe(8)
    expect(first.body.data.hasMore).toBe(true)

    const second = await call('GET', '/services?offset=6&limit=6')
    expect(second.body.data.items).toHaveLength(2)
    expect(second.body.data.hasMore).toBe(false)

    const slugs = [...first.body.data.items, ...second.body.data.items].map((item: Json) => item.slug)
    expect(new Set(slugs).size).toBe(8)

    expect((await call('GET', '/services?limit=500')).status).toBe(422)
    expect((await call('GET', '/services?offset=601')).status).toBe(422)
  })
})

/* ================================================================== delete */

describe('permanent delete', () => {
  it('refuses without the service id, and removes everything with it', async () => {
    const id = await makeLive('website')

    const wrong = await call('DELETE', `/owner/services/${id}`, { confirm: 'yes' })
    expect(wrong.status).toBe(422)
    expect((await call('GET', '/services/website')).status).toBe(200)

    const missing = await call('DELETE', `/owner/services/${id}`)
    expect(missing.status).toBe(422)

    const right = await call('DELETE', `/owner/services/${id}`, { confirm: id })
    expect(right.status).toBe(200)
    expect(right.body.data).toEqual({ deleted: true })

    expect((await call('GET', `/owner/services/${id}`)).status).toBe(404)
    expect((await call('GET', '/services/website')).status).toBe(404)

    for (const table of ['v2_services', 'v2_service_versions', 'v2_service_texts', 'v2_service_slugs']) {
      const { rows } = await database.db.query(`SELECT count(*)::int AS n FROM ${table}`)

      expect(rows[0].n, table).toBe(0)
    }
  })
})

/* ============================================================ independence */

describe('independence from other modules', () => {
  it('imports nothing from the legacy backend or any business module', async () => {
    const directory = new URL('../backend2/modules/services/', import.meta.url)

    for (const file of await readdir(directory)) {
      const source = await readFile(new URL(file, directory), 'utf8')
      const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1] ?? '')

      for (const target of imports) {
        expect(target, `${file} imports ${target}`).not.toMatch(/src\/backend\/|\.\.\/\.\.\/\.\.\/backend\//)
        expect(target, `${file} imports ${target}`).not.toMatch(/leads|invoices|booking|inbox/)
      }
    }
  })
})
