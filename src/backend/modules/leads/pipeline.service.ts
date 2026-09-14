import { getDb, withTransaction, type Db } from '#/backend/db/client'
import { notFoundError, validationError } from '#/backend/shared/error'
import type {
  LeadCall,
  LeadSettings,
  PipelineBoard,
  PipelineCard,
  PipelineColumn,
  PipelineService,
  PipelineStats,
  TodayList,
  TodayRow,
} from '#/shared/types/pipeline.types'
import {
  LEAD_LOST_REASONS,
  OPEN_STAGES,
  STAGE_WEIGHT,
  isOpenStage,
  type LeadChannel,
  type LeadLostReason,
  type LeadPreferences,
  type LeadFieldsWriteInput,
  type ManualLeadInput,
  type PipelineFilterInput,
  type SuggestionDecisionInput,
} from '#/shared/validation/pipeline.validation'
import { LEAD_STATUSES, type LeadLanguage, type LeadSource, type LeadStatus } from '#/shared/validation/lead.validation'
import { recordEvent } from './lead.events'
import { getLeadPreferences, writeLeadPreferences } from './lead.preferences'
import {
  daysFromNow,
  decideSuggestion,
  followUpForStage,
  onNoShow,
  pendingSuggestions,
  runDueAutomation,
} from './lead.automation'

/**
 * The pipeline: the same rows the inbox reads, asked a different question.
 *
 * The inbox asks "who wrote me". This asks "who am I forgetting" — and the
 * answer needs four things the row never carried: a stage worth moving
 * through, a date to be chased on, a number to be worth, and a reason when it
 * dies. Everything here reads `leads`; nothing here owns a table of its own.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export { getLeadPreferences }

export const saveLeadPreferences = async (preferences: LeadPreferences): Promise<LeadSettings> => {
  await writeLeadPreferences(preferences)

  return getLeadSettings()
}

export const getLeadSettings = async (): Promise<LeadSettings> => ({
  preferences: await getLeadPreferences(),
  services: await listServices(),
  // The switch exists; the schedule that would send it does not until the
  // worker is deployed with a cron trigger. Saying so is better than a
  // toggle that silently sends nothing.
  morningMailScheduled: false,
})

/* -------------------------------------------------------------------------- */
/* Services — the shared vocabulary                                           */
/* -------------------------------------------------------------------------- */

type ServiceRow = {
  id: string
  slug: string
  name: string
  start_price_cents: number
  currency: string
  accent: string
}

const toService = (row: ServiceRow): PipelineService => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  startPriceCents: row.start_price_cents,
  currency: row.currency,
  accent: row.accent,
})

/**
 * Admin copy is English, the owner's own decision from the inbox lab, so the
 * English name is preferred and German is the fallback — never an empty label.
 */
const SERVICE_SELECT = `
  s.id, s.slug, s.start_price_cents, s.currency, s.accent,
  COALESCE(
    (SELECT t.name FROM service_translations t
      WHERE t.service_id = s.id
      ORDER BY CASE t.language WHEN 'en' THEN 1 WHEN 'de' THEN 2 ELSE 3 END LIMIT 1),
    s.slug
  ) AS name`

export const listServices = async (db: Db = getDb()): Promise<PipelineService[]> => {
  const result = await db.query<ServiceRow>(
    `SELECT ${SERVICE_SELECT} FROM services s WHERE s.is_active = true ORDER BY s.sort_order, s.slug;`,
  )

  return result.rows.map(toService)
}

/* -------------------------------------------------------------------------- */
/* Reading the board                                                          */
/* -------------------------------------------------------------------------- */

type CardRow = {
  id: string
  name: string
  company: string | null
  email: string
  status: LeadStatus
  source: LeadSource
  channel: LeadChannel | null
  language: LeadLanguage
  value_cents: number | null
  currency: string
  next_step: string
  follow_up_at: Date | null
  stage_changed_at: Date
  read_at: Date | null
  lost_reason: LeadLostReason | null
  auto_closed_at: Date | null
  created_at: Date
  service_id: string | null
  service_slug: string | null
  service_name: string | null
  service_price: number | null
  service_currency: string | null
  service_accent: string | null
  call_id: string | null
  call_reference: string | null
  call_starts_at: Date | null
  call_ends_at: Date | null
  call_status: string | null
  call_type_name: string | null
  call_duration: number | null
  call_held: boolean | null
  call_service_id: string | null
  call_service_slug: string | null
  call_service_name: string | null
  call_service_accent: string | null
}

