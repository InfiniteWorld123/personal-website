import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryStore, createTestDatabase, pngBytes } from './helpers/backend2-db'

/**
 * Projects, end to end, against a real PostgreSQL running inside this process.
 *
 * What is under test is mostly *restraint*: that saving a draft cannot change
 * a single byte of what a visitor is reading, that a failed publish writes
 * nothing at all, that a hidden client name and a private repository link
 * never appear in a public response, and that an unpublished project answers
 * exactly as a project that never existed.
 *
 * The environment is set before Backend2 is imported, because the application
 * decides at start-up whether the owner routes exist at all.
 */
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
delete process.env.BACKEND2_OWNER_AUTH

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { useMediaStoreForTest } = await import('#/backend2/media/store')

const { reorder } = await import('#/backend2/modules/projects/project.order')
const { publishBlockers, slugify, ProjectDraftSchema } = await import(
  '#/backend2/contracts/project.contract'
)
const v = await import('valibot')

type Json = Record<string, any>

const database = await createTestDatabase()
const app = createAppForTest()
let storage = createMemoryStore()

beforeEach(async () => {
  await database.reset()
  storage = createMemoryStore()
  useMediaStoreForTest(storage.store)
})

afterEach(() => {
  useMediaStoreForTest(undefined)
  delete process.env.BACKEND2_OWNER_AUTH
})

afterAll(async () => {
  useMediaStoreForTest(undefined)
  await database.close()
})

/* ---------------------------------------------------------------- plumbing */

const call = async (
  method: string,
  path: string,
  body?: unknown,
  options: { host?: string } = {},
): Promise<{ status: number; body: Json; response: Response }> => {
  const request = new Request(`http://${options.host ?? 'localhost:3000'}/api/v2${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json', origin: `http://${options.host ?? 'localhost:3000'}` },
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

/**
 * A real file in the shared library, so a project can select one.
 *
 * Sent through the upload route rather than the service, the way the picker's
 * **Upload from computer** button does it: the file reaches the library first
 * and is selected second, which is the ordering `docs/v2/media.md` requires.
 */
const addAsset = async (name = 'cover.png'): Promise<string> => {
  const bytes = pngBytes(120, 90)

  const request = new Request('http://localhost:3000/api/v2/owner/media/files', {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.byteLength),
      'x-media-filename': encodeURIComponent(name),
      origin: 'http://localhost:3000',
    },
    body: bytes as unknown as BodyInit,
  })

  const response = await runWithDb(database.db, async () => app.fetch(request))
  const body = (await response.json()) as Json

  expect(response.status, JSON.stringify(body)).toBe(201)

  return body.data.asset.id as string
}

const texts = (over: Partial<Record<'de' | 'en' | 'ar', Partial<Json>>> = {}) => {
  const one = (language: 'de' | 'en' | 'ar') => ({
    name: `Name ${language}`,
    categoryLabel: '',
    summary: `Summary ${language}`,
    caseStudy: null,
    ...(over[language] ?? {}),
  })

  return { de: one('de'), en: one('en'), ar: one('ar') }
}

const blank = () => ({
  de: { name: '', categoryLabel: '', summary: '', caseStudy: null },
  en: { name: '', categoryLabel: '', summary: '', caseStudy: null },
  ar: { name: '', categoryLabel: '', summary: '', caseStudy: null },
})

const alt = (value = 'A picture') => ({ de: value, en: value, ar: value })

/** Creates a project and saves one complete, publishable draft over it. */
const makePublishable = async (over: Json = {}) => {
  const created = await call('POST', '/owner/projects', { type: 'client' })
  const id = created.body.data.id as string

  const saved = await call('PUT', `/owner/projects/${id}`, {
    draftRevision: created.body.data.draftRevision,
    slug: 'prime-estate',
    type: 'client',
    workStatus: 'completed',
    clientName: null,
    showClientName: false,
    tech: ['React'],
    links: [],
    texts: texts(),
    cover: null,
    gallery: [],
    ...over,
  })

  return { id, saved }
}

/* ============================================================== pure rules */

