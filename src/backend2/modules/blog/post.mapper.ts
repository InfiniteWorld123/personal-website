import {
  type BlogCounts,
  type BlogDoc,
  type BlogImage,
  type BlogNode,
  type BlogProjectRef,
  type BlogPublicationDelay,
  type BlogSchedule,
  type BlogState,
  type BlogTagRef,
  type BlogVersionPayload,
  LANGUAGES,
  type Language,
  type OwnerBlogListItem,
  type OwnerBlogPost,
  type PublicBlogCard,
  type PublicBlogDoc,
  type PublicBlogImage,
  type PublicBlogNode,
  type PublicBlogPost,
  type PublicBlogTag,
  BLOG_AUTHOR_NAME,
  SCHEDULE_LATE_AFTER_MINUTES,
  blogDisplayTitle,
  blogPublishIssues,
  completeBlogLanguages,
  instantToBerlinWallTime,
  resolveBlogSeo,
} from '../../contracts/blog.contract'
import type { PublicRichTextNode } from '../../contracts/project.contract'
import type { RichTextNode } from '../../contracts/rich-text.contract'
import type { LanguageTexts, ListRow, PostRow, PublishedRow, StoredVersion } from './post.repo'

/**
 * Rows in, responses out.
 *
 * Two audiences with opposite rules. The owner's shape carries everything the
 * editor needs and still refuses to hand out a storage key or a row id it has
 * no use for. The public shape is built **field by field from typed input,
 * never by spreading a row** — that is the whole mechanism by which a draft
 * sentence, a private file or a hidden id cannot reach a visitor because
 * somebody forgot a `WHERE`.
 */

export const ownerMediaUrl = (assetId: string): string =>
  `/api/v2/owner/media/files/${assetId}/content`

export const publicMediaUrl = (assetId: string): string => `/api/v2/media/${assetId}`

/**
 * Where an image in a response is fetched from. A visitor's copy points at the
 * public route, which serves a file only while a published snapshot uses it.
 * The owner's preview is built by this same projection from a draft or a
 * schedule — whose images are, by design, not public yet — so it passes the
 * owner's route instead and nothing else changes.
 */
export type MediaUrl = (assetId: string) => string

const iso = (value: Date | string | null): string | null =>
  value === null ? null : new Date(value).toISOString()

/* ------------------------------------------------------------------- states */

type StateFields = Pick<
  PostRow,
  | 'published_version_id'
  | 'scheduled_version_id'
  | 'first_published_at'
  | 'draft_revision'
  | 'published_draft_revision'
>

/**
 * Derived on every read, never stored twice.
 *
 * An article that was taken down is told apart from one that was never
 * published by `first_published_at`, so the list can say "you took this
 * down" rather than "this is new".
 */
export const blogState = (row: StateFields): BlogState => {
  if (row.scheduled_version_id !== null) return 'scheduled'

  if (row.published_version_id !== null) {
    return hasPendingChanges(row) ? 'published_with_pending_changes' : 'published'
  }

  return row.first_published_at === null ? 'draft' : 'unpublished'
}

export const hasPendingChanges = (row: StateFields): boolean =>
  row.published_version_id !== null && row.draft_revision !== row.published_draft_revision

/** A schedule that published noticeably later than it was due, or null. */
export const publicationDelay = (row: PostRow): BlogPublicationDelay | null => {
  if (row.last_scheduled_for === null || row.last_schedule_ran_at === null) return null

  const due = new Date(row.last_scheduled_for).getTime()
  const ran = new Date(row.last_schedule_ran_at).getTime()
  const minutesLate = Math.floor((ran - due) / 60_000)

  if (minutesLate < SCHEDULE_LATE_AFTER_MINUTES) return null

  return {
    scheduledFor: iso(row.last_scheduled_for)!,
    publishedAt: iso(row.last_schedule_ran_at)!,
    minutesLate,
  }
}

export const toSchedule = (row: PostRow): BlogSchedule | null => {
  if (row.scheduled_for === null || row.scheduled_draft_revision === null) return null

  return {
    publishAt: iso(row.scheduled_for)!,
    publishAtBerlin: instantToBerlinWallTime(new Date(row.scheduled_for)),
    draftRevision: row.scheduled_draft_revision,
    matchesDraft: row.scheduled_draft_revision === row.draft_revision,
  }
}

