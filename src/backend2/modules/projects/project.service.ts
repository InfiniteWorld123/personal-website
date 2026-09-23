import { withTransaction } from '../../db/client'
import {
  type Language,
  type ProjectDraftInput,
  type ProjectListQuery,
  type ProjectType,
  type WorkStatus,
  displayName,
  publishBlockers,
  slugify,
} from '../../contracts/project.contract'
import { badRequest, conflict, notFound } from '../../http/error'
import type { Page } from '../../contracts/pagination.contract'
import { replaceReferences } from '../media/media.service'
import type { ReferenceEntry } from '../media/media.repo'
import * as repo from './project.repo'
import {
  type OwnerListItem,
  type OwnerProject,
  type ProjectVersionPayload,
  type PublicProjectCard,
  type PublicProjectDetail,
  toDraftInput,
  toListItem,
  toOwnerProject,
  toOwnerVersion,
  ownerMediaUrl,
  toPublicCard,
  toPublicDetail,
} from './project.mapper'

/**
 * What a Projects request actually does.
 *
 * The rule this file exists to keep is one sentence from `docs/v2/projects.md`:
 * *saving cannot change what visitors see.* Every draft operation below writes
 * to the draft version and reads the published one only to report on it, and
 * the one place the two meet is `publish`.
 */

/* ------------------------------------------------------------------ reading */

const loadOwnerVersions = async (
  row: repo.ProjectRow,
): Promise<{ draft: ProjectVersionPayload; published: ProjectVersionPayload | null }> => {
  if (!row.draft_version_id) {
    // Only reachable if a draft row were deleted behind the application's
    // back; every path that creates a project creates its draft too.
    throw notFound('That project has no draft')
  }

  const draftVersion = await repo.findVersion(row.draft_version_id)

  if (!draftVersion) throw notFound('That project has no draft')

  const draft = toOwnerVersion(draftVersion, await repo.loadVersionContent(draftVersion.id))

  if (!row.published_version_id) return { draft, published: null }

  const publishedVersion = await repo.findVersion(row.published_version_id)

  if (!publishedVersion) return { draft, published: null }

  return {
    draft,
    published: toOwnerVersion(
      publishedVersion,
      await repo.loadVersionContent(publishedVersion.id),
    ),
  }
}

/**
 * Is this public address free?
 *
 * Free means: nobody holds it, or the holder is this project. Every slug a
 * project has ever published under is in the table, so an address cannot be
 * taken over from an old link that still resolves (D6).
 */
export const isSlugAvailable = async (input: {
  slug: string
  projectId: string
}): Promise<boolean> => {
  if (input.slug === '') return false

  const owner = await repo.findSlugOwner(input.slug)

  return owner === null || owner === input.projectId
}

const describe = async (row: repo.ProjectRow): Promise<OwnerProject> => {
  const { draft, published } = await loadOwnerVersions(row)
  const draftInput = toDraftInput(draft)

  return toOwnerProject({
    row,
    draft,
    published,
    // Recomputed on every read, so the editor's checklist is never stale.
    blockers: publishBlockers(draftInput),
    slugAvailable: await isSlugAvailable({ slug: draft.slug, projectId: row.id }),
  })
}

export const getProject = async (id: string): Promise<OwnerProject> => {
  const row = await repo.findProject(id)

  if (!row) throw notFound('That project does not exist')

  return describe(row)
}

export const listProjects = async (query: ProjectListQuery): Promise<Page<OwnerListItem>> => {
  const first = await repo.listProjects(query)

  const pageCount = Math.max(1, Math.ceil(first.total / query.pageSize))

  /*
   * A page past the end is clamped rather than answered with an empty list:
   * narrowing a filter must not strand the owner on page 4 of 2 with no way
   * back except editing the URL.
   */
  const page = query.page > pageCount ? pageCount : query.page
  const result = page === query.page ? first : await repo.listProjects({ ...query, page })

  const texts = await repo.loadListTexts(
    result.rows.map((row) => row.draft_version_id).filter((id): id is string => id !== null),
  )

  const items = result.rows.map((row) =>
    toListItem({
      row,
      texts: texts.get(row.draft_version_id ?? '') ?? {
        de: { name: '', summary: '' },
        en: { name: '', summary: '' },
        ar: { name: '', summary: '' },
      },
      language: query.language,
    }),
  )

  return {
    items,
    page,
    pageSize: query.pageSize,
    total: result.total,
    pageCount,
    hasMore: page < pageCount,
  }
}