describe('the rules that need no database', () => {
  it('lets an unfinished project save and names everything publication needs', () => {
    // `parse`, not `safeParse` with a cast: the claim is that this *does*
    // save, so a schema that stopped accepting it should fail here with a
    // readable message rather than pass a coerced value along quietly.
    const parsed = v.parse(ProjectDraftSchema, { type: 'demo', texts: blank() })

    const blockers = publishBlockers(parsed)

    // One sentence per missing thing, each naming its language.
    expect(blockers).toContain('The web address is empty')
    for (const language of ['DE', 'EN', 'AR']) {
      expect(blockers).toContain(`${language}: the project name is empty`)
      expect(blockers).toContain(`${language}: the summary is empty`)
    }
  })

  it('has nothing to say about a complete project', () => {
    const parsed = v.parse(ProjectDraftSchema, {
      slug: 'a-project',
      type: 'demo',
      texts: texts(),
    })

    expect(publishBlockers(parsed)).toEqual([])
  })

  it('refuses a javascript: link and more than one website link', () => {
    const unsafe = v.safeParse(ProjectDraftSchema, {
      type: 'demo',
      texts: blank(),
      links: [{ kind: 'website', url: 'javascript:alert(1)', labels: alt('') }],
    })

    expect(unsafe.success).toBe(false)

    const two = v.safeParse(ProjectDraftSchema, {
      type: 'demo',
      texts: blank(),
      links: [
        { kind: 'website', url: 'https://one.test', labels: alt('') },
        { kind: 'website', url: 'https://two.test', labels: alt('') },
      ],
    })

    expect(two.success).toBe(false)
  })

  it('renumbers densely wherever a project is moved', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']

    expect(reorder(ids, 'e', 1)).toEqual(['e', 'a', 'b', 'c', 'd'])
    expect(reorder(ids, 'a', 5)).toEqual(['b', 'c', 'd', 'e', 'a'])
    // Across what would be a page boundary at 2 per page.
    expect(reorder(ids, 'e', 2)).toEqual(['a', 'e', 'b', 'c', 'd'])
    // Onto itself, and past both ends: clamped, never lost.
    expect(reorder(ids, 'c', 3)).toEqual(ids)
    expect(reorder(ids, 'c', 99)).toEqual(['a', 'b', 'd', 'e', 'c'])
    expect(reorder(ids, 'c', -4)).toEqual(['c', 'a', 'b', 'd', 'e'])
  })

  it('suggests a web address from a name, and nothing from Arabic alone', () => {
    expect(slugify('Präzise Immobilien — Prime Estate!')).toBe('praezise-immobilien-prime-estate')
    expect(slugify('مشروع')).toBe('')
  })
})

/* ====================================================== the security fence */

describe('the deployment fence', () => {
  it('answers 404 — never 401 — on every owner route from a non-local host', async () => {
    const { ownerProjectPaths } = await import('#/backend2/modules/projects/project.owner.route')

    for (const route of ownerProjectPaths) {
      const request = new Request(`https://yamanwarda.de${route.path}`, {
        method: route.method,
        headers: { 'content-type': 'application/json', origin: 'https://yamanwarda.de' },
        body: route.method === 'GET' || route.method === 'DELETE' ? undefined : '{}',
      })

      const response = await runWithDb(database.db, async () => app.fetch(request))

      expect(response.status, `${route.method} ${route.path}`).toBe(404)
    }
  })
})

/* ==================================================== drafts and publishing */

describe('a private draft', () => {
  it('survives missing translations and cannot be reached publicly', async () => {
    const created = await call('POST', '/owner/projects', { type: 'demo', name: 'Half done' })

    expect(created.status).toBe(201)
    expect(created.body.data.state).toBe('draft')

    const saved = await call('PUT', `/owner/projects/${created.body.data.id}`, {
      draftRevision: created.body.data.draftRevision,
      slug: 'half-done',
      type: 'demo',
      workStatus: 'in_progress',
      clientName: null,
      showClientName: false,
      tech: [],
      links: [],
      texts: texts({ ar: { name: '', summary: '' } }),
      cover: null,
      gallery: [],
    })

    expect(saved.status).toBe(200)
    expect(saved.body.data.publishBlockers).toContain('AR: the project name is empty')

    // Nothing about it is public.
    const list = await call('GET', '/projects')
    expect(list.body.data.items).toHaveLength(0)

    const detail = await call('GET', '/projects/half-done')
    expect(detail.status).toBe(404)
  })

  it('refuses an image that is not in the Media library', async () => {
    const { id } = await makePublishable()
    const project = await call('GET', `/owner/projects/${id}`)

    const saved = await call('PUT', `/owner/projects/${id}`, {
      draftRevision: project.body.data.draftRevision,
      slug: 'prime-estate',
      type: 'client',
      workStatus: 'completed',
      clientName: null,
      showClientName: false,
      tech: [],
      links: [],
      texts: texts(),
      cover: { mediaId: '11111111-1111-4111-8111-111111111111', alt: alt() },
      gallery: [],
    })

    expect(saved.status).toBe(400)
    expect(saved.body.message).toMatch(/not in the Media library/i)
  })

  it('refuses a stale revision instead of overwriting', async () => {
    const { id } = await makePublishable()
    const stale = await call('PUT', `/owner/projects/${id}`, {
      draftRevision: 1,
      slug: 'prime-estate',
      type: 'client',
      workStatus: 'completed',
      clientName: null,
      showClientName: false,
      tech: [],
      links: [],
      texts: texts({ en: { name: 'Overwritten' } }),
      cover: null,
      gallery: [],
    })

    expect(stale.status).toBe(409)

    const after = await call('GET', `/owner/projects/${id}`)
    expect(after.body.data.draft.texts.en.name).toBe('Name en')
  })
})