const toCounts = (row: PostRow, comments: { total: number; unseen: number }): BlogCounts => ({
  reads: Number(row.read_count),
  likes: Number(row.like_count),
  comments: comments.total,
  newComments: comments.unseen,
})

/* -------------------------------------------------------------- owner shape */

export type AssetSizes = Map<string, { width: number | null; height: number | null }>

/**
 * One version as the editor loads it. The cover arrives with a URL the
 * dashboard can put in `src`, its size, and its three alternative texts; the
 * tags arrive with their names, so the editor never looks one up.
 */
export const toVersionPayload = (input: {
  stored: StoredVersion
  tags: Map<string, BlogTagRef>
  sizes: AssetSizes
  project: BlogProjectRef | null
}): BlogVersionPayload => {
  const { draft } = input.stored

  const cover: BlogImage | null = draft.cover
    ? {
        mediaId: draft.cover.mediaId,
        url: ownerMediaUrl(draft.cover.mediaId),
        width: input.sizes.get(draft.cover.mediaId)?.width ?? null,
        height: input.sizes.get(draft.cover.mediaId)?.height ?? null,
        alt: draft.cover.alt,
      }
    : null

  return {
    slug: draft.slug,
    cover,
    projectId: draft.projectId,
    project: input.project,
    tagIds: draft.tagIds,
    tags: draft.tagIds
      .map((id) => input.tags.get(id))
      .filter((tag): tag is BlogTagRef => tag !== undefined),
    texts: Object.fromEntries(
      LANGUAGES.map((language) => [
        language,
        { ...draft.texts[language], readingMinutes: input.stored.readingMinutes[language] },
      ]),
    ) as BlogVersionPayload['texts'],
  }
}

export const toOwnerPost = (input: {
  row: PostRow
  draft: StoredVersion
  draftPayload: BlogVersionPayload
  scheduled: BlogVersionPayload | null
  published: BlogVersionPayload | null
  comments: { total: number; unseen: number }
  slugAvailable: boolean
}): OwnerBlogPost => {
  const issues = blogPublishIssues(input.draft.draft)

  return {
    id: input.row.id,
    state: blogState(input.row),
    draftRevision: input.row.draft_revision,
    createdAt: iso(input.row.created_at)!,
    updatedAt: iso(input.row.updated_at)!,
    slugLocked: isSlugLocked(input.row),
    publicSlug: input.row.slug,
    firstPublishedAt: iso(input.row.first_published_at),
    publishedAt: iso(input.row.published_at),
    contentUpdatedAt: iso(input.row.content_updated_at),
    hasPendingChanges: hasPendingChanges(input.row),
    schedule: toSchedule(input.row),
    publicationDelay: publicationDelay(input.row),
    commentsEnabled: input.row.comments_enabled,
    counts: toCounts(input.row, input.comments),
    draft: input.draftPayload,
    scheduled: input.scheduled,
    published: input.published,
    publishBlockers: issues.map((issue) => issue.message),
    publishIssues: issues,
    slugAvailable: input.slugAvailable,
  }
}

/**
 * The address is fixed once anything outside the draft depends on it: a
 * frozen schedule, or a publication a visitor may have bookmarked.
 */
export const isSlugLocked = (row: Pick<PostRow, 'scheduled_version_id' | 'first_published_at'>) =>
  row.scheduled_version_id !== null || row.first_published_at !== null

export const toListItem = (input: {
  row: ListRow
  texts: Record<Language, { title: string; summary: string; bodyEmpty: boolean }> | undefined
  tags: BlogTagRef[]
  comments: { total: number; unseen: number }
  language: Language
}): OwnerBlogListItem => {
  const texts = input.texts ?? {
    de: { title: '', summary: '', bodyEmpty: true },
    en: { title: '', summary: '', bodyEmpty: true },
    ar: { title: '', summary: '', bodyEmpty: true },
  }
  const schedule = toSchedule(input.row)

  return {
    id: input.row.id,
    state: blogState(input.row),
    draftRevision: input.row.draft_revision,
    slug: input.row.draft_slug,
    publicSlug: input.row.slug,
    displayTitle: blogDisplayTitle(texts, input.language),
    languagesComplete: completeBlogLanguages(texts),
    coverUrl: input.row.cover_asset_id ? ownerMediaUrl(input.row.cover_asset_id) : null,
    tags: input.tags.map((tag) => ({ id: tag.id, name: tag.names[input.language] || tag.names.en })),
    schedule: schedule
      ? { publishAt: schedule.publishAt, publishAtBerlin: schedule.publishAtBerlin }
      : null,
    publicationDelay: publicationDelay(input.row),
    firstPublishedAt: iso(input.row.first_published_at),
    publishedAt: iso(input.row.published_at),
    contentUpdatedAt: iso(input.row.content_updated_at),
    createdAt: iso(input.row.created_at)!,
    updatedAt: iso(input.row.updated_at)!,
    hasPendingChanges: hasPendingChanges(input.row),
    commentsEnabled: input.row.comments_enabled,
    counts: toCounts(input.row, input.comments),
  }
}

