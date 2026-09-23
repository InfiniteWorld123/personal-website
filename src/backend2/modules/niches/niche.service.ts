import { withTransaction } from '../../db/client'
import type { Page } from '../../contracts/pagination.contract'
import type { NicheListQuery, NichePatch, OwnerNiche } from '../../contracts/niche.contract'
import { nameTaken, nicheInUse, notFound, validationFailed } from '../../http/error'
import * as repo from './niche.repo'

/**
 * The owner's niche list. See `docs/v2/clients.md`, "Niches".
 *
 * Renaming changes the name every record shows, because it is the same niche.
 * Hiding takes it out of new choices and leaves every record that has it
 * alone. Deleting is only for a niche nothing uses.
 */

const missing = () => notFound('That niche does not exist')

const toNiche = (row: repo.NicheRow): OwnerNiche => ({
  id: row.id,
  name: row.name,
  hidden: row.hidden,
  clientCount: Number(row.client_count),
  createdAt: new Date(row.created_at).toISOString(),
})

export const getNiche = async (id: string): Promise<OwnerNiche> => {
  const row = await repo.findNiche(id)

  if (!row) throw missing()

  return toNiche(row)
}

export const listNiches = async (query: NicheListQuery): Promise<Page<OwnerNiche>> => {
  const first = await repo.listNiches(query)
  const pageCount = Math.max(1, Math.ceil(first.total / query.pageSize))
  const page = Math.min(query.page, pageCount)
  const result = page === query.page ? first : await repo.listNiches({ ...query, page })

  return {
    items: result.rows.map(toNiche),
    page,
    pageSize: query.pageSize,
    total: result.total,
    pageCount,
    hasMore: page < pageCount,
  }
}

const taken = (name: string) =>
  nameTaken(`There is already a niche called “${name}”`, { field: 'name' })

export const createNiche = async (name: string): Promise<OwnerNiche> => {
  const id = await withTransaction(async () => {
    if (await repo.findByName(name)) throw taken(name)

    return repo.insertNiche(name)
  })

  return getNiche(id)
}

export const patchNiche = async (input: { id: string; patch: NichePatch }): Promise<OwnerNiche> => {
  await withTransaction(async () => {
    const row = await repo.lockNiche(input.id)

    if (!row) throw missing()

    if (input.patch.name !== undefined) {
      const holder = await repo.findByName(input.patch.name)

      if (holder && holder.id !== row.id) throw taken(input.patch.name)
    }

    await repo.updateNiche(row.id, input.patch)
  })

  return getNiche(input.id)
}

/** PostgreSQL's "another row still points at this one" (RESTRICT, or a plain key). */
const isForeignKeyViolation = (error: unknown): boolean => {
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : null

  return code === '23001' || code === '23503'
}

/** Only an unused niche. A used one is hidden instead, never removed. */
export const deleteNiche = async (id: string): Promise<{ id: string; deleted: true }> => {
  await withTransaction(async () => {
    const row = await repo.findNiche(id)

    if (!row) throw missing()

    const clients = Number(row.client_count)

    if (clients > 0) {
      throw nicheInUse(
        `${clients === 1 ? 'One client uses' : `${clients} clients use`} this niche. Hide it instead.`,
        { clientCount: clients },
      )
    }

    await repo.deleteNiche(row.id)
  }).catch((error: unknown) => {
    // Given to a record between the count and the delete: the key refuses.
    if (isForeignKeyViolation(error)) throw nicheInUse('This niche is in use. Hide it instead.')

    throw error
  })

  return { id, deleted: true }
}

/**
 * For Clients (and later Leads): is this niche one a record may be given?
 *
 * A niche the record already has is always fine, hidden or not — hiding
 * never changes an existing record. A new choice must exist and be visible.
 */
export const assertNicheChoice = async (input: {
  nicheId: string | null
  currentNicheId?: string | null
  allowHidden?: boolean
}): Promise<void> => {
  if (input.nicheId === null || input.nicheId === input.currentNicheId) return

  const row = await repo.findNiche(input.nicheId)
  const fail = (message: string) =>
    validationFailed(message, { issues: [{ field: 'nicheId', message }], missing: [] })

  if (!row) throw fail('That niche no longer exists. Choose another.')
  if (row.hidden && !input.allowHidden) throw fail('That niche is hidden. Choose another.')
}
