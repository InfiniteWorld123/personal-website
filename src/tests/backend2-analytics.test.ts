import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDatabase } from './helpers/backend2-db'

/**
 * Analytics and the Overview, against a real PostgreSQL inside this process.
 *
 * `docs/v2/analytics.md`. Every figure is checked against fixed, known
 * records written straight into the module tables: what a figure counts and
 * what it leaves out, Berlin day boundaries on both clock-change days, the
 * Won-rate denominator, cancelled and no-show appointments, a failing source
 * that takes only its own figures down, PostHog switched off, Money not built,
 * the owner fence, stable paging — and that no private row ever leaves.
 *
 * Every contact here is fictional.
 */
process.env.DATABASE_URL = 'postgres://legacy.invalid/legacy'
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
delete process.env.BACKEND2_OWNER_AUTH
delete process.env.POSTHOG_PERSONAL_API_KEY
delete process.env.POSTHOG_PROJECT_ID

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { createSession } = await import('#/backend2/auth/session')
const { withAnalyticsSources } = await import('#/backend2/modules/analytics/analytics.sources')
const { ownerAnalyticsPaths } = await import('#/backend2/modules/analytics/analytics.owner.route')
const period = await import('#/backend2/modules/analytics/analytics.period')
const website = await import('#/backend2/modules/analytics/sources/website')

type Json = Record<string, any>
type Sources = Parameters<typeof withAnalyticsSources>[0]

const database = await createTestDatabase()
const app = createAppForTest()

/** 23 Sep 2026, 12:00 in Berlin (CEST). Every test reads the clock from here. */
const NOW = new Date('2026-09-23T10:00:00Z')

beforeEach(async () => {
  await database.reset()
})

afterEach(() => {
  delete process.env.BACKEND2_OWNER_AUTH
  vi.restoreAllMocks()
})

afterAll(async () => {
  await database.close()
})

/* ---------------------------------------------------------------- plumbing */

const call = async (
  path: string,
  options: { host?: string; headers?: Record<string, string>; sources?: Sources } = {},
): Promise<{ status: number; body: Json; text: string; response: Response }> => {
  const host = options.host ?? 'localhost:3000'
  const request = new Request(`http://${host}/api/v2${path}`, { headers: options.headers })
  const response = await runWithDb(database.db, () =>
    withAnalyticsSources({ now: () => NOW, ...options.sources }, async () => app.fetch(request)),
  )
  const text = await response.clone().text()
  let body: Json = {}

  try {
    body = text === '' ? {} : (JSON.parse(text) as Json)
  } catch {
    body = {}
  }

  return { status: response.status, body, text, response }
}

const ok = async (path: string, sources?: Sources): Promise<Json> => {
  const result = await call(path, { sources })

  expect(result.status, `${path}: ${result.text}`).toBe(200)

  return result.body.data
}

const sql = (text: string, values?: unknown[]) => database.db.query(text, values)

const metric = (section: Json, key: string): Json => {
  for (const group of section.groups ?? []) {
    const found = group.metrics.find((m: Json) => m.key === key)

    if (found) return found
  }

  const flat = [...(section.headline ?? []), ...(section.glimpse ?? [])].find((m: Json) => m.key === key)

  if (flat) return flat

  throw new Error(`No metric ${key}`)
}

const breakdown = (section: Json, key: string): Json => {
  for (const group of section.groups) {
    const found = group.breakdowns.find((b: Json) => b.key === key)

    if (found) return found
  }

  throw new Error(`No breakdown ${key}`)
}

/* ----------------------------------------------------------------- fixtures */

let seq = 0

const leadSetup = async () => {
  const stage = async (kind: string, name: string, position = 0) =>
    (
      await sql('INSERT INTO v2_lead_stages (kind, name, position) VALUES ($1, $2, $3) RETURNING id', [
        kind,
        name,
        position,
      ])
    ).rows[0].id as string
  const source = async (name: string, unknown = false) =>
    (
      await sql('INSERT INTO v2_lead_sources (name, is_unknown) VALUES ($1, $2) RETURNING id', [
        name,
        unknown,
      ])
    ).rows[0].id as string

  const stages = {
    new: await stage('new', 'New'),
    contacted: await stage('contacted', 'Contacted', 1),
    qualified: await stage('custom', 'Qualified', 2),
    won: await stage('won', 'Won'),
    lost: await stage('lost', 'Lost'),
  }
  const sources = {
    unknown: await source('Unknown', true),
    instagram: await source('Instagram'),
    whatsapp: await source('WhatsApp'),
    maps: await source('Google Maps'),
  }
  const reason = (
    await sql(`INSERT INTO v2_lead_loss_reasons (name) VALUES ('Price') RETURNING id`)
  ).rows[0].id as string
  const other = (
    await sql(`INSERT INTO v2_lead_loss_reasons (name, is_other) VALUES ('Other', true) RETURNING id`)
  ).rows[0].id as string

  return { stages, sources, reasons: { price: reason, other } }
}

const insertLead = async (input: {
  stageId: string
  sourceId: string
  createdAt: string
  wonAt?: string
  lostAt?: string
  lostReasonId?: string
  importId?: string
  trashed?: boolean
  name?: string
  email?: string
  notes?: string
}): Promise<string> => {
  seq += 1

  const { rows } = await sql(
    `INSERT INTO v2_leads (name, email, phone, phone_key, country_code, notes, source_id, stage_id,
                           created_at, won_at, lost_at, lost_reason_id, import_id, trashed_at)
     VALUES ($1, $2, $3, $4, 'DE', $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    [
      input.name ?? `Probe Lead ${seq}`,
      input.email ?? `probe${seq}@example.org`,
      `+49 30 555 ${1000 + seq}`,
      `+4930555${1000 + seq}`,
      input.notes ?? '',
      input.sourceId,
      input.stageId,
      input.createdAt,
      input.wonAt ?? null,
      input.lostAt ?? null,
      input.lostReasonId ?? null,
      input.importId ?? null,
      input.trashed ? input.createdAt : null,
    ],
  )

  return rows[0].id
}

const insertAppointment = async (input: {
  startsAt: string
  status?: 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  method?: 'video' | 'in_person' | 'phone'
  source?: 'public' | 'manual'
  createdAt?: string
  visitorName?: string
  visitorEmail?: string
}): Promise<void> => {
  seq += 1

  const status = input.status ?? 'confirmed'
  const start = new Date(input.startsAt)
  const end = new Date(start.getTime() + 30 * 60_000)

  await sql(
    `INSERT INTO v2_booking_appointments
       (reference, manage_token_hash, manage_nonce, type_name, duration_minutes, method,
        starts_at, ends_at, blocked, status, source, visitor_name, visitor_email, visitor_phone,
        language, cancelled_at, created_at)
     VALUES ($1, $2, $3, 'Intro call', 30, $4, $5, $6, tstzrange($5, $6), $7, $8, $9, $10, $11,
             'en', $12, $13)`,
    [
      `REF-${seq}`,
      `hash-${seq}`,
      `nonce-${seq}`,
      input.method ?? 'video',
      start,
      end,
      status,
      input.source ?? 'public',
      input.visitorName ?? `Visitor ${seq}`,
      input.visitorEmail ?? `visitor${seq}@example.org`,
      input.method === 'phone' ? '+49 30 1234567' : null,
      status === 'cancelled' ? start : null,
      input.createdAt ?? '2026-09-10T10:00:00Z',
    ],
  )
}

const insertConversation = async (input: {
  origin: 'incoming' | 'outgoing' | 'contact' | 'booking'
  createdAt: string
  folder?: 'inbox' | 'archived' | 'trash'
  isRead?: boolean
  subject?: string
  email?: string
}): Promise<void> => {
  seq += 1

  const folder = input.folder ?? 'inbox'

  await sql(
    `INSERT INTO v2_inbox_conversations
       (subject, counterpart_email, origin, reply_token, folder, trashed_from, trashed_at, is_read, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.subject ?? `Subject ${seq}`,
      input.email ?? `sender${seq}@example.org`,
      input.origin,
      `token-${seq}`,
      folder,
      folder === 'trash' ? 'inbox' : null,
      folder === 'trash' ? input.createdAt : null,
      input.isRead ?? true,
      input.createdAt,
    ],
  )
}