/**
 * One lead, one row, one call.
 *
 * The call is chosen by a lateral rather than fetched per card: the next
 * confirmed appointment if there is one ahead, otherwise the most recent one
 * behind. A card wants to say either "call tomorrow" or "call held", and
 * those are the only two facts worth a join.
 */
const CARD_QUERY = `
  SELECT l.id, l.name, l.company, l.email, l.status, l.source, l.channel, l.language,
         l.value_cents, l.currency, l.next_step, l.follow_up_at, l.stage_changed_at,
         l.read_at, l.lost_reason, l.auto_closed_at, l.created_at,
         s.id AS service_id, s.slug AS service_slug, s.accent AS service_accent,
         s.start_price_cents AS service_price, s.currency AS service_currency,
         (SELECT t.name FROM service_translations t
           WHERE t.service_id = s.id
           ORDER BY CASE t.language WHEN 'en' THEN 1 WHEN 'de' THEN 2 ELSE 3 END LIMIT 1) AS service_name,
         c.id AS call_id, c.reference AS call_reference, c.starts_at AS call_starts_at,
         c.ends_at AS call_ends_at, c.status AS call_status, c.duration_minutes AS call_duration,
         c.type_name AS call_type_name, c.held AS call_held,
         c.service_id AS call_service_id, c.service_slug AS call_service_slug,
         c.service_name AS call_service_name, c.service_accent AS call_service_accent
    FROM leads l
    LEFT JOIN services s ON s.id = l.service_id
    LEFT JOIN LATERAL (
      SELECT b.id, b.reference, b.starts_at, b.ends_at, b.status,
             bt.duration_minutes,
             COALESCE((SELECT tt.name FROM booking_type_translations tt
                        WHERE tt.booking_type_id = bt.id
                        ORDER BY CASE tt.language WHEN 'en' THEN 1 WHEN 'de' THEN 2 ELSE 3 END LIMIT 1), '') AS type_name,
             cs.id AS service_id, cs.slug AS service_slug, cs.accent AS service_accent,
             (SELECT ct.name FROM service_translations ct
               WHERE ct.service_id = cs.id
               ORDER BY CASE ct.language WHEN 'en' THEN 1 WHEN 'de' THEN 2 ELSE 3 END LIMIT 1) AS service_name,
             EXISTS (
               SELECT 1 FROM lead_events e
                WHERE e.lead_id = b.lead_id AND e.kind = 'CALL_HELD' AND e.detail = b.reference
             ) AS held
        FROM bookings b
        JOIN booking_types bt ON bt.id = b.booking_type_id
        LEFT JOIN services cs ON cs.id = bt.service_id
       WHERE b.lead_id = l.id
       ORDER BY CASE WHEN b.status = 'CONFIRMED' AND b.starts_at > CURRENT_TIMESTAMP THEN 0 ELSE 1 END,
                CASE WHEN b.status = 'CONFIRMED' AND b.starts_at > CURRENT_TIMESTAMP THEN b.starts_at END ASC,
                b.starts_at DESC
       LIMIT 1
    ) c ON true
   WHERE l.archived_at IS NULL AND l.is_junk = false`

const wholeDaysUntil = (instant: Date | null): number | null => {
  if (!instant) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(instant)
  target.setHours(0, 0, 0, 0)

  return Math.round((target.getTime() - today.getTime()) / DAY_MS)
}

const daysSince = (instant: Date): number =>
  Math.max(0, Math.floor((Date.now() - instant.getTime()) / DAY_MS))

const toCall = (row: CardRow): LeadCall | null => {
  if (!row.call_id || !row.call_starts_at || !row.call_ends_at) return null

  return {
    id: row.call_id,
    reference: row.call_reference ?? '',
    startsAt: row.call_starts_at.toISOString(),
    endsAt: row.call_ends_at.toISOString(),
    status: row.call_status ?? '',
    typeName: row.call_type_name ?? '',
    durationMinutes: row.call_duration ?? 0,
    service: row.call_service_id
      ? {
          id: row.call_service_id,
          slug: row.call_service_slug ?? '',
          name: row.call_service_name ?? row.call_service_slug ?? '',
          startPriceCents: 0,
          currency: row.currency,
          accent: row.call_service_accent ?? '#355cff',
        }
      : null,
    held: row.call_held ?? false,
  }
}

