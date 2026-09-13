import type { AdminLeadDetail, AdminLeadList, InboxSettings } from '#/shared/types/lead.types'
import type {
  InboxPreferences,
  LeadBulkInput,
  LeadFilterInput,
  LeadReplyInput,
  LeadStatus,
} from '#/shared/validation/lead.validation'
import { api } from './client'
import { unwrap } from './response'

/**
 * Eden Treaty revives anything that parses as an ISO date into a `Date`, so
 * every instant on the wire arrives as an object even though the type here
 * says `string` — the trap `booking.api.ts` documents. Rendering one throws
 * "Objects are not valid as a React child".
 */
const toInstant = <T extends string | null>(value: T): T =>
  ((value as unknown) instanceof Date ? (value as unknown as Date).toISOString() : value) as T

const normaliseItem = <T extends { createdAt: string }>(item: T): T => ({
  ...item,
  createdAt: toInstant(item.createdAt),
})

const normaliseDetail = (lead: AdminLeadDetail): AdminLeadDetail => ({
  ...normaliseItem(lead),
  notifiedAt: toInstant(lead.notifiedAt),
  readAt: toInstant(lead.readAt),
  messages: lead.messages.map((message) => ({ ...message, sentAt: toInstant(message.sentAt) })),
  notes: lead.notes.map((note) => ({ ...note, createdAt: toInstant(note.createdAt) })),
  events: lead.events.map((event) => ({ ...event, createdAt: toInstant(event.createdAt) })),
  bookings: lead.bookings.map((booking) => ({ ...booking, startsAt: toInstant(booking.startsAt) })),
})

export async function fetchLeads(filter: LeadFilterInput): Promise<AdminLeadList> {
  const list = unwrap<AdminLeadList>(
    await api().admin.leads.get({
      query: {
        tab: filter.tab,
        search: filter.search,
        page: String(filter.page),
        withBookings: String(filter.withBookings),
      },
    }),
  )

  return { ...list, items: list.items.map(normaliseItem) }
}

export async function fetchUnreadLeadCount(): Promise<{ unread: number }> {
  return unwrap<{ unread: number }>(await api().admin.leads.unread.get())
}

export async function fetchLead(id: string): Promise<AdminLeadDetail> {
  return normaliseDetail(unwrap<AdminLeadDetail>(await api().admin.leads({ id }).get()))
}

export async function setLeadStatus(id: string, status: LeadStatus): Promise<AdminLeadDetail> {
  return normaliseDetail(
    unwrap<AdminLeadDetail>(await api().admin.leads({ id }).status.patch({ status })),
  )
}

export async function setLeadRead(id: string, value: boolean): Promise<AdminLeadDetail> {
  return normaliseDetail(unwrap<AdminLeadDetail>(await api().admin.leads({ id }).read.patch({ value })))
}

export async function setLeadArchived(id: string, value: boolean): Promise<AdminLeadDetail> {
  return normaliseDetail(
    unwrap<AdminLeadDetail>(await api().admin.leads({ id }).archived.patch({ value })),
  )
}

export async function setLeadJunk(id: string, value: boolean): Promise<AdminLeadDetail> {
  return normaliseDetail(unwrap<AdminLeadDetail>(await api().admin.leads({ id }).junk.patch({ value })))
}

export async function addLeadNote(id: string, body: string): Promise<AdminLeadDetail> {
  return normaliseDetail(unwrap<AdminLeadDetail>(await api().admin.leads({ id }).notes.post({ body })))
}

export async function deleteLeadNote(id: string, noteId: string): Promise<AdminLeadDetail> {
  return normaliseDetail(
    unwrap<AdminLeadDetail>(await api().admin.leads({ id }).notes({ noteId }).delete()),
  )
}

export async function replyToLead(id: string, input: LeadReplyInput): Promise<AdminLeadDetail> {
  return normaliseDetail(unwrap<AdminLeadDetail>(await api().admin.leads({ id }).reply.post(input)))
}

export async function applyLeadBulkAction(input: LeadBulkInput): Promise<{ changed: number }> {
  return unwrap<{ changed: number }>(await api().admin.leads.bulk.post(input))
}

export async function fetchInboxSettings(): Promise<InboxSettings> {
  return unwrap<InboxSettings>(await api().admin.leads.settings.get())
}

export async function saveInboxPreferences(preferences: InboxPreferences): Promise<InboxSettings> {
  return unwrap<InboxSettings>(await api().admin.leads.settings.put(preferences))
}