const insertAsset = async (input: {
  kind: 'image' | 'video' | 'document'
  bytes: number
  createdAt: string
  name?: string
}): Promise<string> => {
  seq += 1

  const { rows } = await sql(
    `INSERT INTO v2_media_assets (storage_key, kind, content_type, original_name, display_name,
                                  byte_size, checksum, created_at)
     VALUES ($1, $2, 'application/octet-stream', $3, $3, $4, $5, $6) RETURNING id`,
    [`key-${seq}`, input.kind, input.name ?? `file-${seq}.bin`, input.bytes, `sum-${seq}`, input.createdAt],
  )

  return rows[0].id
}

const insertPost = async (input: {
  title: string
  reads: number
  likes: number
  firstPublishedAt?: string
  live?: boolean
}): Promise<string> => {
  seq += 1

  const { rows } = await sql(
    `INSERT INTO v2_blog_posts (read_count, like_count) VALUES ($1, $2) RETURNING id`,
    [input.reads, input.likes],
  )
  const postId = rows[0].id as string
  const version = (
    await sql(
      `INSERT INTO v2_blog_post_versions (post_id, kind, slug) VALUES ($1, 'published', $2) RETURNING id`,
      [postId, `post-${seq}`],
    )
  ).rows[0].id as string

  await sql(`INSERT INTO v2_blog_post_texts (version_id, language, title) VALUES ($1, 'en', $2)`, [
    version,
    input.title,
  ])

  if (input.firstPublishedAt) {
    await sql(
      `UPDATE v2_blog_posts
          SET slug = $2, published_version_id = $3, first_published_at = $4, published_at = $4
        WHERE id = $1`,
      [postId, `post-${seq}`, input.live === false ? null : version, input.firstPublishedAt],
    )

    if (input.live === false) {
      await sql('UPDATE v2_blog_posts SET published_version_id = NULL WHERE id = $1', [postId])
    }
  }

  return postId
}

const insertComment = async (postId: string, createdAt: string, author = 'visitor', seen = false) => {
  await sql(
    `INSERT INTO v2_blog_comments (post_id, author, body, created_at, seen_at) VALUES ($1, $2, $3, $4, $5)`,
    [postId, author, 'A private visitor comment text', createdAt, seen ? createdAt : null],
  )
}

/* =================================================================== period */

