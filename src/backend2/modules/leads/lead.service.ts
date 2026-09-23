import { withTransaction } from '../../db/client'
import { emailKey, phoneKey } from '../../contracts/client.contract'
import type { Page } from '../../contracts/pagination.contract'
import {
  LEAD_DUPLICATE_LIMIT,
  type LeadCandidate,
  type LeadFields,
  LeadFieldsSchema,
  type LeadListQuery,
  type LeadPatch,
  type OwnerLead,
  type OwnerLeadListItem,
} from '../../contracts/lead.contract'
import {
  badRequest,
  conflict,
  leadDuplicate,
  leadInTrash,
  notFound,
  validationFailed,
} from '../../http/error'
import { parseInput } from '../../http/validate'
import { assertNicheChoice } from '../niches/niche.service'
import * as choices from './lead-choice.repo'
import * as repo from './lead.repo'
import { toCandidate, toFields, toListItem, toOwnerLead } from './lead.mapper'

/**
 * What a Lead request does. See `docs/v2/leads.md`.
 *
 * A Lead is only ever created by the owner. Nothing here reads Inbox or
 * Booking, sends anything, or touches Services. The one other module Leads
 * writes to is Clients, at `Won`, through `lead.stage.ts`.
 */

const missing = () => notFound('That lead does not exist')

/** The last closed follow-ups kept on a Lead's file. */
const HISTORY_LIMIT = 10

/* ------------------------------------------------------------------ reading */

export const getLead = async (id: string): Promise<OwnerLead> => {
  const row = await repo.findLead(id)

  if (!row) throw missing()

  return toOwnerLead({
    row,
    followUp: (await repo.openFollowUp(id)) ?? undefined,
    history: await repo.closedFollowUps(id, HISTORY_LIMIT),
    client: await repo.linkedClient(id),
  })
}

export const listLeads = async (query: LeadListQuery): Promise<Page<OwnerLeadListItem>> => {
  await withTransaction(() => choices.ensureDefaults())

  const first = await repo.listLeads(query)
  const pageCount = Math.max(1, Math.ceil(first.total / query.pageSize))
  const page = Math.min(query.page, pageCount)
  const result = page === query.page ? first : await repo.listLeads({ ...query, page })
  const followUps = await repo.openFollowUps(result.rows.map((row) => row.id))

  return {
    items: result.rows.map((row) => toListItem(row, followUps.get(row.id))),
    page,
    pageSize: query.pageSize,
    total: result.total,
    pageCount,
    hasMore: page < pageCount,
  }
}

/** Another Lead with this email or phone. A warning, never a merge. */
export const findDuplicates = async (input: {
  email: string
  phone: string
  excludeId?: string
}): Promise<LeadCandidate[]> => {
  const keys = { emailKey: emailKey(input.email), phoneKey: phoneKey(input.phone) }

  if (keys.phoneKey.replace(/\D/gu, '').length < 6) keys.phoneKey = ''

  const rows = await repo.findMatches({
    ...keys,
    excludeId: input.excludeId,
    limit: LEAD_DUPLICATE_LIMIT,
  })

  return rows.map((row) => toCandidate(row, keys))
}

/* ------------------------------------------------------------------ choices */

const fieldError = (field: string, message: string) =>
  validationFailed(message, { issues: [{ field, message }], missing: [] })

/**
 * The source must exist; a new choice must not be hidden. A hidden source a
 * Lead already has stays — hiding never changes an old Lead.
 */
const assertSource = async (sourceId: string, currentSourceId?: string): Promise<void> => {
  if (sourceId === currentSourceId) return

  const source = await choices.findChoice('sources', sourceId)

  if (!source) throw fieldError('sourceId', 'That source no longer exists. Choose another.')
  if (source.hidden) throw fieldError('sourceId', 'That source is hidden. Choose another.')
}

/* ----------------------------------------------------------------- creating */

export const createLead = async (
  input: LeadFields & { allowDuplicate: boolean },
): Promise<OwnerLead> => {
  const { allowDuplicate, ...fields } = input

  const id = await withTransaction(async () => {
    await choices.ensureDefaults()
    await assertSource(fields.sourceId)
    await assertNicheChoice({ nicheId: fields.nicheId })

    if (!allowDuplicate) {
      const candidates = await findDuplicates({ email: fields.email, phone: fields.phone })

      if (candidates.length > 0) {
        throw leadDuplicate('A lead with this email or phone is already on file', { candidates })
      }
    }

    const stage = await choices.stageOfKind('new')

    return repo.insertLead(fields, { stageId: stage.id })
  })

  return getLead(id)
}

/* ------------------------------------------------------------------ editing */

export const patchLead = async (input: {
  leadId: string
  revision: number
  allowDuplicate: boolean
  patch: LeadPatch
}): Promise<OwnerLead> => {
  await withTransaction(async () => {
    const row = await repo.lockLead(input.leadId)

    if (!row) throw missing()
    if (row.trashed_at) throw leadInTrash('Restore this lead from Trash before editing it')
    if (row.revision !== input.revision) {
      throw conflict('This lead was changed somewhere else. Reload to see the newer version.')
    }

    const current = toFields(row)
    const defined = Object.fromEntries(
      Object.entries(input.patch).filter(([, value]) => value !== undefined),
    )
    const next = parseInput(LeadFieldsSchema, { ...current, ...defined })

    if (JSON.stringify(next) === JSON.stringify(current)) return

    await assertSource(next.sourceId, current.sourceId)
    await assertNicheChoice({ nicheId: next.nicheId, currentNicheId: current.nicheId })

    const contactChanged =
      emailKey(next.email) !== emailKey(current.email) ||
      phoneKey(next.phone) !== phoneKey(current.phone)

    if (contactChanged && !input.allowDuplicate) {
      const candidates = await findDuplicates({
        email: next.email,
        phone: next.phone,
        excludeId: row.id,
      })

      if (candidates.length > 0) {
        throw leadDuplicate('Another lead has this email or phone', { candidates })
      }
    }

    await repo.writeLead(row.id, next)
  })

  return getLead(input.leadId)
}

/* ---------------------------------------------------------------- lifecycle */

export const trashLead = async (leadId: string): Promise<OwnerLead> => {
  await withTransaction(async () => {
    const row = await repo.lockLead(leadId)

    if (!row) throw missing()

    await repo.setTrashed(row.id, true)
  })

  return getLead(leadId)
}

export const restoreLead = async (leadId: string): Promise<OwnerLead> => {
  await withTransaction(async () => {
    const row = await repo.lockLead(leadId)

    if (!row) throw missing()

    await repo.setTrashed(row.id, false)
  })

  return getLead(leadId)
}

/**
 * Permanent, from Trash only, with the id sent back. Its follow-ups go with
 * it; a Client it became stays, and keeps the record that a Lead was behind it.
 */
export const deleteLeadPermanently = async (input: {
  leadId: string
  confirm: string
}): Promise<{ id: string; deleted: true }> => {
  if (input.confirm !== input.leadId)
    throw badRequest('Send the lead id to confirm the permanent deletion')

  await withTransaction(async () => {
    const row = await repo.lockLead(input.leadId)

    if (!row) throw missing()
    if (!row.trashed_at) throw conflict('Move this lead to Trash before deleting it permanently')

    await repo.deleteLead(row.id)
  })

  return { id: input.leadId, deleted: true }
}

export { assertSource }