describe('publishing', () => {
  it('explains every missing requirement and writes nothing', async () => {
    const created = await call('POST', '/owner/projects', { type: 'demo' })
    const id = created.body.data.id as string

    const attempt = await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: created.body.data.draftRevision,
    })

    expect(attempt.status).toBe(422)
    expect(attempt.body.details.missing.length).toBeGreaterThan(0)

    const after = await call('GET', `/owner/projects/${id}`)
    expect(after.body.data.state).toBe('draft')
    expect(after.body.data.published).toBeNull()
  })

  it('demands alt text in all three languages for every public image', async () => {
    const assetId = await addAsset()
    const { id } = await makePublishable()
    const loaded = await call('GET', `/owner/projects/${id}`)

    await call('PUT', `/owner/projects/${id}`, {
      draftRevision: loaded.body.data.draftRevision,
      slug: 'prime-estate',
      type: 'client',
      workStatus: 'completed',
      clientName: null,
      showClientName: false,
      tech: [],
      links: [],
      texts: texts(),
      cover: { mediaId: assetId, alt: { de: 'Titelbild', en: '', ar: '' } },
      gallery: [],
    })

    const reloaded = await call('GET', `/owner/projects/${id}`)

    expect(reloaded.body.data.publishBlockers).toContain(
      'The cover image has no EN alternative text',
    )
    expect(reloaded.body.data.publishBlockers).toContain(
      'The cover image has no AR alternative text',
    )

    const attempt = await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: reloaded.body.data.draftRevision,
    })

    expect(attempt.status).toBe(422)
  })

  it('makes a project public, and its images reachable, only once published', async () => {
    const assetId = await addAsset()
    const { id } = await makePublishable()
    const loaded = await call('GET', `/owner/projects/${id}`)

    await call('PUT', `/owner/projects/${id}`, {
      draftRevision: loaded.body.data.draftRevision,
      slug: 'prime-estate',
      type: 'client',
      workStatus: 'completed',
      clientName: null,
      showClientName: false,
      tech: ['React'],
      links: [],
      texts: texts(),
      cover: { mediaId: assetId, alt: alt('Das Titelbild') },
      gallery: [],
    })

    const before = await runWithDb(database.db, async () =>
      app.fetch(new Request(`http://localhost:3000/api/v2/media/${assetId}`)),
    )

    // A draft's image is nobody's business but the owner's.
    expect(before.status).toBe(404)

    const ready = await call('GET', `/owner/projects/${id}`)
    const published = await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: ready.body.data.draftRevision,
    })

    expect(published.status).toBe(200)
    expect(published.body.data.state).toBe('published')

    const after = await runWithDb(database.db, async () =>
      app.fetch(new Request(`http://localhost:3000/api/v2/media/${assetId}`)),
    )

    expect(after.status).toBe(200)

    const detail = await call('GET', '/projects/prime-estate?language=de')
    expect(detail.status).toBe(200)
    expect(detail.body.data.name).toBe('Name de')
    expect(detail.body.data.cover.alt).toBe('Das Titelbild')
    expect(detail.body.data.cover.url).toBe(`/api/v2/media/${assetId}`)
  })

  it('leaves the live version untouched while a pending edit is saved', async () => {
    const { id } = await makePublishable()
    const ready = await call('GET', `/owner/projects/${id}`)

    await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: ready.body.data.draftRevision,
    })

    const live = await call('GET', '/projects/prime-estate?language=en')

    const published = await call('GET', `/owner/projects/${id}`)
    await call('PUT', `/owner/projects/${id}`, {
      draftRevision: published.body.data.draftRevision,
      slug: 'prime-estate',
      type: 'client',
      workStatus: 'completed',
      clientName: null,
      showClientName: false,
      tech: [],
      links: [],
      texts: texts({ en: { name: 'A newer name nobody approved' } }),
      cover: null,
      gallery: [],
    })

    const stillLive = await call('GET', '/projects/prime-estate?language=en')

    expect(stillLive.body.data).toEqual(live.body.data)
    expect(stillLive.body.data.name).toBe('Name en')

    const state = await call('GET', `/owner/projects/${id}`)
    expect(state.body.data.state).toBe('published_with_pending_changes')
    expect(state.body.data.hasPendingChanges).toBe(true)
    // The pending change is kept, not discarded.
    expect(state.body.data.draft.texts.en.name).toBe('A newer name nobody approved')
  })

  it('keeps the live version and the pending changes when a publish update fails', async () => {
    const { id } = await makePublishable()
    const ready = await call('GET', `/owner/projects/${id}`)

    await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: ready.body.data.draftRevision,
    })

    const live = await call('GET', '/projects/prime-estate?language=ar')
    const published = await call('GET', `/owner/projects/${id}`)

    await call('PUT', `/owner/projects/${id}`, {
      draftRevision: published.body.data.draftRevision,
      slug: 'prime-estate',
      type: 'client',
      workStatus: 'completed',
      clientName: null,
      showClientName: false,
      tech: [],
      links: [],
      texts: texts({ ar: { summary: '' } }),
      cover: null,
      gallery: [],
    })

    const pending = await call('GET', `/owner/projects/${id}`)
    const attempt = await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: pending.body.data.draftRevision,
    })

    expect(attempt.status).toBe(422)
    expect(attempt.body.details.missing).toContain('AR: the summary is empty')

    const stillLive = await call('GET', '/projects/prime-estate?language=ar')
    expect(stillLive.body.data).toEqual(live.body.data)

    const after = await call('GET', `/owner/projects/${id}`)
    expect(after.body.data.draft.texts.ar.summary).toBe('')
    expect(after.body.data.published.texts.ar.summary).toBe('Summary ar')
  })

  it('swaps the version atomically on a valid publish update', async () => {
    const { id } = await makePublishable()
    const ready = await call('GET', `/owner/projects/${id}`)

    await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: ready.body.data.draftRevision,
    })

    const published = await call('GET', `/owner/projects/${id}`)
    await call('PUT', `/owner/projects/${id}`, {
      draftRevision: published.body.data.draftRevision,
      slug: 'prime-estate',
      type: 'client',
      workStatus: 'completed',
      clientName: null,
      showClientName: false,
      tech: [],
      links: [],
      texts: texts({ en: { name: 'The approved name' } }),
      cover: null,
      gallery: [],
    })

    const pending = await call('GET', `/owner/projects/${id}`)
    const update = await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: pending.body.data.draftRevision,
    })

    expect(update.status).toBe(200)
    expect(update.body.data.state).toBe('published')
    expect(update.body.data.hasPendingChanges).toBe(false)

    const live = await call('GET', '/projects/prime-estate?language=en')
    expect(live.body.data.name).toBe('The approved name')

    // Exactly one published version survives the swap.
    const { rows } = await database.db.query(
      `SELECT count(*)::int AS n FROM v2_project_versions WHERE kind = 'published'`,
    )
    expect(rows[0].n).toBe(1)
  })

  it('gives the draft back to what is live when pending changes are discarded', async () => {
    const { id } = await makePublishable()
    const ready = await call('GET', `/owner/projects/${id}`)

    await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: ready.body.data.draftRevision,
    })

    const published = await call('GET', `/owner/projects/${id}`)
    await call('PUT', `/owner/projects/${id}`, {
      draftRevision: published.body.data.draftRevision,
      slug: 'prime-estate',
      type: 'client',
      workStatus: 'completed',
      clientName: null,
      showClientName: false,
      tech: [],
      links: [],
      texts: texts({ en: { name: 'Regret' } }),
      cover: null,
      gallery: [],
    })

    const pending = await call('GET', `/owner/projects/${id}`)
    const discarded = await call('POST', `/owner/projects/${id}/discard-pending`, {
      draftRevision: pending.body.data.draftRevision,
    })

    expect(discarded.status).toBe(200)
    expect(discarded.body.data.draft.texts.en.name).toBe('Name en')
    expect(discarded.body.data.hasPendingChanges).toBe(false)
  })

  it('refuses to discard pending changes on a project that was never published', async () => {
    const { id } = await makePublishable()
    const loaded = await call('GET', `/owner/projects/${id}`)

    const attempt = await call('POST', `/owner/projects/${id}/discard-pending`, {
      draftRevision: loaded.body.data.draftRevision,
    })

    expect(attempt.status).toBe(422)
  })
})