describe('the period', () => {
  it('defaults to the last 30 Berlin days, today included, with the 30 before it', async () => {
    const data = await ok('/owner/analytics/overview')

    expect(data.period).toMatchObject({
      preset: '30d',
      from: '2026-08-25',
      to: '2026-09-23',
      days: 30,
      bucket: 'day',
      timezone: 'Europe/Berlin',
      start: '2026-08-24T22:00:00.000Z',
      end: '2026-09-23T22:00:00.000Z',
      previous: { from: '2026-07-26', to: '2026-08-24' },
    })
  })

  it('offers 7, 90 and 365 days, and chooses larger buckets for longer periods', async () => {
    expect((await ok('/owner/analytics/overview?period=7d')).period).toMatchObject({
      from: '2026-09-17',
      days: 7,
      bucket: 'day',
    })
    expect((await ok('/owner/analytics/overview?period=90d')).period.bucket).toBe('day')
    expect((await ok('/owner/analytics/overview?period=365d')).period).toMatchObject({
      from: '2025-09-24',
      days: 365,
      bucket: 'week',
    })
    expect(
      (await ok('/owner/analytics/overview?from=2024-09-24&to=2026-09-23')).period,
    ).toMatchObject({ preset: 'custom', days: 730, bucket: 'month' })
  })

  it('places Berlin midnight correctly on both clock-change days', () => {
    // Spring 2026: the 29 March day is 23 hours long.
    expect(period.berlinMidnight('2026-03-29').toISOString()).toBe('2026-03-28T23:00:00.000Z')
    expect(period.berlinMidnight('2026-03-30').toISOString()).toBe('2026-03-29T22:00:00.000Z')
    // Autumn 2026: the 25 October day is 25 hours long.
    expect(period.berlinMidnight('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z')
    expect(period.berlinMidnight('2026-10-26').toISOString()).toBe('2026-10-25T23:00:00.000Z')
  })

  it('refuses a period it cannot answer honestly, naming the field', async () => {
    const refused = async (query: string, field: string) => {
      const result = await call(`/owner/analytics/overview?${query}`)

      expect(result.status, query).toBe(422)
      expect(result.body.code).toBe('VALIDATION_ERROR')
      expect(result.body.details.issues[0].field, query).toBe(field)
    }

    await refused('period=14d', 'period')
    await refused('from=2026-09-01', 'from')
    await refused('from=2026-09-10&to=2026-09-01', 'from')
    await refused('from=2026-09-01&to=2026-09-24', 'to')
    await refused('from=2024-09-22&to=2026-09-23', 'to')
    await refused('from=2019-12-31&to=2020-01-05', 'from')
    await refused('from=2026-02-30&to=2026-03-01', 'from')
    await refused('period=7d&from=2026-09-01&to=2026-09-02', 'period')
    await refused('bucket=hour', 'bucket')
    await refused('orgin=imported', 'orgin')
  })

  it('refuses a filter a route does not take instead of ignoring it', async () => {
    expect((await call('/owner/analytics/sections/operations?origin=imported')).status).toBe(422)
    expect((await call('/owner/analytics/sections/sales?origin=bought')).status).toBe(422)
    expect((await call('/owner/analytics/rankings/blog-posts?origin=all')).status).toBe(422)
    expect((await call('/owner/analytics/rankings/lead-sources?pageSize=101')).status).toBe(422)
  })

  it('answers 404 for a section or ranking that does not exist', async () => {
    expect((await call('/owner/analytics/sections/secrets')).status).toBe(404)
    expect((await call('/owner/analytics/rankings/clients')).status).toBe(404)
  })
})

/* ================================================================ overview */

describe('the Overview', () => {
  it('on an empty database: real zeros, and honest gaps for what is not there', async () => {
    const data = await ok('/owner/analytics/overview')

    expect(data.headline.map((m: Json) => [m.key, m.state, m.value])).toEqual([
      // Invoices is connected: no live invoice yet is a real zero, not a gap.
      ['money.received', 'ready', null],
      ['invoices.overdue', 'ready', 0],
      ['website.visitors', 'not-connected', null],
      ['inbox.unread', 'ready', 0],
    ])
    expect(data.glimpse.map((m: Json) => [m.key, m.state, m.value])).toEqual([
      ['leads.followUpsDue', 'ready', 0],
      ['booking.upcoming', 'ready', 0],
    ])

    for (const figure of [...data.headline, ...data.glimpse]) {
      expect(figure).toMatchObject({ timezone: 'Europe/Berlin', asOf: NOW.toISOString() })
      expect(typeof figure.source).toBe('string')
      expect(typeof figure.description).toBe('string')

      if (figure.state !== 'ready') expect(figure.message).toBeTruthy()
    }
  })

  it('counts unread Inbox conversations, due follow-ups and the next 7 days of appointments', async () => {
    await insertConversation({ origin: 'incoming', createdAt: '2026-09-20T10:00:00Z', isRead: false })
    await insertConversation({ origin: 'contact', createdAt: '2026-01-20T10:00:00Z', isRead: false })
    // Unread but archived or in Trash: not the Inbox badge.
    await insertConversation({ origin: 'incoming', createdAt: '2026-09-20T10:00:00Z', isRead: false, folder: 'archived' })
    await insertConversation({ origin: 'incoming', createdAt: '2026-09-20T10:00:00Z', isRead: false, folder: 'trash' })
    await insertConversation({ origin: 'incoming', createdAt: '2026-09-20T10:00:00Z', isRead: true })

    const { stages, sources } = await leadSetup()
    const due = await insertLead({ stageId: stages.new, sourceId: sources.instagram, createdAt: '2026-09-01T10:00:00Z' })
    const later = await insertLead({ stageId: stages.new, sourceId: sources.instagram, createdAt: '2026-09-01T10:00:00Z' })
    const trashed = await insertLead({ stageId: stages.new, sourceId: sources.instagram, createdAt: '2026-09-01T10:00:00Z', trashed: true })
    const done = await insertLead({ stageId: stages.new, sourceId: sources.instagram, createdAt: '2026-09-01T10:00:00Z' })

    await sql(`INSERT INTO v2_lead_follow_ups (lead_id, due_at) VALUES ($1, '2026-09-23T09:59:00Z')`, [due])
    await sql(`INSERT INTO v2_lead_follow_ups (lead_id, due_at) VALUES ($1, '2026-09-23T10:01:00Z')`, [later])
    await sql(`INSERT INTO v2_lead_follow_ups (lead_id, due_at) VALUES ($1, '2026-09-20T10:00:00Z')`, [trashed])
    await sql(
      `INSERT INTO v2_lead_follow_ups (lead_id, due_at, status, closed_how, closed_at)
       VALUES ($1, '2026-09-20T10:00:00Z', 'done', 'completed', now())`,
      [done],
    )

    await insertAppointment({ startsAt: '2026-09-23T10:30:00Z' })
    await insertAppointment({ startsAt: '2026-09-30T09:00:00Z' })
    await insertAppointment({ startsAt: '2026-09-30T10:00:00Z' }) // exactly 7 days: not in
    await insertAppointment({ startsAt: '2026-09-25T10:00:00Z', status: 'cancelled' })
    await insertAppointment({ startsAt: '2026-09-23T09:00:00Z' }) // already started

    const data = await ok('/owner/analytics/overview')

    expect(metric(data, 'inbox.unread').value).toBe(2)
    expect(metric(data, 'leads.followUpsDue')).toMatchObject({ value: 1, link: '/dashboard/leads/follow-ups' })
    expect(metric(data, 'booking.upcoming')).toMatchObject({ value: 2, scope: 'next-7-days' })
  })

  it('keeps every other figure when one source fails', async () => {
    await insertConversation({ origin: 'incoming', createdAt: '2026-09-20T10:00:00Z', isRead: false })
    await sql('ALTER TABLE v2_booking_appointments RENAME TO v2_booking_appointments_away')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const data = await ok('/owner/analytics/overview')

      expect(metric(data, 'booking.upcoming')).toMatchObject({ state: 'error', value: null })
      expect(metric(data, 'booking.upcoming').message).toMatch(/could not be loaded/u)
      expect(metric(data, 'inbox.unread')).toMatchObject({ state: 'ready', value: 1 })
      expect(metric(data, 'leads.followUpsDue')).toMatchObject({ state: 'ready', value: 0 })
    } finally {
      await sql('ALTER TABLE v2_booking_appointments_away RENAME TO v2_booking_appointments')
    }
  })
})

/* ==================================================================== sales */

