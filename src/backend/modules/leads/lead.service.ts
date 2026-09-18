import { getDb } from '#/backend/db/client'
import { attachmentUrl } from '#/backend/modules/inbox/attachment.service'
import { getPerson } from '#/backend/modules/inbox/person.service'
import type { Attachment } from '#/shared/types/inbox.types'
import type { MessageDirection } from '#/shared/validation/inbox.validation'
import type {
  Board,
  BoardCard,
  BookedCall,
  LeadFile,
  LeadList,
  LeadRow,
  LeadSummary,
} from '#/shared/types/lead.types'
import {
  DEAL_STAGES,
  type DealStage,
  type LeadQueryInput,
  type LostReason,
} from '#/shared/validation/lead.validation'
import { listDeals } from './deal.service'
import { listEvents } from './event.service'
import { DATE_TEXT, DEAL_COLUMNS, OPEN, TODAY, projectDeal, toInt, toIsoRequired, type DealShape } from './lead.sql'

/**
 * The list, the numbers, one person's file, and the board.
 *
 * **The numbers are counted from the deals in the same breath as the rows.**
 * Not stored, not cached, not typed in anywhere: a figure on this screen is
 * either arithmetic over rows that exist, or it is not shown. That rule is the
 * whole reason this system was rebuilt, so it is enforced here rather than
 * trusted to the screens.
 */

/* -------------------------------------------------------------------------- */
/* The numbers                                                                */
/* -------------------------------------------------------------------------- */

type SummaryShape = {
  open_deals: number | string
  open_people: number | string
  open_build: number | string
  confirmed_monthly: number | string
  won: number | string
  lost: number | string
  top_lost_reason: LostReason | null
  overdue: number | string
  due_today: number | string
}

/**
 * Counted over everything, never over the current search.
 *
 * A "total" that silently means "total of what you are looking at" is a lie
 * with a plausible face — filter to one stage and the pipeline appears to
 * shrink. The strip describes his business; the rows below describe his query.
 */
const readSummary = async (): Promise<LeadSummary> => {
  const result = await getDb().query<SummaryShape>(
    `SELECT
       count(*) FILTER (WHERE ${OPEN})                                  AS open_deals,
       count(DISTINCT lead_id) FILTER (WHERE ${OPEN})                   AS open_people,
       COALESCE(sum(build_cents) FILTER (WHERE ${OPEN}), 0)             AS open_build,
       COALESCE(sum(monthly_cents) FILTER (WHERE stage = 'WON'), 0)     AS confirmed_monthly,
       count(*) FILTER (WHERE stage = 'WON')                            AS won,
       count(*) FILTER (WHERE stage = 'LOST')                           AS lost,
       (SELECT lost_reason FROM deals WHERE lost_reason IS NOT NULL
         GROUP BY lost_reason ORDER BY count(*) DESC, lost_reason LIMIT 1) AS top_lost_reason,
       count(*) FILTER (WHERE ${OPEN} AND follow_up_on < ${TODAY})      AS overdue,
       count(*) FILTER (WHERE ${OPEN} AND follow_up_on = ${TODAY})      AS due_today
     FROM deals;`,
  )

  const row = result.rows[0]!

  return {
    openDeals: toInt(row.open_deals),
    openPeople: toInt(row.open_people),
    openBuildCents: toInt(row.open_build),
    confirmedMonthlyCents: toInt(row.confirmed_monthly),
    won: toInt(row.won),
    lost: toInt(row.lost),
    topLostReason: row.top_lost_reason,
    overdue: toInt(row.overdue),
    dueToday: toInt(row.due_today),
  }
}

/** The one number the sidebar carries. Its own query, because it runs often. */
export const overdueCount = async (): Promise<number> => {
  const result = await getDb().query<{ n: number | string }>(
    `SELECT count(*) AS n FROM deals WHERE ${OPEN} AND follow_up_on < ${TODAY};`,
  )

  return toInt(result.rows[0]?.n ?? 0)
}

