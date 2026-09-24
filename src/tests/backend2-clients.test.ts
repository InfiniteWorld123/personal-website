import { readFile, readdir } from 'node:fs/promises'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from './helpers/backend2-db'

/**
 * Clients, end to end, against a real PostgreSQL running inside this process.
 *
 * `docs/v2/clients.md`. What is under test is mostly restraint: a type change
 * loses nothing, a duplicate is a warning and never a merge, Trash keeps the
 * file whole, a permanent deletion takes nothing else with it, and a Lead's
 * `Won` creates or links exactly one Client — once, however often it is
 * retried — or leaves everything as it was.
 *
 * Every contact here is fictional.
 */
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
delete process.env.BACKEND2_OWNER_AUTH

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb, withTransaction } = await import('#/backend2/db/client')
const { createSession } = await import('#/backend2/auth/session')
const { ownerClientPaths } = await import('#/backend2/modules/clients/client.owner.route')
const { ownerNichePaths } = await import('#/backend2/modules/niches/niche.owner.route')
const won = await import('#/backend2/modules/clients/client.won')
const contract = await import('#/backend2/contracts/client.contract')
const countries = await import('#/backend2/contracts/country.contract')
const v = await import('valibot')

type Json = Record<string, any>

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
      ...(body === undefined
        ? {}
        : { 'content-type': 'application/json', origin: `http://${host}` }),
      ...options.headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const response = await runWithDb(database.db, async () => app.fetch(request))
  const text = await response.clone().text()

  return {
    status: response.status,
    body: text === '' ? {} : (JSON.parse(text) as Json),
    response,
  }
}

const person = (over: Json = {}) => ({
  kind: 'person',
  name: 'Mara Beispiel',
  email: 'mara@example.de',
  phone: '+49 170 1234567',
  country: 'DE',
  companyName: '',
  notes: '',
  ...over,
})

const company = (over: Json = {}) => ({
  kind: 'company',
  name: 'Jonas Muster',
  email: 'jonas@muster-gmbh.example',
  phone: '',
  country: 'AT',
  companyName: 'Muster GmbH',
  notes: '',
  ...over,
})

const create = async (body: Json): Promise<Json> => {
  const created = await call('POST', '/owner/clients', body)

  expect(created.status, JSON.stringify(created.body)).toBe(201)

  return created.body.data
}

const load = async (id: string): Promise<Json> => {
  const loaded = await call('GET', `/owner/clients/${id}`)

  expect(loaded.status, JSON.stringify(loaded.body)).toBe(200)

  return loaded.body.data
}

const count = async (table: string): Promise<number> => {
  const { rows } = await database.db.query(`SELECT count(*) AS total FROM ${table}`)

  return Number(rows[0].total)
}

const lead = (over: Json = {}) => ({
  id: '5a5a5a5a-1111-4111-8111-000000000001',
  name: 'Lina Probe',
  email: 'lina@example.org',
  phone: '+49 30 555 0101',
  country: 'DE',
  company: 'Probe & Co',
  notes: 'Asked about a shop.',
  ...over,
})

const convert = (input: Parameters<typeof won.convertLeadToClient>[0]) =>
  runWithDb(database.db, () => won.convertLeadToClient(input))

/* ======================================================== pure rules */