describe('Sales: Leads and Clients', () => {
  it('on an empty period: zeros that are zeros, and no invented rate', async () => {
    await leadSetup()

    const data = await ok('/owner/analytics/sections/sales')

    expect(metric(data, 'leads.new')).toMatchObject({ state: 'ready', value: 0, previous: { value: 0 } })
    expect(metric(data, 'leads.new').series.points).toHaveLength(30)
    expect(metric(data, 'leads.wonRate')).toMatchObject({
      state: 'empty',
      value: null,
      rate: { numerator: 0, denominator: 0 },
    })
    expect(breakdown(data, 'leads.stages')).toMatchObject({ state: 'empty', total: 0 })
    expect(breakdown(data, 'leads.stages').items.map((i: Json) => [i.label, i.value])).toEqual([
      ['New', 0],
      ['Contacted', 0],
      ['Qualified', 0],
      ['Won', 0],
      ['Lost', 0],
    ])
    expect(breakdown(data, 'leads.sources')).toMatchObject({ state: 'empty', items: [] })
    expect(metric(data, 'clients.new')).toMatchObject({ state: 'ready', value: 0 })
  })

  it('counts Won against Won + Lost in the period, and says so', async () => {
    const { stages, sources, reasons } = await leadSetup()
    const inPeriod = '2026-09-10T10:00:00Z'
    const before = '2026-08-10T10:00:00Z'

    // Three Won in the period and still Won.
    for (let i = 0; i < 3; i += 1) {
      await insertLead({ stageId: stages.won, sourceId: sources.instagram, createdAt: before, wonAt: inPeriod })
    }
    // Won in the period, then reopened: Won nowhere now.
    await insertLead({ stageId: stages.contacted, sourceId: sources.instagram, createdAt: before, wonAt: inPeriod })
    // One Lost in the period; one Lost before it.
    await insertLead({ stageId: stages.lost, sourceId: sources.whatsapp, createdAt: before, lostAt: inPeriod, lostReasonId: reasons.price })
    await insertLead({ stageId: stages.lost, sourceId: sources.whatsapp, createdAt: before, lostAt: before, lostReasonId: reasons.price })
    // Won in the previous period.
    await insertLead({ stageId: stages.won, sourceId: sources.maps, createdAt: before, wonAt: before })
    // Won in the period but in Trash: not counted anywhere.
    await insertLead({ stageId: stages.won, sourceId: sources.maps, createdAt: before, wonAt: inPeriod, trashed: true })

    const data = await ok('/owner/analytics/sections/sales')

    expect(metric(data, 'leads.won')).toMatchObject({ value: 3, previous: { value: 1 } })
    expect(metric(data, 'leads.lost')).toMatchObject({ value: 1, previous: { value: 1 } })
    expect(metric(data, 'leads.wonRate')).toMatchObject({
      state: 'ready',
      unit: 'ratio',
      value: 0.75,
      rate: {
        numerator: 3,
        denominator: 4,
        numeratorLabel: 'Won in the period',
        denominatorLabel: 'Won + Lost in the period',
      },
      previous: { value: 0.5 },
    })
    expect(metric(data, 'leads.active').value).toBe(1)
    expect(breakdown(data, 'leads.lostReasons').items).toEqual([
      { key: reasons.price, label: 'Price', value: 1 },
    ])

    const leadsGroup = data.groups.find((g: Json) => g.key === 'leads')

    expect(leadsGroup.notes.join(' ')).toMatch(/no history of stage changes/u)
  })

  it('narrows to imported or hand-entered Leads, with the caveat attached', async () => {
    const { stages, sources } = await leadSetup()
    const importId = (
      await sql(
        `INSERT INTO v2_lead_imports (idempotency_key, total_rows, accepted_rows, rejected_rows)
         VALUES (gen_random_uuid(), 2, 2, 0) RETURNING id`,
      )
    ).rows[0].id

    await insertLead({ stageId: stages.new, sourceId: sources.maps, createdAt: '2026-09-20T10:00:00Z', importId })
    await insertLead({ stageId: stages.new, sourceId: sources.maps, createdAt: '2026-09-20T10:00:00Z', importId })
    await insertLead({ stageId: stages.new, sourceId: sources.instagram, createdAt: '2026-09-20T10:00:00Z' })

    const all = await ok('/owner/analytics/sections/sales')
    const imported = await ok('/owner/analytics/sections/sales?origin=imported')
    const manual = await ok('/owner/analytics/sections/sales?origin=manual')

    expect(all.filters).toEqual({ origin: 'all' })
    expect(metric(all, 'leads.new').value).toBe(3)
    expect(metric(imported, 'leads.new').value).toBe(2)
    expect(metric(manual, 'leads.new').value).toBe(1)
    expect(breakdown(imported, 'leads.sources').items.map((i: Json) => i.label)).toEqual(['Google Maps'])
    expect(imported.groups[0].notes.join(' ')).toMatch(/import report/u)
    expect(all.groups[0].notes.join(' ')).not.toMatch(/import report/u)
  })

  it('groups new Leads by Berlin day across the spring clock change', async () => {
    const { stages, sources } = await leadSetup()
    const at = (createdAt: string) => insertLead({ stageId: stages.new, sourceId: sources.instagram, createdAt })

    await at('2025-03-29T22:59:00Z') // 29 Mar, 23:59 CET
    await at('2025-03-29T23:00:00Z') // 30 Mar, 00:00 CET
    await at('2025-03-30T21:59:00Z') // 30 Mar, 23:59 CEST
    await at('2025-03-30T22:00:00Z') // 31 Mar, 00:00 CEST

    const data = await ok('/owner/analytics/sections/sales?from=2025-03-29&to=2025-03-31')

    expect(data.period).toMatchObject({
      start: '2025-03-28T23:00:00.000Z',
      end: '2025-03-31T22:00:00.000Z',
    })
    expect(metric(data, 'leads.new').series.points).toEqual([
      { date: '2025-03-29', value: 1 },
      { date: '2025-03-30', value: 2 },
      { date: '2025-03-31', value: 1 },
    ])
  })

  it('groups by Berlin day across the autumn clock change, and by week and month', async () => {
    const { stages, sources } = await leadSetup()
    const at = (createdAt: string) => insertLead({ stageId: stages.new, sourceId: sources.instagram, createdAt })

    await at('2025-10-25T21:59:00Z') // 25 Oct, 23:59 CEST
    await at('2025-10-25T22:00:00Z') // 26 Oct, 00:00 CEST
    await at('2025-10-26T22:59:00Z') // 26 Oct, 23:59 CET — the 25-hour day
    await at('2025-10-26T23:00:00Z') // 27 Oct, 00:00 CET

    const days = await ok('/owner/analytics/sections/sales?from=2025-10-25&to=2025-10-27')

    expect(metric(days, 'leads.new').series.points).toEqual([
      { date: '2025-10-25', value: 1 },
      { date: '2025-10-26', value: 2 },
      { date: '2025-10-27', value: 1 },
    ])

    // 25 Oct 2025 is a Saturday: its week began on Monday 20 Oct, before the
    // period, so the first bucket is pinned to the period's first day.
    const weeks = await ok('/owner/analytics/sections/sales?from=2025-10-25&to=2025-11-05&bucket=week')

    expect(metric(weeks, 'leads.new').series).toEqual({
      bucket: 'week',
      points: [
        { date: '2025-10-25', value: 3 },
        { date: '2025-10-27', value: 1 },
        { date: '2025-11-03', value: 0 },
      ],
    })

    const months = await ok('/owner/analytics/sections/sales?from=2025-10-25&to=2025-11-05&bucket=month')

    expect(metric(months, 'leads.new').series.points).toEqual([
      { date: '2025-10-25', value: 4 },
      { date: '2025-11-01', value: 0 },
    ])
  })

  it('tells Clients made by a Won Lead from ones added directly', async () => {
    const client = async (createdAt: string, status = 'active', trashed = false) =>
      (
        await sql(
          `INSERT INTO v2_clients (kind, name, email, country_code, status, created_at, trashed_at)
           VALUES ('person', 'Probe Client', $1, 'DE', $2, $3, $4) RETURNING id`,
          [`client${(seq += 1)}@example.org`, status, createdAt, trashed ? createdAt : null],
        )
      ).rows[0].id as string

    const made = await client('2026-09-10T10:00:00Z')
    const linked = await client('2026-09-11T10:00:00Z')

    await client('2026-09-12T10:00:00Z', 'inactive')
    await client('2026-09-12T10:00:00Z', 'active', true)
    await client('2026-01-01T10:00:00Z')
    await sql(`INSERT INTO v2_client_lead_links (lead_id, client_id, how) VALUES (gen_random_uuid(), $1, 'created')`, [made])
    await sql(`INSERT INTO v2_client_lead_links (lead_id, client_id, how) VALUES (gen_random_uuid(), $1, 'linked')`, [linked])

    const data = await ok('/owner/analytics/sections/sales')

    expect(metric(data, 'clients.new').value).toBe(3)
    expect(metric(data, 'clients.fromLeads').value).toBe(1)
    expect(metric(data, 'clients.direct').value).toBe(2)
    expect(metric(data, 'clients.active').value).toBe(3)
    expect(metric(data, 'clients.inactive').value).toBe(1)
    expect(breakdown(data, 'clients.origin').items).toEqual([
      { key: 'from-lead', label: 'From a Won lead', value: 1 },
      { key: 'direct', label: 'Added directly', value: 2 },
    ])
  })
})