/* ============================================================ what is public */

describe('what a visitor receives', () => {
  it('never carries a hidden client name, a private link, or an internal id', async () => {
    const { id } = await makePublishable({
      clientName: 'Geheime Firma GmbH',
      showClientName: false,
      links: [
        { kind: 'source', url: 'https://github.test/private-repo', isPublic: false, labels: alt('') },
        { kind: 'other', url: 'https://internal.test/secret', isPublic: false, labels: alt('X') },
        { kind: 'website', url: 'https://public.test', isPublic: true, labels: alt('') },
      ],
    })

    const ready = await call('GET', `/owner/projects/${id}`)
    await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: ready.body.data.draftRevision,
    })

    const detail = await call('GET', '/projects/prime-estate?language=de')
    const serialised = JSON.stringify(detail.body)

    // Deep-scanned rather than field-checked: a future field that spread a row
    // would be caught here, which a named assertion would not.
    expect(serialised).not.toContain('Geheime Firma GmbH')
    expect(serialised).not.toContain('private-repo')
    expect(serialised).not.toContain('internal.test')
    expect(serialised).not.toContain(id)
    expect(serialised).not.toMatch(/storage_key|storageKey/)
    // The other two languages are not sent either.
    expect(serialised).not.toContain('Summary en')
    expect(serialised).not.toContain('Summary ar')

    expect(detail.body.data.client).toBeNull()
    expect(detail.body.data.source).toBeNull()
    expect(detail.body.data.otherLinks).toEqual([])
    expect(detail.body.data.website).toBe('https://public.test')
  })

  it('shows the client name only when the owner allows it', async () => {
    const { id } = await makePublishable({
      clientName: 'Offene Firma GmbH',
      showClientName: true,
    })

    const ready = await call('GET', `/owner/projects/${id}`)
    await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: ready.body.data.draftRevision,
    })

    const detail = await call('GET', '/projects/prime-estate')
    expect(detail.body.data.client).toEqual({ name: 'Offene Firma GmbH' })
  })

  it('still resolves an old address, and says which one is canonical', async () => {
    const { id } = await makePublishable()
    const ready = await call('GET', `/owner/projects/${id}`)

    await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: ready.body.data.draftRevision,
    })

    const published = await call('GET', `/owner/projects/${id}`)
    await call('PUT', `/owner/projects/${id}`, {
      draftRevision: published.body.data.draftRevision,
      slug: 'prime-estate-2026',
      type: 'client',
      workStatus: 'completed',
      clientName: null,
      showClientName: false,
      tech: [],
      links: [],
      texts: texts(),
      cover: null,
      gallery: [],
    })

    const pending = await call('GET', `/owner/projects/${id}`)
    await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: pending.body.data.draftRevision,
    })

    const old = await call('GET', '/projects/prime-estate')

    // 200 with the canonical address, never an HTTP redirect (D12).
    expect(old.status).toBe(200)
    expect(old.body.data.canonicalSlug).toBe('prime-estate-2026')

    const current = await call('GET', '/projects/prime-estate-2026')
    expect(current.status).toBe(200)
  })

  it('answers 404 for an unpublished project, exactly as for one that never existed', async () => {
    const { id } = await makePublishable()
    const ready = await call('GET', `/owner/projects/${id}`)

    await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: ready.body.data.draftRevision,
    })

    expect((await call('GET', '/projects/prime-estate')).status).toBe(200)

    await call('POST', `/owner/projects/${id}/unpublish`)

    const gone = await call('GET', '/projects/prime-estate')
    const never = await call('GET', '/projects/never-existed')

    expect(gone.status).toBe(404)
    expect(gone.body.code).toBe(never.body.code)

    const state = await call('GET', `/owner/projects/${id}`)
    // Unpublished, not draft: the owner took it down rather than never
    // having published it.
    expect(state.body.data.state).toBe('unpublished')
  })

  it('stops serving a published image once the project comes down', async () => {
    const assetId = await addAsset()
    const { id } = await makePublishable()
    const loaded = await call('GET', `/owner/projects/${id}`)

    await call('PUT', `/owner/projects/${id}`, {
      draftRevision: loaded.body.data.draftRevision,
      slug: 'prime-estate',
      type: 'client',
      workStatus: 'completed',
      clientName: null,
      showClientName: false,
      tech: [],
      links: [],
      texts: texts(),
      cover: { mediaId: assetId, alt: alt() },
      gallery: [],
    })

    const ready = await call('GET', `/owner/projects/${id}`)
    await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: ready.body.data.draftRevision,
    })

    const serving = await runWithDb(database.db, async () =>
      app.fetch(new Request(`http://localhost:3000/api/v2/media/${assetId}`)),
    )
    expect(serving.status).toBe(200)

    await call('POST', `/owner/projects/${id}/unpublish`)

    const withdrawn = await runWithDb(database.db, async () =>
      app.fetch(new Request(`http://localhost:3000/api/v2/media/${assetId}`)),
    )
    expect(withdrawn.status).toBe(404)
  })

  /*
   * Found by unpublishing a project in a real browser and watching it keep
   * answering 200 from the HTTP cache while the origin already said 404.
   *
   * The images may be cached for an hour because an asset is immutable. This
   * JSON is not: it changes on every **Publish update**, and a long cache
   * turns that button into "nothing happened".
   */
  it('does not let a stale published version outlive a publish update for long', async () => {
    const { id } = await makePublishable()
    const ready = await call('GET', `/owner/projects/${id}`)

    await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: ready.body.data.draftRevision,
    })

    for (const path of ['/projects', '/projects/prime-estate']) {
      const cacheControl = (await call('GET', path)).response.headers.get('cache-control') ?? ''
      const seconds = Number(/max-age=(\d+)/.exec(cacheControl)?.[1] ?? '0')

      expect(seconds, `${path} sent ${cacheControl}`).toBeLessThanOrEqual(60)
    }

    // A private draft, by contrast, may not be stored by anything at all.
    const owner = await call('GET', `/owner/projects/${id}`)
    expect(owner.response.headers.get('cache-control')).toContain('no-store')
  })

  it('asks for one batch at a time and reports whether more exist', async () => {
    for (let index = 0; index < 8; index += 1) {
      const created = await call('POST', '/owner/projects', { type: 'demo' })
      const id = created.body.data.id as string

      await call('PUT', `/owner/projects/${id}`, {
        draftRevision: created.body.data.draftRevision,
        slug: `project-${index}`,
        type: 'demo',
        workStatus: 'completed',
        clientName: null,
        showClientName: false,
        tech: [],
        links: [],
        texts: texts(),
        cover: null,
        gallery: [],
      })

      const ready = await call('GET', `/owner/projects/${id}`)
      await call('POST', `/owner/projects/${id}/publish`, {
        draftRevision: ready.body.data.draftRevision,
      })
    }

    const first = await call('GET', '/projects?offset=0&limit=6')
    expect(first.body.data.items).toHaveLength(6)
    expect(first.body.data.total).toBe(8)
    expect(first.body.data.hasMore).toBe(true)

    const second = await call('GET', '/projects?offset=6&limit=6')
    expect(second.body.data.items).toHaveLength(2)
    expect(second.body.data.hasMore).toBe(false)

    // The two batches do not overlap.
    const slugs = [...first.body.data.items, ...second.body.data.items].map(
      (item: Json) => item.slug,
    )
    expect(new Set(slugs).size).toBe(8)

    // Bounded on the server, whatever the caller asks for.
    const greedy = await call('GET', '/projects?offset=0&limit=500')
    expect(greedy.status).toBe(422)
  })
})