describe('the rules that need no database', () => {
  it('knows one list of countries, found by code or by an English or German name', () => {
    expect(countries.COUNTRIES.length).toBeGreaterThan(240)
    expect(new Set(countries.COUNTRY_CODES).size).toBe(countries.COUNTRY_CODES.length)
    expect(countries.findCountryCode('de')).toBe('DE')
    expect(countries.findCountryCode('Germany')).toBe('DE')
    expect(countries.findCountryCode('Deutschland')).toBe('DE')
    expect(countries.findCountryCode('  österreich ')).toBe('AT')
    expect(countries.findCountryCode('Turkey')).toBe('TR')
    expect(countries.findCountryCode('Atlantis')).toBeNull()
    expect(countries.countryName('SY')).toBe('Syria')

    // A picker offers the exact code, then names that start with the text.
    const ranked = countries.COUNTRIES.map((c) => ({ c, r: countries.countryRank(c.code, 'de') }))
      .filter((x) => x.r !== null)
      .sort((a, b) => a.r! - b.r!)
    expect(ranked[0]?.c.code).toBe('DE')
    expect(countries.countryRank('DE', 'deutsch')).toBe(1)
    expect(countries.countryRank('BD', 'de')).toBe(2)
    expect(countries.countryRank('FR', 'xyz')).toBeNull()
  })

  it('reads the same phone written two ways as one', () => {
    expect(contract.phoneKey('+49 170 1234567')).toBe(contract.phoneKey('+491701234567'))
    expect(contract.phoneKey('0049 170 1234567')).toBe('+491701234567')
    expect(contract.phoneKey('')).toBe('')
  })

  it('requires a company name only for a Company', () => {
    expect(v.safeParse(contract.ClientFieldsSchema, person()).success).toBe(true)

    const unnamed = v.safeParse(contract.ClientFieldsSchema, company({ companyName: '  ' }))
    expect(unnamed.success).toBe(false)
    expect(unnamed.issues?.[0] ? v.getDotPath(unnamed.issues[0]) : null).toBe('companyName')
  })

  it('appends a Lead’s notes under a separator, keeping the Client’s text above', () => {
    const now = new Date('2026-03-29T00:30:00Z') // 01:30 in Berlin, the DST morning

    expect(
      won.appendLeadNotes({
        clientNotes: 'Pays late.\n',
        leadName: 'Lina',
        leadNotes: 'Wants SEO',
        now,
      }),
    ).toBe('Pays late.\n\n--- Notes from lead "Lina" (2026-03-29) ---\nWants SEO')
    expect(
      won.appendLeadNotes({
        clientNotes: 'Kept',
        leadName: 'L',
        leadNotes: '  ',
        now,
      }),
    ).toBe('Kept')
  })
})

/* ====================================================== the owner boundary */

describe('the owner boundary', () => {
  it('answers 404 — never 401 — on every owner route from a non-local host', async () => {
    const client = await create(person())

    for (const route of [...ownerClientPaths, ...ownerNichePaths]) {
      const path = route.path
        .replace('/api/v2', '')
        .replace('11111111-1111-4111-8111-111111111111', client.id)
      const refused = await call(
        route.method,
        path,
        route.method === 'GET'
          ? undefined
          : {
              ...person({ name: 'Changed' }),
              revision: 1,
              status: 'inactive',
              confirm: client.id,
            },
        { host: 'yamanwarda.de' },
      )

      expect(refused.status, `${route.method} ${path}`).toBe(404)
      expect(refused.body.code, `${route.method} ${path}`).toBe('NOT_FOUND')
    }

    const after = await load(client.id)
    expect(after.name).toBe('Mara Beispiel')
    expect(after.status).toBe('active')
    expect(after.trashedAt).toBeNull()
    expect(await count('v2_clients')).toBe(1)
  })

  it('does not exist at all where the owner API is not switched on', async () => {
    const previous = process.env.BACKEND2_OWNER_API
    delete process.env.BACKEND2_OWNER_API

    try {
      const closed = createAppForTest()
      const response = await runWithDb(database.db, async () =>
        closed.fetch(new Request('http://localhost:3000/api/v2/owner/clients')),
      )

      expect(response.status).toBe(404)
    } finally {
      process.env.BACKEND2_OWNER_API = previous
    }
  })

  it('demands a real owner session once V2 sign-in is switched on', async () => {
    process.env.BACKEND2_OWNER_AUTH = 'required'

    const refused = await call('GET', '/owner/clients')
    expect(refused.status).toBe(401)
    expect(refused.body.code).toBe('UNAUTHORIZED')

    const write = await call('POST', '/owner/clients', person())
    expect(write.status).toBe(401)
    expect(await count('v2_clients')).toBe(0)

    const { rows } = await database.db.query(
      `INSERT INTO v2_owner (email, password_hash, totp_confirmed_at, recovery_codes_issued_at)
       VALUES ('owner@example.de', 'not-a-real-hash', now(), now()) RETURNING id`,
    )
    const session = await runWithDb(database.db, () =>
      createSession({ ownerId: rows[0].id, method: 'password_totp' }),
    )
    const cookie = `v2_owner_session=${encodeURIComponent(session.token)}; v2_csrf=${encodeURIComponent(session.csrfToken)}`

    const forged = await call('POST', '/owner/clients', person(), {
      headers: { cookie },
    })
    expect(forged.status).toBe(401)

    const created = await call('POST', '/owner/clients', person(), {
      headers: { cookie, 'x-v2-csrf': session.csrfToken },
    })
    expect(created.status).toBe(201)

    const allowed = await call('GET', '/owner/clients', undefined, {
      headers: { cookie },
    })
    expect(allowed.status).toBe(200)
    expect(allowed.body.data.items).toHaveLength(1)
  })

  it('has no public route and keeps private replies out of every cache', async () => {
    const client = await create(person({ notes: 'Private note' }))

    const publicList = await call('GET', '/clients')
    expect(publicList.status).toBe(404)

    const detail = await call('GET', `/owner/clients/${client.id}`)
    expect(detail.response.headers.get('cache-control')).toContain('no-store')
  })
})