/* ================================================================= rankings */

describe('rankings', () => {
  it('pages lead sources in a fixed order: count, then name, then id', async () => {
    const { stages, sources } = await leadSetup()
    const add = async (sourceId: string, n: number) => {
      for (let i = 0; i < n; i += 1) {
        await insertLead({ stageId: stages.new, sourceId, createdAt: '2026-09-20T10:00:00Z' })
      }
    }

    await add(sources.whatsapp, 3)
    await add(sources.maps, 2)
    await add(sources.instagram, 2)
    await add(sources.unknown, 1)

    const first = await ok('/owner/analytics/rankings/lead-sources?pageSize=2')
    const second = await ok('/owner/analytics/rankings/lead-sources?pageSize=2&page=2')

    expect(first).toMatchObject({ state: 'ready', total: 4, pageCount: 2, hasMore: true, page: 1 })
    expect(first.items.map((i: Json) => [i.rank, i.label, i.value])).toEqual([
      [1, 'WhatsApp', 3],
      [2, 'Google Maps', 2],
    ])
    expect(second.items.map((i: Json) => [i.rank, i.label, i.value])).toEqual([
      [3, 'Instagram', 2],
      [4, 'Unknown', 1],
    ])
    expect(second.hasMore).toBe(false)

    // The same request twice is the same answer.
    expect(await ok('/owner/analytics/rankings/lead-sources?pageSize=2')).toEqual(first)

    // The section shows the first few and points here for the rest.
    const section = await ok('/owner/analytics/sections/sales')

    expect(breakdown(section, 'leads.sources')).toMatchObject({
      total: 8,
      truncated: false,
      ranking: 'lead-sources',
    })
  })

  it('ranks articles by reads, likes or comments in the period', async () => {
    const a = await insertPost({ title: 'Alpha', reads: 10, likes: 1, firstPublishedAt: '2026-01-01T10:00:00Z' })
    const b = await insertPost({ title: 'Beta', reads: 10, likes: 5, firstPublishedAt: '2026-09-01T10:00:00Z' })
    const c = await insertPost({ title: 'Gamma', reads: 3, likes: 0, firstPublishedAt: '2026-02-01T10:00:00Z', live: false })

    await insertPost({ title: 'Draft never published', reads: 0, likes: 0 })
    await insertComment(c, '2026-09-20T10:00:00Z')
    await insertComment(c, '2026-09-21T10:00:00Z')
    await insertComment(a, '2026-09-21T10:00:00Z')
    await insertComment(a, '2026-01-21T10:00:00Z') // before the period
    await insertComment(b, '2026-09-21T10:00:00Z', 'owner', true) // the owner's reply

    const reads = await ok('/owner/analytics/rankings/blog-posts')

    expect(reads).toMatchObject({ scope: 'all-time', total: 3, filters: { by: 'reads' } })
    expect(reads.items.map((i: Json) => [i.label, i.value])).toEqual([
      ['Alpha', 10],
      ['Beta', 10],
      ['Gamma', 3],
    ])

    const likes = await ok('/owner/analytics/rankings/blog-posts?by=likes')

    expect(likes.items.map((i: Json) => i.label)).toEqual(['Beta', 'Alpha', 'Gamma'])

    const comments = await ok('/owner/analytics/rankings/blog-posts?by=comments')

    expect(comments.scope).toBe('period')
    expect(comments.items.map((i: Json) => [i.key, i.value])).toEqual([
      [c, 2],
      [a, 1],
      [b, 0],
    ])
  })

  it('answers an empty ranking as empty, and a disabled PostHog as not connected', async () => {
    expect(await ok('/owner/analytics/rankings/lead-lost-reasons')).toMatchObject({
      state: 'empty',
      items: [],
      total: 0,
      filters: { origin: 'all' },
    })
    expect(await ok('/owner/analytics/rankings/website-pages')).toMatchObject({
      state: 'not-connected',
      items: [],
      source: 'posthog',
    })
  })
})

/* =============================================================== operations */