/* ================================================================ ordering */

describe('the manual order', () => {
  it('is one global order that the public list follows', async () => {
    const ids: string[] = []

    for (let index = 0; index < 5; index += 1) {
      const created = await call('POST', '/owner/projects', { type: 'demo' })
      const id = created.body.data.id as string
      ids.push(id)

      await call('PUT', `/owner/projects/${id}`, {
        draftRevision: created.body.data.draftRevision,
        slug: `p-${index}`,
        type: 'demo',
        workStatus: 'completed',
        clientName: null,
        showClientName: false,
        tech: [],
        links: [],
        texts: texts(),
        cover: null,
        gallery: [],
      })

      // Only the even ones are published, so the public list is a filtered
      // view of the same order rather than its own sequence.
      if (index % 2 === 0) {
        const ready = await call('GET', `/owner/projects/${id}`)
        await call('POST', `/owner/projects/${id}/publish`, {
          draftRevision: ready.body.data.draftRevision,
        })
      }
    }

    const before = await call('GET', '/projects?limit=6')
    expect(before.body.data.items.map((item: Json) => item.slug)).toEqual(['p-0', 'p-2', 'p-4'])

    // Move the last project to the front — from what would be a second
    // dashboard page at 2 per page.
    const moved = await call('POST', `/owner/projects/${ids[4]}/position`, { position: 1 })
    expect(moved.status).toBe(200)
    expect(moved.body.data.position).toBe(1)

    const after = await call('GET', '/projects?limit=6')
    expect(after.body.data.items.map((item: Json) => item.slug)).toEqual(['p-4', 'p-0', 'p-2'])

    // Dense and unique afterwards.
    const { rows } = await database.db.query('SELECT position FROM v2_projects ORDER BY position')
    expect(rows.map((row: Json) => row.position)).toEqual([1, 2, 3, 4, 5])
  })

  it('clamps a dashboard page past the end instead of stranding the owner', async () => {
    await makePublishable()

    const far = await call('GET', '/owner/projects?page=9&pageSize=20')

    expect(far.status).toBe(200)
    expect(far.body.data.page).toBe(1)
    expect(far.body.data.items).toHaveLength(1)
  })
})

