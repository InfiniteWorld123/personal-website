import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryStore, createTestDatabase, jpegBytes, pngBytes } from './helpers/backend2-db'

/**
 * "Copy from the old site", end to end.
 *
 * Two real PostgreSQL databases in this process: the V2 one, and a small
 * stand-in for the legacy one with just the columns the import reads. The
 * legacy connection is wrapped so every statement it receives is recorded —
 * the proof that the import only ever reads the old site, and does so inside
 * a read-only transaction. Images come from an in-memory "old site" and land
 * in an in-memory vault.
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
const { useMediaStoreForTest } = await import('#/backend2/media/store')
const { useLegacySourceForTest } = await import('#/backend2/modules/import/legacy.source')
const { ownerImportPaths } = await import('#/backend2/modules/import/import.owner.route')

type Json = Record<string, any>

const database = await createTestDatabase()
const app = createAppForTest()
const memory = createMemoryStore()

/* ------------------------------------------------------------ the old site */

const legacy = new PGlite()

await legacy.exec(`
  CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL,
    status text NOT NULL, website_url text, source_url text, is_published boolean NOT NULL,
    sort_order int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE project_translations (project_id uuid REFERENCES projects(id), language text, name text,
    kind text, summary text, problem text, approach text, shows text, features text[] NOT NULL DEFAULT '{}');
  CREATE TABLE project_images (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES projects(id),
    src text, width int, height int, is_cover boolean NOT NULL DEFAULT false, sort_order int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE project_image_translations (project_image_id uuid REFERENCES project_images(id), language text, alt text);
  CREATE TABLE project_tech (project_id uuid REFERENCES projects(id), name text, sort_order int NOT NULL DEFAULT 0);
  CREATE TABLE tags (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL);
  CREATE TABLE tag_translations (tag_id uuid REFERENCES tags(id), language text, name text);
  CREATE TABLE posts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL, project_id uuid,
    cover_src text, cover_width int, cover_height int, is_published boolean NOT NULL, published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE post_translations (post_id uuid REFERENCES posts(id), language text, title text, excerpt text,
    body jsonb, cover_alt text NOT NULL DEFAULT '');
  CREATE TABLE post_tags (post_id uuid, tag_id uuid, sort_order int NOT NULL DEFAULT 0);
  CREATE TABLE booking_types (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL,
    duration_minutes int, buffer_before_minutes int, buffer_after_minutes int, minimum_notice_minutes int,
    booking_window_days int, slot_interval_minutes int, max_per_day int, location_kind text, location_value text,
    price_cents int NOT NULL DEFAULT 0, is_active boolean NOT NULL, sort_order int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE booking_type_translations (booking_type_id uuid, language text, name text, description text);
  CREATE TABLE availability_rules (booking_type_id uuid, weekday int, starts_at_minute int, ends_at_minute int);
  CREATE TABLE availability_exceptions (booking_type_id uuid, on_date date, kind text, starts_at_minute int,
    ends_at_minute int, reason text NOT NULL DEFAULT '');
`)

const L = ['de', 'en', 'ar'] as const

