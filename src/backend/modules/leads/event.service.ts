import { getDb } from '#/backend/db/client'
import { notFoundError } from '#/backend/shared/error'
import type { LeadEvent, LeadEventKind } from '#/shared/types/lead.types'
import type { EventNoteInput } from '#/shared/validation/lead.validation'
import { toIsoRequired } from './lead.sql'

/**
 * The history, both halves of it.
 *
 * He asked for «تلقائي + سطر تكتبه»: the system writes what it did, and he
 * writes what happened away from the screen. The line is stored as the
 * sentence, at the moment the service knows it — not as a typed payload to be
 * rendered later, because the old system's structured events were written by
 * everything and read by nothing.
 *
 * It hangs on the **person**, with the deal optional: a phone call happens
 * with a human being, sometimes before there is any deal to hang it on.
 */

type EventShape = {
  id: string
  deal_id: string | null
  kind: LeadEventKind
  body: string
  is_automatic: boolean
  created_at: Date
}

const project = (row: EventShape): LeadEvent => ({
  id: row.id,
  dealId: row.deal_id,
  kind: row.kind,
  body: row.body,
  isAutomatic: row.is_automatic,
  createdAt: toIsoRequired(row.created_at),
})

/** Written by the services, never by a route. */
export const record = async (input: {
  personId: string
  dealId?: string | null
  kind: LeadEventKind
  body: string
  isAutomatic?: boolean
}): Promise<void> => {
  await getDb().query(
    `INSERT INTO lead_events (lead_id, deal_id, kind, body, is_automatic)
     VALUES ($1, $2, $3, $4, $5);`,
    [input.personId, input.dealId ?? null, input.kind, input.body, input.isAutomatic ?? true],
  )
}

export const listEvents = async (personId: string): Promise<LeadEvent[]> => {
  const result = await getDb().query<EventShape>(
    `SELECT id, deal_id, kind, body, is_automatic, created_at
       FROM lead_events WHERE lead_id = $1
      ORDER BY created_at DESC, id DESC;`,
    [personId],
  )

  return result.rows.map(project)
}

/**
 * His own line.
 *
 * `is_automatic` is false and the constraint in `0015` refuses any other
 * value for a `NOTE`, so a sentence he typed can never be drawn as something
 * the system observed.
 */
export const addLine = async (personId: string, input: EventNoteInput): Promise<LeadEvent[]> => {
  const person = await getDb().query<{ id: string }>('SELECT id FROM leads WHERE id = $1;', [
    personId,
  ])

  if (!person.rows[0]) throw notFoundError('That person is not here')

  /*
   * A line may name a deal, but only one of *this* person's deals.
   *
   * The foreign key only asks whether the deal exists, not whose it is — so
   * without this check a line could be hung on a stranger's deal and would
   * then appear under that stranger's name when the deal is deleted and the
   * line survives it.
   */
  if (input.dealId) {
    const deal = await getDb().query<{ id: string }>(
      'SELECT id FROM deals WHERE id = $1 AND lead_id = $2;',
      [input.dealId, personId],
    )

    if (!deal.rows[0]) throw notFoundError('That deal is not this person’s')
  }

  await record({
    personId,
    dealId: input.dealId ?? null,
    kind: 'NOTE',
    body: input.body,
    isAutomatic: false,
  })

  return listEvents(personId)
}

export const deleteLine = async (personId: string, eventId: string): Promise<LeadEvent[]> => {
  // Only his own lines. What the system recorded is not his to rewrite — a
  // history he can edit answers nothing later.
  await getDb().query(
    `DELETE FROM lead_events WHERE id = $1 AND lead_id = $2 AND is_automatic = false;`,
    [eventId, personId],
  )

  return listEvents(personId)
}