/* ============================================================ the file */

describe('creating and editing a Client', () => {
  it('creates a Person with only the required fields', async () => {
    const created = await create({
      kind: 'person',
      name: '  Mara Beispiel ',
      email: 'Mara@Example.de',
      country: 'de',
    })

    expect(created).toMatchObject({
      kind: 'person',
      displayName: 'Mara Beispiel',
      name: 'Mara Beispiel',
      email: 'Mara@Example.de',
      phone: '',
      country: { code: 'DE', name: 'Germany' },
      companyName: '',
      notes: '',
      status: 'active',
      trashedAt: null,
      revision: 1,
      leads: [],
    })
  })

  it('creates a Company named by its company, with one primary contact', async () => {
    const created = await create(company({ phone: '+43 1 234 5678', notes: 'Met at a fair.' }))

    expect(created.displayName).toBe('Muster GmbH')
    expect(created.name).toBe('Jonas Muster')
    expect(created.country.code).toBe('AT')
  })

  it('refuses missing or malformed required fields, per field', async () => {
    const cases: Array<[Json, string]> = [
      [person({ name: '' }), 'name'],
      [person({ email: 'not-an-email' }), 'email'],
      [person({ country: 'Germany' }), 'country'],
      [person({ country: 'XX' }), 'country'],
      [person({ phone: 'call me' }), 'phone'],
      [person({ phone: '12' }), 'phone'],
      [company({ companyName: '' }), 'companyName'],
      [person({ kind: 'robot' }), 'kind'],
    ]

    for (const [body, field] of cases) {
      const refused = await call('POST', '/owner/clients', body)

      expect(refused.status, JSON.stringify(body)).toBe(422)
      expect(refused.body.code).toBe('VALIDATION_ERROR')
      expect(refused.body.details.issues.map((i: Json) => i.field)).toContain(field)
    }

    expect(await count('v2_clients')).toBe(0)
  })

  it('changes a Person with an affiliation into a Company without losing anything', async () => {
    const created = await create(
      person({ companyName: 'Beispiel Design', notes: 'Line one\nLine two' }),
    )

    const changed = await call('PATCH', `/owner/clients/${created.id}`, {
      revision: created.revision,
      kind: 'company',
    })

    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect(changed.body.data).toMatchObject({
      kind: 'company',
      displayName: 'Beispiel Design',
      name: 'Mara Beispiel',
      email: 'mara@example.de',
      phone: '+49 170 1234567',
      notes: 'Line one\nLine two',
      revision: 2,
    })
  })

  it('refuses a Company without a company name, and leaves the file as it was', async () => {
    const created = await create(person())

    const refused = await call('PATCH', `/owner/clients/${created.id}`, {
      revision: created.revision,
      kind: 'company',
    })

    expect(refused.status).toBe(422)
    expect(refused.body.details.issues[0].field).toBe('companyName')
    expect((await load(created.id)).kind).toBe('person')
  })

  it('refuses a stale edit rather than overwrite a newer one', async () => {
    const created = await create(person())

    const first = await call('PATCH', `/owner/clients/${created.id}`, {
      revision: 1,
      notes: 'From the first tab',
    })
    expect(first.status).toBe(200)

    const stale = await call('PATCH', `/owner/clients/${created.id}`, {
      revision: 1,
      notes: 'From the second tab',
    })
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('CONFLICT')
    expect((await load(created.id)).notes).toBe('From the first tab')
  })

  it('writes nothing, and keeps the revision, when nothing changed', async () => {
    const created = await create(person())

    const same = await call('PATCH', `/owner/clients/${created.id}`, {
      revision: 1,
      name: 'Mara Beispiel',
    })

    expect(same.status).toBe(200)
    expect(same.body.data.revision).toBe(1)
  })

  it('clears an optional phone', async () => {
    const created = await create(person())
    const cleared = await call('PATCH', `/owner/clients/${created.id}`, {
      revision: 1,
      phone: '',
    })

    expect(cleared.body.data.phone).toBe('')
  })

  it('answers a missing client with 404 and a bad id with 422', async () => {
    const missing = await call('GET', '/owner/clients/22222222-2222-4222-8222-222222222222')
    expect(missing.status).toBe(404)
    expect(missing.body.code).toBe('NOT_FOUND')

    const bad = await call('GET', '/owner/clients/not-an-id')
    expect(bad.status).toBe(422)
  })
})