/* ================================================== archive, restore, delete */

describe('archiving and deleting', () => {
  it('hides an archived project everywhere and brings it back unpublished', async () => {
    const { id } = await makePublishable()
    const ready = await call('GET', `/owner/projects/${id}`)

    await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: ready.body.data.draftRevision,
    })

    const archived = await call('POST', `/owner/projects/${id}/archive`)
    expect(archived.body.data.state).toBe('archived')

    expect((await call('GET', '/projects/prime-estate')).status).toBe(404)
    expect((await call('GET', '/projects')).body.data.items).toHaveLength(0)
    // Gone from the default dashboard list too, but findable on purpose.
    expect((await call('GET', '/owner/projects')).body.data.items).toHaveLength(0)
    expect((await call('GET', '/owner/projects?state=archived')).body.data.items).toHaveLength(1)

    const restored = await call('POST', `/owner/projects/${id}/restore`)
    expect(restored.body.data.state).toBe('unpublished')
    // Restoring does not re-publish: that stays a deliberate act.
    expect((await call('GET', '/projects/prime-estate')).status).toBe(404)
  })

  it('refuses a permanent delete without the project id, and keeps the files', async () => {
    const assetId = await addAsset()
    const { id } = await makePublishable()
    const loaded = await call('GET', `/owner/projects/${id}`)

    await call('PUT', `/owner/projects/${id}`, {
      draftRevision: loaded.body.data.draftRevision,
      slug: 'prime-estate',
      type: 'client',
      workStatus: 'completed',
      clientName: null,
      showClientName: false,
      tech: [],
      links: [],
      texts: texts(),
      cover: { mediaId: assetId, alt: alt() },
      gallery: [],
    })

    const wrong = await call('DELETE', `/owner/projects/${id}`, { confirm: 'yes' })
    expect(wrong.status).toBe(422)
    expect((await call('GET', `/owner/projects/${id}`)).status).toBe(200)

    const right = await call('DELETE', `/owner/projects/${id}`, { confirm: id })
    expect(right.status).toBe(200)
    expect((await call('GET', `/owner/projects/${id}`)).status).toBe(404)

    /*
     * The vault keeps the file. `docs/v2/media.md`: "A file no module uses is
     * a file the owner kept on purpose." Deleting a project forgets its uses,
     * it does not reach into the library.
     */
    const { rows } = await database.db.query('SELECT count(*)::int AS n FROM v2_media_assets')
    expect(rows[0].n).toBe(1)

    const references = await database.db.query(
      `SELECT count(*)::int AS n FROM v2_media_references WHERE module = 'projects'`,
    )
    expect(references.rows[0].n).toBe(0)
  })

  it('will not let Media delete a file a project still uses', async () => {
    const assetId = await addAsset()
    const { id } = await makePublishable()
    const loaded = await call('GET', `/owner/projects/${id}`)

    await call('PUT', `/owner/projects/${id}`, {
      draftRevision: loaded.body.data.draftRevision,
      slug: 'prime-estate',
      type: 'client',
      workStatus: 'completed',
      clientName: null,
      showClientName: false,
      tech: [],
      links: [],
      texts: texts(),
      cover: { mediaId: assetId, alt: alt() },
      gallery: [],
    })

    const refused = await call('DELETE', `/owner/media/files/${assetId}`)

    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('DELETE_BLOCKED_BY_REFERENCES')
  })
})

