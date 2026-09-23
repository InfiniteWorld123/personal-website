import { getDb } from '../../db/client'
import { phoneKey } from '../../contracts/client.contract'
import type { LeadFields, LeadListQuery, StageKind } from '../../contracts/lead.contract'

/**
 * Every statement a Lead runs, against `0011_leads.sql`. No business rule
 * lives here and no HTTP concept reaches it. One query at a time, never
 * `Promise.all`.
 */

export type LeadRow = {
  id: string
  name: string
  email: string
  email_key: string
  phone: string
  phone_key: string
  country_code: string
  company: string
  notes: string
  source_id: string
  niche_id: string | null
  stage_id: string
  stage_changed_at: Date
  lost_reason_id: string | null
  lost_reason_text: string
  lost_notes: string
  lost_at: Date | null
  won_at: Date | null
  import_id: string | null
  trashed_at: Date | null
  revision: number
  created_at: Date
  updated_at: Date
  // Joined for reading.
  source_name?: string
  niche_name?: string | null
  stage_kind?: StageKind
  stage_name?: string
  lost_reason_name?: string | null
}

export type FollowUpRow = {
  id: string
  lead_id: string
  due_at: Date
  note: string
  status: 'open' | 'done' | 'cancelled'
  closed_how: 'completed' | 'cancelled' | 'lost' | 'won' | null
  closed_at: Date | null
  created_at: Date
}

const READ = `l.*,
  src.name AS source_name,
  n.name AS niche_name,
  st.kind AS stage_kind,
  st.name AS stage_name,
  lr.name AS lost_reason_name`

const JOINS = `FROM v2_leads l
  JOIN v2_lead_sources src ON src.id = l.source_id
  JOIN v2_lead_stages st ON st.id = l.stage_id
  LEFT JOIN v2_niches n ON n.id = l.niche_id
  LEFT JOIN v2_lead_loss_reasons lr ON lr.id = l.lost_reason_id`

/* ------------------------------------------------------------------ one lead */

export const findLead = async (id: string): Promise<LeadRow | null> => {
  const { rows } = await getDb().query<LeadRow>(`SELECT ${READ} ${JOINS} WHERE l.id = $1`, [id])

  return rows[0] ?? null
}

export const lockLead = async (id: string): Promise<LeadRow | null> => {
  const { rows } = await getDb().query<LeadRow>('SELECT * FROM v2_leads WHERE id = $1 FOR UPDATE', [
    id,
  ])

  return rows[0] ?? null
}

export const insertLead = async (
  fields: LeadFields,
  extra: { stageId: string; importId?: string | null },
): Promise<string> => {
  const { rows } = await getDb().query<{ id: string }>(
    `INSERT INTO v2_leads
       (name, email, phone, phone_key, country_code, company, notes, source_id, niche_id, stage_id, import_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      fields.name,
      fields.email,
      fields.phone,
      phoneKey(fields.phone),
      fields.country,
      fields.company,
      fields.notes,
      fields.sourceId,
      fields.nicheId,
      extra.stageId,
      extra.importId ?? null,
    ],
  )

  return rows[0]!.id
}

export const writeLead = async (id: string, fields: LeadFields): Promise<void> => {
  await getDb().query(
    `UPDATE v2_leads
        SET name = $2, email = $3, phone = $4, phone_key = $5, country_code = $6, company = $7,
            notes = $8, source_id = $9, niche_id = $10,
            revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [
      id,
      fields.name,
      fields.email,
      fields.phone,
      phoneKey(fields.phone),
      fields.country,
      fields.company,
      fields.notes,
      fields.sourceId,
      fields.nicheId,
    ],
  )
}

/** A stage move. Not a change to the file's contents, so no revision. */
export const writeStage = async (
  id: string,
  input: {
    stageId: string
    lost?: { reasonId: string; reasonText: string; notes: string }
    won?: boolean
  },
): Promise<void> => {
  await getDb().query(
    `UPDATE v2_leads
        SET stage_id = $2,
            stage_changed_at = CURRENT_TIMESTAMP,
            lost_reason_id = CASE WHEN $3::uuid IS NOT NULL THEN $3::uuid ELSE lost_reason_id END,
            lost_reason_text = CASE WHEN $3::uuid IS NOT NULL THEN $4 ELSE lost_reason_text END,
            lost_notes = CASE WHEN $3::uuid IS NOT NULL THEN $5 ELSE lost_notes END,
            lost_at = CASE WHEN $3::uuid IS NOT NULL THEN CURRENT_TIMESTAMP ELSE lost_at END,
            won_at = CASE WHEN $6 THEN CURRENT_TIMESTAMP ELSE won_at END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [
      id,
      input.stageId,
      input.lost?.reasonId ?? null,
      input.lost?.reasonText ?? '',
      input.lost?.notes ?? '',
      input.won === true,
    ],
  )
}

export const setTrashed = async (id: string, trashed: boolean): Promise<void> => {
  await getDb().query(
    `UPDATE v2_leads
        SET trashed_at = CASE WHEN $2 THEN COALESCE(trashed_at, CURRENT_TIMESTAMP) ELSE NULL END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [id, trashed],
  )
}