const toCard = (row: CardRow, preferences: LeadPreferences): PipelineCard => {
  const followUpInDays = wholeDaysUntil(row.follow_up_at)
  const daysInStage = daysSince(row.stage_changed_at)

  return {
    id: row.id,
    name: row.name,
    company: row.company ?? '',
    email: row.email,
    status: row.status,
    source: row.source,
    channel: row.channel,
    language: row.language,
    service: row.service_id
      ? {
          id: row.service_id,
          slug: row.service_slug ?? '',
          name: row.service_name ?? row.service_slug ?? '',
          startPriceCents: row.service_price ?? 0,
          currency: row.service_currency ?? row.currency,
          accent: row.service_accent ?? '#355cff',
        }
      : null,
    valueCents: row.value_cents,
    currency: row.currency,
    nextStep: row.next_step,
    followUpAt: row.follow_up_at ? row.follow_up_at.toISOString() : null,
    followUpInDays,
    daysInStage,
    isUnread: row.read_at === null,
    // Stale is about neglect, not about lateness: a lead with a date in the
    // future is being worked even if it has sat in one stage for a month.
    isStale:
      isOpenStage(row.status) &&
      daysInStage >= preferences.timing.staleDays &&
      (followUpInDays === null || followUpInDays < 0),
    lostReason: row.lost_reason,
    call: toCall(row),
    autoClosedAt: row.auto_closed_at ? row.auto_closed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  }
}

const SORT_SQL: Record<PipelineFilterInput['sort'], string> = {
  recent: 'l.stage_changed_at DESC',
  oldest: 'l.stage_changed_at ASC',
  value: 'l.value_cents DESC NULLS LAST',
  due: 'l.follow_up_at ASC NULLS LAST',
}

export const readPipeline = async (filter: PipelineFilterInput): Promise<PipelineBoard> => {
  const db = getDb()
  const preferences = await getLeadPreferences(db)

  // Reading the board is when the owner wants the answer, so it is also when
  // the time-based rules run. See the note in `lead.automation.ts`.
  await runDueAutomation(db, preferences)

  const conditions: string[] = []
  const params: unknown[] = []

  if (filter.service && filter.service !== 'all') {
    params.push(filter.service)
    conditions.push(`l.service_id = $${params.length}`)
  }

  if (filter.search) {
    params.push(`%${filter.search}%`)
    conditions.push(
      `(l.name ILIKE $${params.length} OR l.email ILIKE $${params.length} OR l.company ILIKE $${params.length})`,
    )
  }

  if (!filter.withClosed) conditions.push(`l.status NOT IN ('WON', 'LOST')`)

  const where = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : ''
  const result = await db.query<CardRow>(`${CARD_QUERY}${where} ORDER BY ${SORT_SQL[filter.sort]}, l.created_at DESC;`, params)
  const cards = result.rows.map((row) => toCard(row, preferences))

  const statuses = filter.withClosed ? LEAD_STATUSES : OPEN_STAGES
  const columns: PipelineColumn[] = statuses.map((status) => {
    const inColumn = cards.filter((card) => card.status === status)

    return {
      status,
      cards: inColumn,
      totalCents: inColumn.reduce((sum, card) => sum + (card.valueCents ?? 0), 0),
    }
  })

  return { columns, stats: await readStats(db), services: await listServices(db) }
}

/* -------------------------------------------------------------------------- */
/* The numbers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Every figure on the page, from the owner's own tables.
 *
 * Nothing here is cached. These are counts over hundreds of rows, not the
 * third-party traffic metrics `data-model.md` reserves `metric_snapshots` for.
 */
