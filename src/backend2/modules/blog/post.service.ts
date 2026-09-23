import { withTransaction } from '../../db/client'
import {
  type BlogDraftInput,
  type BlogDraftPatch,
  type BlogListQuery,
  type BlogProjectRef,
  type BlogTagRef,
  type BlogVersionPayload,
  ENGAGEMENT_RATE_LIMITS,
  type Language,
  type OwnerBlogListItem,
  type OwnerBlogPost,
  type PublicBlogBatch,
  type PublicBlogPost,
  type PublicEngagement,
  blogDraftIssues,
  blogFileIds,
  canonicalBlogDraft,
  isValidBlogSlug,
  mergeBlogDraft,
  suggestBlogSlug,
} from '../../contracts/blog.contract'
import type { Page } from '../../contracts/pagination.contract'
import { consumeRateLimit } from '../../auth/rate-limit'
import { badRequest, conflict, notFound, rateLimited, validationFailed } from '../../http/error'
import * as comments from './comment.repo'
import { catchUpSchedules } from './post.due'
import {
  ownerMediaUrl,
  isSlugLocked,
  toListItem,
  toOwnerPost,
  toPublicCard,
  toPublicPost,
  toVersionPayload,
} from './post.mapper'
import { syncReferences } from './post.media'
import * as repo from './post.repo'
import * as tags from './tag.repo'

/**
 * What an article request actually does.
 *
 * The rule this file keeps is the owner's: *saving cannot change what visitors
 * see.* Every draft operation writes the draft version and reads the others
 * only to report on them. The places where a snapshot changes are
 * `post.publish.ts` and, for schedules that come due, `post.due.ts`.
 */

/* ------------------------------------------------------------------ reading */

const projectRef = async (projectId: string): Promise<BlogProjectRef | null> => {
  const row = await repo.findProjectRef(projectId)

  if (!row) return null

  const names = row.names ?? {}

  return {
    id: row.id,
    name: names.en || names.de || names.ar || 'Untitled project',
    isLive: row.live,
  }
}

/** One version, with its tags named, its cover sized and its project described. */
const loadPayload = async (
  versionId: string | null,
): Promise<{ stored: repo.StoredVersion; payload: BlogVersionPayload } | null> => {
  if (!versionId) return null

  const stored = await repo.loadVersion(versionId)

  if (!stored) return null

  const tagRefs = await tags.loadTagRefs(stored.draft.tagIds)
  const sizes = await repo.findAssets(stored.draft.cover ? [stored.draft.cover.mediaId] : [])
  const project = stored.draft.projectId ? await projectRef(stored.draft.projectId) : null

  return {
    stored,
    payload: toVersionPayload({ stored, tags: tagRefs, sizes, project }),
  }
}

/**
 * Is this address free for this article?
 *
 * Free means no article holds it, or this one does. An address is held from
 * the moment its article is scheduled or published, for as long as the
 * article exists.
 */
export const isSlugAvailable = async (input: { slug: string; postId: string }): Promise<boolean> => {
  if (input.slug === '') return false

  const owner = await repo.findSlugOwner(input.slug)

  return owner === null || owner === input.postId
}

const describe = async (row: repo.PostRow): Promise<OwnerBlogPost> => {
  const draft = await loadPayload(row.draft_version_id)

  // Every path that creates an article creates its draft too. A missing one
  // could only be a row deleted behind the application's back.
  if (!draft) throw notFound('That article has no draft')

  const scheduled = await loadPayload(row.scheduled_version_id)
  const published = await loadPayload(row.published_version_id)
  const counts = await comments.countsForPosts([row.id])

  return toOwnerPost({
    row,
    draft: draft.stored,
    draftPayload: draft.payload,
    scheduled: scheduled?.payload ?? null,
    published: published?.payload ?? null,
    comments: counts.get(row.id) ?? { total: 0, unseen: 0 },
    slugAvailable: await isSlugAvailable({ slug: draft.stored.draft.slug, postId: row.id }),
  })
}

export const getPost = async (id: string): Promise<OwnerBlogPost> => {
  const row = await repo.findPost(id)

  if (!row) throw notFound('That article does not exist')

  return describe(row)
}

/**
 * The editor's read. Anything whose schedule has come due is published first,
 * so the owner never looks at "Scheduled" for an article that should already
 * be live.
 */