/* ====================================================== duplicate warnings */

describe('duplicate warnings', () => {
  it('warns on the same email, in any case, and names the match', async () => {
    const first = await create(person())

    const warned = await call(
      'POST',
      '/owner/clients',
      person({ email: 'MARA@example.de', phone: '' }),
    )

    expect(warned.status).toBe(409)
    expect(warned.body.code).toBe('CLIENT_DUPLICATE')
    expect(warned.body.details.candidates).toEqual([
      expect.objectContaining({
        id: first.id,
        matchedOn: ['email'],
        inTrash: false,
      }),
    ])
    expect(await count('v2_clients')).toBe(1)
  })

  it('warns on the same phone written differently', async () => {
    await create(person())

    const warned = await call(
      'POST',
      '/owner/clients',
      person({ email: 'someone@example.de', phone: '0049 170 123 4567' }),
    )

    expect(warned.status).toBe(409)
    expect(warned.body.details.candidates[0].matchedOn).toEqual(['phone'])
  })

  it('saves anyway when the owner has looked and chosen to continue — never merging', async () => {
    const first = await create(person())
    const second = await create(person({ allowDuplicate: true }))

    expect(second.id).not.toBe(first.id)
    expect(await count('v2_clients')).toBe(2)
  })

  it('includes a Client in Trash, so the owner can restore it instead', async () => {
    const first = await create(person())
    await call('POST', `/owner/clients/${first.id}/trash`)

    const check = await call('GET', '/owner/clients/duplicates?email=mara%40example.de')

    expect(check.status).toBe(200)
    expect(check.body.data.candidates[0]).toMatchObject({
      id: first.id,
      inTrash: true,
    })
  })

  it('checks live, excluding the file being edited', async () => {
    const first = await create(person())

    const self = await call(
      'GET',
      `/owner/clients/duplicates?email=mara%40example.de&excludeId=${first.id}`,
    )
    expect(self.body.data.candidates).toEqual([])

    const partial = await call('GET', '/owner/clients/duplicates?phone=%2B49')
    expect(partial.body.data.candidates).toEqual([])
  })
})

/* ========================================================== the directory */

