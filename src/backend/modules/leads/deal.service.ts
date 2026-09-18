import { getDb } from '#/backend/db/client'
import { badRequestError, notFoundError } from '#/backend/shared/error'
import type { Deal } from '#/shared/types/lead.types'
import {
  isOpenStage,
  LOST_REASON_LABEL,
  STAGE_LABEL,
  type DealMoveInput,
  type DealWriteInput,
} from '#/shared/validation/lead.validation'
import { record } from './event.service'
import { DEAL_COLUMNS, projectDeal, type DealShape } from './lead.sql'

/**
 * A deal: one thing this person might buy, or did.
 *
 * Two shapes of write, deliberately not one. **Editing** changes what a deal
 * holds — its name, its two prices, the sentence about what is next, the day
 * he means to chase it. **Moving** changes where it is, and carries rules a
 * general save cannot: losing asks why in the same act, and winning or losing
 * stamps the closing date and drops the follow-up, because a finished deal is
 * not waiting for anything.
 */

const money = (cents: number, currency: string): string =>
  `${(cents / 100).toLocaleString('de-DE')} ${currency === 'EUR' ? '€' : currency}`

const one = async (personId: string, dealId: string): Promise<Deal> => {
  const result = await getDb().query<DealShape>(
    `SELECT ${DEAL_COLUMNS} FROM deals d WHERE d.id = $1 AND d.lead_id = $2;`,
    [dealId, personId],
  )

  const row = result.rows[0]

  if (!row) throw notFoundError('That deal is not here')

  return projectDeal(row)
}

export const listDeals = async (personId: string): Promise<Deal[]> => {
  const result = await getDb().query<DealShape>(
    `SELECT ${DEAL_COLUMNS} FROM deals d WHERE d.lead_id = $1
      ORDER BY (d.stage IN ('WON', 'LOST')), d.created_at DESC;`,
    [personId],
  )

  return result.rows.map(projectDeal)
}

/**
 * Opening a deal.
 *
 * He chose that this is always a button he pressed, inside a conversation —
 * never something that happens because somebody wrote to him. A Hetzner
 * invoice and a baker asking for a website both arrive as letters; only one of
 * them is a deal, and only he knows which.
 */
export const createDeal = async (personId: string, input: DealWriteInput): Promise<Deal[]> => {
  const person = await getDb().query<{ id: string; name: string }>(
    'SELECT id, name FROM leads WHERE id = $1;',
    [personId],
  )

  if (!person.rows[0]) throw notFoundError('That person is not here')

  const result = await getDb().query<{ id: string }>(
    `INSERT INTO deals (lead_id, title, build_cents, monthly_cents, next_step, follow_up_on)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;`,
    [
      personId,
      input.title,
      input.buildEuros,
      input.monthlyEuros,
      input.nextStep,
      input.followUpOn ?? null,
    ],
  )

  const dealId = result.rows[0]!.id

  await record({
    personId,
    dealId,
    kind: 'DEAL_OPENED',
    body: `Deal opened — ${input.title}`,
  })

  return listDeals(personId)
}

/**
 * Editing what a deal holds.
 *
 * Only what actually changed is written to the history. A save that records
 * "money changed" when nothing moved is the kind of noise that makes a history
 * unreadable, and unread history is the same as none.
 */
export const updateDeal = async (
  personId: string,
  dealId: string,
  input: DealWriteInput,
): Promise<Deal[]> => {
  const before = await one(personId, dealId)

  if (input.followUpOn && !isOpenStage(before.stage)) {
    throw badRequestError('A won or lost deal is not waiting for anything — reopen it first')
  }

  await getDb().query(
    `UPDATE deals
        SET title = $3, build_cents = $4, monthly_cents = $5, next_step = $6,
            follow_up_on = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND lead_id = $2;`,
    [
      dealId,
      personId,
      input.title,
      input.buildEuros,
      input.monthlyEuros,
      input.nextStep,
      isOpenStage(before.stage) ? (input.followUpOn ?? null) : null,
    ],
  )

  if (before.buildCents !== input.buildEuros || before.monthlyCents !== input.monthlyEuros) {
    await record({
      personId,
      dealId,
      kind: 'MONEY',
      // The two figures are named separately in the sentence too. Nothing in
      // this system ever prints their sum.
      body: `${money(input.buildEuros, before.currency)} once, ${money(input.monthlyEuros, before.currency)} a month`,
    })
  }

  if ((before.followUpOn ?? null) !== (input.followUpOn ?? null)) {
    await record({
      personId,
      dealId,
      kind: 'FOLLOW_UP',
      body: input.followUpOn ? `Follow up on ${input.followUpOn}` : 'Follow-up cleared',
    })
  }

  return listDeals(personId)
}

/**
 * Moving a deal between stages.
 *
 * Losing and saying why are one act — `deals_lost_pair_check` refuses the
 * half-state, and the screen asks for the reason in the same click that moves
 * it. That pair is the 500 that opened the 15 Sep audit, fixed at the level
 * where it cannot come back.
 */
export const moveDeal = async (
  personId: string,
  dealId: string,
  input: DealMoveInput,
): Promise<Deal[]> => {
  const before = await one(personId, dealId)

  if (before.stage === input.stage) return listDeals(personId)

  const closing = !isOpenStage(input.stage)

  await getDb().query(
    `UPDATE deals
        SET stage = $3,
            lost_reason = $4,
            lost_note = $5,
            -- A closed deal has a closing date and an open one does not, so
            -- reopening clears it rather than leaving yesterday's date behind.
            closed_at = CASE WHEN $6 THEN CURRENT_TIMESTAMP ELSE NULL END,
            -- Nothing that is finished sits in the follow-up list.
            follow_up_on = CASE WHEN $6 THEN NULL ELSE follow_up_on END,
            stage_changed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND lead_id = $2;`,
    [
      dealId,
      personId,
      input.stage,
      input.stage === 'LOST' ? input.lostReason : null,
      input.stage === 'LOST' ? input.lostNote : '',
      closing,
    ],
  )

  const reason =
    input.stage === 'LOST' && input.lostReason
      ? ` — ${LOST_REASON_LABEL[input.lostReason]}${input.lostNote ? `: ${input.lostNote}` : ''}`
      : ''

  const money_ =
    input.stage === 'WON' && before.monthlyCents > 0
      ? ` — ${money(before.monthlyCents, before.currency)} a month starts now`
      : ''

  await record({
    personId,
    dealId,
    kind: 'STAGE',
    body: `${STAGE_LABEL[before.stage]} → ${STAGE_LABEL[input.stage]}${reason}${money_}`,
  })

  return listDeals(personId)
}

/**
 * Removing a deal.
 *
 * The history line is written first and survives, because `lead_events.deal_id`
 * is `ON DELETE SET NULL`: that a deal existed and was deleted is itself a
 * fact about the person, and erasing it would leave a file that quietly lies
 * about what happened.
 */
export const deleteDeal = async (personId: string, dealId: string): Promise<Deal[]> => {
  const before = await one(personId, dealId)

  await record({
    personId,
    dealId,
    kind: 'DEAL_REMOVED',
    body: `Deal removed — ${before.title}`,
  })

  await getDb().query('DELETE FROM deals WHERE id = $1 AND lead_id = $2;', [dealId, personId])

  return listDeals(personId)
}
