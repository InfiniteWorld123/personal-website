import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Reads and likes, and the two rules that make them safe to ship.
 *
 * 1. **An unpublished post is not countable.** `is_published` is in the
 *    predicate of the same statement that increments, not checked before it,
 *    so a draft cannot be inflated by anyone who guesses its slug.
 * 2. **A like cannot walk the figure below zero.** The browser is the only
 *    thing that remembers whether this reader had liked the post, so a cleared
 *    storage or a second tab can send an unlike that was never a like. The
 *    floor absorbs it; without it the table's own CHECK turns a shrug into a
 *    500.
 *
 * The fake database below models the one thing that matters here: a statement
 * whose WHERE does not match changes nothing and returns no row.
 */

const holder = vi.hoisted(() => ({ engine: null as unknown as Engine }))

vi.mock('#/shared/env', () => ({ env: { DATABASE_URL: 'postgres://localhost/test' } }))

vi.mock('pg', () => ({
  Pool: class {
    query = (text: string, values?: unknown[]) => holder.engine.query(text, values ?? [])
    connect = async () => ({
      query: (text: string, values?: unknown[]) => holder.engine.query(text, values ?? []),
      release: () => {},
    })
    end = async () => {}
  },
}))

type Post = { slug: string; published: boolean; views: number; likes: number }

class Engine {
  readonly posts = new Map<string, Post>()

  seed(post: Post): void {
    this.posts.set(post.slug, post)
  }

  async query(text: string, values: unknown[]) {
    const sql = text.replace(/\s+/g, ' ').trim()
    const slug = values[0] as string
    const post = this.posts.get(slug)

    if (!/^UPDATE posts SET/i.test(sql)) {
      throw new Error(`the fake database was asked something it does not model: ${sql}`)
    }

    // The predicate, exactly as the statement states it. A draft matches
    // nothing, so nothing is written and nothing comes back.
    const matches = post && (!/is_published/i.test(sql) || post.published)

    if (!matches) return { rows: [], rowCount: 0 }

    if (/view_count = view_count \+ 1/.test(sql)) post.views += 1
    else if (/like_count = like_count \+ 1/.test(sql)) post.likes += 1
    else if (/GREATEST\(like_count - 1, 0\)/.test(sql)) post.likes = Math.max(post.likes - 1, 0)
    else throw new Error(`unmodelled update: ${sql}`)

    return { rows: [{ view_count: post.views, like_count: post.likes }], rowCount: 1 }
  }
}

import { closePool } from '#/backend/db/client'
import { countPostView, likePost, unlikePost } from '#/backend/modules/posts/post.service'

let engine: Engine

beforeEach(() => {
  engine = new Engine()
  holder.engine = engine
})

afterEach(async () => {
  await closePool()
})

const published = (slug = 'a-post') =>
  engine.seed({ slug, published: true, views: 0, likes: 0 })

describe('counting a read', () => {
  it('adds one and hands back what the database now holds', async () => {
    published()

    expect(await countPostView('a-post')).toEqual({ viewCount: 1, likeCount: 0 })
    expect(await countPostView('a-post')).toEqual({ viewCount: 2, likeCount: 0 })
  })

  it('refuses a post that is not published', async () => {
    engine.seed({ slug: 'draft', published: false, views: 0, likes: 0 })

    await expect(countPostView('draft')).rejects.toThrow('That post does not exist')
    expect(engine.posts.get('draft')?.views).toBe(0)
  })

  it('refuses a slug that is not there, rather than counting nothing quietly', async () => {
    await expect(countPostView('missing')).rejects.toThrow('That post does not exist')
  })
})

describe('liking', () => {
  it('goes up, and comes back down when it is taken back', async () => {
    published()

    expect(await likePost('a-post')).toEqual({ viewCount: 0, likeCount: 1 })
    expect(await unlikePost('a-post')).toEqual({ viewCount: 0, likeCount: 0 })
  })

  it('never goes below zero, however many times it is taken back', async () => {
    published()

    expect(await unlikePost('a-post')).toEqual({ viewCount: 0, likeCount: 0 })
    expect(await unlikePost('a-post')).toEqual({ viewCount: 0, likeCount: 0 })
    expect(engine.posts.get('a-post')?.likes).toBe(0)
  })

  it('refuses a draft, both ways', async () => {
    engine.seed({ slug: 'draft', published: false, views: 0, likes: 3 })

    await expect(likePost('draft')).rejects.toThrow('That post does not exist')
    await expect(unlikePost('draft')).rejects.toThrow('That post does not exist')
    expect(engine.posts.get('draft')?.likes).toBe(3)
  })
})
