import {
  type Language,
  LANGUAGES,
  type OwnerImage,
  type OwnerListItem,
  type OwnerProject,
  type ProjectDraftInput,
  type ProjectState,
  type ProjectType,
  type ProjectVersionPayload,
  type PublicImage,
  type PublicProjectCard,
  type PublicProjectDetail,
  type PublicRichTextDoc,
  type PublicRichTextNode,
  type WorkStatus,
  completeLanguages,
  displayName,
} from '../../contracts/project.contract'
import type { RichTextDoc, RichTextNode } from '../../contracts/rich-text.contract'
import type { ProjectRow, StoredImage, VersionContent, VersionRow } from './project.repo'

/**
 * Rows in, responses out.
 *
 * Two audiences with opposite rules. The owner's shape carries everything the
 * editor needs and still refuses to hand out a storage key or a row id. The
 * public shape is built **field by field from typed input, never by spreading
 * a row** — that is the whole mechanism by which a hidden client name or a
 * private repository link cannot reach a visitor because someone forgot a
 * `WHERE`.
 */

export type {
  OwnerImage,
  OwnerListItem,
  OwnerProject,
  ProjectVersionPayload,
  PublicImage,
  PublicProjectCard,
  PublicProjectDetail,
  PublicRichTextDoc,
  PublicRichTextNode,
}

export const ownerMediaUrl = (assetId: string): string =>
  `/api/v2/owner/media/files/${assetId}/content`

export const publicMediaUrl = (assetId: string): string => `/api/v2/media/${assetId}`

/* ------------------------------------------------------------------- states */

/**
 * Derived on every read, never stored twice
 * (`docs/v2/projects-backend.md` §3).
 *
 * The order matters: archived wins over everything, and an unpublished
 * project is distinguished from one that was never published by
 * `first_published_at` — so the list can say "you took this down" rather than
 * "this is new".
 */
export const projectState = (row: ProjectRow): ProjectState => {
  if (row.lifecycle === 'archived') return 'archived'

  if (row.published_version_id === null) {
    return row.first_published_at === null ? 'draft' : 'unpublished'
  }

  return hasPendingChanges(row) ? 'published_with_pending_changes' : 'published'
}

export const hasPendingChanges = (row: ProjectRow): boolean =>
  row.published_version_id !== null && row.draft_revision !== row.published_draft_revision

/* -------------------------------------------------------------- owner shape */

/* The shapes themselves live in `project.contract.ts`, which is the only part
   of `src/backend2/` the Dashboard may import. */

const toOwnerImage = (image: StoredImage): OwnerImage => ({
  mediaId: image.assetId,
  url: ownerMediaUrl(image.assetId),
  width: image.width,
  height: image.height,
  byteSize: image.byteSize,
  alt: image.alt,
})

/**
 * What the editor loads. Note what is absent: no storage key, no version id,
 * no row id for a text, link or image. The owner API is private and still
 * hands out only what the editor needs.
 */
export const toOwnerVersion = (
  version: VersionRow,
  content: VersionContent,
): ProjectVersionPayload => ({
  slug: version.slug,
  type: version.type,
  workStatus: version.work_status,
  clientName: version.client_name,
  showClientName: version.show_client_name,
  tech: content.tech,
  links: content.links,
  texts: content.texts,
  cover: content.cover ? toOwnerImage(content.cover) : null,
  gallery: content.gallery.map(toOwnerImage),
})

/** The editor's own state, in exactly the shape `publishBlockers` accepts. */
export const toDraftInput = (payload: ProjectVersionPayload): ProjectDraftInput => ({
  slug: payload.slug,
  type: payload.type,
  workStatus: payload.workStatus,
  clientName: payload.clientName,
  showClientName: payload.showClientName,
  tech: payload.tech,
  links: payload.links,
  texts: payload.texts,
  cover: payload.cover ? { mediaId: payload.cover.mediaId, alt: payload.cover.alt } : null,
  gallery: payload.gallery.map((image) => ({ mediaId: image.mediaId, alt: image.alt })),
})

const iso = (value: Date | null): string | null => (value ? new Date(value).toISOString() : null)

export const toOwnerProject = (input: {
  row: ProjectRow
  draft: ProjectVersionPayload
  published: ProjectVersionPayload | null
  blockers: string[]
  slugAvailable: boolean
}): OwnerProject => ({
  id: input.row.id,
  position: input.row.position,
  state: projectState(input.row),
  lifecycle: input.row.lifecycle,
  draftRevision: input.row.draft_revision,
  createdAt: iso(input.row.created_at)!,
  updatedAt: iso(input.row.updated_at)!,
  firstPublishedAt: iso(input.row.first_published_at),
  publishedAt: iso(input.row.published_at),
  hasPendingChanges: hasPendingChanges(input.row),
  draft: input.draft,
  published: input.published,
  publishBlockers: input.blockers,
  slugAvailable: input.slugAvailable,
})

