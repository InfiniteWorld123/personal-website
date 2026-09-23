import { getDb } from '../../db/client'
import {
  type ClientFields,
  type ClientKind,
  type ClientListQuery,
  type ClientStatus,
  phoneKey,
} from '../../contracts/client.contract'

/**
 * Every statement Clients runs, against the shape `0008_clients.sql`
 * installed. No business rule lives here and no HTTP concept reaches it.
 *
 * Queries run one after another, never `Promise.all`: a Cloudflare Worker may
 * hold six sockets at once, and the local development database answers one
 * connection at a time.
 */

export type ClientRow = {
  id: string
  kind: ClientKind
  name: string
  email: string
  email_key: string
  phone: string
  phone_key: string
  country_code: string
  company_name: string
  niche_id: string | null
  /** Joined for reading; absent on a row locked for writing. */
  niche_name?: string | null
  notes: string
  status: ClientStatus
  trashed_at: Date | null
  revision: number
  created_at: Date
  updated_at: Date
}

export type LeadLinkRow = {
  lead_id: string
  client_id: string
  how: 'created' | 'linked'
  linked_at: Date
  /** Null once the Lead is deleted: the link row stays as the Client's history. */
  lead_name: string | null
}

/** Every column, plus the niche's name for reading. */
const READ_COLUMNS = `v2_clients.*,
  (SELECT n.name FROM v2_niches n WHERE n.id = v2_clients.niche_id) AS niche_name`

/* ---------------------------------------------------------------- one client */

export const findClient = async (id: string): Promise<ClientRow | null> => {
  const { rows } = await getDb().query<ClientRow>(
    `SELECT ${READ_COLUMNS} FROM v2_clients WHERE id = $1`,
    [id],
  )

  return rows[0] ?? null
}

/** The same row, locked until the transaction ends. */
export const lockClient = async (id: string): Promise<ClientRow | null> => {
  const { rows } = await getDb().query<ClientRow>(
    'SELECT * FROM v2_clients WHERE id = $1 FOR UPDATE',
    [id],
  )

  return rows[0] ?? null
}

export const insertClient = async (fields: ClientFields): Promise<string> => {
  const { rows } = await getDb().query<{ id: string }>(
    `INSERT INTO v2_clients
       (kind, name, email, phone, phone_key, country_code, company_name, notes, niche_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      fields.kind,
      fields.name,
      fields.email,
      fields.phone,
      phoneKey(fields.phone),
      fields.country,
      fields.companyName,
      fields.notes,
      fields.nicheId,
    ],
  )

  return rows[0]!.id
}

/** Writes the whole file and moves the revision on by one. */
export const writeClient = async (id: string, fields: ClientFields): Promise<void> => {
  await getDb().query(
    `UPDATE v2_clients
        SET kind = $2, name = $3, email = $4, phone = $5, phone_key = $6,
            country_code = $7, company_name = $8, notes = $9, niche_id = $10,
            revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [
      id,
      fields.kind,
      fields.name,
      fields.email,
      fields.phone,
      phoneKey(fields.phone),
      fields.country,
      fields.companyName,
      fields.notes,
      fields.nicheId,
    ],
  )
}

/** Active or Inactive. Not a change to the file's contents, so no revision. */
export const setStatus = async (id: string, status: ClientStatus): Promise<void> => {
  await getDb().query(
    `UPDATE v2_clients SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status IS DISTINCT FROM $2`,
    [id, status],
  )
}

