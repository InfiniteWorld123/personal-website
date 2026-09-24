import { getDb } from '../../db/client'

/**
 * One bounded, read-only query per section. Each returns at most `limit + 1`
 * rows, so the caller can say "there is more" without counting everything.
 *
 * Matching is a case-insensitive substring (`ILIKE`) on the fields the owner
 * would recognise a record by. At a single owner's scale that is fast and
 * predictable, and it behaves the same for German, English and Arabic.
 */

export type Row = { id: string; title: string; subtitle: string | null; badge: string | null }

/** `%` and `_` typed by the owner are letters, not wildcards. */
export const likePattern = (q: string): string => `%${q.replace(/[\\%_]/gu, (c) => `\\${c}`)}%`

const run = async (sql: string, q: string, limit: number): Promise<Row[]> =>
  (await getDb().query<Row>(sql, [likePattern(q), limit + 1])).rows

export const clients = (q: string, limit: number) =>
  run(
    `SELECT id, COALESCE(NULLIF(company_name, ''), name) AS title,
            concat_ws(' · ', CASE WHEN company_name <> '' THEN name END, email) AS subtitle,
            CASE WHEN status = 'inactive' THEN 'Inactive' END AS badge
       FROM v2_clients
      WHERE trashed_at IS NULL
        AND (name ILIKE $1 ESCAPE '\\' OR company_name ILIKE $1 ESCAPE '\\' OR email ILIKE $1 ESCAPE '\\' OR phone ILIKE $1 ESCAPE '\\')
      ORDER BY lower(COALESCE(NULLIF(company_name, ''), name)), id
      LIMIT $2`,
    q,
    limit,
  )

export const leads = (q: string, limit: number) =>
  run(
    `SELECT l.id, l.name AS title, concat_ws(' · ', NULLIF(l.company, ''), l.email) AS subtitle, s.name AS badge
       FROM v2_leads l JOIN v2_lead_stages s ON s.id = l.stage_id
      WHERE l.trashed_at IS NULL
        AND (l.name ILIKE $1 ESCAPE '\\' OR l.company ILIKE $1 ESCAPE '\\' OR l.email ILIKE $1 ESCAPE '\\' OR l.phone ILIKE $1 ESCAPE '\\')
      ORDER BY l.created_at DESC, l.id
      LIMIT $2`,
    q,
    limit,
  )

export const invoices = (q: string, limit: number) =>
  run(
    `SELECT id,
            COALESCE(number, 'Draft') || ' — ' || COALESCE(NULLIF(recipient_company, ''), NULLIF(recipient_name, ''), 'No client yet') AS title,
            concat_ws(' · ', CASE WHEN kind = 'cancellation' THEN 'Cancellation' END, initcap(status),
                      to_char(total_minor / 100.0, 'FM999G999G990D00') || ' ' || currency) AS subtitle,
            CASE WHEN mode = 'test' THEN 'TEST' END AS badge
       FROM v2_invoices
      WHERE number ILIKE $1 ESCAPE '\\' OR recipient_name ILIKE $1 ESCAPE '\\' OR recipient_company ILIKE $1 ESCAPE '\\'
         OR recipient_email ILIKE $1 ESCAPE '\\' OR title ILIKE $1 ESCAPE '\\'
      ORDER BY created_at DESC, id
      LIMIT $2`,
    q,
    limit,
  )

export const subscriptions = (q: string, limit: number) =>
  run(
    `SELECT s.id, s.description AS title,
            concat_ws(' · ', COALESCE(NULLIF(c.company_name, ''), c.name), initcap(s.status), s.billing_interval) AS subtitle,
            CASE WHEN s.mode = 'test' THEN 'TEST' END AS badge
       FROM v2_subscriptions s JOIN v2_clients c ON c.id = s.client_id
      WHERE s.description ILIKE $1 ESCAPE '\\' OR c.name ILIKE $1 ESCAPE '\\' OR c.company_name ILIKE $1 ESCAPE '\\'
      ORDER BY s.created_at DESC, s.id
      LIMIT $2`,
    q,
    limit,
  )

/**
 * The subject and the other person, and the words of any message in it. The
 * result shows the conversation's own stored preview, never the matched text,
 * so a search never surfaces more of a private message than the Inbox list.
 */
export const inbox = (q: string, limit: number) =>
  run(
    `SELECT c.id, COALESCE(NULLIF(c.subject, ''), '(no subject)') AS title,
            concat_ws(' · ', COALESCE(NULLIF(c.counterpart_name, ''), c.counterpart_email), NULLIF(c.last_preview, '')) AS subtitle,
            CASE WHEN c.folder = 'archived' THEN 'Archived' WHEN NOT c.is_read THEN 'Unread' END AS badge
       FROM v2_inbox_conversations c
      WHERE c.folder <> 'trash' AND (c.subject ILIKE $1 ESCAPE '\\' OR c.counterpart_email ILIKE $1 ESCAPE '\\' OR c.counterpart_name ILIKE $1 ESCAPE '\\'
         OR EXISTS (SELECT 1 FROM v2_inbox_messages m WHERE m.conversation_id = c.id AND m.body_text ILIKE $1 ESCAPE '\\'))
      ORDER BY c.last_message_at DESC NULLS LAST, c.id
      LIMIT $2`,
    q,
    limit,
  )

