import type { Db } from '#/backend/db/client'
import { recordEvent } from './lead.events'
import {
  isOpenStage,
  type AutomationRule,
  type LeadPreferences,
  type RuleMode,
} from '#/shared/validation/pipeline.validation'
import type { LeadStatus } from '#/shared/validation/lead.validation'

/**
 * The rules that fire because something happened somewhere else.
 *
 * **Why there is no scheduler here.** Two rules are about time passing rather
 * than about a request: a call whose hour has gone by, and a lead that has
 * been silent for a fortnight. The obvious answer is a cron, and a cron on
 * Cloudflare needs a deploy the owner has to run himself — which would mean
 * shipping a lead system whose best feature does not work until someone
 * remembers to deploy it.
 *
 * So the sweep is **lazy**: `runDueAutomation` is called when the board or
 * Today is read. It is one indexed UPDATE per rule, it is idempotent, and
 * reading the page is exactly when the answer is wanted. A cron can call the
 * same function later without changing a line of it.
 *
 * **Why suggestions are derived, not stored.** A `suggest`-mode rule owns no
 * row. The same predicate that would have acted is evaluated on read, and
 * accepting runs the identical code path the `auto` mode would have run.
 * There is one implementation of "what happens" per rule, never two that can
 * drift apart.
 */

export type AutomationResult = {
  callsMarkedHeld: number
  leadsAutoClosed: number
  followUpsSet: number
}

const mode = (prefs: LeadPreferences, rule: AutomationRule): RuleMode => prefs.rules[rule]

/* -------------------------------------------------------------------------- */
/* Follow-up dates                                                            */
/* -------------------------------------------------------------------------- */

/**
 * How many days ahead a stage puts its next follow-up.
 *
 * A proposal is chased sooner than anything else, because it is the only
 * stage where silence costs money that was already quoted.
 */
export const chaseDaysFor = (status: LeadStatus, prefs: LeadPreferences): number =>
  status === 'PROPOSAL' ? prefs.timing.proposalChaseDays : prefs.timing.chaseDays

/**
 * The follow-up a stage change implies.
 *
 * Returns `undefined` when the rule is off or the stage is an end, which the
 * caller reads as "leave the date alone" — distinct from `null`, which means
 * "clear it".
 */
export const followUpForStage = (
  status: LeadStatus,
  prefs: LeadPreferences,
): Date | null | undefined => {
  if (!isOpenStage(status)) return null
  if (mode(prefs, status === 'PROPOSAL' ? 'proposal' : 'reply') === 'off') return undefined
  if (!prefs.followUp.autoFollowUp) return undefined

  return daysFromNow(chaseDaysFor(status, prefs))
}

export const daysFromNow = (days: number): Date => {
  const date = new Date()
  date.setDate(date.getDate() + days)

  return date
}

/* -------------------------------------------------------------------------- */
/* Events from the calls                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A call was booked.
 *
 * Booking is the strongest signal a visitor gives short of paying: they spent
 * their own time. `auto` moves the lead to QUALIFIED, but only ever forwards
 * — a booking from someone already at PROPOSAL must not drag them back.
 */
export const onCallBooked = async (
  db: Db,
  leadId: string | null,
  prefs: LeadPreferences,
  detail: string,
): Promise<void> => {
  if (!leadId) return

  await recordEvent(db, leadId, 'BOOKED', detail, true)

  if (mode(prefs, 'booked') !== 'auto') return

  await advanceStage(db, leadId, 'QUALIFIED', prefs, 'Booked a call')
}

/** A visitor moved their appointment. The dates changed; the stage did not. */
export const onCallRescheduled = async (
  db: Db,
  leadId: string | null,
  prefs: LeadPreferences,
  detail: string,
): Promise<void> => {
  if (!leadId) return

  await recordEvent(db, leadId, 'RESCHEDULED', detail, true)

  if (mode(prefs, 'rescheduled') !== 'auto') return

  // The appointment carries the follow-up now, so an older chase date would
  // only fire while the call is still ahead.
  await db.query(
    `UPDATE leads SET follow_up_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status NOT IN ('WON', 'LOST');`,
    [leadId],
  )
}

/**
 * A visitor cancelled.
 *
 * Deliberately never moves the stage backwards. A cancellation is a reason to
 * write to someone, not evidence that they are less interested — and guessing
 * otherwise would quietly rewrite the pipeline figure.
 */