describe('Operations: Calendar, Inbox, Media, Blog', () => {
  it('counts appointments by what happened to them, and never counts a cancellation as a meeting', async () => {
    const inPeriod = (day: number) => `2026-09-${String(day).padStart(2, '0')}T08:00:00Z`

    await insertAppointment({ startsAt: inPeriod(1), status: 'completed', method: 'video' })
    await insertAppointment({ startsAt: inPeriod(2), status: 'completed', method: 'phone' })
    await insertAppointment({ startsAt: inPeriod(3), status: 'completed', method: 'in_person' })
    await insertAppointment({ startsAt: inPeriod(4), status: 'no_show', method: 'video' })
    await insertAppointment({ startsAt: inPeriod(5), status: 'cancelled', method: 'video' })
    await insertAppointment({ startsAt: inPeriod(5), status: 'cancelled', method: 'phone' })
    await insertAppointment({ startsAt: '2026-09-24T08:00:00Z', status: 'confirmed', method: 'video', createdAt: '2026-09-22T08:00:00Z', source: 'manual' })
    await insertAppointment({ startsAt: '2026-08-01T08:00:00Z', status: 'no_show', createdAt: '2026-06-01T08:00:00Z' })

    const data = await ok('/owner/analytics/sections/operations')

    expect(metric(data, 'booking.completed').value).toBe(3)
    expect(metric(data, 'booking.cancelled').value).toBe(2)
    expect(metric(data, 'booking.noShow')).toMatchObject({ value: 1, previous: { value: 1 } })
    expect(metric(data, 'booking.noShowRate')).toMatchObject({
      value: 0.25,
      rate: { numerator: 1, denominator: 4 },
    })
    expect(metric(data, 'booking.made').value).toBe(7)
    expect(metric(data, 'booking.upcoming').value).toBe(1)
    // The one after today is still in the future, so it is not in the period's statuses.
    expect(breakdown(data, 'booking.status').items.map((i: Json) => [i.key, i.value])).toEqual([
      ['confirmed', 0],
      ['completed', 3],
      ['cancelled', 2],
      ['no_show', 1],
    ])
    expect(breakdown(data, 'booking.methods').items).toEqual([
      { key: 'video', label: 'Video call', value: 2 },
      { key: 'in_person', label: 'In person', value: 1 },
      { key: 'phone', label: 'Phone', value: 1 },
    ])

    const site = await ok('/owner/analytics/sections/website')

    expect(metric(site, 'website.onlineBookings').value).toBe(6)
  })

  it('counts new Inbox conversations others started, by how they began', async () => {
    await insertConversation({ origin: 'incoming', createdAt: '2026-09-20T10:00:00Z', isRead: false })
    await insertConversation({ origin: 'contact', createdAt: '2026-09-21T10:00:00Z' })
    await insertConversation({ origin: 'booking', createdAt: '2026-09-21T10:00:00Z', folder: 'trash' })
    await insertConversation({ origin: 'outgoing', createdAt: '2026-09-21T10:00:00Z' })
    await insertConversation({ origin: 'incoming', createdAt: '2026-08-01T10:00:00Z' })

    const data = await ok('/owner/analytics/sections/operations')

    expect(metric(data, 'inbox.new')).toMatchObject({ value: 3, previous: { value: 1 } })
    expect(metric(data, 'inbox.unread').value).toBe(1)
    expect(breakdown(data, 'inbox.origins').items.map((i: Json) => [i.key, i.value])).toEqual([
      ['incoming', 1],
      ['contact', 1],
      ['booking', 1],
      ['outgoing', 1],
    ])
  })

  it('sizes the Media library and counts what visitors can reach', async () => {
    const image = await insertAsset({ kind: 'image', bytes: 1000, createdAt: '2026-09-20T10:00:00Z' })

    await insertAsset({ kind: 'image', bytes: 500, createdAt: '2026-01-20T10:00:00Z' })
    await insertAsset({ kind: 'document', bytes: 2048, createdAt: '2026-09-21T10:00:00Z' })
    await sql(
      `INSERT INTO v2_media_references (asset_id, module, scope, owner_type, owner_id, usage)
       VALUES ($1, 'projects', 'published', 'project', 'p1', 'cover'),
              ($1, 'blog', 'published', 'post', 'b1', 'cover'),
              ($1, 'blog', 'draft', 'post', 'b1', 'cover')`,
      [image],
    )

    const data = await ok('/owner/analytics/sections/operations')

    expect(metric(data, 'media.files').value).toBe(3)
    expect(metric(data, 'media.bytes')).toMatchObject({ value: 3548, unit: 'bytes' })
    expect(metric(data, 'media.added').value).toBe(2)
    expect(metric(data, 'media.public').value).toBe(1)
    expect(breakdown(data, 'media.kinds').items.map((i: Json) => i.value)).toEqual([2, 0, 1])
    expect(breakdown(data, 'media.kindBytes').total).toBe(3548)
  })

  it('keeps Blog reads and likes apart, as all-time running totals', async () => {
    const post = await insertPost({ title: 'Live', reads: 40, likes: 4, firstPublishedAt: '2026-09-05T10:00:00Z' })

    await insertPost({ title: 'Old', reads: 2, likes: 1, firstPublishedAt: '2026-01-05T10:00:00Z' })
    await insertComment(post, '2026-09-20T10:00:00Z')
    await insertComment(post, '2026-09-20T11:00:00Z', 'visitor', true)
    await insertComment(post, '2026-09-20T12:00:00Z', 'owner', true)

    const data = await ok('/owner/analytics/sections/operations')

    expect(metric(data, 'blog.live').value).toBe(2)
    expect(metric(data, 'blog.firstPublished').value).toBe(1)
    expect(metric(data, 'blog.comments').value).toBe(2)
    expect(metric(data, 'blog.unseenComments').value).toBe(1)
    expect(metric(data, 'blog.reads')).toMatchObject({ value: 42, scope: 'all-time' })
    expect(metric(data, 'blog.likes')).toMatchObject({ value: 5, scope: 'all-time' })
    expect(metric(data, 'blog.reads').previous).toBeUndefined()
  })

  it('marks only the failing source as an error', async () => {
    await insertConversation({ origin: 'incoming', createdAt: '2026-09-20T10:00:00Z' })
    await sql('ALTER TABLE v2_booking_appointments RENAME TO v2_booking_appointments_away')

    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const data = await ok('/owner/analytics/sections/operations')
      const booking = data.groups.find((g: Json) => g.key === 'booking')

      for (const figure of [...booking.metrics, ...booking.breakdowns]) {
        expect(figure.state, figure.key).toBe('error')
        expect(figure.value ?? null, figure.key).toBeNull()
      }

      expect(breakdown(data, 'booking.status')).toMatchObject({ state: 'error', total: null, items: [] })
      expect(metric(data, 'inbox.new')).toMatchObject({ state: 'ready', value: 1 })
      expect(metric(data, 'media.files')).toMatchObject({ state: 'ready', value: 0 })
      // The log names the source and the database code, never the message.
      expect(logged).toHaveBeenCalledWith('Backend2 analytics source failed', {
        source: 'backend2.booking',
        code: '42P01',
      })
    } finally {
      await sql('ALTER TABLE v2_booking_appointments_away RENAME TO v2_booking_appointments')
    }
  })
})

/* ============================================================ website/PostHog */

