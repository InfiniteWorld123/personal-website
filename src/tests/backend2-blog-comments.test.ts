import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryStore, createTestDatabase } from './helpers/backend2-db'
import { type Json, blogHarness } from './helpers/backend2-blog'

/**
 * Comments, replies and the two counters, end to end, against a real
 * PostgreSQL running inside this process.
 *
 * `docs/v2/blog.md`: a visitor writes text and nothing else, an ordinary
 * comment is public at once, replies form a real tree, and what is refused is
 * refused for its shape — frequency, copies, size, links, markup — never for
 * its opinion. The owner answers, deletes whole branches and switches comments
 * off per article; nothing about a visitor is stored with what they wrote.
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
const contract = await import('#/backend2/contracts/blog.contract')

const database = await createTestDatabase()
const app = createAppForTest()

const { call, edit, load, publish, makeLive, comment } = blogHarness({ database, app, runWithDb })

beforeEach(async () => {
  await database.reset()
  useMediaStoreForTest(createMemoryStore().store)
})

afterEach(() => {
  useMediaStoreForTest(undefined)
})

afterAll(async () => {
  useMediaStoreForTest(undefined)
  await database.close()
})

/* ---------------------------------------------------------------- plumbing */

/** A different sender every time, so the per-sender limits stay out of the way. */
let senders = 0
const nextSender = () => {
  senders += 1

  return `10.${Math.floor(senders / 250) % 250}.${senders % 250}.7`
}

/** A comment that passes, from a fresh sender; returns the stored comment. */
const post = async (slug: string, body: string, parentId: string | null = null): Promise<Json> => {
  const answer = await comment(slug, { body, parentId }, nextSender())

  expect(answer.status, JSON.stringify(answer.body)).toBe(201)

  return answer.body.data
}

const roots = (slug: string, query = '') => call('GET', `/blog/posts/${slug}/comments${query}`)

const replies = (slug: string, id: string, query = '') =>
  call('GET', `/blog/posts/${slug}/comments/${id}/replies${query}`)

const commentCount = async () =>
  (await database.db.query('SELECT count(*)::int AS n FROM v2_blog_comments')).rows[0].n as number

/* ============================================================ a visitor writes */

