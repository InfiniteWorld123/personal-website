import type {
  LeadSettings,
  PipelineBoard,
  PipelineCard,
  PipelineService,
  PipelineStats,
  TodayList,
} from '#/shared/types/pipeline.types'
import type {
  LeadFieldsWriteInput,
  LeadLostReason,
  LeadPreferences,
  ManualLeadInput,
  PipelineFilterInput,
  SuggestionDecisionInput,
} from '#/shared/validation/pipeline.validation'
import type { LeadStatus } from '#/shared/validation/lead.validation'
import { api } from './client'
import { unwrap } from './response'

/**
 * Eden Treaty revives anything that parses as an ISO date into a `Date`, so
 * every instant on the wire arrives as an object even though the type here
 * says `string` — the trap `booking.api.ts` and `lead.api.ts` both document.
 * Rendering one throws "Objects are not valid as a React child", and a card
 * carries four of them.
 */
const toInstant = <T extends string | null>(value: T): T =>
  ((value as unknown) instanceof Date ? (value as unknown as Date).toISOString() : value) as T

const normaliseCard = (card: PipelineCard): PipelineCard => ({
  ...card,
  followUpAt: toInstant(card.followUpAt),
  autoClosedAt: toInstant(card.autoClosedAt),
  createdAt: toInstant(card.createdAt),
  call: card.call
    ? { ...card.call, startsAt: toInstant(card.call.startsAt), endsAt: toInstant(card.call.endsAt) }
    : null,
})

export async function fetchPipeline(filter: PipelineFilterInput): Promise<PipelineBoard> {
  const board = unwrap<PipelineBoard>(
    await api().admin.pipeline.get({
      query: {
        service: filter.service,
        search: filter.search,
        sort: filter.sort,
        withClosed: String(filter.withClosed),
      },
    }),
  )

  return {
    ...board,
    columns: board.columns.map((column) => ({ ...column, cards: column.cards.map(normaliseCard) })),
  }
}

export async function fetchToday(): Promise<TodayList> {
  const today = unwrap<TodayList>(await api().admin.pipeline.today.get())

  return { ...today, rows: today.rows.map((row) => ({ ...row, lead: normaliseCard(row.lead) })) }
}

export async function fetchPipelineStats(): Promise<PipelineStats> {
  return unwrap<PipelineStats>(await api().admin.pipeline.stats.get())
}

export async function fetchServices(): Promise<PipelineService[]> {
  return unwrap<PipelineService[]>(await api().admin.pipeline.services.get())
}

export async function fetchCalls(filter: PipelineFilterInput): Promise<PipelineCard[]> {
  const calls = unwrap<PipelineCard[]>(
    await api().admin.pipeline.calls.get({
      query: { service: filter.service, search: '', sort: filter.sort, withClosed: 'true' },
    }),
  )

  return calls.map(normaliseCard)
}

export async function fetchLeadSettings(): Promise<LeadSettings> {
  return unwrap<LeadSettings>(await api().admin.pipeline.settings.get())
}

export async function saveLeadSettings(preferences: LeadPreferences): Promise<LeadSettings> {
  return unwrap<LeadSettings>(await api().admin.pipeline.settings.put(preferences))
}

export async function createLeadByHand(input: ManualLeadInput): Promise<{ lead: PipelineCard }> {
  const created = unwrap<{ lead: PipelineCard }>(await api().admin.pipeline.leads.post(input))

  return { lead: normaliseCard(created.lead) }
}

export async function setLeadStage(
  id: string,
  status: LeadStatus,
  lostReason?: LeadLostReason | null,
): Promise<PipelineCard> {
  return normaliseCard(
    unwrap<PipelineCard>(await api().admin.pipeline({ id }).stage.patch({ status, lostReason })),
  )
}

export async function setLeadFields(id: string, input: LeadFieldsWriteInput): Promise<PipelineCard> {
  return normaliseCard(unwrap<PipelineCard>(await api().admin.pipeline({ id }).fields.patch(input)))
}

export async function snoozeLead(id: string, days: number): Promise<PipelineCard> {
  return normaliseCard(unwrap<PipelineCard>(await api().admin.pipeline({ id }).snooze.post({ days })))
}

export async function decideSuggestion(
  id: string,
  input: SuggestionDecisionInput,
): Promise<PipelineCard> {
  return normaliseCard(unwrap<PipelineCard>(await api().admin.pipeline({ id }).suggestion.post(input)))
}

export async function markNoShow(id: string): Promise<PipelineCard> {
  return normaliseCard(unwrap<PipelineCard>(await api().admin.pipeline({ id })['no-show'].post()))
}

export async function reopenLead(id: string): Promise<PipelineCard> {
  return normaliseCard(unwrap<PipelineCard>(await api().admin.pipeline({ id }).reopen.post()))
}
