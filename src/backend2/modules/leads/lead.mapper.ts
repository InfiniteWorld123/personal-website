import { clientDisplayName } from '../../contracts/client.contract'
import { toCountry } from '../../contracts/country.contract'
import {
  type FollowUp,
  type LeadCandidate,
  type LeadFields,
  type OwnerLead,
  type OwnerLeadListItem,
  toBerlin,
} from '../../contracts/lead.contract'
import type { FollowUpRow, LeadRow } from './lead.repo'

/** Rows into the shapes the Dashboard reads. */

const iso = (date: Date | string): string => new Date(date).toISOString()

export const toFields = (row: LeadRow): LeadFields => ({
  name: row.name,
  email: row.email,
  phone: row.phone,
  country: row.country_code,
  sourceId: row.source_id,
  company: row.company,
  nicheId: row.niche_id,
  notes: row.notes,
})

export const toFollowUp = (row: FollowUpRow, now: Date = new Date()): FollowUp => {
  const due = new Date(row.due_at)
  const local = toBerlin(due)

  return {
    id: row.id,
    dueAt: due.toISOString(),
    date: local.date,
    time: local.time,
    note: row.note,
    status: row.status,
    closedHow: row.closed_how,
    closedAt: row.closed_at ? iso(row.closed_at) : null,
    isDue: row.status === 'open' && due.getTime() <= now.getTime(),
  }
}

const common = (row: LeadRow, followUp: FollowUpRow | undefined) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  country: toCountry(row.country_code),
  company: row.company,
  source: { id: row.source_id, name: row.source_name ?? '' },
  niche: row.niche_id ? { id: row.niche_id, name: row.niche_name ?? '' } : null,
  stage: { id: row.stage_id, kind: row.stage_kind!, name: row.stage_name ?? '' },
  stageChangedAt: iso(row.stage_changed_at),
  wonAt: row.won_at ? iso(row.won_at) : null,
  followUp: followUp ? toFollowUp(followUp) : null,
  fromImport: row.import_id !== null,
  trashedAt: row.trashed_at ? iso(row.trashed_at) : null,
  revision: row.revision,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
})

const lossReason = (row: LeadRow): string | null => {
  if (!row.lost_reason_id) return null

  return row.lost_reason_text || row.lost_reason_name || null
}

export const toOwnerLead = (input: {
  row: LeadRow
  followUp: FollowUpRow | undefined
  history: FollowUpRow[]
  client: {
    id: string
    kind: 'person' | 'company'
    name: string
    company_name: string
    trashed_at: Date | null
  } | null
}): OwnerLead => {
  const { row } = input
  const reason = lossReason(row)

  return {
    ...common(row, input.followUp),
    notes: row.notes,
    lastLoss:
      reason && row.lost_at ? { reason, notes: row.lost_notes, at: iso(row.lost_at) } : null,
    client: input.client
      ? {
          id: input.client.id,
          displayName: clientDisplayName({
            kind: input.client.kind,
            name: input.client.name,
            companyName: input.client.company_name,
          }),
          inTrash: input.client.trashed_at !== null,
        }
      : null,
    followUpHistory: input.history.map((item) => toFollowUp(item)),
  }
}

export const toListItem = (row: LeadRow, followUp: FollowUpRow | undefined): OwnerLeadListItem => ({
  ...common(row, followUp),
  lostReason: row.stage_kind === 'lost' ? lossReason(row) : null,
})

export const toCandidate = (
  row: LeadRow,
  keys: { emailKey: string; phoneKey: string },
): LeadCandidate => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  stage: row.stage_name ?? '',
  inTrash: row.trashed_at !== null,
  matchedOn: [
    ...(keys.emailKey !== '' && row.email_key === keys.emailKey ? (['email'] as const) : []),
    ...(keys.phoneKey !== '' && row.phone_key === keys.phoneKey ? (['phone'] as const) : []),
  ],
})