const posthogReply = (results: unknown[][]) =>
  new Response(JSON.stringify({ results, columns: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

/** A fake PostHog that answers by what the query asks for. */
const fakePostHog = () => {
  const requests: Array<{ url: string; init: RequestInit; query: string }> = []
  const fetch = async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    const query: string = body.query.query

    requests.push({ url, init, query })

    if (query.includes('uniqIf')) return posthogReply([[120, 450, 80, 300]])
    if (query.includes('AS bucket')) return posthogReply([['2026-09-20', 30, 100], ['2026-09-21', 12, 40]])
    if (query.includes('uniq(properties.$pathname)')) return posthogReply([[3]])

    return posthogReply([
      ['/', 200],
      ['/blog/hello', 50],
    ])
  }

  return { requests, fetch }
}

describe('website statistics', () => {
  it('stays not-connected without both PostHog settings', () => {
    expect(website.resolveWebsiteSource({}).id).toBe('disabled')
    expect(website.resolveWebsiteSource({ POSTHOG_PERSONAL_API_KEY: 'phx_x' }).id).toBe('disabled')
    expect(website.resolveWebsiteSource({ POSTHOG_PROJECT_ID: '1' }).id).toBe('disabled')

    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(
      website.resolveWebsiteSource({ POSTHOG_PERSONAL_API_KEY: 'phx_x', POSTHOG_PROJECT_ID: 'abc' }).id,
    ).toBe('disabled')
    expect(
      website.resolveWebsiteSource({
        POSTHOG_PERSONAL_API_KEY: 'phx_x',
        POSTHOG_PROJECT_ID: '12',
        POSTHOG_HOST: 'http://insecure.example',
      }).id,
    ).toBe('disabled')
    expect(
      website.resolveWebsiteSource({ POSTHOG_PERSONAL_API_KEY: 'phx_x', POSTHOG_PROJECT_ID: '12' }).id,
    ).toBe('posthog')
  })

  it('shows visitors from PostHog with its own date, and asks it the right way', async () => {
    const fake = fakePostHog()
    const source = website.createPostHogWebsiteSource({
      apiKey: 'phx_test',
      projectId: '4242',
      fetch: fake.fetch,
      now: () => NOW,
    })

    const data = await ok('/owner/analytics/sections/website?period=7d', { website: source })

    expect(metric(data, 'website.visitors')).toMatchObject({
      state: 'ready',
      value: 120,
      previous: { value: 80 },
      source: 'posthog',
      asOf: NOW.toISOString(),
    })
    expect(metric(data, 'website.visitors').series.points).toHaveLength(7)
    expect(metric(data, 'website.visitors').series.points.find((p: Json) => p.date === '2026-09-20')).toEqual({
      date: '2026-09-20',
      value: 30,
    })
    expect(metric(data, 'website.pageviews')).toMatchObject({ value: 450, previous: { value: 300 } })
    expect(metric(data, 'website.visitors').notes.join(' ')).toContain('https://eu.posthog.com/project/4242/web')
    expect(breakdown(data, 'website.topPages')).toMatchObject({
      state: 'ready',
      total: 450,
      truncated: true,
      items: [
        { key: '/', label: '/', value: 200 },
        { key: '/blog/hello', label: '/blog/hello', value: 50 },
      ],
    })

    const first = fake.requests[0]!

    expect(first.url).toBe('https://eu.posthog.com/api/projects/4242/query/')
    expect(new Headers(first.init.headers).get('authorization')).toBe('Bearer phx_test')
    expect(JSON.parse(String(first.init.body)).query.kind).toBe('HogQLQuery')
    // The period's Berlin midnights, as UTC instants; private paths filtered out.
    expect(first.query).toContain("toDateTime('2026-09-16 22:00:00', 'UTC')")
    expect(first.query).toContain("'/dashboard%'")

    // Asked again within ten minutes: answered from the cache, not PostHog.
    const before = fake.requests.length

    await ok('/owner/analytics/sections/website?period=7d', { website: source })
    expect(fake.requests.length).toBe(before)
  })

  it('turns a PostHog failure into an error for its figures only, never a zero', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const source = website.createPostHogWebsiteSource({
      apiKey: 'phx_test',
      projectId: '4242',
      fetch: async () => new Response('{"detail":"quota for phx_test"}', { status: 500 }),
    })

    const data = await ok('/owner/analytics/overview', { website: source })

    expect(metric(data, 'website.visitors')).toMatchObject({ state: 'error', value: null })
    expect(metric(data, 'inbox.unread')).toMatchObject({ state: 'ready', value: 0 })
    expect(JSON.stringify(data)).not.toContain('phx_test')

    const ranking = await ok('/owner/analytics/rankings/website-pages', { website: source })

    expect(ranking).toMatchObject({ state: 'error', items: [] })
  })

  it('pages PostHog pages through the ranking', async () => {
    const fake = fakePostHog()
    const source = website.createPostHogWebsiteSource({ apiKey: 'k', projectId: '1', fetch: fake.fetch })
    const ranking = await ok('/owner/analytics/rankings/website-pages?pageSize=2&page=2', { website: source })

    expect(ranking).toMatchObject({ state: 'ready', total: 3, page: 2, pageCount: 2, hasMore: false })
    expect(ranking.items[0]).toMatchObject({ rank: 3, key: '/' })
    expect(fake.requests.at(-1)!.query).toContain('LIMIT 2 OFFSET 2')
  })

  it('reports the contact form as not connected until it sends to Backend2, and live catalogue counts', async () => {
    await sql(`INSERT INTO v2_projects (position, lifecycle) VALUES (1, 'active'), (2, 'archived')`)

    const data = await ok('/owner/analytics/sections/website')

    expect(metric(data, 'website.contactSubmissions')).toMatchObject({ state: 'not-connected', value: null })
    expect(metric(data, 'website.projectsLive')).toMatchObject({ state: 'ready', value: 0 })
    expect(metric(data, 'website.servicesLive')).toMatchObject({ state: 'ready', value: 0 })
    expect(metric(data, 'website.visitors').state).toBe('not-connected')
    expect(breakdown(data, 'website.topPages')).toMatchObject({ state: 'not-connected', total: null })
  })

  it('counts contact messages once the public form sends to Backend2', async () => {
    await insertConversation({ origin: 'contact', createdAt: '2026-09-20T10:00:00Z', isRead: false })
    await insertConversation({ origin: 'contact', createdAt: '2026-08-10T10:00:00Z', isRead: true })
    process.env.PUBLIC_V2_MODULES = 'contact'

    try {
      const data = await ok('/owner/analytics/sections/website')

      expect(metric(data, 'website.contactSubmissions')).toMatchObject({ state: 'ready', value: 1, previous: { value: 1 } })
    } finally {
      delete process.env.PUBLIC_V2_MODULES
    }
  })
})

/* ============================================================ money/assistant */

describe('Money and the assistant', () => {
  it('reads the real Invoices module: with no live invoices, money is not a fake figure', async () => {
    const money = await ok('/owner/analytics/sections/money')

    for (const figure of money.groups[0].metrics) {
      expect(figure.state, figure.key).not.toBe('not-built')
      expect(figure.state, figure.key).not.toBe('error')
    }
  })

  it('reads the real assistant counters: a quiet period is a real zero', async () => {
    const assistant = await ok('/owner/analytics/sections/assistant')

    expect(metric(assistant, 'assistant.conversations')).toMatchObject({ state: 'ready', value: 0 })
    expect(metric(assistant, 'assistant.unanswered')).toMatchObject({ state: 'ready', value: 0 })
  })

  it('reads a plugged-in Money source, keeping each currency separate', async () => {
    const moneySource = {
      source: 'backend2.invoices',
      read: async () => ({
        receivedNet: [
          { currency: 'USD', minor: 5000 },
          { currency: 'EUR', minor: 120000 },
        ],
        previousReceivedNet: [{ currency: 'EUR', minor: 90000 }],
        refunds: [{ currency: 'EUR', minor: 1000 }],
        overdue: { count: 2, balance: [{ currency: 'EUR', minor: 30000 }] },
        outstanding: { count: 3, balance: [{ currency: 'EUR', minor: 45000 }] },
        statusMix: [
          { status: 'paid', label: 'Paid', count: 4 },
          { status: 'overdue', label: 'Overdue', count: 2 },
        ],
      }),
    }

    const overview = await ok('/owner/analytics/overview', { money: moneySource })

    expect(metric(overview, 'money.received')).toMatchObject({
      state: 'ready',
      value: null,
      unit: 'money',
      amounts: [
        { currency: 'EUR', minor: 120000 },
        { currency: 'USD', minor: 5000 },
      ],
      previous: { amounts: [{ currency: 'EUR', minor: 90000 }] },
    })
    expect(metric(overview, 'invoices.overdue')).toMatchObject({
      state: 'ready',
      value: 2,
      amounts: [{ currency: 'EUR', minor: 30000 }],
    })

    const section = await ok('/owner/analytics/sections/money', { money: moneySource })

    expect(breakdown(section, 'invoices.status')).toMatchObject({ state: 'ready', total: 6 })
  })

  it('turns a failing Money source into an error for Money alone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const overview = await ok('/owner/analytics/overview', {
      money: {
        source: 'backend2.invoices',
        read: async () => {
          throw new Error('invoice for Secret Client failed')
        },
      },
    })

    expect(metric(overview, 'money.received')).toMatchObject({ state: 'error', value: null })
    expect(metric(overview, 'invoices.overdue')).toMatchObject({ state: 'error', value: null })
    expect(metric(overview, 'inbox.unread').state).toBe('ready')
    expect(JSON.stringify(overview)).not.toContain('Secret Client')
  })

  it('reads a plugged-in assistant source and marks what it does not record', async () => {
    const data = await ok('/owner/analytics/sections/assistant', {
      assistant: {
        source: 'backend2.assistant',
        read: async () => ({
          conversations: 14,
          previousConversations: 9,
          unanswered: null,
          referralClicks: 3,
          cost: [{ currency: 'USD', minor: 42 }],
        }),
      },
    })

    expect(metric(data, 'assistant.conversations')).toMatchObject({ value: 14, previous: { value: 9 } })
    expect(metric(data, 'assistant.unanswered')).toMatchObject({ state: 'not-built', value: null })
    expect(metric(data, 'assistant.referrals').value).toBe(3)
    expect(metric(data, 'assistant.cost').amounts).toEqual([{ currency: 'USD', minor: 42 }])
  })
})

