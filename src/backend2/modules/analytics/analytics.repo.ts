import type {
  AnalyticsBucket,
  AnalyticsPeriod,
  BlogRankingMeasure,
  LeadOrigin,
} from '../../contracts/analytics.contract'
import { getDb } from '../../db/client'
import { toNumber } from './analytics.metric'

/**
 * Every statement Analytics runs. Read-only, and aggregate-only: each one
 * answers with counts, sums and labels computed by PostgreSQL — `count`,
 * `sum`, `GROUP BY` — never with the rows behind them. No name, email,
 * subject, note or file name is selected here, so none can reach a response.
 *
 * Each module's tables are read directly, but only here, and only their
 * stable columns; Analytics calls no other module's service and changes no
 * module's behaviour. One statement at a time, never `Promise.all`.
 *
 * Days are Berlin days: every bucket is computed with
 * `AT TIME ZONE 'Europe/Berlin'`, which is what keeps the day of a clock
 * change 23 or 25 hours long instead of shifting an hour into the neighbour.
 */

export type Window = {
  start: Date
  end: Date
  previousStart: Date
  from: string
  bucket: AnalyticsBucket
}

export const windowOf = (period: AnalyticsPeriod): Window => ({
  start: new Date(period.start),
  end: new Date(period.end),
  previousStart: new Date(period.previous.start),
  from: period.from,
  bucket: period.bucket,
})

export type SeriesRow = { bucket: string; value: number }

/**
 * The bucket a timestamp falls in, as `YYYY-MM-DD` text — text, because a
 * `date` column arrives in JavaScript as a local-time Date and could move a
 * day. A week or month that began before the period is pinned to its first
 * day. `$3` is always the period's first date.
 */
const bucketExpr = (column: string, bucket: AnalyticsBucket): string => {
  const local = `(${column} AT TIME ZONE 'Europe/Berlin')`
  const unit = bucket === 'week' ? 'week' : bucket === 'month' ? 'month' : 'day'

  return `to_char(GREATEST(date_trunc('${unit}', ${local})::date, $3::date), 'YYYY-MM-DD')`
}

const series = async (sql: {
  table: string
  column: string
  where: string
  window: Window
}): Promise<SeriesRow[]> => {
  const { rows } = await getDb().query<{ bucket: string; value: unknown }>(
    `SELECT ${bucketExpr(sql.column, sql.window.bucket)} AS bucket, count(*) AS value
       FROM ${sql.table}
      WHERE ${sql.column} >= $1 AND ${sql.column} < $2 AND ${sql.where}
      GROUP BY 1
      ORDER BY 1`,
    [sql.window.start, sql.window.end, sql.window.from],
  )

  return rows.map((row) => ({ bucket: row.bucket, value: toNumber(row.value) }))
}

const numbers = <K extends string>(row: Record<string, unknown> | undefined, keys: K[]) =>
  Object.fromEntries(keys.map((key) => [key, toNumber(row?.[key])])) as Record<K, number>

/* -------------------------------------------------------------------- leads */

/** A Lead in Trash is not counted anywhere; `origin` narrows by CSV import. */
const leadScope = (origin: LeadOrigin, alias = 'l'): string =>
  `${alias}.trashed_at IS NULL` +
  (origin === 'imported'
    ? ` AND ${alias}.import_id IS NOT NULL`
    : origin === 'manual'
      ? ` AND ${alias}.import_id IS NULL`
      : '')

export const leadCounts = async (window: Window, origin: LeadOrigin) => {
  const { rows } = await getDb().query(
    `SELECT
       count(*) FILTER (WHERE l.created_at >= $1 AND l.created_at < $2) AS new_now,
       count(*) FILTER (WHERE l.created_at >= $3 AND l.created_at < $1) AS new_prev,
       count(*) FILTER (WHERE st.kind IN ('new', 'contacted', 'custom')) AS active,
       count(*) FILTER (WHERE st.kind = 'won' AND l.won_at >= $1 AND l.won_at < $2) AS won_now,
       count(*) FILTER (WHERE st.kind = 'won' AND l.won_at >= $3 AND l.won_at < $1) AS won_prev,
       count(*) FILTER (WHERE st.kind = 'lost' AND l.lost_at >= $1 AND l.lost_at < $2) AS lost_now,
       count(*) FILTER (WHERE st.kind = 'lost' AND l.lost_at >= $3 AND l.lost_at < $1) AS lost_prev
     FROM v2_leads l
     JOIN v2_lead_stages st ON st.id = l.stage_id
    WHERE ${leadScope(origin)}`,
    [window.start, window.end, window.previousStart],
  )

  return numbers(rows[0], ['new_now', 'new_prev', 'active', 'won_now', 'won_prev', 'lost_now', 'lost_prev'])
}