export const setTrashed = async (id: string, trashed: boolean): Promise<void> => {
  await getDb().query(
    `UPDATE v2_clients
        SET trashed_at = CASE WHEN $2 THEN COALESCE(trashed_at, CURRENT_TIMESTAMP) ELSE NULL END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [id, trashed],
  )
}

export const deleteClient = async (id: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_clients WHERE id = $1', [id])
}

/* ------------------------------------------------------------------- lists */

/** `%` and `_` typed by the owner are letters, not wildcards. */
const likePattern = (text: string): string => `%${text.replace(/[\\%_]/gu, (c) => `\\${c}`)}%`

const DISPLAY_NAME = `lower(CASE WHEN kind = 'company' AND company_name <> '' THEN company_name ELSE name END)`

export const listClients = async (
  query: ClientListQuery,
): Promise<{ rows: ClientRow[]; total: number }> => {
  const where: string[] = []
  const values: unknown[] = []
  const add = (value: unknown): string => {
    values.push(value)

    return `$${values.length}`
  }

  if (query.view === 'trash') {
    where.push('trashed_at IS NOT NULL')
  } else {
    where.push('trashed_at IS NULL')
    if (query.status !== 'all') where.push(`status = ${add(query.status)}`)
  }

  if (query.kind !== 'all') where.push(`kind = ${add(query.kind)}`)
  if (query.niche) where.push(`niche_id = ${add(query.niche)}`)

  if (query.search !== '') {
    const pattern = add(likePattern(query.search))
    const digits = query.search.replace(/\D/gu, '')
    const phoneMatch = digits.length >= 3 ? ` OR phone_key LIKE ${add(likePattern(digits))}` : ''

    where.push(
      `(name ILIKE ${pattern} OR company_name ILIKE ${pattern} OR email ILIKE ${pattern}${phoneMatch})`,
    )
  }

  const clause = `WHERE ${where.join(' AND ')}`
  const db = getDb()

  const { rows: counted } = await db.query<{ total: string | number }>(
    `SELECT count(*) AS total FROM v2_clients ${clause}`,
    values,
  )

  /*
   * Deterministic: the directory reads alphabetically, Trash most recently
   * trashed first, and the id breaks every tie so a page boundary never moves.
   */
  const order = query.view === 'trash' ? 'trashed_at DESC, id' : `${DISPLAY_NAME}, created_at, id`

  const limit = add(query.pageSize)
  const offset = add((query.page - 1) * query.pageSize)

  const { rows } = await db.query<ClientRow>(
    `SELECT ${READ_COLUMNS} FROM v2_clients ${clause} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
    values,
  )

  return { rows, total: Number(counted[0]?.total ?? 0) }
}

/**
 * Clients sharing an email or a phone, in or out of Trash.
 *
 * A Client in Trash is still a person the owner has on file; warning about it
 * lets them restore it instead of typing it in again.
 */
export const findMatches = async (input: {
  emailKey: string
  phoneKey: string
  excludeId?: string
  limit: number
}): Promise<ClientRow[]> => {
  if (input.emailKey === '' && input.phoneKey === '') return []

  const { rows } = await getDb().query<ClientRow>(
    `SELECT ${READ_COLUMNS} FROM v2_clients
      WHERE ((email_key = $1 AND $1 <> '') OR (phone_key = $2 AND $2 <> ''))
        AND ($3::uuid IS NULL OR id <> $3::uuid)
      ORDER BY trashed_at IS NOT NULL, created_at, id
      LIMIT $4`,
    [input.emailKey, input.phoneKey, input.excludeId ?? null, input.limit],
  )

  return rows
}

/* ------------------------------------------------------------- Lead links */

export const findLeadLink = async (leadId: string): Promise<LeadLinkRow | null> => {
  const { rows } = await getDb().query<LeadLinkRow>(
    'SELECT * FROM v2_client_lead_links WHERE lead_id = $1',
    [leadId],
  )

  return rows[0] ?? null
}

export const insertLeadLink = async (input: {
  leadId: string
  clientId: string
  how: 'created' | 'linked'
}): Promise<void> => {
  await getDb().query(
    'INSERT INTO v2_client_lead_links (lead_id, client_id, how) VALUES ($1, $2, $3)',
    [input.leadId, input.clientId, input.how],
  )
}

export const leadLinksFor = async (clientId: string): Promise<LeadLinkRow[]> => {
  const { rows } = await getDb().query<LeadLinkRow>(
    `SELECT k.*, (SELECT l.name FROM v2_leads l WHERE l.id = k.lead_id) AS lead_name
       FROM v2_client_lead_links k WHERE k.client_id = $1 ORDER BY k.linked_at, k.lead_id`,
    [clientId],
  )

  return rows
}

/** Which of these Clients have any Lead behind them, for the list. */
export const clientsWithLeads = async (clientIds: string[]): Promise<Set<string>> => {
  if (clientIds.length === 0) return new Set()

  const { rows } = await getDb().query<{ client_id: string }>(
    'SELECT DISTINCT client_id FROM v2_client_lead_links WHERE client_id = ANY($1::uuid[])',
    [clientIds],
  )

  return new Set(rows.map((row) => row.client_id))
}
