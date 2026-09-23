import { withTransaction } from '../../db/client'
import type { Page } from '../../contracts/pagination.contract'
import {
  type FollowUpListItem,
  type OwnerLead,
  fromBerlin,
  toBerlin,
} from '../../contracts/lead.contract'
import { followUpExists, leadInTrash, notFound } from '../../http/error'
import * as repo from './lead.repo'
import { toFollowUp } from './lead.mapper'
import { getLead } from './lead.service'

/**
 * One follow-up at a time (`docs/v2/leads.md`).
 *
 * A date and time, read in Europe/Berlin, and an optional short note. The
 * owner completes it, postpones it (a new date and time on the same one) or
 * cancels it; only then can another be created. The database's partial
 * unique index is the final word on "one open", so two tabs cannot both add
 * one. No email or SMS — the Dashboard shows what is due.
 */

const lockOpenLead = async (leadId: string) => {
  const lead = await repo.lockLead(leadId)

  if (!lead) throw notFound('That lead does not exist')
  if (lead.trashed_at) throw leadInTrash('Restore this lead from Trash first')

  return lead
}

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'

export const createFollowUp = async (input: {
  leadId: string
  date: string
  time: string
  note: string
}): Promise<OwnerLead> => {
  await withTransaction(async () => {
    const lead = await lockOpenLead(input.leadId)

    if (await repo.openFollowUp(lead.id)) {
      throw followUpExists(
        'This lead already has a follow-up. Complete, postpone or cancel it first.',
      )
    }

    await repo.insertFollowUp({
      leadId: lead.id,
      dueAt: fromBerlin(input.date, input.time),
      note: input.note,
    })
  }).catch((error: unknown) => {
    if (isUniqueViolation(error)) throw followUpExists('This lead already has a follow-up.')

    throw error
  })

  return getLead(input.leadId)
}

/** Postpone or reword the open one. Omitted parts keep their value. */
export const patchFollowUp = async (input: {
  leadId: string
  date?: string
  time?: string
  note?: string
}): Promise<OwnerLead> => {
  await withTransaction(async () => {
    const lead = await lockOpenLead(input.leadId)
    const open = await repo.openFollowUp(lead.id)

    if (!open) throw notFound('This lead has no open follow-up')

    const current = toBerlin(new Date(open.due_at))

    await repo.updateFollowUp(open.id, {
      dueAt: fromBerlin(input.date ?? current.date, input.time ?? current.time),
      note: input.note ?? open.note,
    })
  })

  return getLead(input.leadId)
}

export const closeFollowUp = async (input: {
  leadId: string
  how: 'completed' | 'cancelled'
}): Promise<OwnerLead> => {
  await withTransaction(async () => {
    const lead = await lockOpenLead(input.leadId)
    const open = await repo.openFollowUp(lead.id)

    if (!open) throw notFound('This lead has no open follow-up')

    await repo.closeFollowUp(open.id, input.how)
  })

  return getLead(input.leadId)
}

/** Every open follow-up, soonest first — the Follow-ups view. */
export const listFollowUps = async (input: {
  when: 'due' | 'upcoming' | 'all'
  page: number
  pageSize: number
}): Promise<Page<FollowUpListItem>> => {
  const first = await repo.listOpenFollowUps(input)
  const pageCount = Math.max(1, Math.ceil(first.total / input.pageSize))
  const page = Math.min(input.page, pageCount)
  const result = page === input.page ? first : await repo.listOpenFollowUps({ ...input, page })

  return {
    items: result.rows.map((row) => ({
      lead: {
        id: row.lead_id,
        name: row.lead_name,
        company: row.lead_company,
        stage: row.stage_name,
      },
      followUp: toFollowUp(row),
    })),
    page,
    pageSize: input.pageSize,
    total: result.total,
    pageCount,
    hasMore: page < pageCount,
  }
}

/** How many are due now, for the Dashboard's notification. */
export const dueFollowUpCount = async (): Promise<{ due: number }> => ({
  due: await repo.countDueFollowUps(),
})
