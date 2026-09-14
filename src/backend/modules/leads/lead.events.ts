import type { Db } from '#/backend/db/client'

/**
 * One person's history, written from wherever it happens.
 *
 * This file exists because of a fault worth naming: `bookings.lead_id` has
 * pointed at the person since the bookings migration, and the booking service
 * wrote nothing here. Someone who wrote, booked a call and cancelled it read
 * as a single line — "a message arrived" — and the middle of their story was
 * gone. The inbox owned the only writer, so only the inbox could tell a story.
 *
 * The writer now lives on its own so the calls, the board and the rules can
 * all reach it without importing the inbox.
 */

export type LeadEventKind =
  /* the inbox */
  | 'ARRIVED'
  | 'NOTIFIED'
  | 'OPENED'
  | 'STATUS'
  | 'REPLIED'
  | 'INBOUND'
  | 'NOTE'
  | 'ARCHIVED'
  | 'UNARCHIVED'
  | 'JUNK'
  | 'NOT_JUNK'
  /* the calls */
  | 'BOOKED'
  | 'CALL_HELD'
  | 'NO_SHOW'
  | 'CANCELLED'
  | 'RESCHEDULED'
  /* the board */
  | 'CREATED'
  | 'PROPOSAL'
  | 'FOLLOW_UP'
  | 'SNOOZED'
  | 'VALUE'
  | 'SERVICE'
  | 'WON'
  | 'LOST'
  | 'AUTO_CLOSED'
  | 'REOPENED'

/**
 * Which screen an event came from, for the one timeline.
 *
 * Derived rather than stored: the kind already says where it happened, and a
 * column would be one more thing a writer could get wrong.
 */
export type LeadEventSource = 'inbox' | 'calls' | 'pipeline'

const CALL_KINDS: readonly LeadEventKind[] = ['BOOKED', 'CALL_HELD', 'NO_SHOW', 'CANCELLED', 'RESCHEDULED']

const INBOX_KINDS: readonly LeadEventKind[] = [
  'ARRIVED',
  'NOTIFIED',
  'OPENED',
  'REPLIED',
  'INBOUND',
  'ARCHIVED',
  'UNARCHIVED',
  'JUNK',
  'NOT_JUNK',
]

export const eventSource = (kind: LeadEventKind): LeadEventSource =>
  CALL_KINDS.includes(kind) ? 'calls' : INBOX_KINDS.includes(kind) ? 'inbox' : 'pipeline'

/**
 * Append one line to a lead's history.
 *
 * `automatic` marks the lines nobody decided. The history panel says so
 * plainly, which is the price of letting rules act: the owner must always be
 * able to see what moved on its own.
 */
export const recordEvent = async (
  db: Db,
  leadId: string,
  kind: LeadEventKind,
  detail = '',
  automatic = false,
): Promise<void> => {
  await db.query(
    `INSERT INTO lead_events (lead_id, kind, detail, is_automatic) VALUES ($1, $2, $3, $4);`,
    [leadId, kind, detail, automatic],
  )
}

/**
 * The same, for a booking that may not have a lead attached.
 *
 * A booking without a lead is not an error worth failing a booking over — the
 * visitor's appointment matters more than our bookkeeping — so this is a
 * no-op rather than a throw.
 */
export const recordEventIfLead = async (
  db: Db,
  leadId: string | null | undefined,
  kind: LeadEventKind,
  detail = '',
  automatic = false,
): Promise<void> => {
  if (!leadId) return

  await recordEvent(db, leadId, kind, detail, automatic)
}
