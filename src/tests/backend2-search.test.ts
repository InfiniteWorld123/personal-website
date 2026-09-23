import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from './helpers/backend2-db'

/**
 * Global search (`docs/v2/search.md`), against a real PostgreSQL in process:
 * grouped sections, bounded results with "more", Trash left out, typed `%`
 * taken literally, one broken section not emptying the rest, and the owner
 * fence. Every name here is fictional.
 */
process.env.DATABASE_URL = 'postgres://legacy.invalid/legacy'
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
delete process.env.BACKEND2_OWNER_AUTH

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { likePattern } = await import('#/backend2/modules/search/search.repo')

type Json = Record<string, any>

const database = await createTestDatabase()
const app = createAppForTest()

beforeEach(async () => {
  await database.reset()
})

afterAll(async () => {
  await database.close()
})

const call = async (method: string, path: string, body?: unknown, host = 'localhost:3000') => {
  const response = await runWithDb(database.db, async () =>
    app.fetch(
      new Request(`http://${host}/api/v2${path}`, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json', origin: `http://${host}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    ),
  )
  const text = await response.text()

  return { status: response.status, body: (text ? JSON.parse(text) : {}) as Json, response }
}

const find = async (q: string, limit?: number) => {
  const result = await call('GET', `/owner/search?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ''}`)

  expect(result.status, JSON.stringify(result.body)).toBe(200)

  return result.body.data as Json
}

const section = (data: Json, key: string) => data.sections.find((s: Json) => s.key === key)

let seq = 0

const client = async (name: string, company = '') => {
  const result = await call('POST', '/owner/clients', {
    kind: company ? 'company' : 'person',
    name,
    email: `c${++seq}@example.org`,
    phone: '',
    country: 'DE',
    companyName: company,
  })

  expect(result.status, JSON.stringify(result.body)).toBe(201)

  return result.body.data as Json
}

const conversation = async (subject: string, folder: 'inbox' | 'trash' = 'inbox', body = '') => {
  seq += 1
  const { rows } = await database.db.query(
    `INSERT INTO v2_inbox_conversations (subject, counterpart_email, origin, reply_token, folder, trashed_from, trashed_at, is_read)
     VALUES ($1, $2, 'incoming', $3, $4, $5, $6, false) RETURNING id`,
    [subject, `s${seq}@example.org`, `token-${seq}`, folder, folder === 'trash' ? 'inbox' : null, folder === 'trash' ? new Date() : null],
  )

  if (body) {
    await database.db.query(
      `INSERT INTO v2_inbox_messages (conversation_id, direction, from_email, to_email, subject, body_text, occurred_at, dedupe_key)
       VALUES ($1, 'incoming', 'x@example.org', 'info@example.org', $2, $3, now(), $4)`,
      [rows[0].id, subject, body, `k-${seq}`],
    )
  }

  return rows[0].id as string
}

describe('global search', () => {
  it('answers every section, grouped, with links into each module', async () => {
    const mara = await client('Mara Beispiel', 'Beispiel Studio')
    await conversation('Angebot für Mara')

    const data = await find('beispiel')

    expect(data.sections.map((s: Json) => s.key)).toEqual([
      'clients', 'leads', 'invoices', 'subscriptions', 'inbox', 'calendar', 'blog', 'projects', 'services', 'media',
    ])
    expect(section(data, 'clients').items).toEqual([
      expect.objectContaining({ id: mara.id, title: 'Beispiel Studio', href: `/dashboard/clients?client=${mara.id}` }),
    ])
    expect(section(data, 'inbox').items).toEqual([])
    expect(section(await find('MARA'), 'inbox').items).toHaveLength(1)
  })

  it('matches the words of a message but shows only the stored preview', async () => {
    await conversation('Question', 'inbox', 'my secret budget is forty thousand')

    const hit = section(await find('forty thousand'), 'inbox').items[0]

    expect(hit.title).toBe('Question')
    expect(JSON.stringify(hit)).not.toContain('forty thousand')
  })

  it('leaves Trash out and bounds each section, saying there is more', async () => {
    await conversation('Probe gone', 'trash')
    for (let n = 0; n < 4; n++) await client(`Probe Person ${n}`)

    const data = await find('probe', 3)

    expect(section(data, 'inbox').items).toHaveLength(0)
    expect(section(data, 'clients')).toMatchObject({ hasMore: true })
    expect(section(data, 'clients').items).toHaveLength(3)
  })

  it('takes a typed % or _ literally', async () => {
    expect(likePattern('50%_off')).toBe('%50\\%\\_off%')
    await client('Anna 100% Real')
    await client('Anna 100 Real')

    expect(section(await find('100%'), 'clients').items.map((i: Json) => i.title)).toEqual(['Anna 100% Real'])
  })

  it('refuses a too-short query, and one broken section does not empty the rest', async () => {
    expect((await call('GET', '/owner/search?q=a')).status).toBe(422)

    await client('Zora Probe')
    await database.db.query('ALTER TABLE v2_media_assets RENAME TO v2_media_assets_gone')

    try {
      const data = await find('zora')

      expect(section(data, 'media').state).toBe('error')
      expect(section(data, 'clients').items).toHaveLength(1)
    } finally {
      await database.db.query('ALTER TABLE v2_media_assets_gone RENAME TO v2_media_assets')
    }
  })

  it('is not there for anyone off this machine', async () => {
    expect((await call('GET', '/owner/search?q=probe', undefined, 'yamanwarda.de')).status).toBe(404)
  })
})