/* =================================================================== privacy */

describe('privacy and the owner boundary', () => {
  it('never sends a private row, only counts and the owner’s own labels', async () => {
    const { stages, sources } = await leadSetup()

    await insertLead({
      stageId: stages.new,
      sourceId: sources.instagram,
      createdAt: '2026-09-20T10:00:00Z',
      name: 'Zelda Secretperson',
      email: 'zelda.secret@example.org',
      notes: 'Private note about a budget',
    })
    await insertConversation({
      origin: 'incoming',
      createdAt: '2026-09-20T10:00:00Z',
      subject: 'Confidential contract question',
      email: 'confidential.sender@example.org',
    })
    await insertAppointment({
      startsAt: '2026-09-24T08:00:00Z',
      visitorName: 'Hidden Visitor',
      visitorEmail: 'hidden.visitor@example.org',
    })
    await insertAsset({ kind: 'document', bytes: 10, createdAt: '2026-09-20T10:00:00Z', name: 'client-contract.pdf' })

    const post = await insertPost({ title: 'Public title', reads: 1, likes: 0, firstPublishedAt: '2026-09-01T10:00:00Z' })

    await insertComment(post, '2026-09-20T10:00:00Z')

    const bodies = [(await call('/owner/analytics/overview')).text]

    for (const section of ['website', 'sales', 'operations', 'money', 'assistant']) {
      bodies.push((await call(`/owner/analytics/sections/${section}`)).text)
    }
    for (const ranking of ['lead-sources', 'lead-lost-reasons', 'blog-posts', 'website-pages']) {
      bodies.push((await call(`/owner/analytics/rankings/${ranking}`)).text)
    }

    const everything = bodies.join('\n')

    for (const secret of [
      'Zelda',
      'zelda.secret',
      'Private note',
      'Confidential contract',
      'confidential.sender',
      'Hidden Visitor',
      'hidden.visitor',
      'client-contract',
      'A private visitor comment text',
      '+49',
    ]) {
      expect(everything, secret).not.toContain(secret)
    }

    // The article title is public, and the ranking may name it.
    expect(everything).toContain('Public title')
  })

  it('is never cached', async () => {
    const result = await call('/owner/analytics/overview')

    expect(result.response.headers.get('cache-control')).toContain('no-store')
  })

  it('answers 404 — never 401 — on every Analytics route from a non-local host', async () => {
    for (const route of ownerAnalyticsPaths) {
      const refused = await call(route.path.replace('/api/v2', ''), { host: 'yamanwarda.de' })

      expect(refused.status, route.path).toBe(404)
      expect(refused.text).not.toContain('Europe/Berlin')
    }
  })

  it('demands a real owner session once V2 sign-in is switched on', async () => {
    process.env.BACKEND2_OWNER_AUTH = 'required'

    expect((await call('/owner/analytics/overview')).status).toBe(401)
    expect((await call('/owner/analytics/sections/sales')).status).toBe(401)
    expect((await call('/owner/analytics/rankings/lead-sources')).status).toBe(401)

    const { rows } = await sql(
      `INSERT INTO v2_owner (email, password_hash, totp_confirmed_at, recovery_codes_issued_at)
       VALUES ('owner@example.de', 'not-a-real-hash', now(), now()) RETURNING id`,
    )
    const session = await runWithDb(database.db, () =>
      createSession({ ownerId: rows[0].id, method: 'password_totp' }),
    )
    const cookie = `v2_owner_session=${encodeURIComponent(session.token)}; v2_csrf=${encodeURIComponent(session.csrfToken)}`

    expect((await call('/owner/analytics/overview', { headers: { cookie } })).status).toBe(200)
  })

  it('has no public Analytics route', async () => {
    expect((await call('/analytics/overview')).status).toBe(404)
  })
})