export const readOwnerPost = async (id: string): Promise<OwnerBlogPost> => {
  await catchUpSchedules()

  return getPost(id)
}

export const listPosts = async (query: BlogListQuery): Promise<Page<OwnerBlogListItem>> => {
  await catchUpSchedules()

  const first = await repo.listPosts(query)
  const pageCount = Math.max(1, Math.ceil(first.total / query.pageSize))

  /*
   * A page past the end is clamped rather than answered with nothing: a
   * narrower filter must not strand the owner on page 4 of 2.
   */
  const page = Math.min(query.page, pageCount)
  const result = page === query.page ? first : await repo.listPosts({ ...query, page })

  const draftIds = result.rows
    .map((row) => row.draft_version_id)
    .filter((id): id is string => id !== null)

  const texts = await repo.loadListTexts(draftIds)
  const tagIds = await tags.loadVersionTagIds(draftIds)
  const tagRefs = await tags.loadTagRefs([...new Set([...tagIds.values()].flat())])
  const counts = await comments.countsForPosts(result.rows.map((row) => row.id))

  return {
    items: result.rows.map((row) =>
      toListItem({
        row,
        texts: texts.get(row.draft_version_id ?? ''),
        tags: (tagIds.get(row.draft_version_id ?? '') ?? [])
          .map((id) => tagRefs.get(id))
          .filter((tag): tag is BlogTagRef => tag !== undefined),
        comments: counts.get(row.id) ?? { total: 0, unseen: 0 },
        language: query.language,
      }),
    ),
    page,
    pageSize: query.pageSize,
    total: result.total,
    pageCount,
    hasMore: page < pageCount,
  }
}

/* ----------------------------------------------------------------- creating */

/**
 * A new private draft. The title goes into the one language it was written
 * in, and the address is only a suggestion from it: an Arabic-only title
 * suggests nothing, and an empty address is a perfectly good draft.
 */
export const createPost = async (input: { title: string; language: Language }): Promise<OwnerBlogPost> => {
  const id = await withTransaction(async () =>
    repo.insertPost({
      title: input.title,
      language: input.language,
      slug: suggestBlogSlug(input.title),
    }),
  )

  return getPost(id)
}

/* ------------------------------------------------------------------- saving */

export const staleRevision = () =>
  conflict('This article was changed somewhere else. Reload the page to see the newer version.')

/**
 * Everything the draft names has to exist, and every picture has to be one.
 *
 * An id the vault has never heard of is a client mistake, not a 500, and a
 * PDF is not a cover — the Media library holds documents and videos too.
 */
const assertReferencesExist = async (draft: BlogDraftInput): Promise<void> => {
  const ids = blogFileIds(draft)
  const found = await repo.findAssets(ids)
  const missing = ids.filter((id) => !found.has(id))

  if (missing.length > 0) {
    throw badRequest(
      missing.length === 1
        ? 'One of the selected images is not in the Media library'
        : `${missing.length} of the selected images are not in the Media library`,
    )
  }

  const notImages = ids.filter((id) => found.get(id)?.kind !== 'image')

  if (notImages.length > 0) {
    const coverIsWrong = draft.cover !== null && notImages.includes(draft.cover.mediaId)

    throw validationFailed(
      coverIsWrong ? 'The cover must be an image' : 'Only images can be placed inside an article',
      {
        issues: [{ field: coverIsWrong ? 'cover' : 'texts', message: 'That file is not an image' }],
        missing: [],
      },
    )
  }

  const knownTags = await tags.findKnownTags(draft.tagIds)

  if (draft.tagIds.some((id) => !knownTags.has(id))) {
    throw validationFailed('One of the chosen tags no longer exists', {
      issues: [{ field: 'tagIds', message: 'One of the chosen tags no longer exists' }],
      missing: [],
    })
  }

  if (draft.projectId && !(await repo.findProjectRef(draft.projectId))) {
    throw validationFailed('That project no longer exists', {
      issues: [{ field: 'projectId', message: 'That project no longer exists' }],
      missing: [],
    })
  }
}

/**
 * **Save**: whatever was sent, laid over the draft. The one way editor
 * changes are kept — there is no autosave.
 *
 * A save that changes nothing writes nothing and keeps the revision. A save
 * that makes the draft identical to what is live again records that, so the
 * article goes back to "Live" rather than claiming changes that are not
 * there; the same for a frozen schedule.
 *
 * The address is refused once it is fixed, and the check is here as well as
 * in the editor, because `docs/v2/blog.md` makes a changed published URL a
 * separately planned redirect, never a silent rename.
 */
