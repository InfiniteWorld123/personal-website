import { withTransaction } from '../../db/client'
import {
  type OwnerService,
  canonicalServiceDraft,
  publishBlockers,
} from '../../contracts/service.contract'
import { conflict, notFound, validationFailed } from '../../http/error'
import { compactPositions } from './service.order'
import * as repo from './service.repo'
import { getService, isSlugAvailable, loadVersions } from './service.service'

/**
 * The transitions that change what a visitor can see.
 *
 * Every one takes the service's row with `FOR UPDATE` first, so two
 * overlapping requests queue rather than interleave. Nothing here touches
 * another module: a service is a catalogue entry, and publishing one creates
 * no lead, no invoice and no charge.
 */

const lockOrFail = async (serviceId: string): Promise<repo.ServiceRow> => {
  const row = await repo.lockService(serviceId)

  if (!row) throw notFound('That service does not exist')
  if (!row.draft_version_id) throw notFound('That service has no draft')

  return row
}

const staleRevision = () =>
  conflict('This service was changed somewhere else. Reload the page to see the newer version.')

/**
 * **Publish** and **Publish update**, which are one operation: the server
 * knows which from whether something is live.
 *
 * On failure **nothing is written**. Visitors keep the version they were
 * reading, price included, and the draft keeps every pending change so the
 * owner corrects it rather than retyping it.
 */
export const publishService = async (input: {
  serviceId: string
  draftRevision: number
}): Promise<OwnerService> => {
  await withTransaction(async () => {
    const row = await lockOrFail(input.serviceId)

    if (row.draft_revision !== input.draftRevision) throw staleRevision()

    const { draft } = await loadVersions(row)
    const blockers = publishBlockers(draft)

    if (blockers.length > 0) {
      throw validationFailed('This service is not ready to publish yet', {
        issues: blockers.map((message) => ({ message })),
        missing: blockers,
      })
    }

    /*
     * A taken address is a conflict, not a missing field: the draft is fine,
     * another service simply holds the URL — now, or from an earlier
     * publication whose links must keep working.
     */
    if (!(await isSlugAvailable({ slug: draft.slug, serviceId: row.id }))) {
      throw conflict('Another service already uses that web address')
    }

    /*
     * The previous live version is detached before the new one is written:
     * the unique index allows one published version per service, and the
     * pointer is deferrable, so it may be empty for the length of a statement.
     * The whole transaction still commits or rolls back as one.
     */
    if (row.published_version_id) {
      await repo.setPublished({ serviceId: row.id, publishedVersionId: null })
      await repo.deleteVersion(row.published_version_id)
    }

    const publishedId = await repo.copyToPublished({
      serviceId: row.id,
      draftVersionId: row.draft_version_id!,
    })

    await repo.setPublished({
      serviceId: row.id,
      publishedVersionId: publishedId,
      draftRevision: row.draft_revision,
      firstPublish: row.first_published_at === null,
    })

    // Checked again by the database itself: a claim can only ever update a
    // row this service already owns.
    if (!(await repo.claimSlug({ serviceId: row.id, slug: draft.slug }))) {
      throw conflict('Another service already uses that web address')
    }
  })

  return getService(input.serviceId)
}

/**
 * Taken down without losing anything.
 *
 * It leaves the public list, its page, the homepage and every public answer at
 * once, because all of those read the one live version this removes. The
 * draft — pending changes included — is untouched, and the address history is
 * kept, so republishing uses the same identity and the same address.
 */
export const unpublishService = async (serviceId: string): Promise<OwnerService> => {
  await withTransaction(async () => {
    const row = await lockOrFail(serviceId)

    if (!row.published_version_id) return

    await repo.setPublished({ serviceId, publishedVersionId: null })
    await repo.deleteVersion(row.published_version_id)
    await repo.retireSlugs(serviceId)
  })

  return getService(serviceId)
}

/**
 * The draft, replaced by what is live.
 *
 * For an edit the owner regrets: the pending changes go, and the service is
 * simply "Live" again. Refused when nothing is live, because there is then
 * nothing to go back to and the only honest alternative is emptying the draft.
 */
export const discardPendingService = async (input: {
  serviceId: string
  draftRevision: number
}): Promise<OwnerService> => {
  await withTransaction(async () => {
    const row = await lockOrFail(input.serviceId)

    if (row.draft_revision !== input.draftRevision) throw staleRevision()

    const { draft, published } = await loadVersions(row)

    if (!published) {
      throw validationFailed(
        'This service is not published, so there is no live version to go back to',
      )
    }

    if (canonicalServiceDraft(draft) === canonicalServiceDraft(published)) return

    await repo.writeVersion(row.draft_version_id!, published)

    const revision = await repo.bumpRevision(row.id)

    await repo.markInSync(row.id, revision)
  })

  return getService(input.serviceId)
}

/**
 * Permanent, and it says so by demanding the service's own id back.
 *
 * Everything about the service goes: both versions, every text and every
 * address it held, which another service may then use. Nothing outside the
 * catalogue refers to a service, so nothing else changes.
 */
export const deleteService = async (input: {
  serviceId: string
  confirm: string
}): Promise<{ deleted: true }> =>
  withTransaction(async () => {
    await repo.lockOrder()

    const row = await lockOrFail(input.serviceId)

    if (input.confirm !== row.id) {
      throw validationFailed('Send the service id exactly to confirm permanent deletion')
    }

    await repo.deleteService(row.id)

    // Positions are unique but not required to be contiguous by the
    // database, and the rest of the module assumes they are.
    await compactPositions()

    return { deleted: true }
  })
