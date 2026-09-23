import { readFile, readdir } from 'node:fs/promises'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryStore, createTestDatabase } from './helpers/backend2-db'
import {
  type Json,
  LANGUAGES,
  allLanguages,
  altText,
  blogHarness,
  complete,
  doc,
  image,
  paragraph,
  video,
} from './helpers/backend2-blog'

/**
 * The Blog's articles, end to end, against a real PostgreSQL running inside
 * this process.
 *
 * What is under test is mostly restraint, as in Projects and Services: that
 * saving cannot change what a visitor reads, that a failed publish writes
 * nothing, that a schedule publishes exactly what was frozen and does so once,
 * that a taken-down article answers exactly like one that never existed, that
 * an address never changes behind a published link, and that no draft
 * sentence or private file reaches a public answer. Comments and the two
 * counters have their own suite.
 *
 * The environment is set before Backend2 is imported, because the application
 * decides at start-up whether the owner routes exist at all.
 */
process.env.DATABASE_URL = 'postgres://legacy.invalid/legacy'
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
delete process.env.BACKEND2_OWNER_AUTH

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { useMediaStoreForTest } = await import('#/backend2/media/store')
const { createSession } = await import('#/backend2/auth/session')
const { ownerBlogPaths } = await import('#/backend2/modules/blog/blog.owner.route')
const { publishDuePosts } = await import('#/backend2/modules/blog/post.due')
const contract = await import('#/backend2/contracts/blog.contract')
const v = await import('valibot')

const database = await createTestDatabase()
const app = createAppForTest()
let storage = createMemoryStore()

const {
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
} = blogHarness({ database, app, runWithDb })

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

const DAY = 24 * 60 * 60 * 1000

/** A time on the Berlin clock some days from now, as the editor would send it. */
const berlinIn = (days: number, time = '09:30') => ({
  date: contract.instantToBerlinWallTime(new Date(Date.now() + days * DAY)).date,
  time,
})

/** Moves a schedule into the past, as the passing of time would. */
const makeDue = async (id: string, minutesAgo = 1) => {
  await database.db.query(
    `UPDATE v2_blog_posts SET scheduled_for = now() - make_interval(mins => $2::int) WHERE id = $1`,
    [id, minutesAgo],
  )
}

const runDue = (now?: Date) => runWithDb(database.db, () => publishDuePosts({ now }))

const references = async () => {
  const { rows } = await database.db.query(
    `SELECT asset_id, scope, usage, label FROM v2_media_references
      WHERE module = 'blog' ORDER BY scope, position`,
  )

  return rows as Array<{ asset_id: string; scope: string; usage: string; label: string }>
}

/** A published V2 project, through its own API, for the optional link. */
const makeProject = async (options: { live: boolean }): Promise<string> => {
  const created = await call('POST', '/owner/projects', { type: 'personal', name: 'Portfolio' })
  const id = created.body.data.id as string

  if (!options.live) return id

  const saved = await call('PUT', `/owner/projects/${id}`, {
    draftRevision: created.body.data.draftRevision,
    slug: 'portfolio-site',
    type: 'personal',
    workStatus: 'completed',
    clientName: null,
    showClientName: false,
    tech: [],
    links: [],
    texts: {
      de: { name: 'Projekt', categoryLabel: '', summary: 'Kurz', caseStudy: null },
      en: { name: 'Project', categoryLabel: '', summary: 'Short', caseStudy: null },
      ar: { name: 'مشروع', categoryLabel: '', summary: 'قصير', caseStudy: null },
    },
    cover: null,
    gallery: [],
  })

  expect(saved.status, JSON.stringify(saved.body)).toBe(200)

  const published = await call('POST', `/owner/projects/${id}/publish`, {
    draftRevision: saved.body.data.draftRevision,
  })

  expect(published.status, JSON.stringify(published.body)).toBe(200)

  return id
}

/* ============================================================== pure rules */