export const readStats = async (db: Db = getDb()): Promise<PipelineStats> => {
  const [totals, sources, services, reasons, replies] = await Promise.all([
    db.query<{ status: LeadStatus; count: string; value: string | null }>(
      `SELECT status, COUNT(*)::text AS count, SUM(COALESCE(value_cents, 0))::text AS value
         FROM leads WHERE archived_at IS NULL AND is_junk = false GROUP BY status;`,
    ),
    db.query<{ source: LeadSource; total: string; won: string }>(
      `SELECT source, COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE status = 'WON')::text AS won
         FROM leads WHERE archived_at IS NULL AND is_junk = false GROUP BY source;`,
    ),
    db.query<ServiceRow & { total: string; won: string; open_cents: string | null }>(
      `SELECT ${SERVICE_SELECT},
              COUNT(l.id)::text AS total,
              COUNT(l.id) FILTER (WHERE l.status = 'WON')::text AS won,
              SUM(COALESCE(l.value_cents, 0)) FILTER (WHERE l.status NOT IN ('WON', 'LOST'))::text AS open_cents
         FROM services s
         LEFT JOIN leads l ON l.service_id = s.id AND l.archived_at IS NULL AND l.is_junk = false
        WHERE s.is_active = true
        GROUP BY s.id, s.slug, s.start_price_cents, s.currency, s.accent, s.sort_order
        ORDER BY s.sort_order;`,
    ),
    db.query<{ lost_reason: LeadLostReason; count: string }>(
      `SELECT lost_reason, COUNT(*)::text AS count FROM leads
        WHERE status = 'LOST' AND lost_reason IS NOT NULL GROUP BY lost_reason ORDER BY COUNT(*) DESC;`,
    ),
    db.query<{ hours: string | null; waiting: string }>(
      `SELECT
         (SELECT (PERCENTILE_CONT(0.5) WITHIN GROUP (
                    ORDER BY EXTRACT(EPOCH FROM (first_replied_at - created_at)) / 3600))::text
            FROM leads WHERE first_replied_at IS NOT NULL) AS hours,
         (SELECT COUNT(*)::text FROM leads
           WHERE first_replied_at IS NULL AND archived_at IS NULL AND is_junk = false
             AND status NOT IN ('WON', 'LOST')) AS waiting;`,
    ),
  ])

  const byStatus = new Map(totals.rows.map((row) => [row.status, row]))
  const count = (status: LeadStatus) => Number(byStatus.get(status)?.count ?? 0)
  const value = (status: LeadStatus) => Number(byStatus.get(status)?.value ?? 0)

  const openStatuses = OPEN_STAGES as readonly LeadStatus[]
  const weightedCents = Math.round(openStatuses.reduce((sum, status) => sum + value(status) * STAGE_WEIGHT[status], 0))
  const rawCents = openStatuses.reduce((sum, status) => sum + value(status), 0)
  const openCount = openStatuses.reduce((sum, status) => sum + count(status), 0)
  const wonCount = count('WON')
  const lostCount = count('LOST')
  const closed = wonCount + lostCount
  const medianHours = replies.rows[0]?.hours

  return {
    weightedCents,
    rawCents,
    openCount,
    wonCents: value('WON'),
    wonCount,
    lostCount,
    conversion: closed > 0 ? Math.round((wonCount / closed) * 100) : null,
    medianReplyHours: medianHours === null || medianHours === undefined ? null : Math.round(Number(medianHours) * 10) / 10,
    awaitingReply: Number(replies.rows[0]?.waiting ?? 0),
    bySource: sources.rows.map((row) => ({ source: row.source, total: Number(row.total), won: Number(row.won) })),
    byService: services.rows.map((row) => ({
      service: toService(row),
      total: Number(row.total),
      won: Number(row.won),
      openCents: Number(row.open_cents ?? 0),
    })),
    byLostReason: reasons.rows.map((row) => ({ reason: row.lost_reason, count: Number(row.count) })),
    // One currency for now. The column exists per lead so a franc-priced
    // project later is a value, not a migration.
    currency: 'EUR',
  }
}

/* -------------------------------------------------------------------------- */
/* Today                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Everything that wants the owner today, from wherever it came.
 *
 * The rows are built from the same cards the board draws, so a lead cannot
 * appear here in one state and there in another. Order is by urgency, and
 * urgency is a number rather than a sort key so that "overdue by four days"
 * beats "overdue by one" without a second pass.
 */