/* ----------------------------------------------------------------- creating */

export const createProject = async (input: {
  type: ProjectType
  workStatus: WorkStatus
  name: string
}): Promise<OwnerProject> => {
  const row = await withTransaction(async () => {
    const { projectId } = await repo.insertProject({
      type: input.type,
      workStatus: input.workStatus,
      name: input.name,
      // A suggestion from the name, which the owner edits before publishing.
      // An Arabic-only name transliterates to nothing, and an empty slug is a
      // perfectly good draft — publication is where it becomes a blocker.
      slug: slugify(input.name),
    })

    return repo.findProject(projectId)
  })

  if (!row) throw notFound('That project does not exist')

  return describe(row)
}

/* ------------------------------------------------------------------- saving */

/**
 * Which library files this version uses, and how, for the vault's accounting.
 *
 * `docs/v2/media.md`: a reference is what makes a file undeletable, and at
 * `published` scope it is also the only thing that makes it publicly
 * servable. Draft and published are separate scopes on purpose — saving a
 * draft that drops an image must not take that image off the live page.
 */
const referenceEntries = (draft: ProjectDraftInput): ReferenceEntry[] => {
  const entries: ReferenceEntry[] = []
  const seen = new Set<string>()

  const add = (assetId: string, usage: ReferenceEntry['usage'], position: number) => {
    // One row per file. A photograph used as the cover and again inside the
    // story is one use of one file as far as deletion is concerned.
    if (seen.has(assetId)) return

    seen.add(assetId)
    entries.push({ assetId, usage, position })
  }

  if (draft.cover) add(draft.cover.mediaId, 'cover', 0)

  draft.gallery.forEach((image, index) => add(image.mediaId, 'gallery', index + 1))

  let position = draft.gallery.length + 1

  for (const language of ['de', 'en', 'ar'] as const) {
    for (const id of collectInline(draft, language)) add(id, 'inline', (position += 1))
  }

  return entries
}

const collectInline = (draft: ProjectDraftInput, language: Language): string[] => {
  const doc = draft.texts[language].caseStudy

  if (!doc) return []

  const ids: string[] = []

  const walk = (nodes: typeof doc.content) => {
    for (const node of nodes) {
      if (node.type === 'image') ids.push(node.attrs.mediaId)
      if ('content' in node && node.content) walk(node.content)
    }
  }

  walk(doc.content)

  return ids
}

/** The sentence the Media library shows when it refuses to delete a file. */
const referenceLabel = (draft: ProjectDraftInput, suffix: string): string =>
  `Project: ${displayName(draft.texts, 'en')}${suffix}`

/**
 * Every file the draft names has to be in the library.
 *
 * The check that used to be "does this media object belong to this project?"
 * That question stopped existing when Media became shared: a file may be used
 * by a project, an article and an invoice at once. What has not changed is
 * that an id the vault has never heard of is a client mistake, not a 500.
 */
const assertAssetsExist = async (draft: ProjectDraftInput): Promise<void> => {
  const ids = [...new Set(referenceEntries(draft).map((entry) => entry.assetId))]
  const known = await repo.findKnownAssets(ids)
  const missing = ids.filter((id) => !known.has(id))

  if (missing.length > 0) {
    throw badRequest(
      missing.length === 1
        ? 'One of the selected images is not in the Media library'
        : `${missing.length} of the selected images are not in the Media library`,
    )
  }
}

export const saveDraft = async (input: {
  projectId: string
  draftRevision: number
  draft: ProjectDraftInput
}): Promise<OwnerProject> => {
  const row = await withTransaction(async () => {
    const locked = await repo.lockProject(input.projectId)

    if (!locked) throw notFound('That project does not exist')
    if (!locked.draft_version_id) throw notFound('That project has no draft')

    /*
     * A stale revision means a second browser tab saved in between. Refusing
     * is the whole point: the alternative is the older tab silently writing
     * over work the owner did in the newer one.
     */
    if (locked.draft_revision !== input.draftRevision) {
      throw conflict(
        'This project was changed somewhere else. Reload the page to see the newer version.',
      )
    }

    await assertAssetsExist(input.draft)

    await repo.updateVersionFacts(locked.draft_version_id, input.draft)
    await repo.replaceVersionContent(locked.draft_version_id, input.draft)
    await repo.bumpRevision(input.projectId)

    await replaceReferences({
      module: 'projects',
      ownerType: 'project',
      ownerId: input.projectId,
      scope: 'draft',
      label: referenceLabel(input.draft, ' (draft)'),
      entries: referenceEntries(input.draft),
    })

    return repo.findProject(input.projectId)
  })

  if (!row) throw notFound('That project does not exist')

  return describe(row)
}