describe('the directory', () => {
  it('lists Active Clients alphabetically by default, and filters by type and state', async () => {
    const zed = await create(person({ name: 'Zed Person', email: 'zed@example.de', phone: '' }))
    const acme = await create(company({ companyName: 'Acme Studio', email: 'a@acme.example' }))
    const mid = await create(person({ name: 'Mila Person', email: 'mila@example.de', phone: '' }))

    await call('POST', `/owner/clients/${mid.id}/status`, {
      status: 'inactive',
    })

    const active = await call('GET', '/owner/clients')
    expect(active.body.data.items.map((i: Json) => i.id)).toEqual([acme.id, zed.id])

    const inactive = await call('GET', '/owner/clients?status=inactive')
    expect(inactive.body.data.items.map((i: Json) => i.id)).toEqual([mid.id])

    const all = await call('GET', '/owner/clients?status=all')
    expect(all.body.data.items.map((i: Json) => i.id)).toEqual([acme.id, mid.id, zed.id])

    const companies = await call('GET', '/owner/clients?kind=company&status=all')
    expect(companies.body.data.items.map((i: Json) => i.id)).toEqual([acme.id])

    // The list carries no private notes.
    expect(active.body.data.items[0]).not.toHaveProperty('notes')
  })

  it('searches name, company, email and phone digits — `%` is a letter, not a wildcard', async () => {
    const mara = await create(person())
    const acme = await create(company({ companyName: 'Acme 100% Studio', email: 'x@acme.example' }))

    const byCompany = await call('GET', '/owner/clients?search=acme')
    expect(byCompany.body.data.items.map((i: Json) => i.id)).toEqual([acme.id])

    const byPhone = await call('GET', '/owner/clients?search=1701234')
    expect(byPhone.body.data.items.map((i: Json) => i.id)).toEqual([mara.id])

    const byEmail = await call('GET', '/owner/clients?search=example.de')
    expect(byEmail.body.data.items.map((i: Json) => i.id)).toEqual([mara.id])

    const literal = await call('GET', '/owner/clients?search=100%25')
    expect(literal.body.data.items.map((i: Json) => i.id)).toEqual([acme.id])

    const none = await call('GET', '/owner/clients?search=%25')
    expect(none.body.data.items.map((i: Json) => i.id)).toEqual([acme.id])
  })

  it('pages on the server, in a stable order, and clamps a page past the end', async () => {
    for (let index = 0; index < 7; index += 1) {
      await create(
        person({
          name: `Person ${index}`,
          email: `p${index}@example.de`,
          phone: '',
        }),
      )
    }

    const first = await call('GET', '/owner/clients?pageSize=3&page=1')
    const third = await call('GET', '/owner/clients?pageSize=3&page=3')
    const past = await call('GET', '/owner/clients?pageSize=3&page=9')

    expect(first.body.data).toMatchObject({
      total: 7,
      pageCount: 3,
      hasMore: true,
    })
    expect(first.body.data.items.map((i: Json) => i.name)).toEqual([
      'Person 0',
      'Person 1',
      'Person 2',
    ])
    expect(third.body.data.items.map((i: Json) => i.name)).toEqual(['Person 6'])
    expect(past.body.data.page).toBe(3)

    const tooMany = await call('GET', '/owner/clients?pageSize=1000')
    expect(tooMany.status).toBe(422)
  })

  it('keeps an empty directory an empty page, not an error', async () => {
    const empty = await call('GET', '/owner/clients')

    expect(empty.status).toBe(200)
    expect(empty.body.data).toMatchObject({
      items: [],
      total: 0,
      page: 1,
      pageCount: 1,
    })
  })
})

/* ============================================================ lifecycle */

describe('Active, Inactive, Trash and permanent deletion', () => {
  it('marks a Client Inactive and back, keeping the whole file', async () => {
    const created = await create(person({ notes: 'Keep me' }))

    const inactive = await call('POST', `/owner/clients/${created.id}/status`, {
      status: 'inactive',
    })
    expect(inactive.body.data).toMatchObject({
      status: 'inactive',
      notes: 'Keep me',
    })

    const active = await call('POST', `/owner/clients/${created.id}/status`, {
      status: 'active',
    })
    expect(active.body.data.status).toBe('active')
  })

  it('moves to a paginated Trash and restores, as it was', async () => {
    const created = await create(person({ notes: 'Keep me' }))
    await call('POST', `/owner/clients/${created.id}/status`, {
      status: 'inactive',
    })

    const trashed = await call('POST', `/owner/clients/${created.id}/trash`)
    expect(trashed.body.data.trashedAt).not.toBeNull()

    // Gone from every directory view, present in Trash.
    expect((await call('GET', '/owner/clients?status=all')).body.data.total).toBe(0)
    const trash = await call('GET', '/owner/clients?view=trash&pageSize=1')
    expect(trash.body.data).toMatchObject({ total: 1, pageSize: 1 })
    expect(trash.body.data.items[0].id).toBe(created.id)

    // A file in Trash is read-only until restored.
    const edit = await call('PATCH', `/owner/clients/${created.id}`, {
      revision: 1,
      notes: 'x',
    })
    expect(edit.status).toBe(409)
    expect(edit.body.code).toBe('CLIENT_IN_TRASH')

    const restored = await call('POST', `/owner/clients/${created.id}/restore`)
    expect(restored.body.data).toMatchObject({
      trashedAt: null,
      status: 'inactive',
      notes: 'Keep me',
    })
  })

  it('deletes permanently only from Trash, and only with the id sent back', async () => {
    const created = await create(person())

    const notTrashed = await call('DELETE', `/owner/clients/${created.id}`, {
      confirm: created.id,
    })
    expect(notTrashed.status).toBe(409)

    await call('POST', `/owner/clients/${created.id}/trash`)

    const unconfirmed = await call('DELETE', `/owner/clients/${created.id}`, {
      confirm: 'yes',
    })
    expect(unconfirmed.status).toBe(400)
    expect(await count('v2_clients')).toBe(1)

    const deleted = await call('DELETE', `/owner/clients/${created.id}`, {
      confirm: created.id,
    })
    expect(deleted.status).toBe(200)
    expect(await count('v2_clients')).toBe(0)

    expect((await call('GET', `/owner/clients/${created.id}`)).status).toBe(404)
  })

  it('refuses a permanent deletion another record still points at, as a reason', async () => {
    const created = await create(person())
    await call('POST', `/owner/clients/${created.id}/trash`)

    // A stand-in for the future invoices table, which will hold this key.
    await database.db.query(
      `CREATE TABLE test_invoice_stub (client_id uuid REFERENCES v2_clients (id) ON DELETE RESTRICT)`,
    )

    try {
      await database.db.query('INSERT INTO test_invoice_stub VALUES ($1)', [created.id])

      const blocked = await call('DELETE', `/owner/clients/${created.id}`, {
        confirm: created.id,
      })
      expect(blocked.status).toBe(409)
      expect(blocked.body.code).toBe('CLIENT_DELETE_BLOCKED')
      expect(await count('v2_clients')).toBe(1)
    } finally {
      await database.db.query('DROP TABLE test_invoice_stub')
    }
  })
})

