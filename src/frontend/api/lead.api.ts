import type { Board, Deal, LeadFile, LeadList } from '#/shared/types/lead.types'
import type {
  DealMoveInput,
  DealWriteInput,
  EventNoteInput,
} from '#/shared/validation/lead.validation'
import { api } from './client'
import { unwrap } from './response'

/**
 * Eden Treaty revives anything that parses as a date into a `Date`, so every
 * instant arrives as an object even though the type says `string` — the trap
 * `booking.api.ts`, `post.api.ts` and `inbox.api.ts` all document. Rendering
 * one throws "Objects are not valid as a React child".
 */
const toInstant = <T extends string | null>(value: T): T =>
  ((value as unknown) instanceof Date ? (value as unknown as Date).toISOString() : value) as T

/**
 * A follow-up is a **day**, and has to survive the same revival as a day.
 *
 * `2026-09-24` parses as midnight UTC, so taking the first ten characters of
 * the ISO string hands back exactly the day he picked — while turning it into
 * a local time first would land on the 23rd for anyone west of London.
 */
const toDay = (value: string | null): string | null =>
  (value as unknown) instanceof Date
    ? (value as unknown as Date).toISOString().slice(0, 10)
    : value

const normaliseDeal = (deal: Deal): Deal => ({
  ...deal,
  followUpOn: toDay(deal.followUpOn),
  stageChangedAt: toInstant(deal.stageChangedAt),
  closedAt: toInstant(deal.closedAt),
  createdAt: toInstant(deal.createdAt),
})

const normaliseList = (list: LeadList): LeadList => ({
  ...list,
  rows: list.rows.map((row) => ({
    ...row,
    lastMessageAt: toInstant(row.lastMessageAt),
    followUpOn: toDay(row.followUpOn),
    headline: row.headline ? normaliseDeal(row.headline) : null,
  })),
})

const normaliseFile = (file: LeadFile): LeadFile => ({
  ...file,
  person: {
    ...file.person,
    createdAt: toInstant(file.person.createdAt),
    messages: file.person.messages.map((message) => ({
      ...message,
      sentAt: toInstant(message.sentAt),
      readAt: toInstant(message.readAt),
    })),
    notes: file.person.notes.map((note) => ({
      ...note,
      createdAt: toInstant(note.createdAt),
      updatedAt: toInstant(note.updatedAt),
    })),
  },
  deals: file.deals.map(normaliseDeal),
  events: file.events.map((event) => ({ ...event, createdAt: toInstant(event.createdAt) })),
  calls: file.calls.map((call) => ({
    ...call,
    startsAt: toInstant(call.startsAt),
    endsAt: toInstant(call.endsAt),
  })),
})

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

export async function fetchLeads(stage: string, search: string): Promise<LeadList> {
  return normaliseList(
    unwrap<LeadList>(await api().admin.leads.get({ query: { stage, search, limit: '300' } })),
  )
}

export async function fetchLeadFile(personId: string): Promise<LeadFile> {
  return normaliseFile(unwrap<LeadFile>(await api().admin.leads({ personId }).get()))
}

export async function fetchBoard(): Promise<Board> {
  const board = unwrap<Board>(await api().admin.leads.board.get())

  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      cards: column.cards.map((card) => ({ ...card, deal: normaliseDeal(card.deal) })),
    })),
  }
}

export async function fetchOverdueCount(): Promise<number> {
  return unwrap<{ count: number }>(await api().admin.leads.overdue.get()).count
}

/* -------------------------------------------------------------------------- */
/* Writing — every one answers with the whole file                            */
/* -------------------------------------------------------------------------- */

export async function createDeal(personId: string, input: DealWriteInput): Promise<LeadFile> {
  return normaliseFile(unwrap<LeadFile>(await api().admin.leads({ personId }).deals.post(input)))
}

export async function updateDeal(
  personId: string,
  dealId: string,
  input: DealWriteInput,
): Promise<LeadFile> {
  return normaliseFile(
    unwrap<LeadFile>(await api().admin.leads({ personId }).deals({ dealId }).put(input)),
  )
}

export async function moveDeal(
  personId: string,
  dealId: string,
  input: DealMoveInput,
): Promise<LeadFile> {
  return normaliseFile(
    unwrap<LeadFile>(await api().admin.leads({ personId }).deals({ dealId }).move.post(input)),
  )
}

export async function deleteDeal(personId: string, dealId: string): Promise<LeadFile> {
  return normaliseFile(
    unwrap<LeadFile>(await api().admin.leads({ personId }).deals({ dealId }).delete()),
  )
}

export async function addLine(personId: string, input: EventNoteInput): Promise<LeadFile> {
  return normaliseFile(unwrap<LeadFile>(await api().admin.leads({ personId }).events.post(input)))
}

export async function deleteLine(personId: string, eventId: string): Promise<LeadFile> {
  return normaliseFile(
    unwrap<LeadFile>(await api().admin.leads({ personId }).events({ eventId }).delete()),
  )
}
