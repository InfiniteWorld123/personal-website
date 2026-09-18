import type { Deal } from '#/shared/types/lead.types'
import type { DealStage, LostReason } from '#/shared/validation/lead.validation'
import { toInt, toIso, toIsoRequired } from '#/backend/modules/inbox/inbox.sql'

export { toInt, toIso, toIsoRequired }

/**
 * Today, where he lives.
 *
 * `CURRENT_DATE` on a Worker is today in UTC, which is yesterday in Erfurt for
 * two hours every night. A follow-up list that changes over at 02:00 is wrong
 * in the only way this screen must never be wrong.
 */
export const TODAY = `((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Berlin')::date)`

/** Open means the deal is still moving. Written once, used by every query. */
export const OPEN = `stage NOT IN ('WON', 'LOST')`

/**
 * A date column crosses the wire as the ten characters he picked in the date
 * field, never as an instant. `pg` turns a `date` into a `Date` at the
 * server's midnight, and an ISO string of that lands on the day before
 * whenever the server is east of him.
 */
export const DATE_TEXT = (column: string) => `to_char(${column}, 'YYYY-MM-DD')`

export type DealShape = {
  id: string
  lead_id: string
  title: string
  stage: DealStage
  build_cents: number | string
  monthly_cents: number | string
  currency: string
  next_step: string
  follow_up_on: string | null
  lost_reason: LostReason | null
  lost_note: string
  stage_changed_at: Date
  closed_at: Date | null
  created_at: Date
}

/** Every column a deal needs, spelled the same way everywhere it is read. */
export const DEAL_COLUMNS = `d.id, d.lead_id, d.title, d.stage, d.build_cents, d.monthly_cents,
        d.currency, d.next_step, ${DATE_TEXT('d.follow_up_on')} AS follow_up_on,
        d.lost_reason, d.lost_note, d.stage_changed_at, d.closed_at, d.created_at`

export const projectDeal = (row: DealShape): Deal => ({
  id: row.id,
  personId: row.lead_id,
  title: row.title,
  stage: row.stage,
  buildCents: toInt(row.build_cents),
  monthlyCents: toInt(row.monthly_cents),
  currency: row.currency,
  nextStep: row.next_step,
  followUpOn: row.follow_up_on,
  lostReason: row.lost_reason,
  lostNote: row.lost_note,
  stageChangedAt: toIsoRequired(row.stage_changed_at),
  closedAt: toIso(row.closed_at),
  createdAt: toIsoRequired(row.created_at),
})