export const savePost = async (input: {
  postId: string
  draftRevision: number
  patch: BlogDraftPatch
}): Promise<OwnerBlogPost> => {
  await withTransaction(async () => {
    const row = await repo.lockPost(input.postId)

    if (!row) throw notFound('That article does not exist')
    if (row.draft_revision !== input.draftRevision) throw staleRevision()

    const current = row.draft_version_id ? await repo.loadVersion(row.draft_version_id) : null

    if (!current) throw notFound('That article has no draft')

    const next = mergeBlogDraft(current.draft, input.patch)
    const issues = blogDraftIssues(next)

    if (issues.length > 0) {
      throw validationFailed(issues[0]!, {
        issues: issues.map((message) => ({ message })),
        missing: [],
      })
    }

    if (isSlugLocked(row) && next.slug !== (row.slug ?? current.draft.slug)) {
      const message =
        'The web address cannot change once an article is scheduled or has been published'

      throw validationFailed(message, { issues: [{ field: 'slug', message }], missing: [] })
    }

    const canonical = canonicalBlogDraft(next)

    if (canonical === canonicalBlogDraft(current.draft)) return

    await assertReferencesExist(next)
    await repo.writeVersion(current.id, next)

    const revision = await repo.bumpRevision(row.id)

    await syncReferences({ postId: row.id, scope: 'draft', draft: next })

    const published = row.published_version_id
      ? await repo.loadVersion(row.published_version_id)
      : null
    const scheduled = row.scheduled_version_id
      ? await repo.loadVersion(row.scheduled_version_id)
      : null

    await repo.markDraftMatches({
      postId: row.id,
      revision,
      published: published !== null && canonicalBlogDraft(published.draft) === canonical,
      scheduled: scheduled !== null && canonicalBlogDraft(scheduled.draft) === canonical,
    })
  })

  return getPost(input.postId)
}

/* ------------------------------------------------------------------ preview */

/**
 * A version, in the public shape, for the owner's eyes only.
 *
 * Built by the same projection the live site uses, so the preview shows what
 * publishing would produce — the same fallbacks, the same tags, the linked
 * project only while it is live — rather than a second renderer that agrees
 * until it does not. The images point at the owner's route: a draft's files
 * are not public yet, and must not become so because the owner looked.
 */
export const previewPost = async (input: {
  postId: string
  language: Language
  version: 'draft' | 'scheduled' | 'published'
}): Promise<PublicBlogPost> => {
  const row = await repo.findPost(input.postId)

  if (!row) throw notFound('That article does not exist')

  const versionId = {
    draft: row.draft_version_id,
    scheduled: row.scheduled_version_id,
    published: row.published_version_id,
  }[input.version]

  if (!versionId) {
    throw notFound(
      input.version === 'scheduled' ? 'This article is not scheduled' : 'This article is not live',
    )
  }

  const stored = await repo.loadVersion(versionId)

  if (!stored) throw notFound('That article does not exist')

  const texts = stored.draft.texts[input.language]
  const coverId = stored.draft.cover?.mediaId ?? null
  const counts = await comments.countsForPosts([row.id])

  return toPublicPost({
    row: {
      slug: row.slug ?? stored.draft.slug,
      first_published_at: row.first_published_at,
      content_updated_at: row.content_updated_at,
      read_count: row.read_count,
      like_count: row.like_count,
      cover_asset_id: coverId,
      comments_enabled: row.comments_enabled,
    },
    texts: {
      ...texts,
      readingMinutes: stored.readingMinutes[input.language],
      coverAlt: stored.draft.cover?.alt[input.language] ?? '',
    },
    tags: (await tags.loadPublicTags([versionId], input.language)).get(versionId) ?? [],
    sizes: await repo.findAssets(coverId ? [coverId] : []),
    project: stored.draft.projectId
      ? await repo.findLiveProject(stored.draft.projectId, input.language)
      : null,
    commentCount: counts.get(row.id)?.total ?? 0,
    mediaUrl: ownerMediaUrl,
    publishedAtFallback: row.scheduled_for ? new Date(row.scheduled_for) : new Date(),
  })
}

