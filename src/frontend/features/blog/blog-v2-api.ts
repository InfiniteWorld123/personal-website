import type {
  PublicComment,
  PublicCommentPage,
  PublicEngagement,
} from '#/backend2/contracts/blog.contract'
import type { CommentRefusalWord } from './blog-v2-words'

/**
 * The browser's side of the Backend2 Blog: comments, replies, reads and likes,
 * through the public routes under `/api/v2/blog` (`docs/v2/blog.md`).
 *
 * Plain `fetch` and types only — no client library and no schema — so the
 * article bundle carries a few hundred bytes for this rather than the API
 * layer. The server validates everything again, and every refusal comes back
 * as a stable `details.reason`, which the page translates.
 */

const postPath = (slug: string) => `/api/v2/blog/posts/${encodeURIComponent(slug)}`

const REASONS: readonly CommentRefusalWord[] = [
  'empty',
  'too_long',
  'too_many_links',
  'markup',
  'duplicate',
  'too_fast',
  'too_deep',
  'gone',
  'rejected',
]

/** A refusal or a failure, with the word the page shows for it. */
export class BlogRequestError extends Error {
  readonly reason: CommentRefusalWord
  readonly status: number

  constructor(reason: CommentRefusalWord, status: number) {
    super(reason)
    this.name = 'BlogRequestError'
    this.reason = reason
    this.status = status
  }
}

/**
 * The page's word for a failed answer. A reason the page has no sentence for
 * (comments switched off a moment ago) is "could not be posted"; a request
 * refused for its size is "too long"; anything without an answer at all —
 * the network, a server error — is the retryable "your text is still here".
 */
export const reasonFor = (status: number, body: unknown): CommentRefusalWord => {
  const reason = (body as { details?: { reason?: unknown } } | null)?.details?.reason

  if (typeof reason === 'string') {
    return (REASONS as readonly string[]).includes(reason) ? (reason as CommentRefusalWord) : 'rejected'
  }

  if (status === 413) return 'too_long'
  if (status === 429) return 'too_fast'

  return 'server'
}

const send = async <T>(path: string, init?: { method: 'POST'; body: unknown }): Promise<T> => {
  let response: Response

  try {
    response = await fetch(path, {
      method: init?.method ?? 'GET',
      credentials: 'same-origin',
      headers: init ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
      body: init ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new BlogRequestError('server', 0)
  }

  const body: unknown = await response.json().catch(() => null)
  const envelope = body as { success?: boolean; data?: T } | null

  if (!response.ok || !envelope?.success) throw new BlogRequestError(reasonFor(response.status, body), response.status)

  return envelope.data as T
}

const query = (values: Record<string, string | number>) =>
  new URLSearchParams(
    Object.entries(values)
      .filter(([, value]) => value !== '')
      .map(([key, value]) => [key, String(value)]),
  ).toString()

export const fetchComments = (slug: string, input: { cursor?: string; limit: number }) =>
  send<PublicCommentPage>(`${postPath(slug)}/comments?${query({ cursor: input.cursor ?? '', limit: input.limit })}`)

export const fetchReplies = (slug: string, commentId: string, input: { cursor?: string; limit: number }) =>
  send<PublicCommentPage>(
    `${postPath(slug)}/comments/${encodeURIComponent(commentId)}/replies?${query({
      cursor: input.cursor ?? '',
      limit: input.limit,
    })}`,
  )

export const postComment = (
  slug: string,
  input: { body: string; parentId: string | null; website: string },
) => send<PublicComment>(`${postPath(slug)}/comments`, { method: 'POST', body: input })

export const countRead = (slug: string) =>
  send<PublicEngagement>(`${postPath(slug)}/read`, { method: 'POST', body: {} })

export const setLike = (slug: string, liked: boolean) =>
  send<PublicEngagement>(`${postPath(slug)}/like`, { method: 'POST', body: { liked } })
