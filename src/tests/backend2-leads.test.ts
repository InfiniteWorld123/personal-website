import { readFile, readdir } from 'node:fs/promises'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from './helpers/backend2-db'

/**
 * Leads, end to end, against a real PostgreSQL running inside this process.
 *
 * `docs/v2/leads.md`. Under test: the owner's own lists (stages, sources,
 * reasons) and what they refuse, the Lost and Won rules — Won creating or
 * linking exactly one Client, or nothing at all — one follow-up at a time in
 * Berlin time, and a CSV import that rejects by row and never imports twice.
 *
 * Every contact here is fictional.
 */
process.env.DATABASE_URL = 'postgres://legacy.invalid/legacy'
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
delete process.env.BACKEND2_OWNER_AUTH

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { createSession } = await import('#/backend2/auth/session')
const { ownerLeadPaths } = await import('#/backend2/modules/leads/lead.owner.route')
const contract = await import('#/backend2/contracts/lead.contract')
const csv = await import('#/backend2/modules/leads/csv')

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
): Promise<{ status: number; body: Json; text: string; response: Response }> => {
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
  let json: Json = {}

  try {
    json = text === '' ? {} : (JSON.parse(text) as Json)
  } catch {
    json = {}
  }

  return { status: response.status, body: json, text, response }
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

const stages = async (): Promise<Json[]> => (await ok('GET', '/owner/leads/stages')) as Json[]
const stageOf = async (kind: string): Promise<Json> =>
  (await stages()).find((s) => s.kind === kind)!
const sources = async (): Promise<Json[]> =>
  (await ok('GET', '/owner/leads/sources?pageSize=100')).items
const reasons = async (): Promise<Json[]> =>
  (await ok('GET', '/owner/leads/loss-reasons?pageSize=100')).items
const sourceNamed = async (name: string): Promise<Json> =>
  (await sources()).find((s) => s.name === name)!

let counter = 0

const leadBody = async (over: Json = {}): Promise<Json> => {
  counter += 1

  return {
    name: `Lina Probe ${counter}`,
    email: `lina${counter}@example.org`,
    phone: `+49 30 555 ${String(1000 + counter)}`,
    country: 'DE',
    sourceId: (await sourceNamed('Instagram')).id,
    company: 'Probe & Co',
    notes: 'Asked about a shop.',
    ...over,
  }
}

const createLead = async (over: Json = {}): Promise<Json> =>
  ok('POST', '/owner/leads', await leadBody(over), 201)

const move = (id: string, body: Json) => call('POST', `/owner/leads/${id}/stage`, body)

/* ======================================================== pure rules */

describe('the rules that need no database', () => {
  it('reads Berlin wall-clock time across both daylight-saving changes', () => {
    // Summer: UTC+2. Winter: UTC+1.
    expect(contract.fromBerlin('2026-07-01', '09:00').toISOString()).toBe(
      '2026-07-01T07:00:00.000Z',
    )
    expect(contract.fromBerlin('2026-12-01', '09:00').toISOString()).toBe(
      '2026-12-01T08:00:00.000Z',
    )
    // 02:30 on 29 Mar 2026 does not exist; a clock shows 03:30.
    expect(contract.toBerlin(contract.fromBerlin('2026-03-29', '02:30'))).toEqual({
      date: '2026-03-29',
      time: '03:30',
    })
    // 02:30 on 25 Oct 2026 happens twice; the first one is meant.
    expect(contract.fromBerlin('2026-10-25', '02:30').toISOString()).toBe(
      '2026-10-25T00:30:00.000Z',
    )
    expect(contract.toBerlin(new Date('2026-10-25T00:30:00Z'))).toEqual({
      date: '2026-10-25',
      time: '02:30',
    })
  })

  it('reads CSV with quotes, line breaks, semicolons and a byte-order mark', () => {
    const parsed = csv.parseCsv(
      '﻿Name;Email;Notes\r\n"Probe; Lina";lina@example.org;"Line one\nLine ""two"""\r\n\r\n',
    )

    expect(parsed.header).toEqual(['Name', 'Email', 'Notes'])
    expect(parsed.rows).toEqual([['Probe; Lina', 'lina@example.org', 'Line one\nLine "two"']])
  })

  it('writes a report a spreadsheet cannot run as a formula', () => {
    expect(csv.writeCsv([['=HYPERLINK("x")', 'ok']])).toBe(`"'=HYPERLINK(""x"")",ok\r\n`)
    expect(csv.writeCsv([['+49 170 1234567', '-SUM(A1)', '@x']])).toBe(`+49 170 1234567,'-SUM(A1),'@x\r\n`)
  })
})

/* ====================================================== the owner boundary */

describe('the owner boundary', () => {
  it('answers 404 — never 401 — on every Leads route from a non-local host', async () => {
    const lead = await createLead()

    for (const route of ownerLeadPaths) {
      const path = route.path
        .replace('/api/v2', '')
        .replace('11111111-1111-4111-8111-111111111111', lead.id)
      const refused = await call(
        route.method,
        path,
        route.method === 'GET' ? undefined : { name: 'x', confirm: lead.id },
        {
          host: 'yamanwarda.de',
        },
      )

      expect(refused.status, `${route.method} ${path}`).toBe(404)
    }

    expect(await count('v2_leads')).toBe(1)
    expect(await count('v2_leads', 'WHERE trashed_at IS NOT NULL')).toBe(0)
  })

  it('demands a real owner session once V2 sign-in is switched on', async () => {
    process.env.BACKEND2_OWNER_AUTH = 'required'

    expect((await call('GET', '/owner/leads')).status).toBe(401)
    expect((await call('GET', '/owner/leads/sources')).status).toBe(401)
    expect((await call('POST', '/owner/leads/imports/preview', { csv: 'a\nb' })).status).toBe(401)

    const { rows } = await database.db.query(
      `INSERT INTO v2_owner (email, password_hash, totp_confirmed_at, recovery_codes_issued_at)
       VALUES ('owner@example.de', 'not-a-real-hash', now(), now()) RETURNING id`,
    )
    const session = await runWithDb(database.db, () =>
      createSession({ ownerId: rows[0].id, method: 'password_totp' }),
    )
    const cookie = `v2_owner_session=${encodeURIComponent(session.token)}; v2_csrf=${encodeURIComponent(session.csrfToken)}`

    const allowed = await call('GET', '/owner/leads', undefined, { headers: { cookie } })
    expect(allowed.status).toBe(200)
  })

  it('has no public Lead route', async () => {
    expect((await call('GET', '/leads')).status).toBe(404)
  })
})

/* ================================================= the owner's own lists */

describe('stages, sources and lost reasons', () => {
  it('starts with the four permanent stages in their fixed places', async () => {
    const list = await stages()

    expect(list.map((s) => [s.kind, s.name])).toEqual([
      ['new', 'New'],
      ['contacted', 'Contacted'],
      ['won', 'Won'],
      ['lost', 'Lost'],
    ])
    // A migration carries no rows; the defaults are written on first use.
    expect(await count('v2_lead_stages')).toBe(4)
  })

  it('adds custom stages among the active ones, reorders and renames them', async () => {
    await ok('POST', '/owner/leads/stages', { name: 'Qualified' }, 201)
    const withProposal = await ok('POST', '/owner/leads/stages', { name: 'Proposal sent' }, 201)

    expect(withProposal.map((s: Json) => s.name)).toEqual([
      'New',
      'Contacted',
      'Qualified',
      'Proposal sent',
      'Won',
      'Lost',
    ])

    const qualified = withProposal.find((s: Json) => s.name === 'Qualified')
    const moved = await ok('PATCH', `/owner/leads/stages/${qualified.id}`, {
      position: 1,
      name: 'Qualified lead',
    })

    expect(moved.map((s: Json) => s.name)).toEqual([
      'New',
      'Qualified lead',
      'Contacted',
      'Proposal sent',
      'Won',
      'Lost',
    ])

    // The same id, so no Lead loses its place when a stage is renamed.
    expect(moved.find((s: Json) => s.name === 'Qualified lead').id).toBe(qualified.id)
  })

  it('keeps the permanent stages as they are', async () => {
    const won = await stageOf('won')
    const contacted = await stageOf('contacted')

    const rename = await call('PATCH', `/owner/leads/stages/${won.id}`, { name: 'Closed' })
    expect(rename.status).toBe(409)
    expect(rename.body.code).toBe('CHOICE_LOCKED')

    expect((await call('PATCH', `/owner/leads/stages/${won.id}`, { position: 1 })).body.code).toBe(
      'CHOICE_LOCKED',
    )
    expect((await call('DELETE', `/owner/leads/stages/${contacted.id}`)).body.code).toBe(
      'CHOICE_LOCKED',
    )

    const taken = await call('POST', '/owner/leads/stages', { name: 'won' })
    expect(taken.body.code).toBe('NAME_TAKEN')
  })

  it('deletes a custom stage only once no Lead — Trash included — is in it', async () => {
    const [custom] = (await ok('POST', '/owner/leads/stages', { name: 'Qualified' }, 201)).filter(
      (s: Json) => s.kind === 'custom',
    )
    const lead = await createLead()

    await ok('POST', `/owner/leads/${lead.id}/stage`, { stageId: custom.id })
    await ok('POST', `/owner/leads/${lead.id}/trash`)

    const blocked = await call('DELETE', `/owner/leads/stages/${custom.id}`)
    expect(blocked.status).toBe(409)
    expect(blocked.body.code).toBe('CHOICE_IN_USE')

    await ok('POST', `/owner/leads/${lead.id}/restore`)
    await ok('POST', `/owner/leads/${lead.id}/stage`, { stageId: (await stageOf('contacted')).id })

    const deleted = await ok('DELETE', `/owner/leads/stages/${custom.id}`)
    expect(deleted.map((s: Json) => s.kind)).toEqual(['new', 'contacted', 'won', 'lost'])
  })

  it('seeds sources once, with a locked Unknown, and keeps a deleted default deleted', async () => {
    const list = await sources()

    expect(list[0]).toMatchObject({ name: 'Unknown', locked: true })
    expect(list.map((s) => s.name)).toEqual(
      expect.arrayContaining(['WhatsApp', 'Google Maps', 'Purchased list', 'AI']),
    )

    const ai = list.find((s) => s.name === 'AI')!
    await ok('DELETE', `/owner/leads/sources/${ai.id}`)

    // Asked again: AI does not come back.
    expect((await sources()).some((s) => s.name === 'AI')).toBe(false)

    const unknown = list[0]!
    expect(
      (await call('PATCH', `/owner/leads/sources/${unknown.id}`, { hidden: true })).body.code,
    ).toBe('CHOICE_LOCKED')
    expect((await call('DELETE', `/owner/leads/sources/${unknown.id}`)).body.code).toBe(
      'CHOICE_LOCKED',
    )
  })

  it('hides a source from new Leads without changing the Leads that have it', async () => {
    const whatsapp = await sourceNamed('WhatsApp')
    const lead = await createLead({ sourceId: whatsapp.id })

    await ok('PATCH', `/owner/leads/sources/${whatsapp.id}`, { hidden: true })

    // Still named on the old Lead, and the old Lead can still be edited.
    const edited = await ok('PATCH', `/owner/leads/${lead.id}`, {
      revision: lead.revision,
      notes: 'Still from WhatsApp',
    })
    expect(edited.source.name).toBe('WhatsApp')

    // But not given to a new one.
    const refused = await call('POST', '/owner/leads', await leadBody({ sourceId: whatsapp.id }))
    expect(refused.status).toBe(422)
    expect(refused.body.details.issues[0].field).toBe('sourceId')

    // And not deleted while used.
    const blocked = await call('DELETE', `/owner/leads/sources/${whatsapp.id}`)
    expect(blocked.body.code).toBe('CHOICE_IN_USE')
    expect(blocked.body.details.leadCount).toBe(1)

    const visible = await ok('GET', '/owner/leads/sources?hidden=exclude&pageSize=100')
    expect(visible.items.some((s: Json) => s.name === 'WhatsApp')).toBe(false)
  })

  it('adds, renames and refuses a duplicate name among sources and reasons', async () => {
    const added = await ok('POST', '/owner/leads/sources', { name: 'LinkedIn' }, 201)
    await ok('PATCH', `/owner/leads/sources/${added.id}`, { name: 'LinkedIn DM' })

    expect((await call('POST', '/owner/leads/sources', { name: 'linkedin dm' })).body.code).toBe(
      'NAME_TAKEN',
    )

    const list = await reasons()
    expect(list[0]).toMatchObject({ name: 'Other', locked: true })
    expect(list.map((r) => r.name)).toEqual(
      expect.arrayContaining(['Not interested', 'No reply', 'Price']),
    )
  })
})

/* ============================================================ the file */

describe('creating and editing a Lead', () => {
  it('requires name, email, phone, country and source; company and notes are optional', async () => {
    const minimal = await ok(
      'POST',
      '/owner/leads',
      await leadBody({ company: undefined, notes: undefined }),
      201,
    )

    expect(minimal).toMatchObject({
      company: '',
      notes: '',
      stage: { kind: 'new' },
      followUp: null,
      client: null,
    })

    const cases: Array<[Json, string]> = [
      [{ name: '' }, 'name'],
      [{ email: 'nope' }, 'email'],
      [{ phone: '' }, 'phone'],
      [{ country: 'Germany' }, 'country'],
      [{ sourceId: undefined }, 'sourceId'],
    ]

    for (const [over, field] of cases) {
      const refused = await call('POST', '/owner/leads', await leadBody(over))

      expect(refused.status, JSON.stringify(over)).toBe(422)
      expect(refused.body.details.issues.map((i: Json) => i.field)).toContain(field)
    }
  })

  it('warns about the same email or phone on create and on edit, and saves when told to', async () => {
    const first = await createLead({ email: 'same@example.org', phone: '+49 170 1112223' })

    const byEmail = await call(
      'POST',
      '/owner/leads',
      await leadBody({ email: 'SAME@example.org' }),
    )
    expect(byEmail.status).toBe(409)
    expect(byEmail.body.code).toBe('LEAD_DUPLICATE')
    expect(byEmail.body.details.candidates[0]).toMatchObject({ id: first.id, matchedOn: ['email'] })

    const byPhone = await call(
      'POST',
      '/owner/leads',
      await leadBody({ phone: '0049 170 111 2223' }),
    )
    expect(byPhone.body.details.candidates[0].matchedOn).toEqual(['phone'])

    const anyway = await ok(
      'POST',
      '/owner/leads',
      { ...(await leadBody({ email: 'same@example.org' })), allowDuplicate: true },
      201,
    )
    expect(anyway.id).not.toBe(first.id)

    const second = await createLead()
    const edit = await call('PATCH', `/owner/leads/${second.id}`, {
      revision: second.revision,
      email: 'same@example.org',
    })
    expect(edit.body.code).toBe('LEAD_DUPLICATE')

    const editAnyway = await call('PATCH', `/owner/leads/${second.id}`, {
      revision: second.revision,
      email: 'same@example.org',
      allowDuplicate: true,
    })
    expect(editAnyway.status).toBe(200)
  })

  it('refuses a stale edit', async () => {
    const lead = await createLead()

    await ok('PATCH', `/owner/leads/${lead.id}`, { revision: 1, notes: 'First tab' })

    const stale = await call('PATCH', `/owner/leads/${lead.id}`, {
      revision: 1,
      notes: 'Second tab',
    })
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('CONFLICT')
  })

  it('gives a Lead an optional niche, and a niche a Lead uses cannot be deleted', async () => {
    const niche = await ok('POST', '/owner/niches', { name: 'Roofers' }, 201)
    const lead = await createLead({ nicheId: niche.id })

    expect(lead.niche).toEqual({ id: niche.id, name: 'Roofers' })

    const blocked = await call('DELETE', `/owner/niches/${niche.id}`)
    expect(blocked.body.code).toBe('NICHE_IN_USE')
    expect(blocked.body.details.leadCount).toBe(1)

    const listed = await ok('GET', `/owner/leads?niche=${niche.id}`)
    expect(listed.items.map((i: Json) => i.id)).toEqual([lead.id])
  })
})

/* ========================================================== the list */

describe('the list', () => {
  it('shows active, won and lost Leads apart, filters them and pages on the server', async () => {
    const a = await createLead({ name: 'Alpha Person', country: 'AT' })
    const b = await createLead({ name: 'Beta Person' })
    const c = await createLead({ name: 'Gamma Person' })

    await ok('POST', `/owner/leads/${b.id}/stage`, {
      stageId: (await stageOf('lost')).id,
      lost: { reasonId: (await reasons()).find((r) => r.name === 'Price')!.id },
    })

    const active = await ok('GET', '/owner/leads')
    expect(active.items.map((i: Json) => i.id)).toEqual([c.id, a.id])

    const lost = await ok('GET', '/owner/leads?view=lost')
    expect(lost.items.map((i: Json) => [i.id, i.lostReason])).toEqual([[b.id, 'Price']])

    expect((await ok('GET', '/owner/leads?country=at')).items.map((i: Json) => i.id)).toEqual([
      a.id,
    ])
    expect((await ok('GET', '/owner/leads?search=gamma')).items.map((i: Json) => i.id)).toEqual([
      c.id,
    ])

    const paged = await ok('GET', '/owner/leads?view=all&pageSize=2&page=2')
    expect(paged).toMatchObject({ total: 3, pageCount: 2, page: 2 })
    expect(paged.items).toHaveLength(1)

    // One Board column at a time, with its own page.
    const column = await ok('GET', `/owner/leads?stage=${(await stageOf('new')).id}&pageSize=1`)
    expect(column).toMatchObject({ total: 2, pageCount: 2 })

    expect((await call('GET', '/owner/leads?pageSize=500')).status).toBe(422)

    const withCounts = await stages()
    expect(withCounts.find((s) => s.kind === 'new')?.leadCount).toBe(2)
    expect(withCounts.find((s) => s.kind === 'lost')?.leadCount).toBe(1)
  })
})

/* ====================================================== Lost and Won */

describe('moving to Lost', () => {
  it('requires one reason, and a typed one for Other', async () => {
    const lead = await createLead()
    const lost = await stageOf('lost')
    const other = (await reasons()).find((r) => r.name === 'Other')!

    expect((await move(lead.id, { stageId: lost.id })).status).toBe(422)

    const untyped = await move(lead.id, { stageId: lost.id, lost: { reasonId: other.id } })
    expect(untyped.status).toBe(422)
    expect(untyped.body.details.issues[0].field).toBe('lost.reasonText')

    const moved = await move(lead.id, {
      stageId: lost.id,
      lost: { reasonId: other.id, reasonText: 'Moved abroad', notes: 'Maybe next year' },
    })
    expect(moved.status).toBe(200)
    expect(moved.body.data).toMatchObject({
      stage: { kind: 'lost' },
      lastLoss: { reason: 'Moved abroad', notes: 'Maybe next year' },
    })
  })

  it('cancels the open follow-up as a loss, and reopening keeps the reason as history only', async () => {
    const lead = await createLead()

    await ok(
      'POST',
      `/owner/leads/${lead.id}/follow-up`,
      { date: '2030-01-10', time: '10:00', note: 'Call' },
      201,
    )
    await ok('POST', `/owner/leads/${lead.id}/stage`, {
      stageId: (await stageOf('lost')).id,
      lost: { reasonId: (await reasons()).find((r) => r.name === 'No reply')!.id },
    })

    const afterLoss = await ok('GET', `/owner/leads/${lead.id}`)
    expect(afterLoss.followUp).toBeNull()
    expect(afterLoss.followUpHistory[0]).toMatchObject({ status: 'cancelled', closedHow: 'lost' })

    const reopened = await ok('POST', `/owner/leads/${lead.id}/stage`, {
      stageId: (await stageOf('contacted')).id,
    })
    expect(reopened.stage.kind).toBe('contacted')
    expect(reopened.lastLoss.reason).toBe('No reply')
    // The old follow-up does not come back; the owner chooses a new one.
    expect(reopened.followUp).toBeNull()
  })
})

describe('moving to Won', () => {
  it('creates a Person Client with the Lead’s details and niche, and closes the follow-up as no longer needed', async () => {
    const niche = await ok('POST', '/owner/niches', { name: 'Salon' }, 201)
    const lead = await createLead({ nicheId: niche.id })

    await ok(
      'POST',
      `/owner/leads/${lead.id}/follow-up`,
      { date: '2030-01-10', time: '10:00' },
      201,
    )

    const won = await ok('POST', `/owner/leads/${lead.id}/stage`, {
      stageId: (await stageOf('won')).id,
      won: { mode: 'create' },
    })

    expect(won.stage.kind).toBe('won')
    expect(won.client).toMatchObject({ displayName: lead.name, inTrash: false })
    expect(won.followUp).toBeNull()
    expect(won.followUpHistory[0]).toMatchObject({ status: 'cancelled', closedHow: 'won' })

    const client = await ok('GET', `/owner/clients/${won.client.id}`)
    expect(client).toMatchObject({
      kind: 'person',
      name: lead.name,
      companyName: 'Probe & Co',
      niche: { name: 'Salon' },
      notes: 'Asked about a shop.',
      leads: [expect.objectContaining({ leadId: lead.id, how: 'created', leadName: lead.name })],
    })
  })

  it('needs the owner’s choice the first time, and stays where it was if the Client step fails', async () => {
    const lead = await createLead({ email: 'mara@example.de' })
    const wonStage = await stageOf('won')

    const unchosen = await move(lead.id, { stageId: wonStage.id })
    expect(unchosen.status).toBe(422)

    // A Client already has the email: create is refused, and nothing moves.
    const existing = await ok(
      'POST',
      '/owner/clients',
      { kind: 'person', name: 'Mara', email: 'mara@example.de', country: 'DE' },
      201,
    )
    await ok(
      'POST',
      `/owner/leads/${lead.id}/follow-up`,
      { date: '2030-01-10', time: '10:00' },
      201,
    )

    const refused = await move(lead.id, { stageId: wonStage.id, won: { mode: 'create' } })
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('CLIENT_DUPLICATE')
    expect(refused.body.details.candidates[0].id).toBe(existing.id)

    const still = await ok('GET', `/owner/leads/${lead.id}`)
    expect(still.stage.kind).toBe('new')
    expect(still.followUp).not.toBeNull()
    expect(await count('v2_clients')).toBe(1)

    // Linking works, and appends the notes once.
    const linked = await ok('POST', `/owner/leads/${lead.id}/stage`, {
      stageId: wonStage.id,
      won: { mode: 'link', clientId: existing.id },
    })
    expect(linked.client.id).toBe(existing.id)
    expect((await ok('GET', `/owner/clients/${existing.id}`)).notes).toContain(
      'Asked about a shop.',
    )
  })

  it('leaves the Client alone when the Lead is moved back, and reuses it on a second Won', async () => {
    const lead = await createLead()
    const wonStage = await stageOf('won')
    const first = await ok('POST', `/owner/leads/${lead.id}/stage`, {
      stageId: wonStage.id,
      won: { mode: 'create' },
    })

    await ok('POST', `/owner/leads/${lead.id}/stage`, { stageId: (await stageOf('contacted')).id })

    const client = await ok('GET', `/owner/clients/${first.client.id}`)
    expect(client.status).toBe('active')
    expect(client.trashedAt).toBeNull()

    // No choice needed now: the Lead already has its Client.
    const again = await ok('POST', `/owner/leads/${lead.id}/stage`, { stageId: wonStage.id })
    expect(again.client.id).toBe(first.client.id)
    expect(await count('v2_clients')).toBe(1)
    expect((await ok('GET', `/owner/clients/${first.client.id}`)).notes).toBe('Asked about a shop.')
  })
})

/* ========================================================= follow-ups */

describe('one follow-up at a time', () => {
  it('sets one in Berlin time, refuses a second, and moves or rewords it', async () => {
    const lead = await createLead()

    const set = await ok(
      'POST',
      `/owner/leads/${lead.id}/follow-up`,
      { date: '2030-07-01', time: '09:00', note: 'Call them' },
      201,
    )
    expect(set.followUp).toMatchObject({
      date: '2030-07-01',
      time: '09:00',
      dueAt: '2030-07-01T07:00:00.000Z',
      note: 'Call them',
      isDue: false,
    })

    const second = await call('POST', `/owner/leads/${lead.id}/follow-up`, {
      date: '2030-07-02',
      time: '09:00',
    })
    expect(second.status).toBe(409)
    expect(second.body.code).toBe('FOLLOW_UP_EXISTS')

    const postponed = await ok('PATCH', `/owner/leads/${lead.id}/follow-up`, { date: '2030-12-01' })
    expect(postponed.followUp).toMatchObject({
      date: '2030-12-01',
      time: '09:00',
      dueAt: '2030-12-01T08:00:00.000Z',
    })

    const done = await ok('POST', `/owner/leads/${lead.id}/follow-up/complete`)
    expect(done.followUp).toBeNull()
    expect(done.followUpHistory[0]).toMatchObject({ status: 'done', closedHow: 'completed' })

    // Now another may be set.
    await ok(
      'POST',
      `/owner/leads/${lead.id}/follow-up`,
      { date: '2031-01-05', time: '14:30' },
      201,
    )
    const cancelled = await ok('POST', `/owner/leads/${lead.id}/follow-up/cancel`)
    expect(cancelled.followUpHistory[0]).toMatchObject({ closedHow: 'cancelled' })

    expect(
      (await call('POST', `/owner/leads/${lead.id}/follow-up`, { date: '2031-02-30x', time: '9' }))
        .status,
    ).toBe(422)
  })

  it('lists open follow-ups soonest first, and counts the due ones for the notification', async () => {
    const overdue = await createLead({ name: 'Overdue' })
    const later = await createLead({ name: 'Later' })
    const trashed = await createLead({ name: 'Trashed' })

    await ok(
      'POST',
      `/owner/leads/${later.id}/follow-up`,
      { date: '2099-01-01', time: '09:00' },
      201,
    )
    await ok(
      'POST',
      `/owner/leads/${overdue.id}/follow-up`,
      { date: '2020-01-01', time: '09:00' },
      201,
    )
    await ok(
      'POST',
      `/owner/leads/${trashed.id}/follow-up`,
      { date: '2020-01-02', time: '09:00' },
      201,
    )
    await ok('POST', `/owner/leads/${trashed.id}/trash`)

    const all = await ok('GET', '/owner/leads/follow-ups')
    expect(all.items.map((i: Json) => i.lead.name)).toEqual(['Overdue', 'Later'])
    expect(all.items[0].followUp.isDue).toBe(true)

    expect(
      (await ok('GET', '/owner/leads/follow-ups?when=due')).items.map((i: Json) => i.lead.name),
    ).toEqual(['Overdue'])
    expect(await ok('GET', '/owner/leads/follow-ups/due-count')).toEqual({ due: 1 })
  })
})

/* ============================================================ CSV import */

const FILE = [
  'Name;E-Mail;Telefon;Land;Quelle;Firma;Notizen',
  'Anna Beispiel;anna@example.de;+49 170 0000001;Deutschland;Instagram;Anna GmbH;Hi',
  'Ben Muster;ben@example.at;+43 1 0000002;Austria;SEO;;',
  'No Phone;nophone@example.de;;DE;SEO;;',
  'Bad Country;bad@example.de;+49 170 0000004;Atlantis;SEO;;',
  'Anna Again;ANNA@example.de;+49 170 0000005;DE;SEO;;',
  'Unknown Src;src@example.de;+49 170 0000006;DE;TikTok;;',
  '=CMD();formula@example.de;+49 170 0000007;DE;Instagram;;',
].join('\n')

describe('CSV import', () => {
  it('suggests a mapping from the header and shows each row’s verdict without saving anything', async () => {
    const preview = await ok('POST', '/owner/leads/imports/preview', { csv: FILE })

    expect(preview.mapping).toMatchObject({
      name: 0,
      email: 1,
      phone: 2,
      country: 3,
      source: 4,
      company: 5,
      notes: 6,
    })
    expect(preview.missing).toEqual([])
    expect(preview).toMatchObject({ totalRows: 7, accepted: 3, rejected: 4 })
    expect(preview.rejections).toEqual([
      { row: 4, reason: 'Phone: Enter a phone number' },
      { row: 5, reason: 'Country “Atlantis” is not recognised' },
      { row: 6, reason: 'Same email as row 2' },
      { row: 7, reason: 'Source “TikTok” is not in your list' },
    ])
    expect(await count('v2_leads')).toBe(0)
  })

  it('says which required columns are missing, and accepts a whole-file country and source', async () => {
    const file = 'Name,Email,Phone\nCara,cara@example.de,+49 170 0000009\n'

    const first = await ok('POST', '/owner/leads/imports/preview', { csv: file })
    expect(first.missing).toEqual(['country', 'source'])

    const filled = await ok('POST', '/owner/leads/imports/preview', {
      csv: file,
      countryDefault: 'de',
      sourceDefaultId: (await sourceNamed('Purchased list')).id,
    })
    expect(filled).toMatchObject({ missing: [], accepted: 1 })
  })

  it('imports the valid rows, reports the rest, and never imports twice on a retry', async () => {
    const preview = await ok('POST', '/owner/leads/imports/preview', { csv: FILE })
    const body = {
      csv: FILE,
      fileName: 'fair.csv',
      mapping: preview.mapping,
      idempotencyKey: '7b2f3e9c-1d4a-4c8e-9f00-1234567890ab',
    }

    const result = await ok('POST', '/owner/leads/imports', body, 201)
    expect(result).toMatchObject({ fileName: 'fair.csv', totalRows: 7, accepted: 3, rejected: 4 })
    expect(await count('v2_leads')).toBe(3)

    const retry = await ok('POST', '/owner/leads/imports', body, 201)
    expect(retry.id).toBe(result.id)
    expect(await count('v2_leads')).toBe(3)
    expect(await count('v2_lead_imports')).toBe(1)

    const leads = await ok('GET', '/owner/leads')
    expect(leads.items.every((l: Json) => l.fromImport && l.stage.kind === 'new')).toBe(true)
    expect(leads.items.find((l: Json) => l.name === 'Anna Beispiel')).toMatchObject({
      country: { code: 'DE' },
      source: { name: 'Instagram' },
    })

    // A new import of the same file: everything is now a duplicate.
    const again = await ok(
      'POST',
      '/owner/leads/imports',
      { ...body, idempotencyKey: '8c3f4e9c-1d4a-4c8e-9f00-1234567890ab' },
      201,
    )
    expect(again).toMatchObject({ accepted: 0, rejected: 7 })

    const detail = await ok('GET', `/owner/leads/imports/${result.id}?pageSize=2`)
    expect(detail.rejections).toMatchObject({ total: 4, pageCount: 2 })
    expect(detail.rejections.items[0]).toMatchObject({
      row: 4,
      reason: 'Phone: Enter a phone number',
    })

    const report = await call('GET', `/owner/leads/imports/${result.id}/rejections.csv`)
    expect(report.status).toBe(200)
    expect(report.response.headers.get('content-disposition')).toContain(
      'attachment; filename="fair-rejected.csv"',
    )
    expect(report.response.headers.get('cache-control')).toContain('no-store')
    expect(report.text.split('\r\n')[0]).toBe(
      'Row,Reason,Name,E-Mail,Telefon,Land,Quelle,Firma,Notizen',
    )
    expect(report.text).toContain('7,Source “TikTok” is not in your list,Unknown Src')

    // Deleting the report keeps the Leads.
    await ok('DELETE', `/owner/leads/imports/${result.id}`)
    expect(await count('v2_leads')).toBe(3)
    expect(await count('v2_lead_import_rejections', `WHERE import_id = '${result.id}'`)).toBe(0)
  })

  it('refuses a file that is too long', async () => {
    const rows = Array.from(
      { length: contract.LEAD_IMPORT_LIMITS.rows + 1 },
      (_, i) => `P${i},p${i}@example.de,+49170${String(i).padStart(7, '0')}`,
    )
    const refused = await call('POST', '/owner/leads/imports/preview', {
      csv: `Name,Email,Phone\n${rows.join('\n')}`,
    })

    expect(refused.status).toBe(422)
    expect(refused.body.message).toContain('5,000')
  })
})

/* ========================================================== Trash */

describe('Trash and permanent deletion', () => {
  it('moves to Trash, restores, and deletes permanently only from Trash with the id', async () => {
    const lead = await createLead()

    expect((await call('DELETE', `/owner/leads/${lead.id}`, { confirm: lead.id })).status).toBe(409)

    await ok('POST', `/owner/leads/${lead.id}/trash`)
    expect((await ok('GET', '/owner/leads?view=all')).total).toBe(0)
    expect((await ok('GET', '/owner/leads?view=trash')).items.map((i: Json) => i.id)).toEqual([
      lead.id,
    ])

    const edit = await call('PATCH', `/owner/leads/${lead.id}`, { revision: 1, notes: 'x' })
    expect(edit.body.code).toBe('LEAD_IN_TRASH')

    await ok('POST', `/owner/leads/${lead.id}/restore`)
    await ok('POST', `/owner/leads/${lead.id}/trash`)

    expect((await call('DELETE', `/owner/leads/${lead.id}`, { confirm: 'yes' })).status).toBe(400)
    await ok('DELETE', `/owner/leads/${lead.id}`, { confirm: lead.id })
    expect(await count('v2_leads')).toBe(0)
  })

  it('never deletes the Client a Lead became, which keeps its history', async () => {
    const lead = await createLead()
    const won = await ok('POST', `/owner/leads/${lead.id}/stage`, {
      stageId: (await stageOf('won')).id,
      won: { mode: 'create' },
    })

    await ok('POST', `/owner/leads/${lead.id}/trash`)
    await ok('DELETE', `/owner/leads/${lead.id}`, { confirm: lead.id })

    const client = await ok('GET', `/owner/clients/${won.client.id}`)
    expect(client.leads).toEqual([
      expect.objectContaining({ leadId: lead.id, how: 'created', leadName: null }),
    ])
  })
})

/* ============================================================ isolation */

describe('independence from other modules', () => {
  it('imports nothing from the legacy backend, Inbox, Booking, Services or Projects', async () => {
    const directory = new URL('../backend2/modules/leads/', import.meta.url)

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
})