export const leadNewSeries = (window: Window, origin: LeadOrigin) =>
  series({ table: 'v2_leads l', column: 'l.created_at', where: leadScope(origin), window })

/** Every stage, in the order the Leads board shows them, with its current count. */
export const leadStages = async (origin: LeadOrigin) => {
  const { rows } = await getDb().query<{ id: string; name: string; kind: string; value: unknown }>(
    `SELECT st.id, st.name, st.kind, count(l.id) AS value
       FROM v2_lead_stages st
       LEFT JOIN v2_leads l ON l.stage_id = st.id AND ${leadScope(origin)}
      GROUP BY st.id, st.name, st.kind, st.position
      ORDER BY CASE st.kind WHEN 'new' THEN 0 WHEN 'won' THEN 2 WHEN 'lost' THEN 3 ELSE 1 END,
               st.position, st.name, st.id`,
  )

  return rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, value: toNumber(row.value) }))
}

type Ranked = { rows: Array<{ id: string; name: string; value: number }>; total: number; sum: number }

/** New Leads in the period by the owner's own source label. */
export const leadSources = async (
  window: Window,
  origin: LeadOrigin,
  page: { limit: number; offset: number },
): Promise<Ranked> => {
  const where = `${leadScope(origin)} AND l.created_at >= $1 AND l.created_at < $2`
  const db = getDb()
  const { rows: counted } = await db.query(
    `SELECT count(DISTINCT l.source_id) AS total, count(*) AS sum FROM v2_leads l WHERE ${where}`,
    [window.start, window.end],
  )
  const { rows } = await db.query<{ id: string; name: string; value: unknown }>(
    `SELECT s.id, s.name, count(*) AS value
       FROM v2_leads l JOIN v2_lead_sources s ON s.id = l.source_id
      WHERE ${where}
      GROUP BY s.id, s.name
      ORDER BY count(*) DESC, lower(s.name), s.id
      LIMIT $3 OFFSET $4`,
    [window.start, window.end, page.limit, page.offset],
  )
  const totals = numbers(counted[0], ['total', 'sum'])

  return {
    rows: rows.map((row) => ({ id: row.id, name: row.name, value: toNumber(row.value) })),
    total: totals.total,
    sum: totals.sum,
  }
}

/** Leads Lost in the period, and still Lost, by the reason chosen. */
export const leadLostReasons = async (
  window: Window,
  origin: LeadOrigin,
  page: { limit: number; offset: number },
): Promise<Ranked> => {
  const from = `FROM v2_leads l
    JOIN v2_lead_stages st ON st.id = l.stage_id AND st.kind = 'lost'
    JOIN v2_lead_loss_reasons r ON r.id = l.lost_reason_id
   WHERE ${leadScope(origin)} AND l.lost_at >= $1 AND l.lost_at < $2`
  const db = getDb()
  const { rows: counted } = await db.query(
    `SELECT count(DISTINCT r.id) AS total, count(*) AS sum ${from}`,
    [window.start, window.end],
  )
  const { rows } = await db.query<{ id: string; name: string; value: unknown }>(
    `SELECT r.id, r.name, count(*) AS value ${from}
      GROUP BY r.id, r.name
      ORDER BY count(*) DESC, lower(r.name), r.id
      LIMIT $3 OFFSET $4`,
    [window.start, window.end, page.limit, page.offset],
  )
  const totals = numbers(counted[0], ['total', 'sum'])

  return {
    rows: rows.map((row) => ({ id: row.id, name: row.name, value: toNumber(row.value) })),
    total: totals.total,
    sum: totals.sum,
  }
}

/** Open follow-ups of Leads not in Trash — the same rule as the Leads badge. */
export const leadFollowUps = async (now: Date, origin: LeadOrigin) => {
  const { rows } = await getDb().query(
    `SELECT
       count(*) FILTER (WHERE f.due_at <= $1::timestamptz) AS due,
       count(*) FILTER (WHERE f.due_at > $1::timestamptz
                          AND f.due_at <= $1::timestamptz + interval '7 days') AS next_week
     FROM v2_lead_follow_ups f
     JOIN v2_leads l ON l.id = f.lead_id
    WHERE f.status = 'open' AND ${leadScope(origin)}`,
    [now],
  )

  return numbers(rows[0], ['due', 'next_week'])
}