/* -------------------------------------------------------------------------- */
/* The list                                                                   */
/* -------------------------------------------------------------------------- */

/** The deal half is null for a person who has none, which most of them are. */
type RowShape = Omit<DealShape, 'id'> & {
  id: string | null
  person_id: string
  name: string
  email: string
  company: string | null
  source: string
  last_message_at: Date
  deal_count: number | string
  open_build: number | string
  won_monthly: number | string
  next_follow_up: string | null
}

const projectRow = (row: RowShape): LeadRow => ({
  id: row.person_id,
  name: row.name,
  email: row.email,
  company: row.company === null || row.company.trim() === '' ? null : row.company,
  source: row.source,
  lastMessageAt: toIsoRequired(row.last_message_at),
  dealCount: toInt(row.deal_count),
  headline: row.id === null ? null : projectDeal(row as DealShape),
  openBuildCents: toInt(row.open_build),
  wonMonthlyCents: toInt(row.won_monthly),
  followUpOn: row.next_follow_up,
})

/**
 * Everyone who wrote or booked — his answer, and it has a consequence he chose
 * with his eyes open in the lab: a Hetzner invoice is a person too, and sits
 * in the list under "wrote to you · no deal" until he opens a deal or files it.
 *
 * Filed people are the one exception. Archiving in the inbox is his own act of
 * saying "done with this", so a filed person with no deal stays filed. A filed
 * person who *has* a deal is still here: the deal outranks the filing.
 */
export const listLeads = async (query: LeadQueryInput): Promise<LeadList> => {
  const where: string[] = ['l.is_junk = false', '(l.archived_at IS NULL OR agg.deal_count > 0)']
  const values: unknown[] = []

  if (query.stage === 'NONE') where.push('agg.deal_count = 0')
  else if (query.stage !== 'ALL') {
    values.push(query.stage)
    where.push(`EXISTS (SELECT 1 FROM deals x WHERE x.lead_id = l.id AND x.stage = $${values.length})`)
  }

  if (query.search !== '') {
    values.push(`%${query.search}%`)
    const p = `$${values.length}`

    where.push(
      `(l.name ILIKE ${p} OR l.email ILIKE ${p} OR l.company ILIKE ${p}
        OR EXISTS (SELECT 1 FROM deals x WHERE x.lead_id = l.id
                    AND (x.title ILIKE ${p} OR x.next_step ILIKE ${p})))`,
    )
  }

  values.push(query.limit)

  const result = await getDb().query<RowShape>(
    `SELECT l.id AS person_id, l.name, l.email, l.company, l.source, l.last_message_at,
            agg.deal_count, agg.open_build, agg.won_monthly,
            ${DATE_TEXT('agg.next_follow_up')} AS next_follow_up,
            ${DEAL_COLUMNS}
       FROM leads l
       -- One pass over this person's deals for every figure the row shows, so
       -- a row cannot disagree with itself.
       JOIN LATERAL (
         SELECT count(*) AS deal_count,
                COALESCE(sum(build_cents) FILTER (WHERE ${OPEN}), 0) AS open_build,
                COALESCE(sum(monthly_cents) FILTER (WHERE stage = 'WON'), 0) AS won_monthly,
                min(follow_up_on) FILTER (WHERE ${OPEN}) AS next_follow_up
           FROM deals WHERE lead_id = l.id
       ) agg ON true
       -- The deal the row speaks for: the open one due soonest, else the
       -- newest. A person with three deals still gets one line.
       LEFT JOIN LATERAL (
         SELECT * FROM deals d
          WHERE d.lead_id = l.id
          ORDER BY (d.stage IN ('WON', 'LOST')), d.follow_up_on NULLS LAST, d.created_at DESC
          LIMIT 1
       ) d ON true
      WHERE ${where.join(' AND ')}
      -- Whoever is due first, then whoever wrote last. The grouping the screen
      -- draws reads this order, it does not re-sort it.
      ORDER BY agg.next_follow_up ASC NULLS LAST, l.last_message_at DESC
      LIMIT $${values.length};`,
    values,
  )

  return { rows: result.rows.map(projectRow), summary: await readSummary() }
}