export const onCallCancelled = async (
  db: Db,
  leadId: string | null,
  prefs: LeadPreferences,
  detail: string,
): Promise<void> => {
  if (!leadId) return

  await recordEvent(db, leadId, 'CANCELLED', detail, true)

  if (mode(prefs, 'cancelled') !== 'auto') return

  await setFollowUp(db, leadId, daysFromNow(1), 'Cancelled the call — offer new times', true)
}

/** The owner marked a call as a no-show. */
export const onNoShow = async (db: Db, leadId: string, prefs: LeadPreferences): Promise<void> => {
  await recordEvent(db, leadId, 'NO_SHOW', 'Did not attend', false)

  if (mode(prefs, 'noShow') === 'off') return

  await setFollowUp(db, leadId, new Date(), 'Did not attend — reach out', true)
}

/* -------------------------------------------------------------------------- */
/* The lazy sweep                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Apply every `auto` rule whose trigger is time passing.
 *
 * Idempotent by construction: each statement's WHERE excludes what it has
 * already done, so calling it on every page read is safe and calling it twice
 * in the same second changes nothing.
 */
export const runDueAutomation = async (db: Db, prefs: LeadPreferences): Promise<AutomationResult> => {
  const result: AutomationResult = { callsMarkedHeld: 0, leadsAutoClosed: 0, followUpsSet: 0 }

  if (mode(prefs, 'held') === 'auto') {
    // A confirmed call whose end has passed, on a lead that has not already
    // had this same booking written down. The booking reference in `detail`
    // is what makes the second run a no-op.
    const held = await db.query<{ lead_id: string }>(
      `WITH due AS (
         SELECT b.id, b.lead_id, b.reference
           FROM bookings b
          WHERE b.status = 'CONFIRMED'
            AND b.ends_at < CURRENT_TIMESTAMP
            AND b.lead_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM lead_events e
               WHERE e.lead_id = b.lead_id AND e.kind = 'CALL_HELD' AND e.detail = b.reference
            )
       ), written AS (
         INSERT INTO lead_events (lead_id, kind, detail, is_automatic)
         SELECT lead_id, 'CALL_HELD', reference, true FROM due
         RETURNING lead_id
       )
       SELECT lead_id FROM written;`,
    )

    result.callsMarkedHeld = held.rowCount ?? 0

    if (held.rowCount) {
      // The call happened; the next move is the owner's. A date tomorrow is
      // the difference between "we spoke" and "we spoke and I forgot".
      const followed = await db.query(
        `UPDATE leads
            SET follow_up_at = CURRENT_TIMESTAMP + make_interval(days => 1),
                next_step = CASE WHEN btrim(next_step) = '' THEN 'Call held — send what you promised' ELSE next_step END,
                status = CASE WHEN status IN ('NEW', 'CONTACTED') THEN 'QUALIFIED' ELSE status END,
                stage_changed_at = CASE WHEN status IN ('NEW', 'CONTACTED') THEN CURRENT_TIMESTAMP ELSE stage_changed_at END,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY($1::uuid[])
            AND status NOT IN ('WON', 'LOST')
            AND follow_up_at IS NULL;`,
        [held.rows.map((row) => row.lead_id)],
      )

      result.followUpsSet += followed.rowCount ?? 0
    }
  }

  if (mode(prefs, 'silence') === 'auto') {
    const silent = (await silentLeadIds(db, prefs)).map((row) => row.id)

    if (silent.length > 0) {
      const closed = await db.query<{ id: string }>(
        `UPDATE leads
            SET status = 'LOST',
                lost_reason = 'SILENCE',
                closed_at = CURRENT_TIMESTAMP,
                -- Read by Today for a day, with an undo beside it. An
                -- automatic close the owner never sees is a lost client he
                -- never knew he had.
                auto_closed_at = CURRENT_TIMESTAMP,
                stage_changed_at = CURRENT_TIMESTAMP,
                follow_up_at = NULL,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY($1::uuid[])
          RETURNING id;`,
        [silent],
      )

      result.leadsAutoClosed = closed.rowCount ?? 0

      await db.query(
        `INSERT INTO lead_events (lead_id, kind, detail, is_automatic)
         SELECT id, 'AUTO_CLOSED', $2, true FROM leads WHERE id = ANY($1::uuid[]);`,
        [closed.rows.map((row) => row.id), `No answer for ${prefs.timing.silenceDays} days`],
      )
    }
  }

  return result
}