export const readToday = async (): Promise<TodayList> => {
  const db = getDb()
  const preferences = await getLeadPreferences(db)
  const applied = await runDueAutomation(db, preferences)

  const result = await db.query<CardRow>(`${CARD_QUERY} ORDER BY l.follow_up_at ASC NULLS LAST;`)
  const cards = result.rows.map((row) => toCard(row, preferences))
  const byId = new Map(cards.map((card) => [card.id, card]))
  const rows: TodayRow[] = []

  for (const card of cards) {
    if (card.autoClosedAt && Date.now() - Date.parse(card.autoClosedAt) < DAY_MS) {
      rows.push({
        reason: 'autoClosed',
        lead: card,
        because: `Closed automatically after ${preferences.timing.silenceDays} days of silence`,
        from: 'pipeline',
        urgency: 40,
      })

      continue
    }

    if (!isOpenStage(card.status)) continue

    if (preferences.wires.callsInToday && card.call && card.call.status === 'CONFIRMED') {
      const startsIn = Date.parse(card.call.startsAt) - Date.now()

      if (startsIn > 0 && startsIn < DAY_MS) {
        rows.push({
          reason: 'call',
          lead: card,
          because: `${card.call.typeName} · ${card.call.durationMinutes} min`,
          from: 'calls',
          urgency: -100 + startsIn / DAY_MS,
        })
      }
    }

    if (card.followUpInDays !== null && card.followUpInDays <= 0) {
      rows.push({
        reason: card.followUpInDays < 0 ? 'overdue' : 'due',
        lead: card,
        because:
          card.followUpInDays < 0
            ? `Follow-up ${Math.abs(card.followUpInDays)}d overdue${card.nextStep ? ` — ${card.nextStep}` : ''}`
            : card.nextStep || 'Follow up today',
        from: 'pipeline',
        urgency: card.followUpInDays * 10,
      })
    }

    // An unanswered message is the owner's own backlog, and the one number
    // that moves conversion most in local services.
    const waitedHours = (Date.now() - Date.parse(card.createdAt)) / (60 * 60 * 1000)

    if (card.status === 'NEW' && waitedHours >= preferences.timing.unansweredHours) {
      rows.push({
        reason: 'unanswered',
        lead: card,
        because: `Arrived ${Math.round(waitedHours)}h ago, still unanswered`,
        from: 'inbox',
        urgency: -50,
      })
    }
  }

  for (const suggestion of await pendingSuggestions(db, preferences)) {
    const lead = byId.get(suggestion.leadId)
    if (!lead) continue

    rows.push({
      reason: 'suggestion',
      lead,
      because: suggestion.because,
      from: suggestion.rule === 'silence' ? 'pipeline' : 'calls',
      suggestion: { rule: suggestion.rule, action: suggestion.action },
      urgency: 50,
    })
  }

  rows.sort((left, right) => left.urgency - right.urgency)

  return { rows, applied: { callsMarkedHeld: applied.callsMarkedHeld, leadsAutoClosed: applied.leadsAutoClosed } }
}

/* -------------------------------------------------------------------------- */
/* The calls lens                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Every call, each one carrying the person who booked it.
 *
 * A call without its lead is what the admin had before this round: a row in a
 * calendar that could not answer "who is this and what do they want".
 */