/* ------------------------------------------------------------------ clients */

/**
 * "From a Lead" means a `created` link: that Lead's Won made this Client. A
 * `linked` link joined a Client that already existed, so it is direct.
 */
export const clientCounts = async (window: Window) => {
  const { rows } = await getDb().query(
    `WITH c AS (
       SELECT c.created_at, c.status,
              EXISTS (SELECT 1 FROM v2_client_lead_links k
                       WHERE k.client_id = c.id AND k.how = 'created') AS from_lead
         FROM v2_clients c
        WHERE c.trashed_at IS NULL
     )
     SELECT
       count(*) FILTER (WHERE created_at >= $1 AND created_at < $2) AS new_now,
       count(*) FILTER (WHERE created_at >= $3 AND created_at < $1) AS new_prev,
       count(*) FILTER (WHERE created_at >= $1 AND created_at < $2 AND from_lead) AS from_lead_now,
       count(*) FILTER (WHERE status = 'active') AS active,
       count(*) FILTER (WHERE status = 'inactive') AS inactive
     FROM c`,
    [window.start, window.end, window.previousStart],
  )

  return numbers(rows[0], ['new_now', 'new_prev', 'from_lead_now', 'active', 'inactive'])
}

export const clientNewSeries = (window: Window) =>
  series({ table: 'v2_clients c', column: 'c.created_at', where: 'c.trashed_at IS NULL', window })

/* ------------------------------------------------------------------ booking */

/**
 * By when the appointment *takes place*, with its current status. A status
 * belongs to the meeting, so a meeting in the period that was cancelled
 * counts as cancelled, whenever the cancellation happened. `booked_*` counts
 * by when the booking was made.
 */
export const bookingCounts = async (window: Window, now: Date) => {
  const { rows } = await getDb().query(
    `SELECT
       count(*) FILTER (WHERE starts_at >= $1 AND starts_at < $2 AND status = 'confirmed') AS confirmed_now,
       count(*) FILTER (WHERE starts_at >= $1 AND starts_at < $2 AND status = 'completed') AS completed_now,
       count(*) FILTER (WHERE starts_at >= $1 AND starts_at < $2 AND status = 'cancelled') AS cancelled_now,
       count(*) FILTER (WHERE starts_at >= $1 AND starts_at < $2 AND status = 'no_show') AS no_show_now,
       count(*) FILTER (WHERE starts_at >= $3 AND starts_at < $1 AND status = 'completed') AS completed_prev,
       count(*) FILTER (WHERE starts_at >= $3 AND starts_at < $1 AND status = 'cancelled') AS cancelled_prev,
       count(*) FILTER (WHERE starts_at >= $3 AND starts_at < $1 AND status = 'no_show') AS no_show_prev,
       count(*) FILTER (WHERE created_at >= $1 AND created_at < $2) AS booked_now,
       count(*) FILTER (WHERE created_at >= $3 AND created_at < $1) AS booked_prev,
       count(*) FILTER (WHERE created_at >= $1 AND created_at < $2 AND source = 'public') AS booked_online_now,
       count(*) FILTER (WHERE created_at >= $3 AND created_at < $1 AND source = 'public') AS booked_online_prev,
       count(*) FILTER (WHERE status = 'confirmed' AND starts_at >= $4::timestamptz
                        AND starts_at < $4::timestamptz + interval '7 days') AS upcoming
     FROM v2_booking_appointments`,
    [window.start, window.end, window.previousStart, now],
  )

  return numbers(rows[0], [
    'confirmed_now',
    'completed_now',
    'cancelled_now',
    'no_show_now',
    'completed_prev',
    'cancelled_prev',
    'no_show_prev',
    'booked_now',
    'booked_prev',
    'booked_online_now',
    'booked_online_prev',
    'upcoming',
  ])
}

/** The overview's glimpse, on its own so a Booking failure stays its own. */
export const bookingUpcoming = async (now: Date): Promise<number> => {
  const { rows } = await getDb().query(
    `SELECT count(*) AS upcoming FROM v2_booking_appointments
      WHERE status = 'confirmed' AND starts_at >= $1::timestamptz
        AND starts_at < $1::timestamptz + interval '7 days'`,
    [now],
  )

  return toNumber(rows[0]?.upcoming)
}