/* -------------------------------------------------------------------------- */
/* One person's file                                                          */
/* -------------------------------------------------------------------------- */

type CallShape = {
  id: string
  reference: string
  title: string | null
  starts_at: Date
  ends_at: Date
  status: string
}

/**
 * The calls he has with this person. **Read-only, always.**
 *
 * Booking is finished and must not be touched — this module has no route that
 * writes to it, and this is the only query that reads it. The call's name
 * comes from its German translation, falling back to the slug, because the
 * file is his and he reads German.
 */
const listCalls = async (personId: string): Promise<BookedCall[]> => {
  const result = await getDb().query<CallShape>(
    `SELECT b.id, b.reference, t."name" AS title, b.starts_at, b.ends_at, b.status
       FROM bookings b
       JOIN booking_types bt ON bt.id = b.booking_type_id
       LEFT JOIN booking_type_translations t
              ON t.booking_type_id = bt.id AND t."language" = 'de'
      WHERE b.lead_id = $1
      ORDER BY b.starts_at DESC;`,
    [personId],
  )

  return result.rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    title: row.title ?? 'Call',
    startsAt: toIsoRequired(row.starts_at),
    endsAt: toIsoRequired(row.ends_at),
    status: row.status,
  }))
}

type FileShape = {
  id: string
  filename: string
  content_type: string
  bytes: number | string
  direction: MessageDirection
}

/**
 * Every document, both directions, in one list.
 *
 * His words: «كل ملفاته في مكان واحد» — the alternative is opening nine
 * letters looking for the one PDF. The bytes are never served from the bucket:
 * `attachmentUrl` points at the admin-guarded route, because a client's
 * Handelsregister is not a project screenshot.
 */
const listFiles = async (personId: string): Promise<Attachment[]> => {
  const result = await getDb().query<FileShape>(
    `SELECT id, filename, content_type, bytes, direction
       FROM lead_attachments WHERE lead_id = $1 ORDER BY created_at DESC;`,
    [personId],
  )

  return result.rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    contentType: row.content_type,
    bytes: toInt(row.bytes),
    direction: row.direction,
    url: attachmentUrl(row.id),
  }))
}

/**
 * The file, in one request.
 *
 * The person, their letters and their notes come straight from the inbox's own
 * `getPerson` rather than from a second query written here: one person, one
 * projection, so the two sections can never show different facts about the
 * same human being.
 */
export const getLeadFile = async (personId: string): Promise<LeadFile> => {
  const [person, deals, events, calls, files] = await Promise.all([
    getPerson(personId),
    listDeals(personId),
    listEvents(personId),
    listCalls(personId),
    listFiles(personId),
  ])

  return { person, deals, events, calls, files }
}

/* -------------------------------------------------------------------------- */
/* The board                                                                  */
/* -------------------------------------------------------------------------- */

type CardShape = DealShape & { name: string; company: string | null }

export const getBoard = async (): Promise<Board> => {
  const result = await getDb().query<CardShape>(
    `SELECT ${DEAL_COLUMNS}, l.name, l.company
       FROM deals d JOIN leads l ON l.id = d.lead_id
      ORDER BY d.follow_up_on ASC NULLS LAST, d.stage_changed_at DESC;`,
  )

  const cards: BoardCard[] = result.rows.map((row) => ({
    deal: projectDeal(row),
    personId: row.lead_id,
    personName: row.name,
    company: row.company === null || row.company.trim() === '' ? null : row.company,
  }))

  return {
    columns: DEAL_STAGES.map((stage: DealStage) => ({
      stage,
      cards: cards.filter((card) => card.deal.stage === stage),
    })),
    summary: await readSummary(),
  }
}
