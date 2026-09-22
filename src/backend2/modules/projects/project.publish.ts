import { withTransaction } from '../../db/client'
import { publishBlockers } from '../../contracts/project.contract'
import { conflict, notFound, validationFailed } from '../../http/error'
import { releaseReferences } from '../media/media.service'
import { compactPositions } from './project.order'
import * as repo from './project.repo'
import { toDraftInput, toOwnerVersion } from './project.mapper'
import type { OwnerProject } from './project.mapper'
import { getProject, isSlugAvailable, syncPublishedReferences } from './project.service'

/**
 * The transitions that change what a visitor can see.
 *
 * Every one of them takes the project's row with `FOR UPDATE` first. Two
 * overlapping publishes would otherwise both pass validation and both insert
 * a published version, and the unique index on `(project_id, kind)` would pick
 * the winner at COMMIT — after the loser had already deleted the version that
 * was live.
 */

const lockOrFail = async (projectId: string): Promise<repo.ProjectRow> => {
  const row = await repo.lockProject(projectId)

  if (!row) throw notFound('That project does not exist')
  if (!row.draft_version_id) throw notFound('That project has no draft')

  return row
}

/** Reads the draft back in the shape the publication rules accept. */
const readDraft = async (row: repo.ProjectRow) => {
  const version = await repo.findVersion(row.draft_version_id!)

  if (!version) throw notFound('That project has no draft')

  return toDraftInput(toOwnerVersion(version, await repo.loadVersionContent(version.id)))
}

/**
 * First publication and **Publish update**, which are the same operation: the
 * server knows which from `published_version_id`.
 *
 * On failure **nothing is written**. The version visitors are reading keeps
 * its text and its images, and the draft keeps every pending change so the
 * owner can correct it rather than retype it.
 */
export const publish = async (input: {
  projectId: string
  draftRevision: number
}): Promise<OwnerProject> => {
  await withTransaction(async () => {
    const row = await lockOrFail(input.projectId)

    if (row.lifecycle === 'archived') {
      throw conflict('Restore this project before publishing it')
    }

    if (row.draft_revision !== input.draftRevision) {
      throw conflict(
        'This project was changed somewhere else. Reload the page to see the newer version.',
      )
    }

    const draft = await readDraft(row)
    const blockers = publishBlockers(draft)

    if (blockers.length > 0) {
      throw validationFailed('This project is not ready to publish yet', {
        issues: blockers.map((message) => ({ message })),
        missing: blockers,
      })
    }

    /*
     * A taken address is a conflict, not a validation failure: the draft is
     * perfectly valid, someone else simply holds the URL. Checked after the
     * lock so two projects cannot claim it in the same instant.
     */
    if (!(await isSlugAvailable({ slug: draft.slug, projectId: input.projectId }))) {
      throw conflict('Another project already uses that web address')
    }

    const previousPublishedId = row.published_version_id

    /*
     * The new version is written *before* the old one is removed. The unique
     * index on `(project_id, kind)` would reject that order, so the previous
     * row is detached from the project first — the key is deferrable, which
     * is what lets the pointer be null for the length of one statement.
     */
    if (previousPublishedId) {
      await repo.setPublished({ projectId: input.projectId, publishedVersionId: null })
      await repo.deleteVersion(previousPublishedId)
    }

    const publishedId = await repo.copyDraftToPublished({
      projectId: input.projectId,
      draftVersionId: row.draft_version_id!,
    })

    await repo.setPublished({
      projectId: input.projectId,
      publishedVersionId: publishedId,
      draftRevision: row.draft_revision,
      firstPublish: row.first_published_at === null,
    })

    await repo.claimSlug({ projectId: input.projectId, slug: draft.slug })

    /*
     * The published scope is what makes these files reachable by a visitor.
     * Restated from the draft that was just frozen, so the live page and the
     * vault's idea of what is live cannot disagree.
     */
    await syncPublishedReferences({ projectId: input.projectId, draft })
  })

  return getProject(input.projectId)
}

/**
 * Taken down, without losing the work.
 *
 * `first_published_at` is kept, which is what makes the state `unpublished`
 * rather than `draft` — the difference between "you took this down" and "this
 * is new". The draft, including any pending changes, is untouched.
 */