export const bookingMadeSeries = (window: Window) =>
  series({ table: 'v2_booking_appointments a', column: 'a.created_at', where: 'true', window })

/** How the appointments in the period meet. Cancelled ones did not meet. */
export const bookingMethods = async (window: Window) => {
  const { rows } = await getDb().query<{ method: string; value: unknown }>(
    `SELECT method, count(*) AS value FROM v2_booking_appointments
      WHERE starts_at >= $1 AND starts_at < $2 AND status <> 'cancelled'
      GROUP BY method`,
    [window.start, window.end],
  )

  return new Map(rows.map((row) => [row.method, toNumber(row.value)]))
}

/* -------------------------------------------------------------------- inbox */

/**
 * Unread is the Inbox's own rule: unread conversations in the Inbox folder,
 * not Archived and not Trash. "New" is a conversation someone else started.
 */
export const inboxCounts = async (window: Window) => {
  const { rows } = await getDb().query(
    `SELECT
       count(*) FILTER (WHERE folder = 'inbox' AND is_read = false) AS unread,
       count(*) FILTER (WHERE origin <> 'outgoing' AND created_at >= $1 AND created_at < $2) AS new_now,
       count(*) FILTER (WHERE origin <> 'outgoing' AND created_at >= $3 AND created_at < $1) AS new_prev,
       count(*) FILTER (WHERE origin = 'incoming' AND created_at >= $1 AND created_at < $2) AS incoming_now,
       count(*) FILTER (WHERE origin = 'contact' AND created_at >= $1 AND created_at < $2) AS contact_now,
       count(*) FILTER (WHERE origin = 'booking' AND created_at >= $1 AND created_at < $2) AS booking_now,
       count(*) FILTER (WHERE origin = 'outgoing' AND created_at >= $1 AND created_at < $2) AS outgoing_now
     FROM v2_inbox_conversations`,
    [window.start, window.end, window.previousStart],
  )

  return numbers(rows[0], [
    'unread',
    'new_now',
    'new_prev',
    'incoming_now',
    'contact_now',
    'booking_now',
    'outgoing_now',
  ])
}

export const inboxUnread = async (): Promise<number> => {
  const { rows } = await getDb().query(
    `SELECT count(*) AS unread FROM v2_inbox_conversations WHERE folder = 'inbox' AND is_read = false`,
  )

  return toNumber(rows[0]?.unread)
}

export const inboxNewSeries = (window: Window) =>
  series({ table: 'v2_inbox_conversations c', column: 'c.created_at', where: `c.origin <> 'outgoing'`, window })

/* -------------------------------------------------------------------- media */

export const mediaCounts = async (window: Window) => {
  const { rows } = await getDb().query(
    `SELECT
       count(*) AS files,
       COALESCE(sum(byte_size), 0) AS bytes,
       count(*) FILTER (WHERE created_at >= $1 AND created_at < $2) AS added_now,
       count(*) FILTER (WHERE created_at >= $3 AND created_at < $1) AS added_prev,
       count(*) FILTER (WHERE kind = 'image') AS images,
       count(*) FILTER (WHERE kind = 'video') AS videos,
       count(*) FILTER (WHERE kind = 'document') AS documents,
       COALESCE(sum(byte_size) FILTER (WHERE kind = 'image'), 0) AS image_bytes,
       COALESCE(sum(byte_size) FILTER (WHERE kind = 'video'), 0) AS video_bytes,
       COALESCE(sum(byte_size) FILTER (WHERE kind = 'document'), 0) AS document_bytes,
       (SELECT count(DISTINCT asset_id) FROM v2_media_references WHERE scope = 'published') AS public_files
     FROM v2_media_assets`,
    [window.start, window.end, window.previousStart],
  )

  return numbers(rows[0], [
    'files',
    'bytes',
    'added_now',
    'added_prev',
    'images',
    'videos',
    'documents',
    'image_bytes',
    'video_bytes',
    'document_bytes',
    'public_files',
  ])
}

/* --------------------------------------------------------------------- blog */