/**
 * Leads that have gone quiet.
 *
 * "Quiet" means nothing came *in* and nothing was *done* for the whole
 * window — an outbound chase two days ago keeps a lead alive, because the
 * owner is clearly still working it.
 *
 * NEW is excluded on purpose: an unanswered message is the owner's failure,
 * not the visitor's, and closing it would hide his own backlog from him.
 */
const silentLeadIds = async (db: Db, prefs: LeadPreferences): Promise<Array<{ id: string }>> => {
  const result = await db.query<{ id: string }>(
    `SELECT l.id
       FROM leads l
      WHERE l.status IN ('CONTACTED', 'QUALIFIED', 'PROPOSAL')
        AND l.archived_at IS NULL
        AND l.is_junk = false
        AND l.stage_changed_at < CURRENT_TIMESTAMP - make_interval(days => $1::int)
        AND NOT EXISTS (
          SELECT 1 FROM lead_messages m
           WHERE m.lead_id = l.id
             AND m.sent_at > CURRENT_TIMESTAMP - make_interval(days => $1::int)
        )
        AND NOT EXISTS (
          SELECT 1 FROM lead_events e
           WHERE e.lead_id = l.id
             AND e.is_automatic = false
             AND e.created_at > CURRENT_TIMESTAMP - make_interval(days => $1::int)
        )
        AND NOT EXISTS (
          SELECT 1 FROM bookings b
           WHERE b.lead_id = l.id
             AND b.status = 'CONFIRMED'
             AND b.starts_at > CURRENT_TIMESTAMP
        );`,
    [prefs.timing.silenceDays],
  )

  return result.rows
}

/* -------------------------------------------------------------------------- */
/* Suggestions                                                                */
/* -------------------------------------------------------------------------- */

export type LeadSuggestion = {
  leadId: string
  rule: AutomationRule
  /** What the rule noticed. */
  because: string
  /** The button's words. */
  action: string
}

/**
 * What the `suggest`-mode rules would like to do.
 *
 * Evaluated from the same predicates the `auto` path uses, so a rule cannot
 * suggest one thing and do another when its mode is flipped.
 */
export const pendingSuggestions = async (db: Db, prefs: LeadPreferences): Promise<LeadSuggestion[]> => {
  const suggestions: LeadSuggestion[] = []

  if (mode(prefs, 'silence') === 'suggest') {
    for (const row of await silentLeadIds(db, prefs)) {
      suggestions.push({
        leadId: row.id,
        rule: 'silence',
        because: `Silent for ${prefs.timing.silenceDays} days`,
        action: 'Close as “Never answered”',
      })
    }
  }

  if (mode(prefs, 'cancelled') === 'suggest') {
    const cancelled = await db.query<{ lead_id: string }>(
      `SELECT DISTINCT b.lead_id
         FROM bookings b
         JOIN leads l ON l.id = b.lead_id
        WHERE b.status = 'CANCELLED'
          AND b.updated_at > CURRENT_TIMESTAMP - make_interval(days => 7)
          AND l.status NOT IN ('WON', 'LOST')
          AND l.follow_up_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM bookings later
             WHERE later.lead_id = b.lead_id AND later.status = 'CONFIRMED' AND later.starts_at > CURRENT_TIMESTAMP
          );`,
    )

    for (const row of cancelled.rows) {
      suggestions.push({
        leadId: row.lead_id,
        rule: 'cancelled',
        because: 'Cancelled a call and has not booked again',
        action: 'Follow up tomorrow',
      })
    }
  }

  if (mode(prefs, 'held') === 'suggest') {
    const held = await db.query<{ lead_id: string; reference: string }>(
      `SELECT b.lead_id, b.reference
         FROM bookings b
         JOIN leads l ON l.id = b.lead_id
        WHERE b.status = 'CONFIRMED'
          AND b.ends_at < CURRENT_TIMESTAMP
          AND l.status NOT IN ('WON', 'LOST')
          AND NOT EXISTS (
            SELECT 1 FROM lead_events e
             WHERE e.lead_id = b.lead_id AND e.kind = 'CALL_HELD' AND e.detail = b.reference
          );`,
    )

    for (const row of held.rows) {
      suggestions.push({
        leadId: row.lead_id,
        rule: 'held',
        because: 'The call time has passed',
        action: 'Mark held, follow up tomorrow',
      })
    }
  }

  return suggestions
}

