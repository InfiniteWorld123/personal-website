import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createMemoryStore, createTestDatabase } from './helpers/backend2-db'
import { allLanguages, altText, blogHarness, doc, image, paragraph, video } from './helpers/backend2-blog'

/**
 * Public cutover step 4 (`docs/v2/public-cutover.md`): the public blog reads
 * Backend2 — the only backend since the legacy one was removed.
 *
 * The server functions are exercised through their real handlers:
 * `createServerFn` is replaced by a stand-in that runs the validator and the
 * handler, which is all the framework adds on the server. Backend2 runs
 * against a real PostgreSQL inside this process.
 */

vi.mock('@tanstack/react-start', () => {
  const createServerFn = () => {
    let validate: (input: unknown) => unknown = (input) => input

    const builder = {
      validator(fn: (input: unknown) => unknown) {
        validate = fn

        return builder
      },
      handler(fn: (context: { data: unknown }) => unknown) {
        return (options?: { data?: unknown }) => fn({ data: validate(options?.data) })
      },
    }

    return builder
  }

  // `src/start.ts` builds its middleware at import; only its CSP is tested here.
  const inert = () => ({ server: () => ({}) })

  return { createServerFn, createMiddleware: inert, createStart: () => ({}) }
})

process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
delete process.env.BACKEND2_OWNER_AUTH

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { useMediaStoreForTest } = await import('#/backend2/media/store')
const contract = await import('#/backend2/contracts/blog.contract')
const posts = await import('#/frontend/features/blog/server/published-posts')
const { buildFeedResponse } = await import('#/frontend/features/blog/server/rss-feed')
const { berlinDay, toPostSummary } = await import('#/frontend/features/blog/public-article')
const { getPostBatch, listPageHead } = await import('#/frontend/features/blog/post-list')
const { commentLengthProblem, normalizeComment, COMMENT_MAX_LENGTH } = await import(
  '#/frontend/features/blog/comment-text'
)
const { reasonFor } = await import('#/frontend/features/blog/blog-v2-api')
const { blogV2Words } = await import('#/frontend/features/blog/blog-v2-words')
const { buildContentSecurityPolicy } = await import('#/start')

const database = await createTestDatabase()
const app = createAppForTest()
const { call, addImage, makeLive, makeTag, edit, publish, create } = blogHarness({ database, app, runWithDb })

/** Runs a server function or feed with Backend2 reading this test's database. */
const inV2 = <T>(fn: () => Promise<T>): Promise<T> => runWithDb(database.db, fn)

const table = {
  type: 'table',
  content: [
    {
      type: 'tableRow',
      content: [
        { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('Plan')] },
        { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('Price')] },
      ],
    },
    {
      type: 'tableRow',
      content: [
        { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('Start')] },
        { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('900 €')] },
      ],
    },
  ],
}

let coverId = ''
let tagSlug = ''

beforeAll(async () => {
  await database.reset()
  useMediaStoreForTest(createMemoryStore().store)

  const tag = await makeTag('Search')
  tagSlug = tag.slug as string
  coverId = await addImage('cover.png')

  // Eleven live articles, so the archive has two pages; the newest carries
  // the cover, the tag, a table, an image and a video.
  for (let index = 1; index <= 10; index += 1) {
    await makeLive(`article-${String(index).padStart(2, '0')}`)
  }

  await makeLive('rich-article', {
    tagIds: [tag.id],
    cover: { mediaId: coverId, alt: altText('Cover') },
    texts: allLanguages({
      de: { title: 'Reicher Artikel', body: doc(paragraph('Text'), table, image(coverId, 'Bild'), video('dQw4w9WgXcQ', 'Film')) },
      en: { title: 'Rich article', seoTitle: 'Rich SEO title', body: doc(paragraph('Text'), table, video('dQw4w9WgXcQ', 'Film')) },
      ar: { title: 'مقال غني', body: doc(paragraph('نص'), table) },
    }),
  })

  // A private draft and a taken-down article: neither may appear anywhere.
  const draft = await create({ title: 'Secret draft', language: 'en' })
  await edit(draft.id, { slug: 'secret-draft', texts: allLanguages() })
  const gone = await makeLive('taken-down')
  await call('POST', `/owner/blog/posts/${gone}/unpublish`, {})
}, 60_000)

afterAll(async () => {
  useMediaStoreForTest(undefined)
  await database.close()
})