export const deleteLead = async (id: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_leads WHERE id = $1', [id])
}

/* ------------------------------------------------------------------- lists */

const likePattern = (text: string): string => `%${text.replace(/[\\%_]/gu, (c) => `\\${c}`)}%`

export const listLeads = async (
  query: LeadListQuery,
): Promise<{ rows: LeadRow[]; total: number }> => {
  const where: string[] = []
  const values: unknown[] = []
  const add = (value: unknown) => {
    values.push(value)

    return `$${values.length}`
  }

  if (query.view === 'trash') {
    where.push('l.trashed_at IS NOT NULL')
  } else {
    where.push('l.trashed_at IS NULL')
    if (query.view === 'active') where.push(`st.kind IN ('new', 'contacted', 'custom')`)
    if (query.view === 'won') where.push(`st.kind = 'won'`)
    if (query.view === 'lost') where.push(`st.kind = 'lost'`)
  }

  if (query.stage) where.push(`l.stage_id = ${add(query.stage)}`)
  if (query.source) where.push(`l.source_id = ${add(query.source)}`)
  if (query.niche) where.push(`l.niche_id = ${add(query.niche)}`)
  if (query.country) where.push(`l.country_code = ${add(query.country)}`)

  if (query.search !== '') {
    const pattern = add(likePattern(query.search))
    const digits = query.search.replace(/\D/gu, '')
    const phoneMatch = digits.length >= 3 ? ` OR l.phone_key LIKE ${add(likePattern(digits))}` : ''

    where.push(
      `(l.name ILIKE ${pattern} OR l.company ILIKE ${pattern} OR l.email ILIKE ${pattern}${phoneMatch})`,
    )
  }

  const clause = `WHERE ${where.join(' AND ')}`
  const db = getDb()
  const { rows: counted } = await db.query<{ total: string | number }>(
    `SELECT count(*) AS total ${JOINS} ${clause}`,
    values,
  )

  // Newest first; Trash most recently trashed first. The id breaks ties.
  // Won and Lost read as outcomes: the most recent one first.
  const order =
    query.view === 'trash'
      ? 'l.trashed_at DESC, l.id'
      : query.view === 'won' || query.view === 'lost'
        ? 'l.stage_changed_at DESC, l.id'
        : 'l.created_at DESC, l.id'
  const limit = add(query.pageSize)
  const offset = add((query.page - 1) * query.pageSize)
  const { rows } = await db.query<LeadRow>(
    `SELECT ${READ} ${JOINS} ${clause} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
    values,
  )

  return { rows, total: Number(counted[0]?.total ?? 0) }
}

export const findMatches = async (input: {
  emailKey: string
  phoneKey: string
  excludeId?: string
  limit: number
}): Promise<LeadRow[]> => {
  if (input.emailKey === '' && input.phoneKey === '') return []

  const { rows } = await getDb().query<LeadRow>(
    `SELECT ${READ} ${JOINS}
      WHERE ((l.email_key = $1 AND $1 <> '') OR (l.phone_key = $2 AND $2 <> ''))
        AND ($3::uuid IS NULL OR l.id <> $3::uuid)
      ORDER BY l.trashed_at IS NOT NULL, l.created_at, l.id
      LIMIT $4`,
    [input.emailKey, input.phoneKey, input.excludeId ?? null, input.limit],
  )

  return rows
}

/** Every email and phone already on file, for checking a whole CSV at once. */
export const existingKeys = async (
  emailKeys: string[],
  phoneKeys: string[],
): Promise<{ emails: Set<string>; phones: Set<string> }> => {
  const { rows } = await getDb().query<{ email_key: string; phone_key: string }>(
    `SELECT email_key, phone_key FROM v2_leads
      WHERE email_key = ANY($1::text[]) OR phone_key = ANY($2::text[])`,
    [emailKeys, phoneKeys],
  )

  return {
    emails: new Set(rows.map((row) => row.email_key)),
    phones: new Set(rows.map((row) => row.phone_key)),
  }
}

/* --------------------------------------------------------------- follow-ups */

export const openFollowUp = async (leadId: string): Promise<FollowUpRow | null> => {
  const { rows } = await getDb().query<FollowUpRow>(
    `SELECT * FROM v2_lead_follow_ups WHERE lead_id = $1 AND status = 'open'`,
    [leadId],
  )

  return rows[0] ?? null
}

export const openFollowUps = async (leadIds: string[]): Promise<Map<string, FollowUpRow>> => {
  if (leadIds.length === 0) return new Map()

  const { rows } = await getDb().query<FollowUpRow>(
    `SELECT * FROM v2_lead_follow_ups WHERE lead_id = ANY($1::uuid[]) AND status = 'open'`,
    [leadIds],
  )

  return new Map(rows.map((row) => [row.lead_id, row]))
}

export const closedFollowUps = async (leadId: string, limit: number): Promise<FollowUpRow[]> => {
  const { rows } = await getDb().query<FollowUpRow>(
    `SELECT * FROM v2_lead_follow_ups WHERE lead_id = $1 AND status <> 'open'
      ORDER BY closed_at DESC, id LIMIT $2`,
    [leadId, limit],
  )

  return rows
}

export const insertFollowUp = async (input: {
  leadId: string
  dueAt: Date
  note: string
}): Promise<void> => {
  await getDb().query(
    'INSERT INTO v2_lead_follow_ups (lead_id, due_at, note) VALUES ($1, $2, $3)',
    [input.leadId, input.dueAt, input.note],
  )
}

export const updateFollowUp = async (
  id: string,
  patch: { dueAt: Date; note: string },
): Promise<void> => {
  await getDb().query(
    'UPDATE v2_lead_follow_ups SET due_at = $2, note = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [id, patch.dueAt, patch.note],
  )
}

export const closeFollowUp = async (
  id: string,
  how: 'completed' | 'cancelled' | 'lost' | 'won',
): Promise<void> => {
  await getDb().query(
    `UPDATE v2_lead_follow_ups
        SET status = $2, closed_how = $3, closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'open'`,
    [id, how === 'completed' ? 'done' : 'cancelled', how],
  )
}

/** Open follow-ups of Leads not in Trash, soonest first. */
export const listOpenFollowUps = async (input: {
  when: 'due' | 'upcoming' | 'all'
  page: number
  pageSize: number
}): Promise<{
  rows: Array<FollowUpRow & { lead_name: string; lead_company: string; stage_name: string }>
  total: number
}> => {
  const when =
    input.when === 'due'
      ? 'AND f.due_at <= CURRENT_TIMESTAMP'
      : input.when === 'upcoming'
        ? 'AND f.due_at > CURRENT_TIMESTAMP'
        : ''
  const base = `FROM v2_lead_follow_ups f
    JOIN v2_leads l ON l.id = f.lead_id
    JOIN v2_lead_stages st ON st.id = l.stage_id
    WHERE f.status = 'open' AND l.trashed_at IS NULL ${when}`
  const db = getDb()
  const { rows: counted } = await db.query<{ total: string | number }>(
    `SELECT count(*) AS total ${base}`,
  )
  const { rows } = await db.query<
    FollowUpRow & { lead_name: string; lead_company: string; stage_name: string }
  >(
    `SELECT f.*, l.name AS lead_name, l.company AS lead_company, st.name AS stage_name ${base}
      ORDER BY f.due_at, f.id LIMIT $1 OFFSET $2`,
    [input.pageSize, (input.page - 1) * input.pageSize],
  )

  return { rows, total: Number(counted[0]?.total ?? 0) }
}

export const countDueFollowUps = async (): Promise<number> => {
  const { rows } = await getDb().query<{ total: string | number }>(
    `SELECT count(*) AS total FROM v2_lead_follow_ups f JOIN v2_leads l ON l.id = f.lead_id
      WHERE f.status = 'open' AND l.trashed_at IS NULL AND f.due_at <= CURRENT_TIMESTAMP`,
  )

  return Number(rows[0]?.total ?? 0)
}

/* ------------------------------------------------------------ client link */

export const linkedClient = async (
  leadId: string,
): Promise<{
  id: string
  kind: 'person' | 'company'
  name: string
  company_name: string
  trashed_at: Date | null
} | null> => {
  const { rows } = await getDb().query<{
    id: string
    kind: 'person' | 'company'
    name: string
    company_name: string
    trashed_at: Date | null
  }>(
    `SELECT c.id, c.kind, c.name, c.company_name, c.trashed_at
       FROM v2_client_lead_links k JOIN v2_clients c ON c.id = k.client_id
      WHERE k.lead_id = $1`,
    [leadId],
  )

  return rows[0] ?? null
}