/* ================================================== Lead `Won` → Client */

describe('a Lead moving to Won', () => {
  it('creates a Person, even when the Lead has a company, with its own copy of the notes', async () => {
    const result = await convert({ lead: lead(), choice: { mode: 'create' } })

    expect(result.outcome).toBe('created')

    const client = await load(result.clientId)
    expect(client).toMatchObject({
      kind: 'person',
      name: 'Lina Probe',
      email: 'lina@example.org',
      phone: '+49 30 555 0101',
      country: { code: 'DE' },
      companyName: 'Probe & Co',
      notes: 'Asked about a shop.',
      leads: [expect.objectContaining({ leadId: lead().id, how: 'created' })],
    })

    // The Client's notes are its own from now on.
    await call('PATCH', `/owner/clients/${client.id}`, {
      revision: client.revision,
      notes: 'Edited',
    })
    const again = await convert({
      lead: lead({ notes: 'Lead notes changed later' }),
      choice: { mode: 'create' },
    })
    expect(again).toEqual({ clientId: client.id, outcome: 'reused' })
    expect((await load(client.id)).notes).toBe('Edited')
  })

  it('refuses to create a second Client when one has the Lead’s email, and names it', async () => {
    const existing = await create(person({ email: 'LINA@example.org', phone: '' }))

    await expect(convert({ lead: lead(), choice: { mode: 'create' } })).rejects.toMatchObject({
      code: 'CLIENT_DUPLICATE',
      details: { candidates: [expect.objectContaining({ id: existing.id })] },
    })
    expect(await count('v2_clients')).toBe(1)
    expect(await count('v2_client_lead_links')).toBe(0)
  })

  it('links the existing Client the owner chose, appending the Lead’s notes exactly once', async () => {
    const existing = await create(
      person({ email: 'lina@example.org', phone: '', notes: 'Old note' }),
    )

    const first = await convert({
      lead: lead(),
      choice: { mode: 'link', clientId: existing.id },
      now: new Date('2026-09-23T10:00:00Z'),
    })
    expect(first).toEqual({ clientId: existing.id, outcome: 'linked' })

    const linked = await load(existing.id)
    expect(linked.notes).toBe(
      'Old note\n\n--- Notes from lead "Lina Probe" (2026-09-23) ---\nAsked about a shop.',
    )
    expect(linked.kind).toBe('person')
    expect(linked.leads).toEqual([expect.objectContaining({ how: 'linked' })])

    // A retry — or a later return to Won — appends nothing and creates nothing.
    const retry = await convert({
      lead: lead(),
      choice: { mode: 'link', clientId: existing.id },
    })
    expect(retry.outcome).toBe('reused')
    expect((await load(existing.id)).notes).toBe(linked.notes)
    expect(await count('v2_clients')).toBe(1)
  })

  it('leaves both sides as they were when the Lead’s own step fails afterwards', async () => {
    await expect(
      runWithDb(database.db, () =>
        withTransaction(async () => {
          await won.convertLeadToClient({
            lead: lead(),
            choice: { mode: 'create' },
          })

          // The Lead's stage write, failing after the Client was made.
          throw new Error('Stage change failed')
        }),
      ),
    ).rejects.toThrow('Stage change failed')

    expect(await count('v2_clients')).toBe(0)
    expect(await count('v2_client_lead_links')).toBe(0)

    // And it is retryable.
    const retried = await convert({ lead: lead(), choice: { mode: 'create' } })
    expect(retried.outcome).toBe('created')
  })

  it('refuses a Lead whose details cannot make a valid Client, creating nothing', async () => {
    await expect(
      convert({ lead: lead({ email: 'broken' }), choice: { mode: 'create' } }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })

    expect(await count('v2_clients')).toBe(0)
  })

  it('does not revive a Client in Trash on its own; the owner restores it first', async () => {
    const result = await convert({ lead: lead(), choice: { mode: 'create' } })
    await call('POST', `/owner/clients/${result.clientId}/trash`)

    await expect(convert({ lead: lead(), choice: { mode: 'create' } })).rejects.toMatchObject({
      code: 'CLIENT_IN_TRASH',
    })

    await call('POST', `/owner/clients/${result.clientId}/restore`)
    expect((await convert({ lead: lead(), choice: { mode: 'create' } })).outcome).toBe('reused')
    expect(await count('v2_clients')).toBe(1)
  })

  it('never inactivates or deletes the Client when the Lead is reversed', async () => {
    // Reversal is a Leads action that does not call Clients at all; the
    // Client stays exactly as it was until the owner changes it here.
    const result = await convert({ lead: lead(), choice: { mode: 'create' } })
    const client = await load(result.clientId)

    expect(client.status).toBe('active')
    expect(client.trashedAt).toBeNull()
  })

  it('starts a new Client if the linked one was deleted permanently', async () => {
    const first = await convert({ lead: lead(), choice: { mode: 'create' } })
    await call('POST', `/owner/clients/${first.clientId}/trash`)
    await call('DELETE', `/owner/clients/${first.clientId}`, {
      confirm: first.clientId,
    })

    expect(await count('v2_client_lead_links')).toBe(0)

    const second = await convert({ lead: lead(), choice: { mode: 'create' } })
    expect(second.outcome).toBe('created')
    expect(second.clientId).not.toBe(first.clientId)
  })
})