export const unpublish = async (projectId: string): Promise<OwnerProject> => {
  await withTransaction(async () => {
    const row = await lockOrFail(projectId)

    if (!row.published_version_id) return

    await repo.setPublished({ projectId, publishedVersionId: null })
    await repo.deleteVersion(row.published_version_id)
    await repo.retireSlugs(projectId)

    // The published references go with it: within the cache window stated in
    // `media.public.route.ts`, the images stop being servable to visitors.
    await releaseReferences({
      module: 'projects',
      ownerType: 'project',
      ownerId: projectId,
      scope: 'published',
    })
  })

  return getProject(projectId)
}

/** The draft, replaced by a fresh copy of what is live. */
export const discardPending = async (input: {
  projectId: string
  draftRevision: number
}): Promise<OwnerProject> => {
  await withTransaction(async () => {
    const row = await lockOrFail(input.projectId)

    if (row.draft_revision !== input.draftRevision) {
      throw conflict(
        'This project was changed somewhere else. Reload the page to see the newer version.',
      )
    }

    // Refused rather than silently emptying the draft: with nothing published
    // there is nothing to fall back to.
    if (!row.published_version_id) {
      throw validationFailed('This project has never been published, so there is nothing to go back to')
    }

    await repo.copyPublishedToDraft({
      publishedVersionId: row.published_version_id,
      draftVersionId: row.draft_version_id!,
    })

    const revision = await repo.bumpRevision(input.projectId)

    // The draft now *is* the published version, so the two revisions match
    // again and the project stops reporting pending changes.
    await repo.setPublished({
      projectId: input.projectId,
      publishedVersionId: row.published_version_id,
      draftRevision: revision,
    })

    const draft = await readDraft(await lockOrFail(input.projectId))

    await syncPublishedReferences({ projectId: input.projectId, draft })
  })

  return getProject(input.projectId)
}

/**
 * Archiving unpublishes in the same transaction (D4).
 *
 * The project keeps its position and its images; it simply stops appearing in
 * the default Dashboard list and in every public response. Publishing again
 * after a restore is a separate, deliberate act.
 */
export const archive = async (projectId: string): Promise<OwnerProject> => {
  await withTransaction(async () => {
    const row = await lockOrFail(projectId)

    if (row.published_version_id) {
      await repo.setPublished({ projectId, publishedVersionId: null })
      await repo.deleteVersion(row.published_version_id)
      await repo.retireSlugs(projectId)
      await releaseReferences({
        module: 'projects',
        ownerType: 'project',
        ownerId: projectId,
        scope: 'published',
      })
    }

    await repo.setLifecycle({ projectId, lifecycle: 'archived' })
  })

  return getProject(projectId)
}

export const restore = async (projectId: string): Promise<OwnerProject> => {
  await withTransaction(async () => {
    await lockOrFail(projectId)
    await repo.setLifecycle({ projectId, lifecycle: 'active' })
  })

  return getProject(projectId)
}

/**
 * Permanent, and it says so by demanding the project's own id back.
 *
 * The files themselves are **not** removed. That is the vault:
 * `docs/v2/media.md` — "A file no module uses is a file the owner kept on
 * purpose." Deleting a project forgets its uses; the library still holds
 * every image, and the owner deletes those from Media if they want them gone.
 */
export const deleteProject = async (input: {
  projectId: string
  confirm: string
}): Promise<{ deleted: true; releasedFiles: number }> =>
  withTransaction(async () => {
    const row = await lockOrFail(input.projectId)

    if (input.confirm !== row.id) {
      throw validationFailed('Type the project id exactly to confirm permanent deletion')
    }

    const used = new Set<string>()

    for (const versionId of [row.draft_version_id, row.published_version_id]) {
      if (!versionId) continue

      const content = await repo.loadVersionContent(versionId)

      if (content.cover) used.add(content.cover.assetId)
      for (const image of content.gallery) used.add(image.assetId)
      for (const id of content.inline) used.add(id)
    }

    for (const scope of ['draft', 'published'] as const) {
      await releaseReferences({
        module: 'projects',
        ownerType: 'project',
        ownerId: input.projectId,
        scope,
      })
    }

    await repo.deleteProject(input.projectId)

    // Positions are unique but the database does not require them to be
    // contiguous, and the rest of the module assumes they are.
    await compactPositions()

    return { deleted: true, releasedFiles: used.size }
  })