/**
 * Take a suggestion. Runs the same work the `auto` mode would have done.
 *
 * Dismissing is not a stored "no". It pushes the follow-up date out by the
 * snooze length, which removes the lead from Today for a real reason instead
 * of hiding it behind a flag nobody can see later.
 */
export const decideSuggestion = async (
  db: Db,
  leadId: string,
  rule: AutomationRule,
  decision: 'accept' | 'dismiss',
  prefs: LeadPreferences,
): Promise<void> => {
  if (decision === 'dismiss') {
    await setFollowUp(db, leadId, daysFromNow(prefs.timing.snoozeDays), '', false)
    await recordEvent(db, leadId, 'SNOOZED', `Dismissed: ${rule}`, false)

    return
  }

  if (rule === 'silence') {
    await db.query(
      `UPDATE leads
          SET status = 'LOST', lost_reason = 'SILENCE', closed_at = CURRENT_TIMESTAMP,
              stage_changed_at = CURRENT_TIMESTAMP, follow_up_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status NOT IN ('WON', 'LOST');`,
      [leadId],
    )
    await recordEvent(db, leadId, 'LOST', 'Never answered', false)

    return
  }

  if (rule === 'cancelled') {
    await setFollowUp(db, leadId, daysFromNow(1), 'Cancelled the call — offer new times', false)

    return
  }

  if (rule === 'held') {
    await db.query(
      `INSERT INTO lead_events (lead_id, kind, detail, is_automatic)
       SELECT b.lead_id, 'CALL_HELD', b.reference, false
         FROM bookings b
        WHERE b.lead_id = $1 AND b.status = 'CONFIRMED' AND b.ends_at < CURRENT_TIMESTAMP
          AND NOT EXISTS (
            SELECT 1 FROM lead_events e
             WHERE e.lead_id = b.lead_id AND e.kind = 'CALL_HELD' AND e.detail = b.reference
          );`,
      [leadId],
    )
    await advanceStage(db, leadId, 'QUALIFIED', prefs, 'Call held')
    await setFollowUp(db, leadId, daysFromNow(1), 'Call held — send what you promised', false)
  }
}

/* -------------------------------------------------------------------------- */
/* Shared writes                                                              */
/* -------------------------------------------------------------------------- */

/** Stage order, for rules that may only ever move a lead forwards. */
const ORDER: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'HOLD', 'WON', 'LOST']

/**
 * Move a lead to `target`, but never backwards and never out of an end.
 *
 * Every automatic stage change goes through here. A rule that could drag a
 * lead back from PROPOSAL to QUALIFIED would rewrite the pipeline figure
 * behind the owner's back, which is the fastest way to make him stop
 * believing the number.
 */
export const advanceStage = async (
  db: Db,
  leadId: string,
  target: LeadStatus,
  prefs: LeadPreferences,
  detail: string,
): Promise<void> => {
  const result = await db.query<{ status: LeadStatus }>(
    `UPDATE leads
        SET status = $2, stage_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
            follow_up_at = COALESCE(follow_up_at, CURRENT_TIMESTAMP + make_interval(days => $3::int))
      WHERE id = $1
        AND status NOT IN ('WON', 'LOST')
        AND array_position($4::text[], status) < array_position($4::text[], $2::text)
      RETURNING status;`,
    [leadId, target, chaseDaysFor(target, prefs), ORDER],
  )

  if (result.rowCount) await recordEvent(db, leadId, 'STATUS', detail, true)
}

export const setFollowUp = async (
  db: Db,
  leadId: string,
  on: Date | null,
  nextStep: string,
  automatic: boolean,
): Promise<void> => {
  await db.query(
    `UPDATE leads
        SET follow_up_at = $2,
            next_step = CASE WHEN $3::text <> '' THEN $3 ELSE next_step END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status NOT IN ('WON', 'LOST');`,
    [leadId, on, nextStep],
  )

  if (nextStep) await recordEvent(db, leadId, 'FOLLOW_UP', nextStep, automatic)
}