/** The set a published version holds, restated after it changes. */
export const syncPublishedReferences = async (input: {
  projectId: string
  draft: ProjectDraftInput
}): Promise<void> => {
  await replaceReferences({
    module: 'projects',
    ownerType: 'project',
    ownerId: input.projectId,
    scope: 'published',
    label: referenceLabel(input.draft, ''),
    entries: referenceEntries(input.draft),
  })
}

/* -------------------------------------------------------------------- public */

/**
 * What a visitor may read, and only that.
 *
 * These two functions never look at a draft version. They join
 * `published_version_id`, and there is nothing else to join — which is the
 * reason `docs/v2/projects-backend.md` §4.4 chose two versions over a
 * "pending changes" flag. One forgotten `WHERE` on a flag would put an
 * unfinished sentence on the live site; here the query cannot reach the draft
 * at all.
 */
export const listPublicProjects = async (input: {
  language: Language
  offset: number
  limit: number
}): Promise<{
  items: PublicProjectCard[]
  offset: number
  limit: number
  total: number
  hasMore: boolean
}> => {
  const { rows, total } = await repo.listPublished({ offset: input.offset, limit: input.limit })

  /*
   * The page's contents load side by side and every cover's size in one query:
   * one project after another was ~72 sequential round trips for a full page.
   * The pool still caps how many run at once.
   */
  const contents = await Promise.all(rows.map((version) => repo.loadVersionContent(version.id)))
  const sizes = await repo.loadAssetSizes(
    contents.flatMap((content) => (content.cover ? [content.cover.assetId] : [])),
  )

  const items: PublicProjectCard[] = rows.map((version, index) =>
    toPublicCard({
      version,
      content: contents[index]!,
      language: input.language,
      publishedAt: version.published_at,
      sizes,
    }),
  )

  return {
    items,
    offset: input.offset,
    limit: input.limit,
    total,
    hasMore: input.offset + items.length < total,
  }
}

export const readPublicProject = async (input: {
  slug: string
  language: Language
}): Promise<PublicProjectDetail> => {
  const version = await repo.findPublishedBySlug(input.slug)

  // An unpublished, draft-only or archived project answers exactly as a slug
  // that never existed does. Nothing is revealed by the difference.
  if (!version) throw notFound('That project does not exist')

  const content = await repo.loadVersionContent(version.id)

  const referenced = [
    ...(content.cover ? [content.cover.assetId] : []),
    ...content.gallery.map((image) => image.assetId),
    ...content.inline,
  ]

  return toPublicDetail({
    version,
    content,
    language: input.language,
    publishedAt: version.published_at,
    // The address the owner publishes under now. When it differs from the one
    // that was requested the frontend issues its own redirect (D12) — the API
    // stays a data API.
    canonicalSlug: version.canonical_slug ?? version.slug,
    sizes: await repo.loadAssetSizes(referenced),
  })
}

/**
 * The draft, in the public shape, for the owner's preview.
 *
 * Built from the same projection the live site uses, so what the owner
 * previews is what publishing would produce — rather than a second renderer
 * that agrees with it until it does not.
 */
export const previewProject = async (input: {
  projectId: string
  language: Language
}): Promise<PublicProjectDetail> => {
  const row = await repo.findProject(input.projectId)

  if (!row?.draft_version_id) throw notFound('That project does not exist')

  const version = await repo.findVersion(row.draft_version_id)

  if (!version) throw notFound('That project does not exist')

  const content = await repo.loadVersionContent(version.id)

  const referenced = [
    ...(content.cover ? [content.cover.assetId] : []),
    ...content.gallery.map((image) => image.assetId),
    ...content.inline,
  ]

  return toPublicDetail({
    version,
    content,
    language: input.language,
    publishedAt: row.published_at,
    canonicalSlug: version.slug,
    sizes: await repo.loadAssetSizes(referenced),
    // The draft's images are not public yet, and must not become so because
    // the owner looked at them. The owner's route serves them to the owner;
    // the public one would answer 404.
    mediaUrl: ownerMediaUrl,
  })
}

export { referenceEntries }