describe('the public blog', () => {
  it('pages the archive on the server, nine at a time, newest first', async () => {
    const first = await inV2(() => posts.fetchPublishedPostPage({ data: { language: 'en', page: 1 } }))
    const second = await inV2(() => posts.fetchPublishedPostPage({ data: { language: 'en', page: 2 } }))
    const beyond = await inV2(() => posts.fetchPublishedPostPage({ data: { language: 'en', page: 40 } }))

    expect(first.total).toBe(11)
    expect(first.posts).toHaveLength(9)
    expect(first.posts[0]?.slug).toBe('rich-article')
    expect(second.posts).toHaveLength(11)
    expect(second.page).toBe(2)
    // A page past the end shows what exists and names the last real page.
    expect(beyond).toMatchObject({ page: 2, total: 11 })
    expect(beyond.posts).toHaveLength(11)

    const batch = getPostBatch(first.posts, 1, first.total)
    expect(batch).toMatchObject({ page: 1, total: 11, hasMore: true })
    expect(batch.visible).toHaveLength(9)
  })

  it('never lists a draft or a taken-down article, anywhere', async () => {
    const page = await inV2(() => posts.fetchPublishedPostPage({ data: { language: 'en', page: 5 } }))
    const slugs = await inV2(() => posts.fetchPublishedPostSlugs())
    const every = [...page.posts.map((post) => post.slug), ...slugs]

    expect(every).not.toContain('secret-draft')
    expect(every).not.toContain('taken-down')
    expect(slugs).toHaveLength(11)
    expect(await inV2(() => posts.fetchPublishedPost({ data: { language: 'en', slug: 'secret-draft' } }))).toBeNull()
    expect(await inV2(() => posts.fetchPublishedPost({ data: { language: 'en', slug: 'taken-down' } }))).toBeNull()
    expect(await inV2(() => posts.fetchPublishedPost({ data: { language: 'en', slug: 'Not A Slug!' } }))).toBeNull()
  })

  it('filters by tag and offers only tags a live article carries, per language', async () => {
    const tagged = await inV2(() => posts.fetchPublishedPostPage({ data: { language: 'de', tag: tagSlug, page: 1 } }))
    const tagsDe = await inV2(() => posts.fetchPublishedTags({ data: { language: 'de' } }))
    const tagsAr = await inV2(() => posts.fetchPublishedTags({ data: { language: 'ar' } }))

    expect(tagged.posts.map((post) => post.slug)).toEqual(['rich-article'])
    expect(tagged.total).toBe(1)
    expect(tagsDe).toEqual([{ slug: tagSlug, name: 'Search DE' }])
    expect(tagsAr).toEqual([{ slug: tagSlug, name: 'Search AR' }])
  })

  it('maps a card into the shape the list, the home section and the feeds draw', async () => {
    const [card] = await inV2(() => posts.fetchPublishedPosts({ data: { language: 'ar' } }))

    expect(card).toEqual({
      slug: 'rich-article',
      title: 'مقال غني',
      excerpt: 'Summary ar',
      publishedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      readingMinutes: expect.any(Number),
      cover: { src: `/api/v2/media/${coverId}`, width: 120, height: 90, alt: 'Cover ar' },
      tags: [{ slug: tagSlug, name: 'Search AR' }],
      viewCount: 0,
      likeCount: 0,
    })
  })

  it('reads one article in one language, with its SEO, table, video and comment switch', async () => {
    const article = await inV2(() => posts.fetchPublishedPost({ data: { language: 'en', slug: 'rich-article' } }))

    expect(article).toMatchObject({
      title: 'Rich article',
      seo: { title: 'Rich SEO title', description: 'Summary en' },
      updatedOn: null,
      commentsEnabled: true,
      commentCount: 0,
    })
    expect(article?.body.content.map((node) => node.type)).toEqual(['paragraph', 'table', 'youtube'])
    expect(JSON.stringify(article)).not.toContain('mediaId')
  })

  it('shows "updated" only after a real published update, and never moves the original date', async () => {
    const before = await inV2(() => posts.fetchPublishedPost({ data: { language: 'de', slug: 'article-01' } }))
    const id = (await call('GET', '/owner/blog/posts?search=article-01')).body.data.items[0].id as string

    await edit(id, { texts: { de: { title: 'Neuer Titel' } } })
    await publish(id)

    const after = await inV2(() => posts.fetchPublishedPost({ data: { language: 'de', slug: 'article-01' } }))

    expect(before?.updatedOn).toBeNull()
    expect(after?.title).toBe('Neuer Titel')
    expect(after?.updatedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(after?.publishedOn).toBe(before?.publishedOn)
  })

  it('writes one feed per language from live articles only', async () => {
    const response = await inV2(() => buildFeedResponse('ar'))
    const xml = await response.text()

    expect(response.headers.get('content-type')).toContain('application/rss+xml')
    expect(xml).toContain('<language>ar</language>')
    expect(xml).toContain('<title>مقال غني</title>')
    expect(xml).toContain('https://yamanwarda.de/ar/blog/rich-article')
    expect(xml).toContain('<category>Search AR</category>')
    expect(xml).not.toContain('secret-draft')
    expect(xml).not.toContain('taken-down')
    expect(xml.match(/<item>/g)).toHaveLength(11)

    const german = await (await inV2(() => buildFeedResponse('de'))).text()
    expect(german).toContain('<title>Reicher Artikel</title>')
    expect(german).not.toContain('مقال غني')
  })

  it('allows the one YouTube frame origin the click-to-load player needs', () => {
    expect(buildContentSecurityPolicy('n', {})).toContain(
      'frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com;',
    )
  })
})

describe('the archive head', () => {
  const head = {
    meta: [{ property: 'og:url', content: 'https://x.test/en/blog' }, { name: 'description', content: 'd' }],
    links: [
      { rel: 'canonical', href: 'https://x.test/en/blog' },
      { rel: 'alternate', hrefLang: 'de', href: 'https://x.test/de/blog' },
      { rel: 'alternate', hrefLang: 'x-default', href: 'https://x.test/en/blog' },
      { rel: 'alternate', type: 'application/rss+xml', href: 'https://x.test/rss/en.xml' },
    ],
    scripts: [],
  }

  it('makes page 2 onwards canonical to itself, with matching alternates', () => {
    const paged = listPageHead(head, { page: 2 })

    expect(paged.links).toEqual([
      { rel: 'canonical', href: 'https://x.test/en/blog?page=2' },
      { rel: 'alternate', hrefLang: 'de', href: 'https://x.test/de/blog?page=2' },
      { rel: 'alternate', hrefLang: 'x-default', href: 'https://x.test/en/blog?page=2' },
      { rel: 'alternate', type: 'application/rss+xml', href: 'https://x.test/rss/en.xml' },
    ])
    expect(paged.meta[0]).toEqual({ property: 'og:url', content: 'https://x.test/en/blog?page=2' })
  })

  it('leaves the first page and tag views pointing at the plain archive', () => {
    expect(listPageHead(head, { page: 1 })).toBe(head)
    expect(listPageHead(head, { page: 3, tag: 'seo' })).toBe(head)
  })
})

describe('small pieces', () => {
  it('dates an article by the Berlin calendar', () => {
    expect(berlinDay('2026-03-01T23:30:00.000Z')).toBe('2026-03-02')
    expect(berlinDay('2026-07-01T21:59:00.000Z')).toBe('2026-07-01')
    expect(berlinDay('2026-07-01T22:00:00.000Z')).toBe('2026-07-02')
  })

  it('gives an unmeasured cover the card box rather than no size', () => {
    const summary = toPostSummary({
      slug: 's',
      title: 't',
      summary: 'x',
      publishedAt: '2026-01-01T10:00:00.000Z',
      updatedAt: null,
      readingMinutes: 1,
      cover: { url: '/api/v2/media/a', width: null, height: null, alt: 'a' },
      tags: [],
      readCount: 3,
      likeCount: 1,
    })

    expect(summary.cover).toEqual({ src: '/api/v2/media/a', width: 1600, height: 900, alt: 'a' })
    expect(summary).toMatchObject({ viewCount: 3, likeCount: 1, excerpt: 'x' })
  })

  it('checks a comment exactly as the server normalises and limits it', () => {
    const samples = [
      '  hello  ',
      'a\r\nb\rc',
      'x‮y\u0007z﻿',
      'line   \n\n\n\nnext',
      '\n\n',
      'ok',
    ]

    for (const sample of samples) expect(normalizeComment(sample)).toBe(contract.normalizeCommentText(sample))

    expect(COMMENT_MAX_LENGTH).toBe(contract.COMMENT_LIMITS.body)
    expect(commentLengthProblem('   \n ')).toBe('empty')
    expect(commentLengthProblem('a'.repeat(3001))).toBe('too_long')
    expect(commentLengthProblem(`${'a'.repeat(3000)}   `)).toBeNull()
  })

  it('turns every refusal into a word the page has, in every language', () => {
    expect(reasonFor(422, { details: { reason: 'markup' } })).toBe('markup')
    expect(reasonFor(429, { details: { reason: 'too_fast', retryAfter: 30 } })).toBe('too_fast')
    expect(reasonFor(409, { details: { reason: 'duplicate' } })).toBe('duplicate')
    expect(reasonFor(403, { details: { reason: 'closed' } })).toBe('rejected')
    expect(reasonFor(413, null)).toBe('too_long')
    expect(reasonFor(429, null)).toBe('too_fast')
    expect(reasonFor(500, null)).toBe('server')

    const refusals = Object.keys(contract.COMMENT_REFUSALS).filter((reason) => reason !== 'closed')

    for (const language of ['de', 'en', 'ar'] as const) {
      for (const reason of refusals) {
        expect(blogV2Words(language).refuse[reason as keyof ReturnType<typeof blogV2Words>['refuse']]).toBeTruthy()
      }
    }
  })
})
