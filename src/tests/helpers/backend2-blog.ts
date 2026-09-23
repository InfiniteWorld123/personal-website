import { expect } from 'vitest'
import { pdfBytes, pngBytes } from './backend2-db'
import type { TestDatabase } from './backend2-db'

/**
 * The plumbing both Blog suites share: calling the application the way a
 * browser would, putting real files in the shared library, and building
 * articles one helper at a time.
 *
 * A factory rather than module state, because each suite owns its own
 * in-process PostgreSQL and its own copy of the application.
 */

export type Json = Record<string, any>
export type Language = 'de' | 'en' | 'ar'

export const LANGUAGES: Language[] = ['de', 'en', 'ar']

type App = { fetch: (request: Request) => Response | Promise<Response> }
type RunWithDb = <T>(db: TestDatabase['db'], fn: () => Promise<T>) => Promise<T>

/* ------------------------------------------------------------ documents */

export const text = (value: string) => ({ type: 'text', text: value })
export const paragraph = (value: string) => ({ type: 'paragraph', content: [text(value)] })
export const image = (mediaId: string, alt: string) => ({
  type: 'image',
  attrs: { mediaId, alt, width: 120, height: 90 },
})
export const video = (videoId: string, title = '') => ({
  type: 'youtube',
  attrs: { videoId, start: null, title },
})
export const doc = (...nodes: unknown[]) => ({ type: 'doc', content: nodes })

/** One language written out completely, in its own words so a leak is visible. */
export const complete = (language: Language, over: Json = {}) => ({
  title: `Title ${language}`,
  summary: `Summary ${language}`,
  body: doc(paragraph(`Body ${language} with enough words to read`)),
  seoTitle: '',
  seoDescription: '',
  ...over,
})

export const allLanguages = (over: Partial<Record<Language, Json>> = {}) => ({
  de: complete('de', over.de),
  en: complete('en', over.en),
  ar: complete('ar', over.ar),
})

export const altText = (value = 'A picture') => ({ de: `${value} de`, en: `${value} en`, ar: `${value} ar` })

/* -------------------------------------------------------------- harness */

export const blogHarness = (input: { database: TestDatabase; app: App; runWithDb: RunWithDb }) => {
  const { database, app, runWithDb } = input

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

    // A served file is bytes, not an envelope.
    if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
      return { status: response.status, body: {}, response }
    }

    const raw = await response.clone().text()

    return { status: response.status, body: raw === '' ? {} : (JSON.parse(raw) as Json), response }
  }

  /**
   * A real file in the shared library, sent through the upload route the way
   * the picker's **Upload from computer** does: the library first, the
   * article second.
   */
  const addFile = async (name: string, bytes: Uint8Array): Promise<string> => {
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

  const addImage = (name = 'cover.png') => addFile(name, pngBytes(120, 90))
  const addPdf = (name = 'brochure.pdf') => addFile(name, pdfBytes())

  const create = async (body: Json = {}): Promise<Json> => {
    const created = await call('POST', '/owner/blog/posts', body)

    expect(created.status, JSON.stringify(created.body)).toBe(201)

    return created.body.data
  }

  const load = async (id: string): Promise<Json> => {
    const loaded = await call('GET', `/owner/blog/posts/${id}`)

    expect(loaded.status, JSON.stringify(loaded.body)).toBe(200)

    return loaded.body.data
  }

  /** A save, sent with whatever revision the article is at now. */
  const edit = async (id: string, patch: Json) => {
    const current = await load(id)

    return call('PATCH', `/owner/blog/posts/${id}`, { draftRevision: current.draftRevision, ...patch })
  }

  const publish = async (id: string) => {
    const current = await load(id)

    return call('POST', `/owner/blog/posts/${id}/publish`, { draftRevision: current.draftRevision })
  }

  const schedule = async (id: string, when: { date: string; time: string }, snapshot?: 'draft' | 'keep') => {
    const current = await load(id)

    return call('POST', `/owner/blog/posts/${id}/schedule`, {
      draftRevision: current.draftRevision,
      ...when,
      ...(snapshot ? { snapshot } : {}),
    })
  }

  /** An article with everything publication needs, not yet published. */
  const makePublishable = async (slug = 'first-article', over: Json = {}): Promise<string> => {
    const article = await create({ title: 'First article', language: 'en' })
    const saved = await edit(article.id, { slug, texts: allLanguages(), ...over })

    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect(saved.body.data.publishBlockers).toEqual([])

    return article.id as string
  }

  const makeLive = async (slug = 'first-article', over: Json = {}): Promise<string> => {
    const id = await makePublishable(slug, over)
    const published = await publish(id)

    expect(published.status, JSON.stringify(published.body)).toBe(200)

    return id
  }

  const makeTag = async (en: string, over: Json = {}): Promise<Json> => {
    const created = await call('POST', '/owner/blog/tags', {
      names: { de: `${en} DE`, en, ar: `${en} AR` },
      ...over,
    })

    expect(created.status, JSON.stringify(created.body)).toBe(201)

    return created.body.data
  }

  /** A visitor's comment, from an address of the test's choosing. */
  const comment = (slug: string, body: Json, source = '203.0.113.10') =>
    call('POST', `/blog/posts/${slug}/comments`, body, { headers: { 'cf-connecting-ip': source } })

  return {
    call,
    addImage,
    addPdf,
    create,
    load,
    edit,
    publish,
    schedule,
    makePublishable,
    makeLive,
    makeTag,
    comment,
  }
}