export const toListItem = (input: {
  row: ProjectRow & {
    slug: string
    type: ProjectType
    work_status: WorkStatus
    published_slug: string | null
    image_count: number
    cover_asset_id: string | null
  }
  texts: Record<Language, { name: string; summary: string }>
  language: Language
}): OwnerListItem => {
  // `completeLanguages` and `displayName` want the full text shape; the list
  // only reads two of its fields, so the rest are filled in rather than
  // fetched.
  const full = Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      { ...input.texts[language], categoryLabel: '', caseStudy: null },
    ]),
  ) as VersionContent['texts']

  return {
    id: input.row.id,
    position: input.row.position,
    state: projectState(input.row),
    type: input.row.type,
    workStatus: input.row.work_status,
    slug: input.row.slug,
    publishedSlug: input.row.published_slug,
    displayName: displayName(full, input.language),
    languagesComplete: completeLanguages(full),
    coverUrl: input.row.cover_asset_id ? ownerMediaUrl(input.row.cover_asset_id) : null,
    imageCount: input.row.image_count,
    hasPendingChanges: hasPendingChanges(input.row),
    updatedAt: iso(input.row.updated_at)!,
    publishedAt: iso(input.row.published_at),
  }
}

/* ------------------------------------------------------------- public shape */

/* The shapes live in `project.contract.ts`, next to the owner's. */

/**
 * Where an image in a response can be fetched from.
 *
 * A visitor's copy points at the public route, which serves a file only while
 * a *published* version uses it. The owner's preview is built by this same
 * projection from the *draft* — and a draft's images are, by design, not
 * public yet, so pointed at the public route they answered 404 and the preview
 * showed broken pictures exactly where the owner was checking them. The
 * preview passes the owner's route instead; nothing else changes, so the
 * preview still shows precisely what publishing would produce.
 */
export type MediaUrl = (assetId: string) => string

const resolveInlineImages = (
  doc: RichTextDoc | null,
  mediaUrl: MediaUrl,
): PublicRichTextDoc | null => {
  if (!doc) return null

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

  return { type: 'doc', content: doc.content.map(convert) }
}

const toPublicImage = (
  image: StoredImage,
  language: Language,
  sizes: Map<string, { width: number | null; height: number | null }>,
  mediaUrl: MediaUrl,
): PublicImage => ({
  url: mediaUrl(image.assetId),
  width: sizes.get(image.assetId)?.width ?? image.width,
  height: sizes.get(image.assetId)?.height ?? image.height,
  // One language's sentence. The other two are not sent.
  alt: image.alt[language],
})

/**
 * A card, built one field at a time.
 *
 * Nothing here spreads a row or a payload. Adding a private column to
 * `v2_project_versions` later therefore cannot leak it by default — this
 * function would have to be edited to mention it, and a test deep-scans the
 * serialised output for exactly that mistake.
 */
export const toPublicCard = (input: {
  version: VersionRow
  content: VersionContent
  language: Language
  publishedAt: Date | null
  sizes: Map<string, { width: number | null; height: number | null }>
  /** Defaults to the public route; only the owner's preview changes it. */
  mediaUrl?: MediaUrl
}): PublicProjectCard => {
  const text = input.content.texts[input.language]
  const mediaUrl = input.mediaUrl ?? publicMediaUrl

  return {
    slug: input.version.slug,
    type: input.version.type,
    workStatus: input.version.work_status,
    name: text.name,
    // Empty means "fall back to the project type on the page", which the
    // public design already does. An empty string would render an empty
    // eyebrow instead.
    categoryLabel: text.categoryLabel === '' ? null : text.categoryLabel,
    summary: text.summary,
    cover: input.content.cover
      ? toPublicImage(input.content.cover, input.language, input.sizes, mediaUrl)
      : null,
    tech: input.content.tech,
    publishedAt: input.publishedAt ? new Date(input.publishedAt).toISOString() : null,
  }
}

export const toPublicDetail = (input: {
  version: VersionRow
  content: VersionContent
  language: Language
  publishedAt: Date | null
  canonicalSlug: string
  sizes: Map<string, { width: number | null; height: number | null }>
  /** Defaults to the public route; only the owner's preview changes it. */
  mediaUrl?: MediaUrl
}): PublicProjectDetail => {
  const mediaUrl = input.mediaUrl ?? publicMediaUrl
  // A link that exists is not a link that is published. `isPublic` is checked
  // here and nowhere else, so there is one place to read to be sure.
  const publicLinks = input.content.links.filter((link) => link.isPublic && link.url.trim() !== '')

  return {
    ...toPublicCard(input),
    canonicalSlug: input.canonicalSlug,
    caseStudy: resolveInlineImages(input.content.texts[input.language].caseStudy, mediaUrl),
    gallery: input.content.gallery.map((image) =>
      toPublicImage(image, input.language, input.sizes, mediaUrl),
    ),
    website: publicLinks.find((link) => link.kind === 'website')?.url ?? null,
    source: publicLinks.find((link) => link.kind === 'source')?.url ?? null,
    otherLinks: publicLinks
      .filter((link) => link.kind === 'other')
      .map((link) => ({ url: link.url, label: link.labels[input.language] })),
    /*
     * A client's name is never published because it happens to be stored.
     * Both halves are required: the owner's explicit choice, and a name to
     * show.
     */
    client:
      input.version.show_client_name && (input.version.client_name ?? '').trim() !== ''
        ? { name: input.version.client_name! }
        : null,
  }
}