/* -------------------------------------------------------------------- public */

/**
 * What a visitor may read, and only that.
 *
 * These functions never look at a draft or a schedule. They join
 * `published_version_id`, and there is nothing else to join.
 */
export const listPublicPosts = async (input: {
  language: Language
  offset: number
  limit: number
  tag: string
}): Promise<PublicBlogBatch> => {
  await catchUpSchedules()

  const { rows, total } = await repo.listPublished({
    offset: input.offset,
    limit: input.limit,
    tagSlug: input.tag,
  })

  const versionIds = rows.map((row) => row.version_id)
  const texts = await repo.loadTextsIn(versionIds, input.language, { withBody: false })
  const publicTags = await tags.loadPublicTags(versionIds, input.language)
  const sizes = await repo.findAssets(
    rows.map((row) => row.cover_asset_id).filter((id): id is string => id !== null),
  )

  const items = rows.flatMap((row) => {
    const text = texts.get(row.version_id)

    return text
      ? [toPublicCard({ row, texts: text, tags: publicTags.get(row.version_id) ?? [], sizes })]
      : []
  })

  return {
    items,
    offset: input.offset,
    limit: input.limit,
    total,
    hasMore: input.offset + items.length < total,
  }
}

/** A live article by its address, or the same 404 as an address that never existed. */
const findLive = async (slug: string): Promise<repo.PublishedRow> => {
  const found = isValidBlogSlug(slug) ? await repo.findPublishedBySlug(slug) : null

  if (!found) throw notFound('That article does not exist')

  return found
}

export const readPublicPost = async (input: {
  slug: string
  language: Language
}): Promise<PublicBlogPost> => {
  await catchUpSchedules()

  const found = await findLive(input.slug)
  const texts = (await repo.loadTextsIn([found.version_id], input.language, { withBody: true })).get(
    found.version_id,
  )

  if (!texts) throw notFound('That article does not exist')

  const counts = await comments.countsForPosts([found.id])

  return toPublicPost({
    row: found,
    texts,
    tags: (await tags.loadPublicTags([found.version_id], input.language)).get(found.version_id) ?? [],
    sizes: await repo.findAssets(found.cover_asset_id ? [found.cover_asset_id] : []),
    project: found.project_id ? await repo.findLiveProject(found.project_id, input.language) : null,
    commentCount: counts.get(found.id)?.total ?? 0,
  })
}

/* --------------------------------------------------------------- counters */

/**
 * The counters' own limit, per sender. Refused quietly — a read that could
 * not be counted is not worth a visitor's attention, and the website ignores
 * the answer anyway.
 */
const limitEngagement = async (
  rule: (typeof ENGAGEMENT_RATE_LIMITS)[keyof typeof ENGAGEMENT_RATE_LIMITS],
  identity: string,
): Promise<void> => {
  const result = await consumeRateLimit({
    scope: rule.scope,
    identity,
    rule: { limit: rule.limit, windowSeconds: rule.windowSeconds },
  })

  if (!result.allowed) {
    throw rateLimited('That is a lot of clicking. Give it a minute.', {
      reason: 'too_fast',
      retryAfter: result.retryAfter,
    })
  }
}

/**
 * One more read. Two integers come back and nothing is stored about the
 * reader: whether *this* browser has counted the article already is
 * remembered by the browser, never by the server.
 */
export const countPublicRead = async (input: {
  slug: string
  identity: string
}): Promise<PublicEngagement> => {
  if (!isValidBlogSlug(input.slug)) throw notFound('That article does not exist')

  await limitEngagement(ENGAGEMENT_RATE_LIMITS.read, input.identity)

  const counts = await repo.countRead(input.slug)

  if (!counts) throw notFound('That article does not exist')

  return { readCount: Number(counts.read_count), likeCount: Number(counts.like_count) }
}

export const setPublicLike = async (input: {
  slug: string
  liked: boolean
  identity: string
}): Promise<PublicEngagement> => {
  if (!isValidBlogSlug(input.slug)) throw notFound('That article does not exist')

  await limitEngagement(ENGAGEMENT_RATE_LIMITS.like, input.identity)

  const counts = await repo.changeLikes(input.slug, input.liked)

  if (!counts) throw notFound('That article does not exist')

  return { readCount: Number(counts.read_count), likeCount: Number(counts.like_count) }
}
