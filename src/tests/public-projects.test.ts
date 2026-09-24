import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryStore, createTestDatabase, pngBytes } from './helpers/backend2-db'

/**
 * Public cutover step 3: `/work`, the homepage selection and the project pages
 * reading Backend2 (`docs/v2/public-cutover.md`).
 *
 * Projects are created and published through the real owner routes against a
 * PostgreSQL inside this process and read back through the functions the
 * public server functions call. Nothing here can touch a real database.
 */
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
delete process.env.BACKEND2_OWNER_AUTH

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { useMediaStoreForTest } = await import('#/backend2/media/store')
const source = await import('#/frontend/features/work/server/projects-source')
const { projectKind } = await import('#/frontend/features/work/server/v2-projects')
const { getProjectBatch } = await import('#/frontend/features/work/project-list')

type Json = Record<string, any>

const database = await createTestDatabase()
const app = createAppForTest()

beforeEach(async () => {
  await database.reset()
  useMediaStoreForTest(createMemoryStore().store)
})

afterEach(() => {
  useMediaStoreForTest(undefined)
})

afterAll(async () => {
  await database.close()
})

/* ---------------------------------------------------------------- plumbing */

const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const request = new Request(`http://localhost:3000/api/v2${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json', origin: 'http://localhost:3000' }),
      ...headers,
    },
    body: body === undefined ? undefined : body instanceof Uint8Array ? (body as unknown as BodyInit) : JSON.stringify(body),
  })
  const response = await runWithDb(database.db, async () => app.fetch(request))
  const text = await response.text()

  return { status: response.status, body: (text === '' ? {} : JSON.parse(text)) as Json }
}

const read = <T>(fn: () => Promise<T>): Promise<T> => runWithDb(database.db, fn)

const addAsset = async (width: number, height: number, name = 'shot.png'): Promise<string> => {
  const bytes = pngBytes(width, height)
  const uploaded = await call('POST', '/owner/media/files', bytes, {
    'content-type': 'application/octet-stream',
    'content-length': String(bytes.byteLength),
    'x-media-filename': encodeURIComponent(name),
    origin: 'http://localhost:3000',
  })

  expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201)

  return uploaded.body.data.asset.id as string
}

const alt = (value: string) => ({ de: `${value} de`, en: `${value} en`, ar: `${value} ar` })

const texts = (name: string, over: Json = {}) =>
  Object.fromEntries(
    (['de', 'en', 'ar'] as const).map((language) => [
      language,
      { name: `${name} ${language}`, categoryLabel: '', summary: `Summary ${name} ${language}`, caseStudy: null, ...(over[language] ?? {}) },
    ]),
  )

const project = async (
  slug: string,
  options: { live?: boolean; over?: Json } = {},
): Promise<string> => {
  const created = await call('POST', '/owner/projects', { type: 'personal' })
  const id = created.body.data.id as string
  const saved = await call('PUT', `/owner/projects/${id}`, {
    draftRevision: created.body.data.draftRevision,
    slug,
    type: 'personal',
    workStatus: 'completed',
    clientName: null,
    showClientName: false,
    tech: ['React', 'TypeScript'],
    links: [],
    texts: texts(slug),
    cover: null,
    gallery: [],
    ...options.over,
  })

  expect(saved.status, JSON.stringify(saved.body)).toBe(200)

  if (options.live !== false) {
    const published = await call('POST', `/owner/projects/${id}/publish`, { draftRevision: saved.body.data.draftRevision })

    expect(published.status, JSON.stringify(published.body)).toBe(200)
  }

  return id
}

/* ============================================================ from Backend2 */

describe('/work and the homepage from Backend2', () => {
  it('maps a published project into the shape the accepted card draws', async () => {
    const cover = await addAsset(160, 100, 'cover.png')
    const shot = await addAsset(90, 160, 'phone.png')

    await project('prime-estate', {
      over: {
        type: 'client',
        workStatus: 'in_progress',
        texts: texts('prime-estate', { de: { categoryLabel: 'Immobilien' } }),
        cover: { mediaId: cover, alt: alt('Titelbild') },
        gallery: [{ mediaId: shot, alt: alt('Handy') }],
        links: [
          { kind: 'website', url: 'https://prime.test', isPublic: true, labels: { de: '', en: '', ar: '' } },
          { kind: 'source', url: 'https://github.test/private', isPublic: false, labels: { de: '', en: '', ar: '' } },
        ],
      },
    })

    const [entry] = await read(() => source.loadProjects({ language: 'de' }))

    expect(entry).toEqual({
      facts: {
        slug: 'prime-estate',
        status: 'building',
        website: 'https://prime.test',
        // A private link is never published.
        source: null,
        stack: ['React', 'TypeScript'],
        images: [
          { src: `/api/v2/media/${cover}`, width: 160, height: 100, alt: 'Titelbild de' },
          { src: `/api/v2/media/${shot}`, width: 90, height: 160, alt: 'Handy de' },
        ],
      },
      copy: {
        name: 'prime-estate de',
        kind: 'Kundenprojekt · Immobilien',
        summary: 'Summary prime-estate de',
      },
    })
  })

  it('names the project type in the owner approved words of each language', () => {
    expect(projectKind('demo', null, 'de')).toBe('Demo')
    expect(projectKind('personal', null, 'de')).toBe('Eigenes Projekt')
    expect(projectKind('client', null, 'de')).toBe('Kundenprojekt')
    expect(projectKind('personal', null, 'en')).toBe('Personal')
    expect(projectKind('demo', null, 'ar')).toBe('مشروع تجريبي')
    expect(projectKind('personal', null, 'ar')).toBe('مشروع شخصي')
    expect(projectKind('client', 'متجر', 'ar')).toBe('مشروع لعميل · متجر')
  })

  it('shows only published projects, in the owner order', async () => {
    await project('first')
    await project('private-draft', { live: false })
    const down = await project('taken-down')
    await project('second')
    const unpublished = await call('POST', `/owner/projects/${down}/unpublish`, {})
    expect(unpublished.status, JSON.stringify(unpublished.body)).toBe(200)

    const page = await read(() => source.loadProjectsPage({ language: 'en', page: 1 }))

    expect(page.total).toBe(2)
    expect(page.entries.map((entry) => entry.facts.slug)).toEqual(['first', 'second'])
  })

  it('asks for only the batches the page shows, and the homepage for six', async () => {
    for (let index = 1; index <= 8; index += 1) await project(`project-${index}`)

    const first = await read(() => source.loadProjectsPage({ language: 'en', page: 1 }))
    const second = await read(() => source.loadProjectsPage({ language: 'en', page: 2 }))
    const home = await read(() => source.loadProjects({ language: 'en' }))

    expect(first.entries).toHaveLength(6)
    expect(first.total).toBe(8)
    expect(getProjectBatch(first.entries, 1, first.total)).toMatchObject({ hasMore: true })
    expect(second.entries.map((entry) => entry.facts.slug)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `project-${n}`),
    )
    expect(getProjectBatch(second.entries, 2, second.total)).toMatchObject({ hasMore: false, page: 2 })
    expect(home).toHaveLength(6)

    // "Load more" asks for the missing batch alone.
    const next = await read(() => source.loadProjectsBatch({ language: 'en', offset: 6, limit: 6 }))
    expect(next.entries.map((entry) => entry.facts.slug)).toEqual(['project-7', 'project-8'])
    expect(next.total).toBe(8)
  })

  it('shows an empty list as an empty list', async () => {
    expect(await read(() => source.loadProjectsPage({ language: 'ar', page: 1 }))).toEqual({ entries: [], total: 0 })
  })

  it('gives the sitemap the published addresses only', async () => {
    await project('first')
    await project('private-draft', { live: false })
    await project('second')

    expect(await read(() => source.loadProjectSlugs())).toEqual(['first', 'second'])
  })
})

describe('a project page from Backend2', () => {
  it('carries the case study, with inline images resolved to public addresses', async () => {
    const inline = await addAsset(120, 90, 'inline.png')

    await project('prime-estate', {
      over: {
        texts: texts('prime-estate', {
          ar: {
            caseStudy: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'البداية' }] },
                { type: 'image', attrs: { mediaId: inline, alt: 'صورة', width: 120, height: 90 } },
              ],
            },
          },
        }),
      },
    })

    const entry = await read(() => source.loadProject({ language: 'ar', slug: 'prime-estate' }))

    expect(entry?.copy.name).toBe('prime-estate ar')
    expect(entry?.caseStudy?.content[1]).toEqual({
      type: 'image',
      attrs: { src: `/api/v2/media/${inline}`, alt: 'صورة', width: 120, height: 90 },
    })
    expect(JSON.stringify(entry)).not.toContain('mediaId')
  })

  it('has a null case study when none was written, so the page leaves the story out', async () => {
    await project('prime-estate')

    const entry = await read(() => source.loadProject({ language: 'en', slug: 'prime-estate' }))

    expect(entry).toHaveProperty('caseStudy', null)
  })

  it('answers a draft, a taken-down project and an unknown address with 404', async () => {
    await project('private-draft', { live: false })
    const down = await project('taken-down')
    await call('POST', `/owner/projects/${down}/unpublish`, {})

    for (const slug of ['private-draft', 'taken-down', 'never-existed']) {
      expect(await read(() => source.loadProject({ language: 'de', slug }))).toBeNull()
    }
  })

  it('names the current address when an earlier one is asked for, so the route can redirect', async () => {
    const id = await project('old-name')
    const current = await call('GET', `/owner/projects/${id}`)
    const saved = await call('PUT', `/owner/projects/${id}`, {
      draftRevision: current.body.data.draftRevision,
      slug: 'new-name',
      type: 'personal',
      workStatus: 'completed',
      clientName: null,
      showClientName: false,
      tech: [],
      links: [],
      texts: texts('old-name'),
      cover: null,
      gallery: [],
    })
    await call('POST', `/owner/projects/${id}/publish`, { draftRevision: saved.body.data.draftRevision })

    const entry = await read(() => source.loadProject({ language: 'en', slug: 'old-name' }))

    expect(entry?.facts.slug).toBe('new-name')
  })
})

describe('the /work batch arithmetic', () => {
  it('slices a list that holds every project', () => {
    const items = Array.from({ length: 10 }, (_, index) => index)

    expect(getProjectBatch(items, 1, 10)).toMatchObject({ page: 1, total: 10, hasMore: true })
    expect(getProjectBatch(items, 1, 10).visible).toHaveLength(6)
    expect(getProjectBatch(items, 9, 10)).toMatchObject({ page: 2, hasMore: false })
  })

  it('trusts the server total when only the shown batches arrive', () => {
    const six = Array.from({ length: 6 }, (_, index) => index)

    expect(getProjectBatch(six, 1, 20)).toMatchObject({ page: 1, total: 20, hasMore: true })
    // A deep link beyond the end is clamped to the last real page.
    expect(getProjectBatch(six, 99, 20).page).toBe(4)
  })
})