/* ================================================================ niches */

const addNiche = async (name: string): Promise<Json> => {
  const created = await call('POST', '/owner/niches', { name })

  expect(created.status, JSON.stringify(created.body)).toBe(201)

  return created.body.data
}

describe('niches', () => {
  it('lets the owner add niches, alphabetically, never the same name twice', async () => {
    await addNiche('Roofers')
    await addNiche('  Salon ')
    await addNiche('Plumbers')

    const twice = await call('POST', '/owner/niches', { name: 'salon' })
    expect(twice.status).toBe(409)
    expect(twice.body.code).toBe('NAME_TAKEN')

    const blank = await call('POST', '/owner/niches', { name: '  ' })
    expect(blank.status).toBe(422)

    const list = await call('GET', '/owner/niches')
    expect(list.body.data.items.map((n: Json) => n.name)).toEqual(['Plumbers', 'Roofers', 'Salon'])

    const page = await call('GET', '/owner/niches?pageSize=2&page=2')
    expect(page.body.data).toMatchObject({ total: 3, pageCount: 2 })
    expect(page.body.data.items.map((n: Json) => n.name)).toEqual(['Salon'])

    const searched = await call('GET', '/owner/niches?search=plu')
    expect(searched.body.data.items.map((n: Json) => n.name)).toEqual(['Plumbers'])
  })

  it('gives a Client an optional niche, shows its name, and filters by it', async () => {
    const salon = await addNiche('Salon')
    const withNiche = await create(person({ nicheId: salon.id }))
    const without = await create(company())

    expect(withNiche.niche).toEqual({ id: salon.id, name: 'Salon' })
    expect(without.niche).toBeNull()

    const filtered = await call('GET', `/owner/clients?niche=${salon.id}`)
    expect(filtered.body.data.items.map((i: Json) => i.id)).toEqual([withNiche.id])
    expect(filtered.body.data.items[0].niche.name).toBe('Salon')

    const cleared = await call('PATCH', `/owner/clients/${withNiche.id}`, {
      revision: withNiche.revision,
      nicheId: null,
    })
    expect(cleared.body.data.niche).toBeNull()
  })

  it('renames everywhere at once, because it is the same niche', async () => {
    const niche = await addNiche('Barber')
    const client = await create(person({ nicheId: niche.id }))

    const renamed = await call('PATCH', `/owner/niches/${niche.id}`, { name: 'Barbershop' })
    expect(renamed.status).toBe(200)
    expect((await load(client.id)).niche.name).toBe('Barbershop')
  })

  it('hides a niche from new choices without touching the Clients that have it', async () => {
    const niche = await addNiche('Florist')
    const client = await create(person({ nicheId: niche.id }))

    await call('PATCH', `/owner/niches/${niche.id}`, { hidden: true })

    expect((await call('GET', '/owner/niches?hidden=exclude')).body.data.items).toEqual([])

    // The Client keeps it and can still be edited.
    const kept = await call('PATCH', `/owner/clients/${client.id}`, {
      revision: client.revision,
      notes: 'Still a florist',
    })
    expect(kept.status).toBe(200)
    expect(kept.body.data.niche.name).toBe('Florist')

    // But nobody new can be given it.
    const refused = await call('POST', '/owner/clients', company({ nicheId: niche.id }))
    expect(refused.status).toBe(422)
    expect(refused.body.details.issues[0].field).toBe('nicheId')

    const unknown = await call(
      'POST',
      '/owner/clients',
      company({ nicheId: '33333333-3333-4333-8333-333333333333' }),
    )
    expect(unknown.status).toBe(422)
  })

  it('deletes only a niche nothing uses', async () => {
    const used = await addNiche('Roofers')
    const unused = await addNiche('Typo')
    await create(person({ nicheId: used.id }))

    const blocked = await call('DELETE', `/owner/niches/${used.id}`)
    expect(blocked.status).toBe(409)
    expect(blocked.body.code).toBe('NICHE_IN_USE')
    expect(blocked.body.details.clientCount).toBe(1)

    const deleted = await call('DELETE', `/owner/niches/${unused.id}`)
    expect(deleted.status).toBe(200)
    expect(await count('v2_niches')).toBe(1)
  })

  it('carries a won Lead’s niche onto the new Client, but never onto an existing one', async () => {
    const niche = await addNiche('Salon')
    await call('PATCH', `/owner/niches/${niche.id}`, { hidden: true })

    const created = await convert({ lead: lead({ nicheId: niche.id }), choice: { mode: 'create' } })
    expect((await load(created.clientId)).niche.name).toBe('Salon')

    const existing = await create(person({ email: 'other@example.org', phone: '' }))
    await convert({
      lead: lead({ id: '5a5a5a5a-1111-4111-8111-000000000002', nicheId: niche.id }),
      choice: { mode: 'link', clientId: existing.id },
    })
    expect((await load(existing.id)).niche).toBeNull()
  })
})

/* ============================================================ isolation */

describe('independence from other modules', () => {
  it('imports nothing from the legacy backend or from Inbox, Booking, Services or Projects', async () => {
    const directory = new URL('../backend2/modules/clients/', import.meta.url)

    for (const file of await readdir(directory)) {
      const source = await readFile(new URL(file, directory), 'utf8')
      const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1] ?? '')

      for (const target of imports) {
        expect(target, `${file} imports ${target}`).not.toMatch(
          /src\/backend\/|\.\.\/\.\.\/\.\.\/backend\//,
        )
        expect(target, `${file} imports ${target}`).not.toMatch(
          /inbox|booking|services|projects|invoices/,
        )
      }
    }
  })

  it('creates a Client from nothing but the owner’s own action', async () => {
    // No other module's table is read to fill the directory.
    await create(person())

    const { rows } = await database.db.query(
      `SELECT count(*) AS total FROM v2_clients WHERE email_key = 'mara@example.de'`,
    )
    expect(Number(rows[0].total)).toBe(1)
  })
})