export const listCallsWithLeads = async (filter: PipelineFilterInput): Promise<PipelineCard[]> => {
  const db = getDb()
  const preferences = await getLeadPreferences(db)
  const params: unknown[] = []
  let where = ''

  if (filter.service && filter.service !== 'all') {
    params.push(filter.service)
    where = ` AND l.service_id = $${params.length}`
  }

  const result = await db.query<CardRow>(
    `${CARD_QUERY}${where} AND EXISTS (SELECT 1 FROM bookings b WHERE b.lead_id = l.id)
      ORDER BY c.starts_at DESC NULLS LAST;`,
    params,
  )

  return result.rows.map((row) => toCard(row, preferences)).filter((card) => card.call !== null)
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

const loadCard = async (db: Db, id: string): Promise<PipelineCard> => {
  const preferences = await getLeadPreferences(db)
  const result = await db.query<CardRow>(`${CARD_QUERY} AND l.id = $1 LIMIT 1;`, [id])

  if (!result.rows[0]) throw notFoundError('That lead does not exist')

  return toCard(result.rows[0], preferences)
}

/**
 * Move a lead.
 *
 * LOST without a reason is refused here rather than at the constraint, so the
 * owner gets a sentence instead of a database error — and the reason is what
 * makes the "why I lose" figure worth reading at all.
 */
export const setLeadStage = async (
  id: string,
  status: LeadStatus,
  lostReason: LeadLostReason | null | undefined,
): Promise<PipelineCard> => {
  const preferences = await getLeadPreferences()

  if (status === 'LOST' && preferences.closing.lostReasonRequired && !lostReason) {
    throw validationError('Pick why this one was lost')
  }

  if (status === 'LOST' && lostReason && !LEAD_LOST_REASONS.includes(lostReason)) {
    throw validationError('That is not a reason we record')
  }

  return withTransaction(async (db) => {
    const followUp = followUpForStage(status, preferences)
    const result = await db.query<{ status: LeadStatus }>(
      `UPDATE leads
          SET status = $2,
              lost_reason = CASE WHEN $2 = 'LOST' THEN $3::text ELSE NULL END,
              closed_at = CASE WHEN $2 IN ('WON', 'LOST') THEN CURRENT_TIMESTAMP ELSE NULL END,
              -- Cleared on any hand-made move: the owner has now seen it.
              auto_closed_at = NULL,
              follow_up_at = CASE
                WHEN $2 IN ('WON', 'LOST') THEN NULL
                WHEN $4::timestamptz IS NOT NULL THEN $4::timestamptz
                ELSE follow_up_at END,
              stage_changed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      RETURNING status;`,
      [id, status, status === 'LOST' ? (lostReason ?? null) : null, followUp ?? null],
    )

    if (!result.rowCount) throw notFoundError('That lead does not exist')

    await recordEvent(
      db,
      id,
      status === 'WON' ? 'WON' : status === 'LOST' ? 'LOST' : 'STATUS',
      status === 'LOST' && lostReason ? `Lost · ${lostReason}` : `Moved to ${status}`,
      false,
    )

    return loadCard(db, id)
  })
}

export const setLeadFields = async (id: string, input: LeadFieldsWriteInput): Promise<PipelineCard> =>
  withTransaction(async (db) => {
    const current = await db.query<{ value_cents: number | null; status: LeadStatus }>(
      `SELECT value_cents, status FROM leads WHERE id = $1;`,
      [id],
    )

    if (!current.rows[0]) throw notFoundError('That lead does not exist')

    const preferences = await getLeadPreferences(db)

    // A won deal's price is what was agreed. Letting it drift afterwards
    // would quietly rewrite the only revenue figure the platform has.
    if (
      preferences.closing.lockValueOnWon &&
      current.rows[0].status === 'WON' &&
      input.valueCents !== undefined &&
      input.valueCents !== current.rows[0].value_cents
    ) {
      throw validationError('The price of a won project is fixed')
    }

    await db.query(
      `UPDATE leads
          SET value_cents = COALESCE($2::integer, value_cents),
              service_id = CASE WHEN $3::boolean THEN $4::uuid ELSE service_id END,
              follow_up_at = CASE WHEN $5::boolean THEN $6::timestamptz ELSE follow_up_at END,
              next_step = COALESCE($7::text, next_step),
              channel = CASE WHEN $8::boolean THEN $9::text ELSE channel END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1;`,
      [
        id,
        input.valueCents ?? null,
        input.serviceId !== undefined,
        input.serviceId ?? null,
        input.followUpOn !== undefined,
        input.followUpOn ? new Date(`${input.followUpOn}T09:00:00`) : null,
        input.nextStep ?? null,
        input.channel !== undefined,
        input.channel ?? null,
      ],
    )

    if (input.valueCents !== undefined && input.valueCents !== current.rows[0].value_cents) {
      await recordEvent(db, id, 'VALUE', `Worth ${((input.valueCents ?? 0) / 100).toFixed(0)}`, false)
    }

    if (input.serviceId !== undefined) await recordEvent(db, id, 'SERVICE', 'Service set', false)

    if (input.followUpOn !== undefined) {
      await recordEvent(db, id, 'FOLLOW_UP', input.followUpOn ? `Follow up on ${input.followUpOn}` : 'Follow-up cleared', false)
    }

    return loadCard(db, id)
  })

export const snoozeLead = async (id: string, days: number): Promise<PipelineCard> =>
  withTransaction(async (db) => {
    const result = await db.query(
      `UPDATE leads SET follow_up_at = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status NOT IN ('WON', 'LOST');`,
      [id, daysFromNow(days)],
    )

    if (!result.rowCount) throw notFoundError('That lead is not open')

    await recordEvent(db, id, 'SNOOZED', `Snoozed ${days} day${days === 1 ? '' : 's'}`, false)

    return loadCard(db, id)
  })

/**
 * Put a lead a rule closed back where it was.
 *
 * The undo beside an automatic close is what makes full automation safe to
 * hand someone: the rule acts, the owner is told, and one press returns it.
 */
export const reopenLead = async (id: string): Promise<PipelineCard> =>
  withTransaction(async (db) => {
    const result = await db.query(
      `UPDATE leads
          SET status = 'CONTACTED', lost_reason = NULL, closed_at = NULL, auto_closed_at = NULL,
              stage_changed_at = CURRENT_TIMESTAMP,
              follow_up_at = CURRENT_TIMESTAMP + make_interval(days => 2),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'LOST';`,
      [id],
    )

    if (!result.rowCount) throw notFoundError('That lead is not closed')

    await recordEvent(db, id, 'REOPENED', 'Reopened after an automatic close', false)

    return loadCard(db, id)
  })

export const applySuggestion = async (id: string, input: SuggestionDecisionInput): Promise<PipelineCard> =>
  withTransaction(async (db) => {
    const preferences = await getLeadPreferences(db)
    await decideSuggestion(db, id, input.rule, input.decision, preferences)

    return loadCard(db, id)
  })

export const markCallNoShow = async (leadId: string): Promise<PipelineCard> =>
  withTransaction(async (db) => {
    const preferences = await getLeadPreferences(db)
    await onNoShow(db, leadId, preferences)

    return loadCard(db, leadId)
  })

/* -------------------------------------------------------------------------- */
/* Adding one by hand                                                         */
/* -------------------------------------------------------------------------- */

export const createManualLead = async (
  input: ManualLeadInput,
): Promise<{ lead: PipelineCard; duplicateOf?: string }> => {
  const db = getDb()
  const preferences = await getLeadPreferences(db)

  if (preferences.manual.duplicateHint && !input.allowDuplicate) {
    const existing = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM leads WHERE lower(email) = lower($1) ORDER BY created_at DESC LIMIT 1;`,
      [input.email],
    )

    if (existing.rows[0]) {
      throw validationError(
        `${existing.rows[0].name} already exists with that address. Open them instead, or add anyway.`,
      )
    }
  }

  return withTransaction(async (transaction) => {
    // The suggested value comes from the service, so adding someone met at a
    // fair is four fields rather than a form.
    const suggested = input.serviceId
      ? await transaction.query<{ start_price_cents: number; currency: string }>(
          `SELECT start_price_cents, currency FROM services WHERE id = $1;`,
          [input.serviceId],
        )
      : null

    const result = await transaction.query<{ id: string }>(
      `INSERT INTO leads
         (source, name, email, phone, company, message, "language", status,
          service_id, value_cents, currency, channel, next_step, follow_up_at, read_at)
       VALUES ('MANUAL', $1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6, 'NEW',
               $7::uuid, $8::integer, COALESCE($9, 'EUR'), $10::text, '', $11::timestamptz, CURRENT_TIMESTAMP)
       RETURNING id;`,
      [
        input.name,
        input.email,
        input.phone ?? '',
        input.company ?? '',
        input.note ?? '',
        input.language ?? 'de',
        input.serviceId ?? null,
        input.valueCents ?? suggested?.rows[0]?.start_price_cents ?? null,
        suggested?.rows[0]?.currency ?? 'EUR',
        input.channel ?? 'OTHER',
        input.followUpOn ? new Date(`${input.followUpOn}T09:00:00`) : null,
      ],
    )

    const id = result.rows[0].id
    await recordEvent(transaction, id, 'CREATED', `Added by hand · ${input.channel ?? 'OTHER'}`, false)

    return { lead: await loadCard(transaction, id) }
  })
}