describe('the rules that need no database', () => {
  it('lets an empty draft save and names everything publication needs, per language', () => {
    const draft = v.parse(contract.BlogDraftSchema, {})
    const blockers = contract.publishBlockers(draft)

    expect(blockers).toContain('The web address is empty')

    for (const label of ['DE', 'EN', 'AR']) {
      expect(blockers).toContain(`${label}: the title is empty`)
      expect(blockers).toContain(`${label}: the summary is empty`)
      expect(blockers).toContain(`${label}: the article is empty`)
    }

    // Each blocker names the field it is about, for the editor.
    const fields = contract.blogPublishIssues(draft).map((issue) => issue.field)
    expect(fields).toContain('texts.ar.body')
    expect(fields).toContain('slug')
  })

  it('has nothing to say about a complete article, and needs no SEO override or cover', () => {
    const draft = v.parse(contract.BlogDraftSchema, { slug: 'first', texts: allLanguages() })

    expect(contract.publishBlockers(draft)).toEqual([])
    expect(contract.resolveBlogSeo(draft.texts.de)).toEqual({ title: 'Title de', description: 'Summary de' })
  })

  it('demands the cover alternative text in all three languages, but only with a cover', () => {
    const mediaId = '11111111-1111-4111-8111-111111111111'
    const draft = v.parse(contract.BlogDraftSchema, {
      slug: 'first',
      cover: { mediaId, alt: { de: 'Bild', en: '', ar: '' } },
      texts: allLanguages(),
    })

    expect(contract.publishBlockers(draft)).toEqual([
      'The cover image has no EN alternative text',
      'The cover image has no AR alternative text',
    ])
  })

  it('demands alternative text for every inline image, in its own language, and says which', () => {
    const mediaId = '11111111-1111-4111-8111-111111111111'
    const draft = v.parse(contract.BlogDraftSchema, {
      slug: 'first',
      texts: allLanguages({
        ar: {
          body: doc(paragraph('نص'), image(mediaId, 'صورة'), image(mediaId, '')),
        },
      }),
    })

    expect(contract.publishBlockers(draft)).toEqual(['AR: image 2 in the article has no alternative text'])
  })

  it('counts a video as content, and empty paragraphs as nothing', () => {
    expect(contract.isBlogBodyEmpty(doc({ type: 'paragraph' }, paragraph('   ')) as never)).toBe(true)
    expect(contract.isBlogBodyEmpty(doc(video('dQw4w9WgXcQ')) as never)).toBe(false)
  })

  it('stores a YouTube video by id only, and only at the top of an article', () => {
    expect(contract.youtubeVideoIdFrom('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30')).toBe('dQw4w9WgXcQ')
    expect(contract.youtubeVideoIdFrom('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(contract.youtubeVideoIdFrom('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(contract.youtubeVideoIdFrom('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(contract.youtubeVideoIdFrom('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ">')).toBeNull()
    expect(contract.youtubeVideoIdFrom('https://evil.example/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(contract.youtubeVideoIdFrom('javascript:alert(1)')).toBeNull()

    expect(v.safeParse(contract.BlogDocSchema, doc(video('dQw4w9WgXcQ', 'Demo'))).success).toBe(true)
    // Arbitrary embed code, an unknown node, a bad id, a video inside a paragraph.
    expect(v.safeParse(contract.BlogDocSchema, doc({ type: 'html', html: '<iframe>' })).success).toBe(false)
    expect(v.safeParse(contract.BlogDocSchema, doc(video('not-an-id'))).success).toBe(false)
    expect(
      v.safeParse(contract.BlogDocSchema, doc({ type: 'paragraph', content: [video('dQw4w9WgXcQ')] }))
        .success,
    ).toBe(false)
    // The case-study rules come along: a `javascript:` link is refused here too.
    expect(
      v.safeParse(
        contract.BlogDocSchema,
        doc({
          type: 'paragraph',
          content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }],
        }),
      ).success,
    ).toBe(false)
  })

  it('reads a Berlin wall-clock time the same way in summer, in winter and around the change', () => {
    const at = (date: string, time: string) => contract.berlinWallTimeToInstant(date, time)?.toISOString()

    expect(at('2026-07-01', '10:00')).toBe('2026-07-01T08:00:00.000Z')
    expect(at('2026-12-01', '10:00')).toBe('2026-12-01T09:00:00.000Z')
    // The clocks jump from 02:00 to 03:00 on 29 March 2026: 02:30 never happens.
    expect(at('2026-03-29', '02:30')).toBeUndefined()
    // 02:30 happens twice on 25 October 2026; the earlier, summer-time one wins.
    expect(at('2026-10-25', '02:30')).toBe('2026-10-25T00:30:00.000Z')
    expect(at('2026-02-30', '10:00')).toBeUndefined()
    expect(at('2026-07-01', '24:00')).toBeUndefined()

    expect(contract.instantToBerlinWallTime(new Date('2026-07-01T08:00:00Z'))).toEqual({
      date: '2026-07-01',
      time: '10:00',
    })
    expect(contract.instantToBerlinWallTime(new Date('2026-12-31T23:30:00Z'))).toEqual({
      date: '2027-01-01',
      time: '00:30',
    })
  })

  it('treats a body read back in another key order as the same body', () => {
    const one = contract.stableStringify({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: undefined } })
    const two = contract.stableStringify({ a: { d: [1, { x: 1, y: 2 }] }, b: 1 })

    expect(one).toBe(two)
  })

  it('imports nothing but valibot and the two contracts it builds on', async () => {
    const source = await readFile(new URL('../backend2/contracts/blog.contract.ts', import.meta.url), 'utf8')
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1])

    expect(imports).toEqual(['valibot', './project.contract', './rich-text.contract'])
  })
})

/* ====================================================== the security fence */

describe('the owner boundary', () => {
  it('answers 404 — never 401 — on every owner route from a non-local host', async () => {
    const id = await makePublishable()

    for (const route of ownerBlogPaths) {
      const path = route.path.replace('/api/v2', '').replace('11111111-1111-4111-8111-111111111111', id)
      const refused = await call(
        route.method,
        path,
        route.method === 'GET' ? undefined : { draftRevision: 1, confirm: id, enabled: false },
        { host: 'yamanwarda.de' },
      )

      expect(refused.status, `${route.method} ${path}`).toBe(404)
      expect(refused.body.code, `${route.method} ${path}`).toBe('NOT_FOUND')
    }

    // Nothing reached the database: the article is still an unpublished draft.
    expect((await load(id)).state).toBe('draft')
  })

  it('demands a real owner session once V2 sign-in is switched on', async () => {
    const id = await makePublishable()

    process.env.BACKEND2_OWNER_AUTH = 'required'

    const refused = await call('GET', '/owner/blog/posts')
    expect(refused.status).toBe(401)
    expect(refused.body.code).toBe('UNAUTHORIZED')

    expect((await call('POST', `/owner/blog/posts/${id}/publish`, { draftRevision: 1 })).status).toBe(401)
    expect((await call('GET', '/owner/blog/comments')).status).toBe(401)
    expect((await call('GET', '/owner/blog/tags')).status).toBe(401)

    const { rows } = await database.db.query(
      `INSERT INTO v2_owner (email, password_hash, totp_confirmed_at, recovery_codes_issued_at)
       VALUES ('owner@example.de', 'not-a-real-hash', now(), now()) RETURNING id`,
    )
    const session = await runWithDb(database.db, () =>
      createSession({ ownerId: rows[0].id, method: 'password_totp' }),
    )
    const cookie = `v2_owner_session=${encodeURIComponent(session.token)}; v2_csrf=${encodeURIComponent(session.csrfToken)}`

    const allowed = await call('GET', '/owner/blog/posts', undefined, { headers: { cookie } })
    expect(allowed.status).toBe(200)
    expect(allowed.body.data.items).toHaveLength(1)

    // A write without the CSRF header is refused even with the cookie.
    const forged = await call('POST', '/owner/blog/posts', {}, { headers: { cookie } })
    expect(forged.status).toBe(401)

    const created = await call('POST', '/owner/blog/posts', {}, {
      headers: { cookie, 'x-v2-csrf': session.csrfToken },
    })
    expect(created.status).toBe(201)

    // The session never makes the owner API answer a stranger's host.
    const remote = await call('GET', '/owner/blog/posts', undefined, {
      host: 'yamanwarda.de',
      headers: { cookie },
    })
    expect(remote.status).toBe(404)
  })

  it('leaves the public reads reachable from anywhere', async () => {
    await makeLive()

    const list = await call('GET', '/blog/posts', undefined, { host: 'yamanwarda.de' })
    expect(list.status).toBe(200)
    expect(list.body.data.items).toHaveLength(1)
  })
})

/* ==================================================== drafts and saving */

describe('a private draft', () => {
  it('starts in the one language it was written in, with a suggested address', async () => {
    const german = await create({ title: 'Über Bildformate', language: 'de' })
    const arabic = await create({ title: 'عن الصور', language: 'ar' })

    expect(german.state).toBe('draft')
    expect(german.draft.slug).toBe('ueber-bildformate')
    expect(german.draft.texts.de.title).toBe('Über Bildformate')
    expect(german.draft.texts.en.title).toBe('')
    expect(german.slugLocked).toBe(false)
    expect(german.publicSlug).toBeNull()
    expect(german.commentsEnabled).toBe(true)
    expect(german.counts).toEqual({ reads: 0, likes: 0, comments: 0, newComments: 0 })

    // An Arabic title suggests nothing; an empty address is a good draft.
    expect(arabic.draft.slug).toBe('')
    expect(arabic.draft.texts.ar.title).toBe('عن الصور')
    expect(arabic.publishBlockers).toContain('The web address is empty')
  })

  it('saves only what was sent, and a save that changes nothing writes nothing', async () => {
    const article = await create({ title: 'Draft', language: 'en' })

    const first = await edit(article.id, { texts: { de: { summary: 'Nur Deutsch' } } })
    expect(first.status).toBe(200)
    expect(first.body.data.draftRevision).toBe(2)
    expect(first.body.data.draft.texts.de.summary).toBe('Nur Deutsch')
    expect(first.body.data.draft.texts.en.title).toBe('Draft')

    const same = await edit(article.id, { texts: { de: { summary: 'Nur Deutsch' } } })
    expect(same.status).toBe(200)
    expect(same.body.data.draftRevision).toBe(2)
  })

  it('refuses a stale revision rather than overwriting the newer tab', async () => {
    const article = await create({ title: 'Draft', language: 'en' })

    await edit(article.id, { texts: { en: { summary: 'Newer tab' } } })

    const stale = await call('PATCH', `/owner/blog/posts/${article.id}`, {
      draftRevision: article.draftRevision,
      texts: { en: { summary: 'Older tab' } },
    })

    expect(stale.status).toBe(409)
    expect((await load(article.id)).draft.texts.en.summary).toBe('Newer tab')
  })

  it('refuses what cannot be saved at all, and writes nothing when it does', async () => {
    const article = await create({ title: 'Draft', language: 'en' })
    const pdf = await addPdf()
    const unknown = '99999999-9999-4999-8999-999999999999'
    // One at a time: the in-process database is a single connection.
    const tags: Json[] = []

    for (let n = 1; n <= 11; n += 1) tags.push(await makeTag(`Tag ${n}`))

    const tooMany = await edit(article.id, { tagIds: tags.map((tag) => tag.id) })
    expect(tooMany.status).toBe(422)

    const twice = await edit(article.id, { tagIds: [tags[0]!.id, tags[0]!.id] })
    expect(twice.status).toBe(422)

    const ghostTag = await edit(article.id, { tagIds: [unknown] })
    expect(ghostTag.status).toBe(422)

    const ghostFile = await edit(article.id, { cover: { mediaId: unknown, alt: altText() } })
    expect(ghostFile.status).toBe(400)

    const notAnImage = await edit(article.id, { cover: { mediaId: pdf, alt: altText() } })
    expect(notAnImage.status).toBe(422)
    expect(notAnImage.body.message).toBe('The cover must be an image')

    const ghostProject = await edit(article.id, { projectId: unknown })
    expect(ghostProject.status).toBe(422)

    const markup = await edit(article.id, { texts: { en: { body: doc({ type: 'script', text: 'x' }) } } })
    expect(markup.status).toBe(422)

    const after = await load(article.id)
    expect(after.draftRevision).toBe(1)
    expect(after.draft.cover).toBeNull()
    expect(after.draft.tagIds).toEqual([])
  })

  it('is invisible to every public route', async () => {
    await makePublishable('secret-draft')

    expect((await call('GET', '/blog/posts/secret-draft')).status).toBe(404)
    expect((await call('GET', '/blog/posts')).body.data.total).toBe(0)
    expect((await call('GET', '/blog/posts/secret-draft/comments')).status).toBe(404)
    expect((await call('POST', '/blog/posts/secret-draft/read', {})).status).toBe(404)
    expect((await call('POST', '/blog/posts/secret-draft/like', { liked: true })).status).toBe(404)
  })
})

/* ============================================================== publishing */

describe('publishing', () => {
  it('refuses an incomplete article with every reason, and writes nothing', async () => {
    const article = await create({ title: 'Only English', language: 'en' })
    await edit(article.id, { slug: 'only-english', texts: { en: complete('en') } })

    const refused = await publish(article.id)

    expect(refused.status).toBe(422)
    expect(refused.body.details.missing).toEqual([
      'DE: the title is empty',
      'DE: the summary is empty',
      'DE: the article is empty',
      'AR: the title is empty',
      'AR: the summary is empty',
      'AR: the article is empty',
    ])
    expect(refused.body.details.issues[0].field).toBe('texts.de.title')

    const after = await load(article.id)
    expect(after.state).toBe('draft')
    expect(after.published).toBeNull()
    expect(after.publicSlug).toBeNull()
    expect((await call('GET', '/blog/posts/only-english')).status).toBe(404)
  })

  it('publishes one language per answer, with only public fields', async () => {
    const cover = await addImage('cover.png')
    const inline = await addImage('inline.png')
    const tag = await makeTag('Performance')
    const id = await makeLive('fast-images', {
      cover: { mediaId: cover, alt: altText('Cover') },
      tagIds: [tag.id],
      texts: allLanguages({
        ar: {
          body: doc(paragraph('نص المقال'), image(inline, 'صورة داخلية'), video('dQw4w9WgXcQ', 'فيديو')),
          seoTitle: 'عنوان البحث',
        },
      }),
    })

    const answer = await call('GET', '/blog/posts/fast-images?language=ar')
    expect(answer.status).toBe(200)
    expect(answer.response.headers.get('cache-control')).toBe('public, max-age=60')

    const post = answer.body.data
    expect(post.title).toBe('Title ar')
    expect(post.summary).toBe('Summary ar')
    expect(post.author).toEqual({ name: 'Yaman Warda' })
    expect(post.languages).toEqual(['de', 'en', 'ar'])
    expect(post.seo).toEqual({ title: 'عنوان البحث', description: 'Summary ar' })
    expect(post.tags).toEqual([{ slug: 'performance', name: 'Performance AR' }])
    expect(post.cover).toEqual({
      url: `/api/v2/media/${cover}`,
      width: 120,
      height: 90,
      alt: 'Cover ar',
    })
    expect(post.body.content[1]).toEqual({
      type: 'image',
      attrs: { src: `/api/v2/media/${inline}`, alt: 'صورة داخلية', width: 120, height: 90 },
    })
    expect(post.body.content[2]).toEqual({
      type: 'youtube',
      attrs: { videoId: 'dQw4w9WgXcQ', start: null, title: 'فيديو' },
    })
    expect(post.commentsEnabled).toBe(true)
    expect(post.updatedAt).toBeNull()
    expect(typeof post.publishedAt).toBe('string')

    // Nothing private and nothing from the other two languages.
    const serialised = JSON.stringify(answer.body)
    for (const needle of [id, 'mediaId', 'Title de', 'Title en', 'Cover de', 'draft', 'seen', 'storage']) {
      expect(serialised, needle).not.toContain(needle)
    }
  })

  it('lists live articles newest first, one bounded batch at a time, filtered by tag', async () => {
    const tag = await makeTag('Design')
    const ids: string[] = []

    for (const index of [1, 2, 3, 4]) {
      ids.push(await makeLive(`article-${index}`, index % 2 === 0 ? { tagIds: [tag.id] } : {}))
      // Distinct publication instants, so the order is the order of publishing.
      await database.db.query(
        `UPDATE v2_blog_posts SET first_published_at = now() - make_interval(days => $2::int) WHERE id = $1`,
        [ids[ids.length - 1], 10 - index],
      )
    }

    const first = await call('GET', '/blog/posts?language=en&offset=0&limit=3')
    expect(first.body.data.items.map((item: Json) => item.slug)).toEqual(['article-4', 'article-3', 'article-2'])
    expect(first.body.data).toMatchObject({ offset: 0, limit: 3, total: 4, hasMore: true })

    const second = await call('GET', '/blog/posts?language=en&offset=3&limit=3')
    expect(second.body.data.items.map((item: Json) => item.slug)).toEqual(['article-1'])
    expect(second.body.data.hasMore).toBe(false)

    // A card carries no body.
    expect(first.body.data.items[0].body).toBeUndefined()

    const tagged = await call('GET', '/blog/posts?language=de&tag=design')
    expect(tagged.body.data.items.map((item: Json) => item.slug)).toEqual(['article-4', 'article-2'])
    expect(tagged.body.data.items[0].tags).toEqual([{ slug: 'design', name: 'Design DE' }])

    expect((await call('GET', '/blog/posts?limit=37')).status).toBe(422)
    expect((await call('GET', '/blog/posts?offset=1001')).status).toBe(422)
    expect((await call('GET', '/blog/posts?language=fr')).status).toBe(422)
  })

  it('keeps pending edits private until Publish update, which keeps the date and marks an update', async () => {
    const id = await makeLive('evolving')
    const before = await load(id)

    const saved = await edit(id, { texts: { en: { title: 'Better title' } } })
    expect(saved.body.data.state).toBe('published_with_pending_changes')
    expect(saved.body.data.hasPendingChanges).toBe(true)
    expect(saved.body.data.published.texts.en.title).toBe('Title en')

    // Visitors still read the old version.
    expect((await call('GET', '/blog/posts/evolving?language=en')).body.data.title).toBe('Title en')
    expect((await call('GET', '/owner/blog/posts?state=pending')).body.data.total).toBe(1)

    const updated = await publish(id)
    expect(updated.status).toBe(200)
    expect(updated.body.data.state).toBe('published')

    const live = (await call('GET', '/blog/posts/evolving?language=en')).body.data
    expect(live.title).toBe('Better title')
    // The original date stays; the update is dated separately.
    expect(live.publishedAt).toBe(before.firstPublishedAt)
    expect(live.updatedAt).not.toBeNull()
    expect(updated.body.data.firstPublishedAt).toBe(before.firstPublishedAt)
  })

  it('does not call a change of tags or search text an update', async () => {
    const tag = await makeTag('Notes')
    const id = await makeLive('quiet-change')

    await edit(id, { tagIds: [tag.id], texts: { de: { seoDescription: 'Bessere Beschreibung' } } })
    expect((await publish(id)).status).toBe(200)

    const live = (await call('GET', '/blog/posts/quiet-change?language=de')).body.data
    expect(live.tags).toEqual([{ slug: 'notes', name: 'Notes DE' }])
    expect(live.seo.description).toBe('Bessere Beschreibung')
    expect(live.updatedAt).toBeNull()
  })

  it('leaves the live article and the pending edits alone when an update is refused', async () => {
    const id = await makeLive('steady')

    await edit(id, { texts: { ar: { title: '' }, en: { title: 'New EN title' } } })

    const refused = await publish(id)
    expect(refused.status).toBe(422)
    expect(refused.body.details.missing).toEqual(['AR: the title is empty'])

    expect((await call('GET', '/blog/posts/steady?language=ar')).body.data.title).toBe('Title ar')
    expect((await call('GET', '/blog/posts/steady?language=en')).body.data.title).toBe('Title en')

    const after = await load(id)
    expect(after.draft.texts.en.title).toBe('New EN title')
    expect(after.state).toBe('published_with_pending_changes')
  })

  it('goes back to "Live" when an edit is undone, and can throw pending edits away', async () => {
    const id = await makeLive('undo')

    await edit(id, { texts: { en: { title: 'Changed' } } })
    const undone = await edit(id, { texts: { en: { title: 'Title en' } } })
    expect(undone.body.data.state).toBe('published')

    await edit(id, { texts: { de: { title: 'Geändert' } } })
    const current = await load(id)
    const discarded = await call('POST', `/owner/blog/posts/${id}/discard-pending`, {
      draftRevision: current.draftRevision,
    })

    expect(discarded.status).toBe(200)
    expect(discarded.body.data.state).toBe('published')
    expect(discarded.body.data.draft.texts.de.title).toBe('Title de')

    const draftOnly = await makePublishable('never-live')
    const nothingLive = await call('POST', `/owner/blog/posts/${draftOnly}/discard-pending`, {
      draftRevision: (await load(draftOnly)).draftRevision,
    })
    expect(nothingLive.status).toBe(422)
  })

  it('fixes the address at the first publication, and refuses one another article holds', async () => {
    const id = await makeLive('stable-address')

    const renamed = await edit(id, { slug: 'another-address' })
    expect(renamed.status).toBe(422)
    expect(renamed.body.details.issues[0].field).toBe('slug')
    expect((await load(id)).slugLocked).toBe(true)

    const rival = await makePublishable('stable-address')
    const clash = await publish(rival)
    expect(clash.status).toBe(409)
    expect((await load(rival)).state).toBe('draft')

    const free = await call('GET', '/owner/blog/posts/slug-available?slug=stable-address')
    expect(free.body.data).toEqual({ available: false, reason: 'Another article already uses that web address' })
    const own = await call(`GET`, `/owner/blog/posts/slug-available?slug=stable-address&postId=${id}`)
    expect(own.body.data.available).toBe(true)
  })

  it('links a project only while the project is live itself', async () => {
    const hidden = await makeProject({ live: false })
    const id = await makeLive('with-project', { projectId: hidden })

    const owner = await load(id)
    expect(owner.published.project).toMatchObject({ id: hidden, isLive: false })
    expect((await call('GET', '/blog/posts/with-project?language=en')).body.data.project).toBeNull()

    const shown = await makeProject({ live: true })
    await edit(id, { projectId: shown })
    await publish(id)

    expect((await call('GET', '/blog/posts/with-project?language=ar')).body.data.project).toEqual({
      slug: 'portfolio-site',
      name: 'مشروع',
    })
  })
})

/* =========================================================== taking down */

describe('taking an article down and putting it back', () => {
  it('hides it everywhere, keeps it whole, and restores the same article', async () => {
    const cover = await addImage()
    const id = await makeLive('comeback', { cover: { mediaId: cover, alt: altText() } })
    const firstPublishedAt = (await load(id)).firstPublishedAt

    await call('POST', '/blog/posts/comeback/read', {}, { headers: { 'cf-connecting-ip': '198.51.100.1' } })
    await call(
      'POST',
      '/blog/posts/comeback/comments',
      { body: 'Kept through a take down' },
      { headers: { 'cf-connecting-ip': '198.51.100.1' } },
    )

    expect((await call('GET', `/media/${cover}`)).status).toBe(200)

    const down = await call('POST', `/owner/blog/posts/${id}/unpublish`, {})
    expect(down.status).toBe(200)
    expect(down.body.data.state).toBe('unpublished')
    expect(down.body.data.counts).toMatchObject({ reads: 1, comments: 1 })
    expect(down.body.data.publicSlug).toBe('comeback')
    expect(down.body.data.slugLocked).toBe(true)

    expect((await call('GET', '/blog/posts/comeback')).status).toBe(404)
    expect((await call('GET', '/blog/posts')).body.data.total).toBe(0)
    expect((await call('GET', '/blog/posts/comeback/comments')).status).toBe(404)
    expect((await call('GET', `/media/${cover}`)).status).toBe(404)
    expect((await call('GET', '/owner/blog/comments')).body.data.total).toBe(1)

    const back = await publish(id)
    expect(back.status).toBe(200)

    const live = (await call('GET', '/blog/posts/comeback?language=de')).body.data
    expect(live.publishedAt).toBe(firstPublishedAt)
    expect(live.readCount).toBe(1)
    expect(live.commentCount).toBe(1)
    // Republished unchanged: not an update.
    expect(live.updatedAt).toBeNull()
    expect((await call('GET', `/media/${cover}`)).status).toBe(200)
  })
})

/* ================================================================= schedules */

describe('scheduling the first publication', () => {
  it('validates everything when it is scheduled, not when it comes due', async () => {
    const article = await create({ title: 'Later', language: 'en' })
    await edit(article.id, { slug: 'later' })

    const incomplete = await schedule(article.id, berlinIn(2))
    expect(incomplete.status).toBe(422)
    expect(incomplete.body.details.missing).toContain('DE: the title is empty')

    const id = await makePublishable('on-time')

    const past = await schedule(id, berlinIn(-1))
    expect(past.status).toBe(422)
    expect(past.body.message).toBe('Choose a time in the future')

    const gap = await schedule(id, { date: '2027-03-28', time: '02:30' })
    expect(gap.status).toBe(422)
    expect(gap.body.message).toContain('clocks go forward')

    expect((await schedule(id, berlinIn(400))).status).toBe(422)
    expect((await schedule(id, { date: '28.03.2027', time: '9:30' })).status).toBe(422)

    expect((await load(id)).state).toBe('draft')
  })

  it('freezes a snapshot that later saves cannot change, and publishes exactly that', async () => {
    const cover = await addImage()
    const id = await makePublishable('frozen', { cover: { mediaId: cover, alt: altText() } })
    const when = berlinIn(3, '07:45')

    const scheduled = await schedule(id, when)
    expect(scheduled.status, JSON.stringify(scheduled.body)).toBe(200)
    expect(scheduled.body.data.state).toBe('scheduled')
    expect(scheduled.body.data.schedule.publishAtBerlin).toEqual(when)
    expect(scheduled.body.data.schedule.matchesDraft).toBe(true)
    expect(scheduled.body.data.publicSlug).toBe('frozen')
    expect(scheduled.body.data.slugLocked).toBe(true)

    // Held, and not public.
    expect((await references()).map((row) => row.scope)).toEqual(['draft', 'scheduled'])
    expect((await call('GET', `/media/${cover}`)).status).toBe(404)
    expect((await call('GET', '/blog/posts/frozen')).status).toBe(404)

    const saved = await edit(id, { texts: { en: { title: 'Edited after scheduling' } } })
    expect(saved.body.data.schedule.matchesDraft).toBe(false)
    expect(saved.body.data.scheduled.texts.en.title).toBe('Title en')

    const preview = await call('GET', `/owner/blog/posts/${id}/preview?language=en&version=scheduled`)
    expect(preview.body.data.title).toBe('Title en')

    // The address is fixed while it waits.
    expect((await edit(id, { slug: 'moved' })).status).toBe(422)
    // Publishing now would overtake the approved snapshot.
    const overtaken = await publish(id)
    expect(overtaken.status).toBe(409)
    expect(overtaken.body.code).toBe('ARTICLE_SCHEDULED')

    await makeDue(id)

    const live = await call('GET', '/blog/posts/frozen?language=en')
    expect(live.status).toBe(200)
    expect(live.body.data.title).toBe('Title en')

    const after = await load(id)
    expect(after.state).toBe('published_with_pending_changes')
    expect(after.schedule).toBeNull()
    expect(after.publicationDelay).toBeNull()
    expect(after.draft.texts.en.title).toBe('Edited after scheduling')
    expect((await references()).map((row) => row.scope)).toEqual(['draft', 'published'])
    expect((await call('GET', `/media/${cover}`)).status).toBe(200)
  })

  it('moves the time without touching the snapshot, or replaces the snapshot on request', async () => {
    const id = await makePublishable('movable')

    await schedule(id, berlinIn(2))
    await edit(id, { texts: { en: { summary: 'A newer summary' } } })

    const moved = await schedule(id, berlinIn(5, '18:00'), 'keep')
    expect(moved.status).toBe(200)
    expect(moved.body.data.schedule.publishAtBerlin).toEqual(berlinIn(5, '18:00'))
    expect(moved.body.data.scheduled.texts.en.summary).toBe('Summary en')

    const replaced = await schedule(id, berlinIn(5, '18:00'))
    expect(replaced.body.data.scheduled.texts.en.summary).toBe('A newer summary')
    expect(replaced.body.data.schedule.matchesDraft).toBe(true)

    const unscheduled = await makePublishable('not-yet')
    expect((await schedule(unscheduled, berlinIn(2), 'keep')).status).toBe(422)
  })

  it('can be cancelled, which gives the address back and releases the files', async () => {
    const cover = await addImage()
    const id = await makePublishable('cancelled', { cover: { mediaId: cover, alt: altText() } })

    await schedule(id, berlinIn(2))

    const cancelled = await call('POST', `/owner/blog/posts/${id}/cancel-schedule`, {})
    expect(cancelled.status).toBe(200)
    expect(cancelled.body.data.state).toBe('draft')
    expect(cancelled.body.data.schedule).toBeNull()
    expect(cancelled.body.data.publicSlug).toBeNull()
    expect(cancelled.body.data.slugLocked).toBe(false)
    expect((await references()).map((row) => row.scope)).toEqual(['draft'])

    // Nothing will publish it.
    await runDue(new Date(Date.now() + 10 * DAY))
    expect((await load(id)).state).toBe('draft')

    // Never seen by anyone, so the address may change again.
    expect((await edit(id, { slug: 'renamed' })).status).toBe(200)
  })

  it('only schedules a first publication', async () => {
    const live = await makeLive('already-live')
    const liveRefusal = await schedule(live, berlinIn(2))
    expect(liveRefusal.status).toBe(409)

    await call('POST', `/owner/blog/posts/${live}/unpublish`, {})
    expect((await schedule(live, berlinIn(2))).status).toBe(409)
  })

  it('publishes a due schedule once, however many times it is noticed', async () => {
    const id = await makePublishable('once')

    await schedule(id, berlinIn(1))

    const first = await runDue(new Date(Date.now() + 2 * DAY))
    expect(first).toEqual({ published: [id], failed: 0 })

    const publishedAt = (await load(id)).publishedAt
    const second = await runDue(new Date(Date.now() + 3 * DAY))
    expect(second).toEqual({ published: [], failed: 0 })

    const { rows } = await database.db.query(
      `SELECT kind FROM v2_blog_post_versions WHERE post_id = $1 ORDER BY kind`,
      [id],
    )
    expect(rows.map((row: Json) => row.kind)).toEqual(['draft', 'published'])
    expect((await load(id)).publishedAt).toBe(publishedAt)
  })

  it('publishes a due schedule on whichever public read comes first — the tag filter too', async () => {
    const tag = await makeTag('Fresh')
    const id = await makePublishable('fresh', { tagIds: [tag.id] })

    await schedule(id, berlinIn(1))
    expect((await call('GET', '/blog/tags?language=en')).body.data).toEqual([])

    await makeDue(id)

    expect((await call('GET', '/blog/tags?language=en')).body.data).toEqual([{ slug: 'fresh', name: 'Fresh' }])
    expect((await load(id)).state).toBe('published')
  })

  it('publishes a late schedule when a request next arrives, and tells the owner it was late', async () => {
    const id = await makePublishable('late')

    await schedule(id, berlinIn(1))
    await makeDue(id, 150)

    // The Dashboard list notices too — the owner never sees "Scheduled" for an
    // article that should already be live.
    const listed = await call('GET', '/owner/blog/posts')
    expect(listed.body.data.items[0].state).toBe('published')

    const after = await load(id)
    expect(after.publicationDelay.minutesLate).toBeGreaterThanOrEqual(149)
    expect(listed.body.data.items[0].publicationDelay.minutesLate).toBeGreaterThanOrEqual(149)
    expect((await call('GET', '/blog/posts/late')).status).toBe(200)
  })
})

/* ====================================================================== tags */

describe('tags', () => {
  it('are created with all three names, and refuse a copy of another', async () => {
    const created = await makeTag('Accessibility')
    expect(created).toMatchObject({
      slug: 'accessibility',
      names: { de: 'Accessibility DE', en: 'Accessibility', ar: 'Accessibility AR' },
      articleCount: 0,
      liveArticleCount: 0,
    })

    const missing = await call('POST', '/owner/blog/tags', { names: { de: 'Nur', en: 'Only', ar: '' } })
    expect(missing.status).toBe(422)

    const sameName = await call('POST', '/owner/blog/tags', {
      slug: 'other',
      names: { de: 'x', en: 'ACCESSIBILITY', ar: 'y' },
    })
    expect(sameName.status).toBe(409)
    expect(sameName.body.code).toBe('NAME_TAKEN')

    const sameSlug = await call('POST', '/owner/blog/tags', {
      slug: 'accessibility',
      names: { de: 'a', en: 'b', ar: 'c' },
    })
    expect(sameSlug.status).toBe(409)

    const arabicOnly = await call('POST', '/owner/blog/tags', { names: { de: 'تصميم', en: 'تصميم', ar: 'تصميم' } })
    expect(arabicOnly.status).toBe(422)
  })

  it('rename everywhere at once, and the public filter offers only tags on live articles', async () => {
    const shown = await makeTag('Shown')
    const hidden = await makeTag('Hidden')

    await makeLive('tagged', { tagIds: [shown.id] })
    await makePublishable('draft-tagged', { tagIds: [hidden.id] })

    expect((await call('GET', '/blog/tags?language=ar')).body.data).toEqual([
      { slug: 'shown', name: 'Shown AR' },
    ])

    const renamed = await call('PATCH', `/owner/blog/tags/${shown.id}`, { names: { ar: 'ظاهر' } })
    expect(renamed.status).toBe(200)
    expect(renamed.body.data.names).toEqual({ de: 'Shown DE', en: 'Shown', ar: 'ظاهر' })
    expect((await call('GET', '/blog/posts/tagged?language=ar')).body.data.tags).toEqual([
      { slug: 'shown', name: 'ظاهر' },
    ])

    const listed = await call('GET', '/owner/blog/tags?pageSize=1')
    expect(listed.body.data).toMatchObject({ total: 2, pageCount: 2, hasMore: true })
    expect(listed.body.data.items[0]).toMatchObject({ slug: 'hidden', articleCount: 1, liveArticleCount: 0 })
  })

  it('cannot be deleted while any article carries them, and says which', async () => {
    const tag = await makeTag('Busy')
    const id = await makePublishable('busy-article', { tagIds: [tag.id] })

    const refused = await call('DELETE', `/owner/blog/tags/${tag.id}`)
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('TAG_IN_USE')
    expect(refused.body.details.articles).toEqual([{ id, title: 'Title en' }])

    await edit(id, { tagIds: [] })

    const deleted = await call('DELETE', `/owner/blog/tags/${tag.id}`)
    expect(deleted.status).toBe(200)
    expect((await call('GET', '/owner/blog/tags')).body.data.total).toBe(0)
  })
})

/* ============================================================ shared media */

describe('files from the shared Media library', () => {
  it('declares every file, keeps it undeletable while used, and never deletes it', async () => {
    const cover = await addImage('cover.png')
    const inline = await addImage('inline.png')
    const id = await makePublishable('with-files', {
      cover: { mediaId: cover, alt: altText() },
      texts: allLanguages({ de: { body: doc(paragraph('Text'), image(inline, 'Bild')) } }),
    })

    expect(await references()).toEqual([
      { asset_id: cover, scope: 'draft', usage: 'cover', label: 'Blog: Title en (draft)' },
      { asset_id: inline, scope: 'draft', usage: 'inline', label: 'Blog: Title en (draft)' },
    ])

    // Selected, but not public until the article is.
    expect((await call('GET', `/media/${inline}`)).status).toBe(404)
    await publish(id)
    expect((await call('GET', `/media/${inline}`)).status).toBe(200)

    const blocked = await call('DELETE', `/owner/media/files/${cover}`)
    expect(blocked.status).toBe(409)
    expect(blocked.body.code).toBe('DELETE_BLOCKED_BY_REFERENCES')
    expect(blocked.body.details.references.map((entry: Json) => entry.label)).toContain('Blog: Title en')

    // An update that drops the inline image takes it off the live page.
    await edit(id, { texts: { de: { body: doc(paragraph('Nur Text')) } } })
    await publish(id)
    expect((await call('GET', `/media/${inline}`)).status).toBe(404)
    expect((await call('DELETE', `/owner/media/files/${inline}`)).status).toBe(200)

    // Deleting the article forgets its uses; the library keeps the file.
    const deleted = await call('DELETE', `/owner/blog/posts/${id}`, { confirm: id })
    expect(deleted.status).toBe(200)
    expect(await references()).toEqual([])
    expect((await call('GET', `/owner/media/files/${cover}`)).status).toBe(200)
    expect((await call('DELETE', `/owner/media/files/${cover}`)).status).toBe(200)
  })

  it('previews private images through the owner route, never the public one', async () => {
    const cover = await addImage()
    const id = await makePublishable('preview-me', { cover: { mediaId: cover, alt: altText() } })

    const preview = await call('GET', `/owner/blog/posts/${id}/preview?language=de`)
    expect(preview.status).toBe(200)
    expect(preview.response.headers.get('cache-control')).toContain('no-store')
    expect(preview.body.data.title).toBe('Title de')
    expect(preview.body.data.cover.url).toBe(`/api/v2/owner/media/files/${cover}/content`)

    expect((await call('GET', `/owner/blog/posts/${id}/preview?version=published`)).status).toBe(404)
    expect((await call('GET', `/owner/blog/posts/${id}/preview?version=scheduled`)).status).toBe(404)
  })
})

/* ================================================================== delete */

describe('permanent delete', () => {
  it('asks for the article id, then removes everything the article owned', async () => {
    const tag = await makeTag('Kept')
    const id = await makeLive('doomed', { tagIds: [tag.id] })

    await call(
      'POST',
      '/blog/posts/doomed/comments',
      { body: 'A comment that goes with it' },
      { headers: { 'cf-connecting-ip': '198.51.100.7' } },
    )

    expect((await call('DELETE', `/owner/blog/posts/${id}`, { confirm: 'yes' })).status).toBe(422)
    expect((await call('DELETE', `/owner/blog/posts/${id}`)).status).toBe(422)
    expect((await call('GET', '/blog/posts/doomed')).status).toBe(200)

    const deleted = await call('DELETE', `/owner/blog/posts/${id}`, { confirm: id })
    expect(deleted.body.data).toEqual({ deleted: true, comments: 1 })

    expect((await call('GET', `/owner/blog/posts/${id}`)).status).toBe(404)
    expect((await call('GET', '/blog/posts/doomed')).status).toBe(404)

    for (const table of [
      'v2_blog_posts',
      'v2_blog_post_versions',
      'v2_blog_post_texts',
      'v2_blog_post_tags',
      'v2_blog_comments',
    ]) {
      const { rows } = await database.db.query(`SELECT count(*)::int AS n FROM ${table}`)

      expect(rows[0].n, table).toBe(0)
    }

    // The tag is the owner's, not the article's.
    expect((await call('GET', '/owner/blog/tags')).body.data.total).toBe(1)

    // The address is free again.
    const reused = await makeLive('doomed')
    expect((await load(reused)).publicSlug).toBe('doomed')
  })
})

/* ============================================================ owner list */

describe('the Dashboard list', () => {
  it('pages on the server, filters by state and tag, and searches every language', async () => {
    const tag = await makeTag('Filter')
    const live = await makeLive('live-one', { tagIds: [tag.id] })
    const scheduled = await makePublishable('scheduled-one')
    await schedule(scheduled, berlinIn(2))
    const draft = await create({ title: 'مسودة خاصة', language: 'ar' })

    const page = await call('GET', '/owner/blog/posts?page=1&pageSize=2')
    expect(page.body.data).toMatchObject({ page: 1, pageSize: 2, total: 3, pageCount: 2, hasMore: true })
    expect(page.body.data.items).toHaveLength(2)

    const far = await call('GET', '/owner/blog/posts?page=9&pageSize=2')
    expect(far.body.data.page).toBe(2)

    const byState = async (state: string) =>
      (await call('GET', `/owner/blog/posts?state=${state}`)).body.data.items.map((item: Json) => item.id)

    expect(await byState('published')).toEqual([live])
    expect(await byState('scheduled')).toEqual([scheduled])
    expect(await byState('draft')).toEqual([draft.id])

    const tagged = await call('GET', `/owner/blog/posts?tag=${tag.id}`)
    expect(tagged.body.data.items.map((item: Json) => item.id)).toEqual([live])
    expect(tagged.body.data.items[0].tags).toEqual([{ id: tag.id, name: 'Filter' }])

    const found = await call('GET', `/owner/blog/posts?search=${encodeURIComponent('خاصة')}`)
    expect(found.body.data.items.map((item: Json) => item.id)).toEqual([draft.id])
    expect(found.body.data.items[0].displayTitle).toBe('مسودة خاصة')
    expect(found.body.data.items[0].languagesComplete).toEqual([])

    // A wildcard typed by the owner is a character to find, not "everything".
    expect((await call('GET', '/owner/blog/posts?search=%25')).body.data.total).toBe(0)
    expect((await call('GET', '/owner/blog/posts?pageSize=51')).status).toBe(422)

    const row = (await call('GET', `/owner/blog/posts?state=scheduled`)).body.data.items[0]
    expect(row.schedule.publishAtBerlin).toEqual(berlinIn(2))
    expect(row.languagesComplete).toEqual(['de', 'en', 'ar'])
  })

  it('switches comments on and off at once, without touching the draft', async () => {
    const id = await makeLive('switchable')
    const before = await load(id)

    const off = await call('POST', `/owner/blog/posts/${id}/comment-setting`, { enabled: false })
    expect(off.status).toBe(200)
    expect(off.body.data.commentsEnabled).toBe(false)
    expect(off.body.data.draftRevision).toBe(before.draftRevision)
    expect(off.body.data.state).toBe('published')

    expect((await call('GET', '/blog/posts/switchable')).body.data.commentsEnabled).toBe(false)
  })
})

/* ============================================================ independence */

describe('independence from other modules', () => {
  it('imports nothing from the legacy backend or any unrelated business module', async () => {
    const directory = new URL('../backend2/modules/blog/', import.meta.url)

    for (const file of await readdir(directory)) {
      const source = await readFile(new URL(file, directory), 'utf8')
      const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1] ?? '')

      for (const target of imports) {
        expect(target, `${file} imports ${target}`).not.toMatch(/src\/backend\/|\.\.\/\.\.\/\.\.\/backend\//)
        expect(target, `${file} imports ${target}`).not.toMatch(/leads|invoices|booking|inbox|services|projects\//)
      }
    }
  })

  it('writes nothing outside the Blog, the vault and the rate limits while it works', async () => {
    const count = async () => {
      const { rows } = await database.db.query(
        `SELECT tablename FROM pg_tables
          WHERE schemaname = 'public' AND tablename LIKE 'v2\\_%'
            AND tablename NOT LIKE 'v2\\_blog%'
            AND tablename NOT IN ('v2_media_references', 'v2_auth_rate_limits', 'v2_schema_migrations')
          ORDER BY tablename`,
      )
      const counts: Record<string, number> = {}

      for (const { tablename } of rows as Array<{ tablename: string }>) {
        counts[tablename] = (await database.db.query(`SELECT count(*)::int AS n FROM ${tablename}`)).rows[0].n
      }

      return counts
    }

    const cover = await addImage()
    const before = await count()

    const id = await makeLive('self-contained', { cover: { mediaId: cover, alt: altText() } })
    await edit(id, { texts: { en: { title: 'Changed' } } })
    await publish(id)
    await call('POST', `/owner/blog/posts/${id}/unpublish`, {})
    await call('DELETE', `/owner/blog/posts/${id}`, { confirm: id })

    expect(await count()).toEqual(before)
  })
})

/* ------------------------------------------------ a final shape check */

describe('the public shape', () => {
  it('is the same projection in every language', async () => {
    await makeLive('three-languages')

    for (const language of LANGUAGES) {
      const answer = (await call('GET', `/blog/posts/three-languages?language=${language}`)).body.data

      expect(answer.title).toBe(`Title ${language}`)
      expect(Object.keys(answer).sort()).toEqual(
        [
          'author',
          'body',
          'commentCount',
          'commentsEnabled',
          'cover',
          'languages',
          'likeCount',
          'project',
          'publishedAt',
          'readCount',
          'readingMinutes',
          'seo',
          'slug',
          'summary',
          'tags',
          'title',
          'updatedAt',
        ].sort(),
      )
    }
  })
})
