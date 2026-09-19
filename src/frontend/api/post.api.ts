import type {
  AdminPostDetail,
  AdminPostList,
  AdminTag,
  PostProjectOption,
} from '#/shared/types/post.types'
import type { PostFilterInput, PostWriteInput, TagWriteInput } from '#/shared/validation/post.validation'
import { api } from './client'
import { unwrap } from './response'

/**
 * Eden Treaty revives any value that parses as an ISO date into a `Date`, so
 * `publishedOn` arrives as a Date object even though the server sent the
 * string `2026-09-12` and the type here says `string`. Rendering that in the
 * admin table threw "Objects are not valid as a React child".
 *
 * Both fields are put back to what the server actually sent. `toISOString`
 * is safe on the way back because a date-only string is parsed as UTC
 * midnight, so the day cannot slip backwards.
 */
const toDay = <T extends string | null>(value: T): T =>
  // The cast through `unknown` is the point: the declared type says this is
  // already a string, and the whole reason this exists is that at runtime it
  // is not.
  ((value as unknown) instanceof Date ? (value as unknown as Date).toISOString().slice(0, 10) : value) as T

const toInstant = (value: string): string =>
  (value as unknown) instanceof Date ? (value as unknown as Date).toISOString() : value

const normalisePost = <T extends { publishedOn: string | null }>(post: T): T => ({
  ...post,
  publishedOn: toDay(post.publishedOn),
})

/** Query-string values are strings; the server coerces and clamps them. */
const toQuery = (filter: PostFilterInput) => ({
  search: filter.search,
  published: filter.published,
  tag: filter.tag,
  page: String(filter.page),
})

export async function fetchAdminPosts(filter: PostFilterInput): Promise<AdminPostList> {
  const list = await unwrap<AdminPostList>(await api().admin.blog.posts.get({ query: toQuery(filter) }))

  return {
    ...list,
    items: list.items.map((item) => ({
      ...normalisePost(item),
      updatedAt: toInstant(item.updatedAt),
    })),
  }
}

export async function fetchAdminPost(id: string): Promise<AdminPostDetail> {
  return normalisePost(await unwrap<AdminPostDetail>(await api().admin.blog.posts({ id }).get()))
}

export async function createAdminPost(input: PostWriteInput): Promise<AdminPostDetail> {
  return normalisePost(await unwrap<AdminPostDetail>(await api().admin.blog.posts.post(input)))
}

export async function updateAdminPost(id: string, input: PostWriteInput): Promise<AdminPostDetail> {
  return normalisePost(await unwrap<AdminPostDetail>(await api().admin.blog.posts({ id }).put(input)))
}

export async function deleteAdminPost(id: string): Promise<void> {
  unwrap(await api().admin.blog.posts({ id }).delete())
}

export async function fetchAdminTags(): Promise<AdminTag[]> {
  return unwrap(await api().admin.blog.tags.get())
}

export async function createAdminTag(input: TagWriteInput): Promise<AdminTag> {
  return unwrap(await api().admin.blog.tags.post(input))
}

export async function updateAdminTag(id: string, input: TagWriteInput): Promise<AdminTag> {
  return unwrap(await api().admin.blog.tags({ id }).put(input))
}

export async function deleteAdminTag(id: string): Promise<void> {
  unwrap(await api().admin.blog.tags({ id }).delete())
}

/** The case studies an article can be tied to. */
export async function fetchPostProjectOptions(): Promise<PostProjectOption[]> {
  return unwrap(await api().admin.blog.projects.get())
}

/* -------------------------------------------------------------------------- */
/* Reading and liking                                                         */
/* -------------------------------------------------------------------------- */

/** The two figures, as the database holds them after the change. */
export type PostEngagement = { viewCount: number; likeCount: number }

/**
 * Counts one read, and hands back the new totals.
 *
 * No body, no cookie, no visitor id. Whether *this* reader has already been
 * counted is remembered by their own browser (`post-engagement.ts`); the server
 * only ever adds one to an integer.
 */
export async function countPostRead(slug: string): Promise<PostEngagement> {
  return unwrap(await api().blog.posts({ slug }).view.post())
}

export async function likePost(slug: string): Promise<PostEngagement> {
  return unwrap(await api().blog.posts({ slug }).like.post())
}

export async function unlikePost(slug: string): Promise<PostEngagement> {
  return unwrap(await api().blog.posts({ slug }).like.delete())
}
