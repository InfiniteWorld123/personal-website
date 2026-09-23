import {
  type ClientCandidate,
  type ClientFields,
  type OwnerClient,
  type OwnerClientListItem,
  clientDisplayName,
} from '../../contracts/client.contract'
import { toCountry } from '../../contracts/country.contract'
import type { ClientRow, LeadLinkRow } from './client.repo'

/** Rows into the shapes the Dashboard reads. Nothing else crosses the wire. */

export const toFields = (row: ClientRow): ClientFields => ({
  kind: row.kind,
  name: row.name,
  email: row.email,
  phone: row.phone,
  country: row.country_code,
  companyName: row.company_name,
  nicheId: row.niche_id,
  notes: row.notes,
})

const iso = (date: Date | string): string => new Date(date).toISOString()

const common = (row: ClientRow) => ({
  id: row.id,
  kind: row.kind,
  displayName: clientDisplayName({
    kind: row.kind,
    name: row.name,
    companyName: row.company_name,
  }),
  name: row.name,
  email: row.email,
  phone: row.phone,
  country: toCountry(row.country_code),
  companyName: row.company_name,
  niche: row.niche_id ? { id: row.niche_id, name: row.niche_name ?? '' } : null,
  status: row.status,
  trashedAt: row.trashed_at ? iso(row.trashed_at) : null,
  revision: row.revision,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
})

export const toOwnerClient = (row: ClientRow, links: LeadLinkRow[]): OwnerClient => ({
  ...common(row),
  notes: row.notes,
  leads: links.map((link) => ({
    leadId: link.lead_id,
    how: link.how,
    linkedAt: iso(link.linked_at),
    leadName: link.lead_name ?? null,
  })),
})

export const toListItem = (row: ClientRow, fromLead: boolean): OwnerClientListItem => ({
  ...common(row),
  fromLead,
})

export const toCandidate = (
  row: ClientRow,
  keys: { emailKey: string; phoneKey: string },
): ClientCandidate => ({
  id: row.id,
  kind: row.kind,
  displayName: clientDisplayName({
    kind: row.kind,
    name: row.name,
    companyName: row.company_name,
  }),
  name: row.name,
  email: row.email,
  phone: row.phone,
  status: row.status,
  inTrash: row.trashed_at !== null,
  matchedOn: [
    ...(keys.emailKey !== '' && row.email_key === keys.emailKey ? (['email'] as const) : []),
    ...(keys.phoneKey !== '' && row.phone_key === keys.phoneKey ? (['phone'] as const) : []),
  ],
})