const seedLegacy = async () => {
  const project = async (slug: string, order: number, published: boolean, status = 'live') => {
    const { rows } = (await legacy.query(
      `INSERT INTO projects (slug, status, website_url, is_published, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [slug, status, `https://${slug}.example`, published, order],
    )) as { rows: Array<{ id: string }> }
    const id = rows[0]!.id

    for (const language of L) {
      await legacy.query(
        `INSERT INTO project_translations (project_id, language, name, kind, summary, problem, approach, shows, features)
         VALUES ($1, $2, $3, 'Web app', $4, 'Problem', 'Approach', 'Shows', ARRAY['Feature one', 'Feature two'])`,
        [id, language, `${slug} ${language}`, `Summary ${language}`],
      )
    }

    return id
  }

  const image = async (projectId: string, src: string, cover: boolean, order: number) => {
    const { rows } = (await legacy.query(
      `INSERT INTO project_images (project_id, src, width, height, is_cover, sort_order)
       VALUES ($1, $2, 800, 600, $3, $4) RETURNING id`,
      [projectId, src, cover, order],
    )) as { rows: Array<{ id: string }> }

    for (const language of L) {
      await legacy.query(
        'INSERT INTO project_image_translations (project_image_id, language, alt) VALUES ($1, $2, $3)',
        [rows[0]!.id, language, `Alt ${language}`],
      )
    }
  }

  const inknest = await project('inknest', 1, true)
  await image(inknest, '/images/work/inknest/home.jpg', true, 1)
  await image(inknest, '/images/work/inknest/discover.jpg', false, 2)
  await legacy.query(`INSERT INTO project_tech (project_id, name, sort_order) VALUES ($1, 'React', 1), ($1, 'Bun', 2)`, [inknest])

  await project('prime-estate', 2, true, 'building')

  const store = await project('tech-store', 3, true)
  await image(store, '/images/work/tech-store/home.jpg', true, 1)
  await image(store, '/images/work/tech-store/missing.jpg', false, 2)

  await project('secret', 4, false)

  const { rows: tag } = (await legacy.query(`INSERT INTO tags (slug) VALUES ('news') RETURNING id`)) as {
    rows: Array<{ id: string }>
  }
  for (const language of L) {
    await legacy.query('INSERT INTO tag_translations (tag_id, language, name) VALUES ($1, $2, $3)', [
      tag[0]!.id,
      language,
      `News ${language}`,
    ])
  }

  const { rows: post } = (await legacy.query(
    `INSERT INTO posts (slug, project_id, cover_src, cover_width, cover_height, is_published, published_at)
     VALUES ('hello', $1, '/images/blog/cover.png', 1200, 630, true, now()) RETURNING id`,
    [inknest],
  )) as { rows: Array<{ id: string }> }
  for (const language of L) {
    await legacy.query(
      `INSERT INTO post_translations (post_id, language, title, excerpt, body, cover_alt) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        post[0]!.id,
        language,
        `Hello ${language}`,
        `Excerpt ${language}`,
        JSON.stringify({
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: `Body ${language}`, marks: [{ type: 'bold' }] }] },
            { type: 'image', attrs: { src: '/images/work/inknest/discover.jpg', alt: `Inline ${language}`, width: 800, height: 600 } },
          ],
        }),
        `Cover ${language}`,
      ],
    )
  }
  await legacy.query('INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)', [post[0]!.id, tag[0]!.id])

  const { rows: type } = (await legacy.query(
    `INSERT INTO booking_types (slug, duration_minutes, buffer_before_minutes, buffer_after_minutes,
       minimum_notice_minutes, booking_window_days, slot_interval_minutes, location_kind, is_active)
     VALUES ('intro-call', 30, 0, 10, 1440, 60, 15, 'VIDEO', true) RETURNING id`,
  )) as { rows: Array<{ id: string }> }
  for (const language of L) {
    await legacy.query(
      'INSERT INTO booking_type_translations (booking_type_id, language, name, description) VALUES ($1, $2, $3, $4)',
      [type[0]!.id, language, `Intro ${language}`, `Description ${language}`],
    )
  }
  // Monday 09:00–12:00 and 11:00–13:00 (overlapping on purpose), Friday 14:00–16:00.
  await legacy.query(
    `INSERT INTO availability_rules (booking_type_id, weekday, starts_at_minute, ends_at_minute)
     VALUES (NULL, 1, 540, 720), (NULL, 1, 660, 780), (NULL, 5, 840, 960)`,
  )
  // 5 Jan 2099 is a Monday: blocked 10:00–11:00. 9 Jan 2099 (Friday): closed.
  await legacy.query(
    `INSERT INTO availability_exceptions (booking_type_id, on_date, kind, starts_at_minute, ends_at_minute, reason)
     VALUES (NULL, '2099-01-05', 'BLOCK', 600, 660, 'Dentist'), (NULL, '2099-01-09', 'BLOCK', NULL, NULL, 'Holiday'),
            (NULL, '2000-01-03', 'BLOCK', NULL, NULL, 'Long past')`,
  )
}

const statements: string[] = []
let readOnlyInside: string[] = []

const legacyFiles = new Map<string, Uint8Array>([
  ['/images/work/inknest/home.jpg', jpegBytes(800, 600)],
  ['/images/work/inknest/discover.jpg', jpegBytes(800, 600)],
  ['/images/work/tech-store/home.jpg', jpegBytes(800, 600)],
  ['/images/blog/cover.png', pngBytes(1200, 630)],
])

const stream = (bytes: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })

beforeEach(async () => {
  await database.reset()
  memory.objects.clear()
  statements.length = 0
  readOnlyInside = []
  await legacy.exec(`
    TRUNCATE availability_exceptions, availability_rules, booking_type_translations, booking_types, post_tags,
      post_translations, posts, tag_translations, tags, project_tech, project_image_translations,
      project_images, project_translations, projects`)
  await seedLegacy()

  useMediaStoreForTest(memory.store)
  useLegacySourceForTest({
    connect: async () => ({
      query: async (text: string, values?: unknown[]) => {
        statements.push(text.trim())

        if (/^SELECT/i.test(text.trim()) && readOnlyInside.length === 0) {
          const { rows } = (await legacy.query('SHOW transaction_read_only')) as { rows: Array<{ transaction_read_only: string }> }
          readOnlyInside.push(rows[0]!.transaction_read_only)
        }

        return (await legacy.query(text, values)) as { rows: any[] }
      },
      end: async () => {},
    }),
    images: {
      async open(src: string) {
        const bytes = legacyFiles.get(src)

        if (!bytes) throw new Error('the old site answered 404 for it')

        return { body: stream(bytes), size: bytes.byteLength }
      },
      async measure(src: string) {
        return legacyFiles.get(src)?.byteLength ?? null
      },
    },
  })
})

afterEach(() => {
  delete process.env.BACKEND2_OWNER_AUTH
})

afterAll(async () => {
  useMediaStoreForTest(undefined)
  useLegacySourceForTest({})
  await database.close()
  await legacy.close()
})

/* ---------------------------------------------------------------- plumbing */

const call = async (
  method: string,
  path: string,
  body?: unknown,
  options: { host?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Json }> => {
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
  const text = await response.text()

  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Json) }
}

const plan = async () => {
  const answer = await call('GET', '/owner/import/legacy')

  expect(answer.status, JSON.stringify(answer.body)).toBe(200)

  return answer.body.data
}

/** Presses the button: repeats the step until nothing remains, as the Dashboard does. */
const runAll = async () => {
  const did: string[] = []

  for (let guard = 0; guard < 60; guard += 1) {
    const step = await call('POST', '/owner/import/legacy', { confirm: true })

    expect(step.status, JSON.stringify(step.body)).toBe(200)

    if (step.body.data.did) did.push(step.body.data.did)
    if (step.body.data.remaining === 0) return did
  }

  throw new Error('The import never finished')
}

const count = async (table: string) =>
  Number((await database.db.query(`SELECT count(*)::int AS total FROM ${table}`)).rows[0].total)

const item = (data: Json, kind: string, key: string) =>
  data.items.find((entry: Json) => entry.kind === kind && entry.key === key)

const legacyWrites = () =>
  statements.filter((text) => !/^(BEGIN TRANSACTION READ ONLY|SELECT|COMMIT|ROLLBACK)\b/i.test(text))

/* ------------------------------------------------------------------ dry run */

describe('the dry run', () => {
  it('lists what would be copied, and writes nothing anywhere', async () => {
    const data = await plan()

    expect(data.counts).toEqual({ create: 9, skip: 0, done: 0, failed: 0 })
    expect(data.items.map((entry: Json) => `${entry.kind}:${entry.key}`)).toEqual([
      'service:websites',
      'service:shopify',
      'service:software',
      'project:inknest',
      'project:prime-estate',
      'project:tech-store',
      'post:hello',
      'booking_type:intro-call',
      'availability:hours',
    ])

    // Five distinct files: the inline blog image is the inknest one, counted once.
    expect(data.images.toCopy).toBe(5)
    expect(data.images.unknownSizes).toBe(1)
    expect(data.images.bytes).toBe(48 * 3 + 64)

    expect(item(data, 'service', 'websites').lands).toBe('published')
    expect(item(data, 'project', 'inknest').lands).toBe('published')
    expect(item(data, 'post', 'hello').lands).toBe('draft')
    expect(item(data, 'booking_type', 'intro-call').lands).toBe('on')
    expect(item(data, 'booking_type', 'intro-call').needsYou.join(' ')).toContain('10 min after')
    expect(data.notes.join(' ')).toContain('1 unpublished project is not copied')

    for (const table of ['v2_legacy_imports', 'v2_projects', 'v2_services', 'v2_blog_posts', 'v2_booking_types', 'v2_media_assets']) {
      expect(await count(table), table).toBe(0)
    }
    expect(memory.objects.size).toBe(0)
    expect(legacyWrites()).toEqual([])
    expect(statements[0]).toBe('BEGIN TRANSACTION READ ONLY')
    expect(readOnlyInside).toEqual(['on'])
  })

  it('answers a clear 503 when the old site cannot be reached', async () => {
    useLegacySourceForTest({
      connect: async () => {
        throw new (await import('#/backend2/http/error')).ApiError({
          status: 503,
          code: 'PROVIDER_UNAVAILABLE',
          message: 'The old site’s database did not answer. Nothing was changed.',
        })
      },
    })

    const answer = await call('GET', '/owner/import/legacy')
    expect(answer.status).toBe(503)
    // A server-side failure's own sentence never reaches the browser; the
    // Dashboard explains this code in its own words.
    expect(answer.body.code).toBe('PROVIDER_UNAVAILABLE')
    expect(await count('v2_legacy_imports')).toBe(0)
  })
})

/* ------------------------------------------------------------------- the run */

describe('copying', () => {
  it('creates every item through V2, with images, languages, order and state', async () => {
    const did = await runAll()

    expect(did.some((line) => line.startsWith('Copied the image'))).toBe(true)
    expect(did).toContain('Could not copy the image “missing.jpg”: the old site answered 404 for it')

    // Services, published and starred, in the /services order.
    const services = (await call('GET', '/owner/services')).body.data.items
    expect(services.map((service: Json) => [service.slug, service.state, service.featured])).toEqual([
      ['websites', 'published', true],
      ['shopify', 'published', true],
      ['software', 'published', true],
    ])

    // Projects: live, in the old order, with the cover, gallery, alt text and tech.
    const projects = (await call('GET', '/owner/projects')).body.data.items
    expect(projects.map((project: Json) => [project.slug, project.state])).toEqual([
      ['inknest', 'published'],
      ['prime-estate', 'published'],
      // One picture could not be copied, so it waits for the owner.
      ['tech-store', 'draft'],
    ])

    const inknest = (await call('GET', `/owner/projects/${projects[0].id}`)).body.data
    expect(inknest.published.cover.alt).toEqual({ de: 'Alt de', en: 'Alt en', ar: 'Alt ar' })
    expect(inknest.published.gallery).toHaveLength(1)
    expect(inknest.published.tech).toEqual(['React', 'Bun'])
    expect(inknest.published.workStatus).toBe('completed')
    expect(inknest.published.type).toBe('personal')
    expect(inknest.published.links).toEqual([
      { kind: 'website', url: 'https://inknest.example', isPublic: true, labels: { de: '', en: '', ar: '' } },
    ])
    expect(inknest.published.texts.ar.name).toBe('inknest ar')
    expect(inknest.published.texts.de.categoryLabel).toBe('Web app')
    expect(JSON.stringify(inknest.published.texts.en.caseStudy)).toContain('Feature two')

    const prime = (await call('GET', `/owner/projects/${projects[1].id}`)).body.data
    expect(prime.published.workStatus).toBe('in_progress')

    const store = (await call('GET', `/owner/projects/${projects[2].id}`)).body.data
    expect(store.draft.cover).not.toBeNull()
    expect(store.draft.gallery).toHaveLength(0)

    // The article: a private draft, with its cover, inline image, tag and project.
    const posts = (await call('GET', '/owner/blog/posts')).body.data.items
    expect(posts).toHaveLength(1)
    const post = (await call('GET', `/owner/blog/posts/${posts[0].id}`)).body.data
    expect(post.state).toBe('draft')
    expect(post.draft.slug).toBe('hello')
    expect(post.draft.projectId).toBe(projects[0].id)
    expect(post.draft.tagIds).toHaveLength(1)
    expect(post.draft.cover.alt.ar).toBe('Cover ar')
    const inline = post.draft.texts.en.body.content[1]
    expect(inline.type).toBe('image')
    // The same old file as the inknest gallery picture: copied once, used twice.
    expect(inline.attrs.mediaId).toBe(inknest.published.gallery[0].mediaId)

    // Booking: the type is on, the hours are the old ones, the exceptions exact.
    const types = (await call('GET', '/owner/calendar/types')).body.data.items
    expect(types.map((type: Json) => [type.slug, type.enabled, type.bufferMinutes, type.slotStepMinutes])).toEqual([
      ['intro-call', true, 10, 15],
    ])
    const hours = (await call('GET', '/owner/calendar/availability')).body.data
    expect(hours.weekly).toEqual([
      { weekday: 1, startMinute: 540, endMinute: 780 },
      { weekday: 5, startMinute: 840, endMinute: 960 },
    ])
    expect(hours.exceptions).toEqual([
      { date: '2099-01-05', ranges: [{ startMinute: 540, endMinute: 600 }, { startMinute: 660, endMinute: 780 }], note: 'Dentist' },
      { date: '2099-01-09', ranges: [], note: 'Holiday' },
    ])

    // Four files in the vault, all in the import folder.
    const { rows: files } = await database.db.query(
      `SELECT f.name FROM v2_media_assets a JOIN v2_media_folders f ON f.id = a.folder_id`,
    )
    expect(files).toHaveLength(4)
    expect(new Set(files.map((file: Json) => file.name))).toEqual(new Set(['Imported from old site']))
    expect(memory.objects.size).toBe(4)

    expect(legacyWrites()).toEqual([])
  })

  it('creates nothing twice: a second run finds nothing to do', async () => {
    await runAll()

    const before = {
      projects: await count('v2_projects'),
      services: await count('v2_services'),
      posts: await count('v2_blog_posts'),
      types: await count('v2_booking_types'),
      assets: await count('v2_media_assets'),
      tags: await count('v2_blog_tags'),
    }

    const again = await call('POST', '/owner/import/legacy', { confirm: true })
    expect(again.body.data).toEqual({ did: null, remaining: 0 })

    expect({
      projects: await count('v2_projects'),
      services: await count('v2_services'),
      posts: await count('v2_blog_posts'),
      types: await count('v2_booking_types'),
      assets: await count('v2_media_assets'),
      tags: await count('v2_blog_tags'),
    }).toEqual(before)

    const data = await plan()
    expect(data.counts).toEqual({ create: 0, skip: 0, done: 9, failed: 0 })
    expect(item(data, 'project', 'tech-store').images).toEqual({ total: 2, copied: 1, failed: 1 })
  })

  it('never touches something V2 already has at the same address', async () => {
    const service = await call('POST', '/owner/services', { name: 'My own websites', language: 'en' })
    const serviceId = service.body.data.id
    await call('PATCH', `/owner/services/${serviceId}`, { draftRevision: service.body.data.draftRevision, slug: 'websites' })

    const project = await call('POST', '/owner/projects', { type: 'client', name: 'Inknest' })
    expect(project.body.data.draft.slug).toBe('inknest')

    const data = await plan()
    expect(item(data, 'service', 'websites').action).toBe('skip')
    expect(item(data, 'service', 'websites').reason).toContain('already has a service')
    expect(item(data, 'project', 'inknest').action).toBe('skip')

    await runAll()

    const mine = (await call('GET', `/owner/services/${serviceId}`)).body.data
    expect(mine.draft.texts.en.name).toBe('My own websites')
    expect(mine.state).toBe('draft')
    expect(await count('v2_services')).toBe(3)
    expect(await count('v2_projects')).toBe(3)

    const { rows } = await database.db.query(`SELECT count(*)::int AS total FROM v2_project_versions WHERE slug = 'inknest'`)
    expect(rows[0].total).toBe(1)
  })

  it('keeps an image failure inside its own project', async () => {
    legacyFiles.delete('/images/work/inknest/discover.jpg')

    try {
      await runAll()
    } finally {
      legacyFiles.set('/images/work/inknest/discover.jpg', jpegBytes(800, 600))
    }

    const projects = (await call('GET', '/owner/projects')).body.data.items
    const states = Object.fromEntries(projects.map((project: Json) => [project.slug, project.state]))
    expect(states).toEqual({ inknest: 'draft', 'prime-estate': 'published', 'tech-store': 'draft' })

    // Everything else went through, services and booking included.
    expect(await count('v2_services')).toBe(3)
    expect(await count('v2_booking_types')).toBe(1)

    const data = await plan()
    expect(item(data, 'project', 'inknest').images).toEqual({ total: 2, copied: 1, failed: 1 })
    const { rows } = await database.db.query(`SELECT legacy_key, note FROM v2_legacy_imports WHERE outcome = 'failed' ORDER BY legacy_key`)
    expect(rows.map((row: Json) => row.legacy_key)).toEqual([
      '/images/work/inknest/discover.jpg',
      '/images/work/tech-store/missing.jpg',
    ])
  })

  it('refuses a run without the explicit confirmation', async () => {
    const answer = await call('POST', '/owner/import/legacy', {})
    expect(answer.status).toBe(422)
    expect(await count('v2_legacy_imports')).toBe(0)
  })
})

/* ---------------------------------------------------------------- the fence */

describe('who may copy', () => {
  it('answers 404 to any host but this machine', async () => {
    for (const route of ownerImportPaths) {
      const refused = await call(
        route.method,
        route.path.replace('/api/v2', ''),
        route.method === 'POST' ? { confirm: true } : undefined,
        { host: 'yamanwarda.de' },
      )
      expect(refused.status, route.method).toBe(404)
    }

    expect(statements).toEqual([])
    expect(await count('v2_legacy_imports')).toBe(0)
  })

  it('needs a real owner session, and the CSRF header on the run', async () => {
    process.env.BACKEND2_OWNER_AUTH = 'required'

    expect((await call('GET', '/owner/import/legacy')).status).toBe(401)
    expect((await call('POST', '/owner/import/legacy', { confirm: true })).status).toBe(401)

    const { rows } = await database.db.query(
      `INSERT INTO v2_owner (email, password_hash, totp_confirmed_at, recovery_codes_issued_at)
       VALUES ('owner@example.de', 'not-a-real-hash', now(), now()) RETURNING id`,
    )
    const session = await runWithDb(database.db, () =>
      createSession({ ownerId: rows[0].id, method: 'password_totp' }),
    )
    const cookie = `v2_owner_session=${encodeURIComponent(session.token)}; v2_csrf=${encodeURIComponent(session.csrfToken)}`

    expect((await call('GET', '/owner/import/legacy', undefined, { headers: { cookie } })).status).toBe(200)

    const forged = await call('POST', '/owner/import/legacy', { confirm: true }, { headers: { cookie } })
    expect(forged.status).toBe(401)
    expect(await count('v2_legacy_imports')).toBe(0)

    const allowed = await call('POST', '/owner/import/legacy', { confirm: true }, {
      headers: { cookie, 'x-v2-csrf': session.csrfToken },
    })
    expect(allowed.status).toBe(200)
    expect(allowed.body.data.remaining).toBe(13)
  })
})
