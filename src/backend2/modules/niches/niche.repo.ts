import { getDb } from '../../db/client'
import type { NicheListQuery } from '../../contracts/niche.contract'

/**
 * Every statement the niche list runs, against `v2_niches` from
 * `0008_clients.sql`. Leads adds its own count when its table exists.
 */

export type NicheRow = {
  id: string
  name: string
  name_key: string
  hidden: boolean
  created_at: Date
  updated_at: Date
  client_count: string | number
}

const COLUMNS = `v2_niches.*,
  (SELECT count(*) FROM v2_clients c WHERE c.niche_id = v2_niches.id) AS client_count`

export const findNiche = async (id: string): Promise<NicheRow | null> => {
  const { rows } = await getDb().query<NicheRow>(`SELECT ${COLUMNS} FROM v2_niches WHERE id = $1`, [
    id,
  ])

  return rows[0] ?? null
}

export const lockNiche = async (id: string): Promise<NicheRow | null> => {
  const { rows } = await getDb().query<NicheRow>(
    'SELECT *, 0 AS client_count FROM v2_niches WHERE id = $1 FOR UPDATE',
    [id],
  )

  return rows[0] ?? null
}

/** The niche already holding this name, in any letter case. */
export const findByName = async (name: string): Promise<{ id: string } | null> => {
  const { rows } = await getDb().query<{ id: string }>(
    'SELECT id FROM v2_niches WHERE name_key = lower(btrim($1))',
    [name],
  )

  return rows[0] ?? null
}

export const insertNiche = async (name: string): Promise<string> => {
  const { rows } = await getDb().query<{ id: string }>(
    'INSERT INTO v2_niches (name) VALUES ($1) RETURNING id',
    [name],
  )

  return rows[0]!.id
}

export const updateNiche = async (
  id: string,
  patch: { name?: string; hidden?: boolean },
): Promise<void> => {
  await getDb().query(
    `UPDATE v2_niches
        SET name = COALESCE($2, name),
            hidden = COALESCE($3, hidden),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [id, patch.name ?? null, patch.hidden ?? null],
  )
}

export const deleteNiche = async (id: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_niches WHERE id = $1', [id])
}

const likePattern = (text: string): string => `%${text.replace(/[\\%_]/gu, (c) => `\\${c}`)}%`

/** Alphabetical, the id breaking ties, so a page boundary never moves. */
export const listNiches = async (
  query: NicheListQuery,
): Promise<{ rows: NicheRow[]; total: number }> => {
  const where: string[] = []
  const values: unknown[] = []
  const add = (value: unknown): string => {
    values.push(value)

    return `$${values.length}`
  }

  if (query.hidden === 'exclude') where.push('hidden = false')
  if (query.search !== '') where.push(`name ILIKE ${add(likePattern(query.search))}`)

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const db = getDb()

  const { rows: counted } = await db.query<{ total: string | number }>(
    `SELECT count(*) AS total FROM v2_niches ${clause}`,
    values,
  )

  const limit = add(query.pageSize)
  const offset = add((query.page - 1) * query.pageSize)

  const { rows } = await db.query<NicheRow>(
    `SELECT ${COLUMNS} FROM v2_niches ${clause}
      ORDER BY name_key, id LIMIT ${limit} OFFSET ${offset}`,
    values,
  )

  return { rows, total: Number(counted[0]?.total ?? 0) }
}