describe('a visitor comment', () => {
  it('is public at once, as plain text, with nothing about who sent it', async () => {
    await makeLive('talk')

    const sent = await comment('talk', { body: '  Great read!\r\n\r\n\r\n\r\nThanks  ' }, '203.0.113.50')

    expect(sent.status).toBe(201)
    expect(sent.response.headers.get('cache-control')).toBe('no-store')
    expect(Object.keys(sent.body.data).sort()).toEqual(
      ['author', 'body', 'createdAt', 'id', 'level', 'parentId', 'replyCount'].sort(),
    )
    expect(sent.body.data).toMatchObject({
      parentId: null,
      level: 1,
      author: 'visitor',
      // One kind of line break, never more than one blank line, nothing around the edges.
      body: 'Great read!\n\nThanks',
      replyCount: 0,
    })

    const listed = await roots('talk')
    expect(listed.status).toBe(200)
    expect(listed.response.headers.get('cache-control')).toBe('no-store')
    expect(listed.body.data).toEqual({
      enabled: true,
      total: 1,
      items: [sent.body.data],
      nextCursor: null,
    })

    // Nothing in the table can name the sender, and the rate limits keep only keyed hashes.
    const { rows: columns } = await database.db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'v2_blog_comments'`,
    )
    expect(columns.map((row: Json) => row.column_name).sort()).toEqual(
      ['author', 'body', 'created_at', 'depth', 'id', 'parent_id', 'post_id', 'seen_at'].sort(),
    )

    const { rows: limits } = await database.db.query('SELECT key FROM v2_auth_rate_limits')
    expect(limits.length).toBeGreaterThan(0)

    for (const { key } of limits as Array<{ key: string }>) {
      expect(key).toMatch(/^[a-z-]+:[0-9a-f]{64}$/)
      expect(key).not.toContain('203.0.113.50')
    }
  })

  it('keeps text that only mentions markup exactly as written — it is never HTML', async () => {
    await makeLive('talk')

    const body = 'Put it in a <script> tag, or use <img alt=""> — and 5 < 6 & 7 > 3.'
    const sent = await comment('talk', { body })

    expect(sent.status).toBe(201)
    expect(sent.body.data.body).toBe(body)
    expect((await roots('talk')).body.data.items[0].body).toBe(body)
  })

  it('strips characters nobody types on purpose, and keeps the ones Arabic needs', () => {
    expect(contract.normalizeCommentText('a‮b\u0000c﻿d')).toBe('abcd')
    // The zero-width joiners shape Arabic and emoji; they stay.
    expect(contract.normalizeCommentText('می‌خواهم 👨‍👩')).toBe('می‌خواهم 👨‍👩')
  })

  it('is refused for its shape, never its opinion, with a reason the website can translate', async () => {
    await makeLive('talk')

    const refusals: Array<[Json, number, string, string]> = [
      [{ body: 'Hello', website: 'https://spam.example' }, 422, 'COMMENT_REJECTED', 'rejected'],
      [{ body: '   \n  ' }, 422, 'VALIDATION_ERROR', 'empty'],
      [{ body: 'x'.repeat(3001) }, 422, 'VALIDATION_ERROR', 'too_long'],
      [
        { body: 'See https://a.example and https://b.example and www.c.example' },
        422,
        'COMMENT_REJECTED',
        'too_many_links',
      ],
      [{ body: 'Cheap <a href="https://x.example">pills</a>' }, 422, 'COMMENT_REJECTED', 'markup'],
      [{ body: 'Visit [url=https://x.example]here[/url]' }, 422, 'COMMENT_REJECTED', 'markup'],
      [{ body: '<img src=x onerror=alert(1)>' }, 422, 'COMMENT_REJECTED', 'markup'],
      [{ body: '<script>alert(1)</script>' }, 422, 'COMMENT_REJECTED', 'markup'],
      [{ body: '<iframe src="https://x.example"></iframe>' }, 422, 'COMMENT_REJECTED', 'markup'],
    ]

    for (const [body, status, code, reason] of refusals) {
      const answer = await comment('talk', body, nextSender())

      expect(answer.status, JSON.stringify(body)).toBe(status)
      expect(answer.body.code, JSON.stringify(body)).toBe(code)
      expect(answer.body.details.reason, JSON.stringify(body)).toBe(reason)
    }

    // An oversized request is refused before it is read.
    const huge = await comment('talk', { body: 'x'.repeat(20_000) }, nextSender())
    expect(huge.status).toBe(413)

    expect(await commentCount()).toBe(0)

    // Disagreement is a comment like any other, and two links are fine.
    await post('talk', 'This article is wrong and badly argued, and I say so plainly.')
    await post('talk', 'Compare https://a.example with https://b.example first.')
    expect(await commentCount()).toBe(2)
  })

  it('refuses copies: the same words from anyone, and the same short words twice from one sender', async () => {
    await makeLive('talk')

    const long = 'I tried this approach on my own site and it halved the load time.'

    expect((await comment('talk', { body: long }, '198.51.100.1')).status).toBe(201)

    const copied = await comment('talk', { body: long }, '198.51.100.2')
    expect(copied.status).toBe(409)
    expect(copied.body.code).toBe('DUPLICATE_COMMENT')
    expect(copied.body.details.reason).toBe('duplicate')

    // "Thanks!" is too ordinary to call a copy when two people say it…
    expect((await comment('talk', { body: 'Thanks!' }, '198.51.100.1')).status).toBe(201)
    expect((await comment('talk', { body: 'Thanks!' }, '198.51.100.2')).status).toBe(201)

    // …but the same person sending it twice is a double click.
    const twice = await comment('talk', { body: 'Thanks!' }, '198.51.100.2')
    expect(twice.status).toBe(409)
  })

  it('slows down a sender who posts too fast, and nobody else', async () => {
    await makeLive('talk')

    for (const body of ['First thought', 'Second thought', 'Third thought']) {
      expect((await comment('talk', { body }, '192.0.2.9')).status).toBe(201)
    }

    const fourth = await comment('talk', { body: 'Fourth thought' }, '192.0.2.9')
    expect(fourth.status).toBe(429)
    expect(fourth.body.code).toBe('RATE_LIMITED')
    expect(fourth.body.details.reason).toBe('too_fast')
    expect(fourth.body.message).toBe(contract.COMMENT_REFUSALS.too_fast)

    expect((await comment('talk', { body: 'Someone else entirely' }, '192.0.2.10')).status).toBe(201)
  })

  it('bounds a flood on one article, however many senders it comes from', async () => {
    await makeLive('talk')

    const perArticle = contract.COMMENT_RATE_LIMITS.find((rule) => rule.per === 'article')!

    for (let index = 0; index < perArticle.limit; index += 1) {
      await post('talk', `Comment number ${index} from yet another sender`)
    }

    const over = await comment('talk', { body: 'One too many for this hour' }, nextSender())
    expect(over.status).toBe(429)

    // Another article is unaffected.
    await makeLive('quiet')
    await post('quiet', 'A calm conversation elsewhere')
  })

  it('stops when the owner switches comments off, and everything returns when they switch on', async () => {
    const id = await makeLive('talk')
    const first = await post('talk', 'Before the switch')
    await post('talk', 'Also before the switch', first.id)

    await call('POST', `/owner/blog/posts/${id}/comment-setting`, { enabled: false })

    expect((await roots('talk')).body.data).toEqual({ enabled: false, total: 0, items: [], nextCursor: null })
    expect((await replies('talk', first.id)).body.data.enabled).toBe(false)

    const detail = (await call('GET', '/blog/posts/talk')).body.data
    expect(detail.commentsEnabled).toBe(false)
    expect(detail.commentCount).toBe(0)

    const closed = await comment('talk', { body: 'After the switch' }, nextSender())
    expect(closed.status).toBe(409)
    expect(closed.body.code).toBe('COMMENTS_CLOSED')
    expect(closed.body.details.reason).toBe('closed')

    // The records stay, and the owner still sees them.
    expect((await call('GET', '/owner/blog/comments')).body.data.total).toBe(2)

    await call('POST', `/owner/blog/posts/${id}/comment-setting`, { enabled: true })

    const back = (await roots('talk')).body.data
    expect(back.enabled).toBe(true)
    expect(back.total).toBe(2)
    expect(back.items[0].id).toBe(first.id)
  })

  it('exists only on a live article', async () => {
    const id = await makeLive('talk')
    const kept = await post('talk', 'Written while it was live')

    await call('POST', `/owner/blog/posts/${id}/unpublish`, {})

    expect((await roots('talk')).status).toBe(404)
    expect((await replies('talk', kept.id)).status).toBe(404)
    expect((await comment('talk', { body: 'Anyone there?' }, nextSender())).status).toBe(404)
    expect((await call('GET', '/owner/blog/comments')).body.data.total).toBe(1)

    await publish(id)

    expect((await roots('talk')).body.data.items.map((item: Json) => item.id)).toEqual([kept.id])
  })
})

/* ================================================================== replies */

describe('replies', () => {
  it('form a real tree: threads newest first, replies oldest first, at any depth', async () => {
    await makeLive('talk')

    const older = await post('talk', 'The older thread')
    const newer = await post('talk', 'The newer thread')
    const first = await post('talk', 'First reply', older.id)
    const second = await post('talk', 'Second reply', older.id)
    const deeper = await post('talk', 'A reply to a reply', first.id)

    expect(deeper.level).toBe(3)
    expect(deeper.parentId).toBe(first.id)

    const threads = (await roots('talk')).body.data
    expect(threads.total).toBe(5)
    expect(threads.items.map((item: Json) => item.id)).toEqual([newer.id, older.id])
    expect(threads.items[1].replyCount).toBe(2)

    const answers = (await replies('talk', older.id)).body.data
    expect(answers.items.map((item: Json) => item.id)).toEqual([first.id, second.id])
    expect(answers.total).toBe(2)
    expect(answers.items[0].replyCount).toBe(1)
  })

  it('refuses a parent that is gone or belongs to another article', async () => {
    await makeLive('talk')
    await makeLive('other')

    const elsewhere = await post('other', 'On another article')

    const wrongArticle = await comment('talk', { body: 'Misplaced reply', parentId: elsewhere.id }, nextSender())
    expect(wrongArticle.status).toBe(404)
    expect(wrongArticle.body.details.reason).toBe('gone')

    const ghost = await comment(
      'talk',
      { body: 'Reply to nothing', parentId: '99999999-9999-4999-8999-999999999999' },
      nextSender(),
    )
    expect(ghost.status).toBe(404)

    expect((await replies('talk', elsewhere.id)).status).toBe(404)
    expect((await replies('talk', 'not-an-id')).status).toBe(404)
  })

  it('pages threads and replies on the server, with a marker that never repeats or skips', async () => {
    await makeLive('talk')

    const made: string[] = []

    for (let index = 1; index <= 5; index += 1) made.push((await post('talk', `Thread ${index}`)).id)

    const seen: string[] = []
    let cursor = ''

    for (;;) {
      const page = (await roots('talk', `?limit=2${cursor ? `&cursor=${cursor}` : ''}`)).body.data

      seen.push(...page.items.map((item: Json) => item.id))

      if (!page.nextCursor) break

      cursor = page.nextCursor
    }

    expect(seen).toEqual([...made].reverse())

    const parent = made[0]!
    const answers: string[] = []

    for (let index = 1; index <= 4; index += 1) answers.push((await post('talk', `Answer ${index}`, parent)).id)

    const firstPage = (await replies('talk', parent, '?limit=3')).body.data
    expect(firstPage.items.map((item: Json) => item.id)).toEqual(answers.slice(0, 3))

    const secondPage = (await replies('talk', parent, `?limit=3&cursor=${firstPage.nextCursor}`)).body.data
    expect(secondPage.items.map((item: Json) => item.id)).toEqual(answers.slice(3))
    expect(secondPage.nextCursor).toBeNull()

    expect((await roots('talk', '?cursor=garbage')).status).toBe(400)
    expect((await roots('talk', '?limit=31')).status).toBe(422)
  })

  it('keeps comments written in the same instant apart', async () => {
    const id = await makeLive('talk')

    await database.db.query(
      `INSERT INTO v2_blog_comments (post_id, author, body, created_at)
       SELECT $1, 'visitor', 'Same instant ' || n, '2026-09-01T10:00:00.123456Z'
         FROM generate_series(1, 3) AS n`,
      [id],
    )

    const seen = new Set<string>()
    let cursor = ''

    for (let guard = 0; guard < 5; guard += 1) {
      const page = (await roots('talk', `?limit=1${cursor ? `&cursor=${cursor}` : ''}`)).body.data

      for (const item of page.items) seen.add(item.id)
      if (!page.nextCursor) break

      cursor = page.nextCursor
    }

    expect(seen.size).toBe(3)
  })

  it(`stops at ${contract.COMMENT_LIMITS.depth} levels`, async () => {
    await makeLive('talk')

    let parent: string | null = null
    let last: Json = {}

    for (let level = 1; level <= contract.COMMENT_LIMITS.depth; level += 1) {
      last = await post('talk', `Level ${level}`, parent)
      parent = last.id
    }

    expect(last.level).toBe(contract.COMMENT_LIMITS.depth)

    const deeper = await comment('talk', { body: 'One level too deep', parentId: parent }, nextSender())
    expect(deeper.status).toBe(422)
    expect(deeper.body.details.reason).toBe('too_deep')

    const ownerDeeper = await call('POST', `/owner/blog/comments/${parent}/replies`, { body: 'Owner, too deep' })
    expect(ownerDeeper.status).toBe(422)
  })
})

/* ================================================================ the owner */

describe('the owner', () => {
  it('sees every comment, newest first, with what is new counted', async () => {
    const first = await makeLive('first')
    await makeLive('second')

    const a = await post('first', 'Comment on the first article')
    const b = await post('second', 'Comment on the second article')
    const c = await post('first', 'A reply on the first article', a.id)

    const all = (await call('GET', '/owner/blog/comments')).body.data
    expect(all).toMatchObject({ total: 3, newTotal: 3, page: 1, pageCount: 1 })
    expect(all.items.map((item: Json) => item.id)).toEqual([c.id, b.id, a.id])
    expect(all.items[0]).toMatchObject({
      postId: first,
      parentId: a.id,
      level: 2,
      author: 'visitor',
      isNew: true,
      parent: { id: a.id, author: 'visitor', excerpt: 'Comment on the first article' },
      post: { id: first, title: 'Title en', state: 'published', publicSlug: 'first', commentsEnabled: true },
    })

    const onFirst = (await call('GET', `/owner/blog/comments?postId=${first}&parentId=root`)).body.data
    expect(onFirst.items.map((item: Json) => item.id)).toEqual([a.id])

    const under = (await call('GET', `/owner/blog/comments?parentId=${a.id}`)).body.data
    expect(under.items.map((item: Json) => item.id)).toEqual([c.id])

    const searched = (await call('GET', '/owner/blog/comments?search=second')).body.data
    expect(searched.items.map((item: Json) => item.id)).toEqual([b.id])

    const paged = (await call('GET', '/owner/blog/comments?pageSize=2&page=2')).body.data
    expect(paged).toMatchObject({ page: 2, pageCount: 2, hasMore: false })
    expect(paged.items).toHaveLength(1)

    expect((await load(first)).counts).toMatchObject({ comments: 2, newComments: 2 })
    const row = (await call('GET', '/owner/blog/posts')).body.data.items.find((item: Json) => item.id === first)
    expect(row.counts).toMatchObject({ comments: 2, newComments: 2 })

    const byId = await call('POST', '/owner/blog/comments/seen', { ids: [b.id] })
    expect(byId.body.data).toEqual({ marked: 1, newTotal: 2 })

    const byArticle = await call('POST', '/owner/blog/comments/seen', { postId: first })
    expect(byArticle.body.data).toEqual({ marked: 2, newTotal: 0 })

    expect((await call('GET', '/owner/blog/comments?status=new')).body.data.total).toBe(0)
    expect((await call('POST', '/owner/blog/comments/seen', { all: true })).body.data.marked).toBe(0)
  })

  it('replies as Yaman Warda, which is also having seen the comment', async () => {
    await makeLive('talk')

    const question = await post('talk', 'Which image format did you use?')
    const reply = await call('POST', `/owner/blog/comments/${question.id}/replies`, {
      body: 'AVIF with a WebP fallback — see https://a.example, https://b.example and https://c.example',
    })

    expect(reply.status).toBe(201)
    expect(reply.body.data).toMatchObject({ author: 'owner', isNew: false, level: 2, parentId: question.id })

    const publicReplies = (await replies('talk', question.id)).body.data.items
    expect(publicReplies).toHaveLength(1)
    expect(publicReplies[0].author).toBe('owner')

    const thread = (await call('GET', `/owner/blog/comments/${question.id}`)).body.data
    expect(thread.comment.isNew).toBe(false)

    expect((await call('POST', `/owner/blog/comments/${question.id}/replies`, { body: '  ' })).status).toBe(422)
    expect(
      (await call('POST', '/owner/blog/comments/99999999-9999-4999-8999-999999999999/replies', { body: 'x' }))
        .status,
    ).toBe(404)

    // Visitors may answer the owner in turn.
    const answer = await post('talk', 'Thank you, that helps.', reply.body.data.id)
    expect(answer.level).toBe(3)
  })

  it('sees the conversation before deleting it, and deletes the whole branch', async () => {
    await makeLive('talk')

    const root = await post('talk', 'The thread')
    const branch = await post('talk', 'A branch', root.id)
    const leaf = await post('talk', 'A leaf on the branch', branch.id)
    const sibling = await post('talk', 'A sibling that stays', root.id)

    const thread = (await call('GET', `/owner/blog/comments/${branch.id}`)).body.data
    expect(thread.ancestors).toEqual([
      { id: root.id, author: 'visitor', body: 'The thread', createdAt: root.createdAt, level: 1 },
    ])
    expect(thread.descendantCount).toBe(1)

    const deleted = await call('DELETE', `/owner/blog/comments/${branch.id}`)
    expect(deleted.body.data).toEqual({ deleted: 2 })

    expect((await replies('talk', root.id)).body.data.items.map((item: Json) => item.id)).toEqual([sibling.id])
    expect((await call('GET', `/owner/blog/comments/${leaf.id}`)).status).toBe(404)
    expect((await roots('talk')).body.data.total).toBe(2)
    expect((await call('DELETE', `/owner/blog/comments/${branch.id}`)).status).toBe(404)
  })
})

/* ============================================================ reads and likes */

describe('reads and likes', () => {
  it('count on a live article only, never below zero, and survive updates and take downs', async () => {
    const id = await makeLive('counted')
    const from = { headers: { 'cf-connecting-ip': '203.0.113.77' } }

    const read = await call('POST', '/blog/posts/counted/read', {}, from)
    expect(read.status).toBe(200)
    expect(read.response.headers.get('cache-control')).toBe('no-store')
    expect(read.body.data).toEqual({ readCount: 1, likeCount: 0 })

    expect((await call('POST', '/blog/posts/counted/like', { liked: true }, from)).body.data).toEqual({
      readCount: 1,
      likeCount: 1,
    })
    expect((await call('POST', '/blog/posts/counted/like', { liked: false }, from)).body.data.likeCount).toBe(0)
    expect((await call('POST', '/blog/posts/counted/like', { liked: false }, from)).body.data.likeCount).toBe(0)
    expect((await call('POST', '/blog/posts/counted/like', { liked: 'yes' }, from)).status).toBe(422)

    await call('POST', '/blog/posts/counted/like', { liked: true }, from)
    await edit(id, { texts: { en: { title: 'Updated title' } } })
    await publish(id)

    const updated = (await call('GET', '/blog/posts/counted?language=en')).body.data
    expect(updated).toMatchObject({ title: 'Updated title', readCount: 1, likeCount: 1 })

    await call('POST', `/owner/blog/posts/${id}/unpublish`, {})
    expect((await call('POST', '/blog/posts/counted/read', {}, from)).status).toBe(404)
    expect((await load(id)).counts).toMatchObject({ reads: 1, likes: 1 })

    await publish(id)
    expect((await call('GET', '/blog/posts/counted')).body.data).toMatchObject({ readCount: 1, likeCount: 1 })
  })

  it('are bounded per sender, and nobody else is slowed by it', async () => {
    await makeLive('counted')

    const heavy = { headers: { 'cf-connecting-ip': '203.0.113.88' } }
    const { read, like } = contract.ENGAGEMENT_RATE_LIMITS

    for (let index = 0; index < read.limit; index += 1) {
      expect((await call('POST', '/blog/posts/counted/read', {}, heavy)).status).toBe(200)
    }

    const refused = await call('POST', '/blog/posts/counted/read', {}, heavy)
    expect(refused.status).toBe(429)
    expect(refused.body.details.reason).toBe('too_fast')

    const other = await call('POST', '/blog/posts/counted/read', {}, { headers: { 'cf-connecting-ip': '203.0.113.89' } })
    expect(other.status).toBe(200)
    expect(other.body.data.readCount).toBe(read.limit + 1)

    for (let index = 0; index < like.limit; index += 1) {
      await call('POST', '/blog/posts/counted/like', { liked: index % 2 === 0 }, heavy)
    }

    expect((await call('POST', '/blog/posts/counted/like', { liked: true }, heavy)).status).toBe(429)
  })

  it('go when the article is deleted', async () => {
    const id = await makeLive('counted')

    await call('POST', '/blog/posts/counted/read', {}, { headers: { 'cf-connecting-ip': '203.0.113.90' } })
    await call('DELETE', `/owner/blog/posts/${id}`, { confirm: id })

    const { rows } = await database.db.query('SELECT count(*)::int AS n FROM v2_blog_posts')
    expect(rows[0].n).toBe(0)
    expect((await call('POST', '/blog/posts/counted/read', {})).status).toBe(404)
  })
})