export const blogCounts = async (window: Window) => {
  const db = getDb()
  const { rows: posts } = await db.query(
    `SELECT
       count(*) FILTER (WHERE published_version_id IS NOT NULL) AS live,
       count(*) FILTER (WHERE first_published_at >= $1 AND first_published_at < $2) AS first_now,
       count(*) FILTER (WHERE first_published_at >= $3 AND first_published_at < $1) AS first_prev,
       COALESCE(sum(read_count), 0) AS reads,
       COALESCE(sum(like_count), 0) AS likes
     FROM v2_blog_posts`,
    [window.start, window.end, window.previousStart],
  )
  const { rows: comments } = await db.query(
    `SELECT
       count(*) FILTER (WHERE author = 'visitor' AND created_at >= $1 AND created_at < $2) AS comments_now,
       count(*) FILTER (WHERE author = 'visitor' AND created_at >= $3 AND created_at < $1) AS comments_prev,
       count(*) FILTER (WHERE seen_at IS NULL) AS unseen
     FROM v2_blog_comments`,
    [window.start, window.end, window.previousStart],
  )

  return {
    ...numbers(posts[0], ['live', 'first_now', 'first_prev', 'reads', 'likes']),
    ...numbers(comments[0], ['comments_now', 'comments_prev', 'unseen']),
  }
}

export const blogCommentSeries = (window: Window) =>
  series({ table: 'v2_blog_comments c', column: 'c.created_at', where: `c.author = 'visitor'`, window })

/**
 * Articles that have ever been published, by one measure. Reads and likes
 * are the article's running totals (the Blog keeps no dates for them);
 * comments are visitor comments written in the period. The label is the
 * article's title — from its live version first, then a kept published or
 * scheduled one, then its draft; English first, then German, then Arabic.
 */
export const blogPostRanking = async (
  window: Window,
  by: BlogRankingMeasure,
  page: { limit: number; offset: number },
): Promise<{ rows: Array<{ id: string; name: string; value: number }>; total: number }> => {
  // Only the comment count looks at the period, so only it takes its bounds.
  const value =
    by === 'reads'
      ? 'p.read_count'
      : by === 'likes'
        ? 'p.like_count'
        : `(SELECT count(*) FROM v2_blog_comments c
             WHERE c.post_id = p.id AND c.author = 'visitor'
               AND c.created_at >= $3 AND c.created_at < $4)`
  const values: unknown[] = [page.limit, page.offset]

  if (by === 'comments') values.push(window.start, window.end)

  const db = getDb()
  const { rows: counted } = await db.query(
    'SELECT count(*) AS total FROM v2_blog_posts p WHERE p.first_published_at IS NOT NULL',
  )
  const { rows } = await db.query<{ id: string; name: string | null; value: unknown }>(
    `SELECT p.id, title.title AS name, ${value} AS value
       FROM v2_blog_posts p
       LEFT JOIN LATERAL (
         SELECT t.title
           FROM v2_blog_post_versions v
           JOIN v2_blog_post_texts t ON t.version_id = v.id
          WHERE v.post_id = p.id AND btrim(t.title) <> ''
          ORDER BY CASE WHEN v.id = p.published_version_id THEN 0
                        WHEN v.kind = 'published' THEN 1
                        WHEN v.kind = 'scheduled' THEN 2
                        ELSE 3 END,
                   CASE t.language WHEN 'en' THEN 0 WHEN 'de' THEN 1 ELSE 2 END
          LIMIT 1
       ) title ON true
      WHERE p.first_published_at IS NOT NULL
      ORDER BY 3 DESC, lower(COALESCE(title.title, '')), p.id
      LIMIT $1 OFFSET $2`,
    values,
  )

  return {
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name ?? 'Untitled article',
      value: toNumber(row.value),
    })),
    total: toNumber(counted[0]?.total),
  }
}

/* ------------------------------------------------------ projects & services */

export const catalogueCounts = async () => {
  const db = getDb()
  const { rows: projects } = await db.query(
    `SELECT
       count(*) FILTER (WHERE lifecycle = 'active' AND published_version_id IS NOT NULL) AS projects_live,
       count(*) FILTER (WHERE lifecycle = 'active' AND published_version_id IS NULL) AS projects_unpublished,
       count(*) FILTER (WHERE lifecycle = 'archived') AS projects_archived
     FROM v2_projects`,
  )
  const { rows: services } = await db.query(
    `SELECT
       count(*) FILTER (WHERE published_version_id IS NOT NULL) AS services_live,
       count(*) FILTER (WHERE published_version_id IS NULL) AS services_unpublished
     FROM v2_services`,
  )

  return {
    ...numbers(projects[0], ['projects_live', 'projects_unpublished', 'projects_archived']),
    ...numbers(services[0], ['services_live', 'services_unpublished']),
  }
}