export const calendar = (q: string, limit: number) =>
  run(
    `SELECT id, visitor_name || ' — ' || type_name AS title,
            concat_ws(' · ', to_char(starts_at AT TIME ZONE 'Europe/Berlin', 'DD Mon YYYY, HH24:MI'), reference) AS subtitle,
            CASE status WHEN 'cancelled' THEN 'Cancelled' WHEN 'completed' THEN 'Completed' WHEN 'no_show' THEN 'No-show' END AS badge
       FROM v2_booking_appointments
      WHERE visitor_name ILIKE $1 ESCAPE '\\' OR visitor_email ILIKE $1 ESCAPE '\\' OR reference ILIKE $1 ESCAPE '\\' OR company ILIKE $1 ESCAPE '\\'
      ORDER BY starts_at DESC, id
      LIMIT $2`,
    q,
    limit,
  )

/** The owner's working copy (the draft) is what the Dashboard edits, so that is what is searched. */
export const blog = (q: string, limit: number) =>
  run(
    `SELECT p.id, t.title, concat_ws(' · ', t.language, v.slug) AS subtitle,
            CASE WHEN p.published_version_id IS NULL THEN 'Draft' END AS badge
       FROM v2_blog_posts p
       JOIN LATERAL (
              SELECT tx.title, tx.language FROM v2_blog_post_texts tx
               WHERE tx.version_id = COALESCE(p.draft_version_id, p.scheduled_version_id, p.published_version_id) AND (tx.title ILIKE $1 ESCAPE '\\' OR tx.summary ILIKE $1 ESCAPE '\\')
               ORDER BY CASE tx.language WHEN 'en' THEN 0 WHEN 'de' THEN 1 ELSE 2 END LIMIT 1
            ) t ON true
       JOIN v2_blog_post_versions v ON v.id = COALESCE(p.draft_version_id, p.scheduled_version_id, p.published_version_id)
      ORDER BY p.updated_at DESC, p.id
      LIMIT $2`,
    q,
    limit,
  )

export const projects = (q: string, limit: number) =>
  run(
    `SELECT p.id, t.name AS title, concat_ws(' · ', t.category_label, v.slug) AS subtitle,
            CASE WHEN p.lifecycle = 'archived' THEN 'Archived' WHEN p.published_version_id IS NULL THEN 'Draft' END AS badge
       FROM v2_projects p
       JOIN LATERAL (
              SELECT tx.name, tx.category_label FROM v2_project_texts tx
               WHERE tx.version_id = COALESCE(p.draft_version_id, p.published_version_id)
                 AND (tx.name ILIKE $1 ESCAPE '\\' OR tx.summary ILIKE $1 ESCAPE '\\' OR tx.category_label ILIKE $1 ESCAPE '\\')
               ORDER BY CASE tx.language WHEN 'en' THEN 0 WHEN 'de' THEN 1 ELSE 2 END LIMIT 1
            ) t ON true
       JOIN v2_project_versions v ON v.id = COALESCE(p.draft_version_id, p.published_version_id)
      ORDER BY p.position, p.id
      LIMIT $2`,
    q,
    limit,
  )

export const services = (q: string, limit: number) =>
  run(
    `SELECT s.id, t.name AS title, v.slug AS subtitle,
            CASE WHEN s.published_version_id IS NULL THEN 'Draft' END AS badge
       FROM v2_services s
       JOIN LATERAL (
              SELECT tx.name FROM v2_service_texts tx
               WHERE tx.version_id = COALESCE(s.draft_version_id, s.published_version_id) AND (tx.name ILIKE $1 ESCAPE '\\' OR tx.summary ILIKE $1 ESCAPE '\\')
               ORDER BY CASE tx.language WHEN 'en' THEN 0 WHEN 'de' THEN 1 ELSE 2 END LIMIT 1
            ) t ON true
       JOIN v2_service_versions v ON v.id = COALESCE(s.draft_version_id, s.published_version_id)
      ORDER BY s.position, s.id
      LIMIT $2`,
    q,
    limit,
  )

export const media = (q: string, limit: number) =>
  run(
    `SELECT id, COALESCE(NULLIF(display_name, ''), original_name) AS title,
            concat_ws(' · ', kind, pg_size_pretty(byte_size::bigint)) AS subtitle, NULL AS badge
       FROM v2_media_assets
      WHERE display_name ILIKE $1 ESCAPE '\\' OR original_name ILIKE $1 ESCAPE '\\'
      ORDER BY created_at DESC, id
      LIMIT $2`,
    q,
    limit,
  )
