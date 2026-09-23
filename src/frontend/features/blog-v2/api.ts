import { ApiRequestError } from '#/frontend/api/response'
import type { Page } from '#/backend2/contracts/pagination.contract'
import type {
  BlogDraftPatch,
  BlogListSort,
  BlogListState,
  Language,
  OwnerBlogListItem,
  OwnerBlogPost,
  OwnerBlogTag,
  OwnerComment,
  OwnerCommentPage,
  OwnerCommentThread,
  PublicBlogPost,
} from '#/backend2/contracts/blog.contract'
import { csrfToken } from '#/frontend/features/auth-v2/api'

/**
 * The Dashboard's side of Backend2 Blog.
 *
 * Plain `fetch`, like the Projects, Services and Media clients: V2 shares no
 * code with the legacy Eden client, and `features/blog/` is the legacy blog.
 * A refusal arrives as one `ApiRequestError` with its `code` and `details`
 * intact — a failed publication is `VALIDATION_ERROR` whose `details.issues`
 * name the fields, and a tag still in use is `TAG_IN_USE` with the articles
 * that carry it.
 */

const OWNER = '/api/v2/owner/blog'

type Envelope = { success: boolean; message?: string; code?: string; data?: unknown; details?: unknown }

const request = async <TData>(path: string, init: RequestInit = {}): Promise<TData> => {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)

  if (init.body !== undefined) headers.set('content-type', 'application/json')

  if (method !== 'GET' && method !== 'HEAD') {
    const token = csrfToken()

    if (token) headers.set('x-v2-csrf', token)
  }

  const response = await fetch(path, { credentials: 'same-origin', ...init, headers })
  const body = (await response.json().catch(() => null)) as Envelope | null

  if (!response.ok || !body?.success) {
    throw new ApiRequestError({
      message: body?.message ?? 'The server did not answer',
      code: body?.code ?? null,
      status: response.status,
      details: body?.details,
    })
  }

  return body.data as TData
}

const post = <TData>(path: string, body?: unknown) =>
  request<TData>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

/** Only the values that differ from the server's default, so the URL stays short. */
const toSearch = (values: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === '' || value === 'all') continue
    if (key === 'page' && value === 1) continue

    search.set(key, String(value))
  }

  const text = search.toString()

  return text === '' ? '' : `?${text}`
}

/* ------------------------------------------------------------- articles */

export type ArticlesQuery = {
  page?: number
  pageSize?: number
  search?: string
  state?: BlogListState
  /** A tag id, or every tag. */
  tag?: string
  sort?: BlogListSort
  language?: Language
}

export const listArticles = (query: ArticlesQuery) =>
  request<Page<OwnerBlogListItem>>(`${OWNER}/posts${toSearch(query)}`)

export const readArticle = (id: string) => request<OwnerBlogPost>(`${OWNER}/posts/${id}`)

export const createArticle = (input: { title?: string; language?: Language }) =>
  post<OwnerBlogPost>(`${OWNER}/posts`, input)

/** **Save**: only the fields sent change, and nothing a visitor sees changes. */
export const saveArticle = (id: string, patch: BlogDraftPatch & { draftRevision: number }) =>
  request<OwnerBlogPost>(`${OWNER}/posts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })

export const publishArticle = (id: string, draftRevision: number) =>
  post<OwnerBlogPost>(`${OWNER}/posts/${id}/publish`, { draftRevision })

export type ScheduleInput = {
  draftRevision: number
  /** `YYYY-MM-DD` and `HH:MM` on the clock in Berlin. */
  date: string
  time: string
  /** `draft` freezes the saved draft now; `keep` only moves the time. */
  snapshot: 'draft' | 'keep'
}

export const scheduleArticle = (id: string, input: ScheduleInput) =>
  post<OwnerBlogPost>(`${OWNER}/posts/${id}/schedule`, input)

export const cancelArticleSchedule = (id: string) =>
  post<OwnerBlogPost>(`${OWNER}/posts/${id}/cancel-schedule`)

export const unpublishArticle = (id: string) => post<OwnerBlogPost>(`${OWNER}/posts/${id}/unpublish`)

export const discardArticleChanges = (id: string, draftRevision: number) =>
  post<OwnerBlogPost>(`${OWNER}/posts/${id}/discard-pending`, { draftRevision })

/** Comments on or off, at once — a setting, not content. */
export const setArticleComments = (id: string, enabled: boolean) =>
  post<OwnerBlogPost>(`${OWNER}/posts/${id}/comment-setting`, { enabled })

/** Permanent. The server wants the article's own id back as confirmation. */
export const deleteArticle = (id: string) =>
  request<{ deleted: true; comments: number }>(`${OWNER}/posts/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirm: id }),
  })

export const checkArticleSlug = (slug: string, postId: string) =>
  request<{ available: boolean; reason?: string }>(
    `${OWNER}/posts/slug-available?slug=${encodeURIComponent(slug)}&postId=${postId}`,
  )

export type PreviewVersion = 'draft' | 'scheduled' | 'published'

/** A version through the same projection the public site will use. */
export const previewArticle = (id: string, language: Language, version: PreviewVersion) =>
  request<PublicBlogPost>(`${OWNER}/posts/${id}/preview?language=${language}&version=${version}`)

/* ----------------------------------------------------------------- tags */

export type TagsQuery = { page?: number; pageSize?: number; search?: string }

export const listTags = (query: TagsQuery) => request<Page<OwnerBlogTag>>(`${OWNER}/tags${toSearch(query)}`)

export type TagInput = { slug: string; names: Record<Language, string> }

export const createTag = (input: TagInput) => post<OwnerBlogTag>(`${OWNER}/tags`, input)

export const saveTag = (id: string, input: TagInput) =>
  request<OwnerBlogTag>(`${OWNER}/tags/${id}`, { method: 'PATCH', body: JSON.stringify(input) })

/** Refused with `TAG_IN_USE` while any version of any article carries it. */
export const deleteTag = (id: string) => request<{ deleted: true }>(`${OWNER}/tags/${id}`, { method: 'DELETE' })

/* ------------------------------------------------------------- comments */

export type CommentsQuery = {
  page?: number
  pageSize?: number
  postId?: string
  status?: 'all' | 'new'
  search?: string
}

export const listComments = (query: CommentsQuery) =>
  request<OwnerCommentPage>(`${OWNER}/comments${toSearch(query)}`)

/** One comment, the conversation above it, and how many replies hang below. */
export const readComment = (id: string) => request<OwnerCommentThread>(`${OWNER}/comments/${id}`)

export const replyToComment = (id: string, body: string) =>
  post<OwnerComment>(`${OWNER}/comments/${id}/replies`, { body })

/** The comment and every reply beneath it. Answers how many went. */
export const deleteComment = (id: string) =>
  request<{ deleted: number }>(`${OWNER}/comments/${id}`, { method: 'DELETE' })

export const markCommentsSeen = (input: { ids?: string[]; postId?: string; all?: boolean }) =>
  post<{ marked: number; newTotal: number }>(`${OWNER}/comments/seen`, input)