/* =========================================================== the preview */

describe("the owner's preview", () => {
  /** Image responses are bytes, not the JSON envelope `call` expects. */
  const fetchImage = (path: string) =>
    runWithDb(database.db, async () => app.fetch(new Request(`http://localhost:3000${path}`)))

  it('shows the saved draft, while visitors keep the published version', async () => {
    const { id } = await makePublishable()
    const ready = await call('GET', `/owner/projects/${id}`)

    await call('POST', `/owner/projects/${id}/publish`, {
      draftRevision: ready.body.data.draftRevision,
    })

    const published = await call('GET', `/owner/projects/${id}`)
    await call('PUT', `/owner/projects/${id}`, {
      draftRevision: published.body.data.draftRevision,
      slug: 'prime-estate',
      type: 'client',
      workStatus: 'completed',
      clientName: null,
      showClientName: false,
      tech: [],
      links: [],
      texts: texts({ en: { name: 'The name I have not published yet' } }),
      cover: null,
      gallery: [],
    })

    const preview = await call('GET', `/owner/projects/${id}/preview?language=en`)
    const live = await call('GET', '/projects/prime-estate?language=en')

    expect(preview.status).toBe(200)
    expect(preview.body.data.name).toBe('The name I have not published yet')
    expect(live.body.data.name).toBe('Name en')
    // A private draft must not survive in a cache on its way to the owner.
    expect(preview.response.headers.get('cache-control')).toContain('no-store')
  })

  it('previews an unpublished project, in exactly one language', async () => {
    const { id } = await makePublishable()

    const german = await call('GET', `/owner/projects/${id}/preview?language=de`)
    const arabic = await call('GET', `/owner/projects/${id}/preview?language=ar`)

    expect(german.body.data.summary).toBe('Summary de')
    expect(arabic.body.data.summary).toBe('Summary ar')
    // The other two languages are not sent, as on the public route.
    expect(JSON.stringify(german.body)).not.toContain('Summary en')
    expect(JSON.stringify(german.body)).not.toContain('Summary ar')
    // Previewing publishes nothing.
    expect((await call('GET', '/projects/prime-estate')).status).toBe(404)
  })

  it("points the draft's images at the owner's route, so they actually load", async () => {
    const coverId = await addAsset('cover.png')
    const inlineId = await addAsset('inline.png')
    const { id } = await makePublishable()
    const loaded = await call('GET', `/owner/projects/${id}`)

    await call('PUT', `/owner/projects/${id}`, {
      draftRevision: loaded.body.data.draftRevision,
      slug: 'prime-estate',
      type: 'client',
      workStatus: 'completed',
      clientName: null,
      showClientName: false,
      tech: [],
      links: [],
      texts: texts({
        de: {
          caseStudy: {
            type: 'doc',
            content: [
              {
                type: 'image',
                attrs: { mediaId: inlineId, alt: 'Im Text', width: 120, height: 90 },
              },
            ],
          },
        },
      }),
      cover: { mediaId: coverId, alt: alt('Das Titelbild') },
      gallery: [],
    })

    const preview = await call('GET', `/owner/projects/${id}/preview?language=de`)
    const coverUrl = preview.body.data.cover.url as string
    const inlineUrl = preview.body.data.caseStudy.content[0].attrs.src as string

    // The bug this guards: built with the public route, both of these answered
    // 404 — the pictures were broken exactly where the owner was checking them.
    expect(coverUrl).toBe(`/api/v2/owner/media/files/${coverId}/content`)
    expect(inlineUrl).toBe(`/api/v2/owner/media/files/${inlineId}/content`)
    expect((await fetchImage(coverUrl)).status).toBe(200)
    expect((await fetchImage(inlineUrl)).status).toBe(200)

    // And looking at a draft did not make its images public.
    expect((await fetchImage(`/api/v2/media/${coverId}`)).status).toBe(404)
    expect((await fetchImage(`/api/v2/media/${inlineId}`)).status).toBe(404)
  })

  it('follows the public rules for what is shown at all', async () => {
    const { id } = await makePublishable({
      clientName: 'Geheime Firma GmbH',
      showClientName: false,
      links: [
        { kind: 'source', url: 'https://github.test/private-repo', isPublic: false, labels: alt('') },
        { kind: 'website', url: 'https://public.test', isPublic: true, labels: alt('') },
      ],
    })

    const preview = await call('GET', `/owner/projects/${id}/preview?language=de`)
    const serialised = JSON.stringify(preview.body)

    // What the owner previews is what publishing would produce — so what a
    // visitor would never see does not appear in the preview either.
    expect(serialised).not.toContain('Geheime Firma GmbH')
    expect(serialised).not.toContain('private-repo')
    expect(preview.body.data.website).toBe('https://public.test')
    expect(preview.body.data.client).toBeNull()
  })

  it('answers 404 for a project that does not exist', async () => {
    const missing = await call(
      'GET',
      '/owner/projects/11111111-1111-4111-8111-111111111111/preview?language=de',
    )

    expect(missing.status).toBe(404)
  })
})