/* ------------------------------------------------------------- public shape */

/**
 * The stored body, as a visitor receives it.
 *
 * Rebuilt node by node rather than passed through: an image swaps its library
 * id for a `src`, and a video is rebuilt from its three named attributes, so
 * a stray key that somehow reached the database still cannot reach a page.
 */
export const resolveBody = (doc: BlogDoc, mediaUrl: MediaUrl): PublicBlogDoc => {
  const convert = (node: RichTextNode): PublicRichTextNode => {
    if (node.type === 'image') {
      return {
        type: 'image',
        attrs: {
          src: mediaUrl(node.attrs.mediaId),
          alt: node.attrs.alt,
          width: node.attrs.width,
          height: node.attrs.height,
        },
      }
    }

    if ('content' in node && node.content) {
      return { ...node, content: node.content.map(convert) } as PublicRichTextNode
    }

    return node as PublicRichTextNode
  }

  const top = (node: BlogNode): PublicBlogNode =>
    node.type === 'youtube'
      ? {
          type: 'youtube',
          attrs: { videoId: node.attrs.videoId, start: node.attrs.start, title: node.attrs.title },
        }
      : convert(node)

  return { type: 'doc', content: doc.content.map(top) }
}

type CardSource = Pick<
  PublishedRow,
  'slug' | 'first_published_at' | 'content_updated_at' | 'read_count' | 'like_count' | 'cover_asset_id'
>

/**
 * A card, built one field at a time. Nothing here spreads a row: a private
 * column added later cannot leak by default, and a test deep-scans the
 * serialised output for exactly that mistake.
 */
export const toPublicCard = (input: {
  row: CardSource
  texts: LanguageTexts
  tags: PublicBlogTag[]
  sizes: AssetSizes
  mediaUrl?: MediaUrl
  /** The preview of a never-published article has no publication date yet. */
  publishedAtFallback?: Date
}): PublicBlogCard => {
  const mediaUrl = input.mediaUrl ?? publicMediaUrl
  const coverId = input.row.cover_asset_id

  const cover: PublicBlogImage | null = coverId
    ? {
        url: mediaUrl(coverId),
        width: input.sizes.get(coverId)?.width ?? null,
        height: input.sizes.get(coverId)?.height ?? null,
        // One language's sentence. The other two are not sent.
        alt: input.texts.coverAlt,
      }
    : null

  return {
    slug: input.row.slug ?? '',
    title: input.texts.title,
    summary: input.texts.summary,
    publishedAt: (iso(input.row.first_published_at) ??
      input.publishedAtFallback?.toISOString() ??
      new Date(0).toISOString()) as string,
    updatedAt: iso(input.row.content_updated_at),
    readingMinutes: input.texts.readingMinutes,
    cover,
    tags: input.tags,
    readCount: Number(input.row.read_count),
    likeCount: Number(input.row.like_count),
  }
}

export const toPublicPost = (input: {
  row: CardSource & { comments_enabled: boolean }
  texts: LanguageTexts
  tags: PublicBlogTag[]
  sizes: AssetSizes
  project: { slug: string; name: string } | null
  commentCount: number
  mediaUrl?: MediaUrl
  publishedAtFallback?: Date
}): PublicBlogPost => {
  const mediaUrl = input.mediaUrl ?? publicMediaUrl

  return {
    ...toPublicCard(input),
    body: resolveBody(input.texts.body, mediaUrl),
    project: input.project,
    author: { name: BLOG_AUTHOR_NAME },
    seo: resolveBlogSeo(input.texts),
    // Publication demands all three, so a live article is always in all three.
    languages: [...LANGUAGES],
    commentsEnabled: input.row.comments_enabled,
    commentCount: input.row.comments_enabled ? input.commentCount : 0,
  }
}
