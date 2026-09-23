import { getDb } from '../../db/client'
import {
  type ChoiceListQuery,
  DEFAULT_LOSS_REASONS,
  DEFAULT_SOURCES,
  OTHER_REASON,
  PERMANENT_STAGES,
  type StageKind,
  UNKNOWN_SOURCE,
} from '../../contracts/lead.contract'

/**
 * The owner-managed lists behind a Lead: stages, sources and lost reasons,
 * against `0011_leads.sql`. No business rule lives here.
 */

export type StageRow = {
  id: string
  kind: StageKind
  name: string
  position: number
  lead_count: string | number
}

export type ChoiceRow = {
  id: string
  name: string
  hidden: boolean
  locked: boolean
  lead_count: string | number
}

/* ---------------------------------------------------------------- defaults */

/**
 * The defaults, written the first time Leads is used rather than by the
 * migration (which carries no rows).
 *
 * The permanent stages and the two locked choices are ensured every time —
 * they may never be missing. The editable defaults are written once, and a
 * marker row remembers it, so a default source the owner deleted stays
 * deleted. An advisory lock makes two first requests agree.
 */
export const ensureDefaults = async (): Promise<void> => {
  const db = getDb()

  const { rows } = await db.query<{ total: string | number }>(
    `SELECT count(*) AS total FROM v2_lead_defaults WHERE name IN ('stages', 'sources', 'reasons')`,
  )

  if (Number(rows[0]?.total ?? 0) === 3) return

  await db.query(`SELECT pg_advisory_xact_lock(hashtext('v2_lead_defaults'))`)

  const kinds = Object.entries(PERMANENT_STAGES) as Array<[Exclude<StageKind, 'custom'>, string]>

  for (const [kind, name] of kinds) {
    await db.query(
      `INSERT INTO v2_lead_stages (kind, name, position)
       SELECT $1, $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM v2_lead_stages WHERE kind = $1)`,
      [kind, name, kind === 'contacted' ? 1 : 0],
    )
  }

  await db.query(
    `INSERT INTO v2_lead_sources (name, is_unknown)
     SELECT $1, true WHERE NOT EXISTS (SELECT 1 FROM v2_lead_sources WHERE is_unknown)`,
    [UNKNOWN_SOURCE],
  )
  await db.query(
    `INSERT INTO v2_lead_loss_reasons (name, is_other)
     SELECT $1, true WHERE NOT EXISTS (SELECT 1 FROM v2_lead_loss_reasons WHERE is_other)`,
    [OTHER_REASON],
  )

  const once = async (marker: string, write: () => Promise<void>) => {
    const { rows: done } = await db.query('SELECT 1 FROM v2_lead_defaults WHERE name = $1', [
      marker,
    ])

    if (done.length > 0) return

    await write()
    await db.query('INSERT INTO v2_lead_defaults (name) VALUES ($1) ON CONFLICT DO NOTHING', [
      marker,
    ])
  }

  await once('stages', async () => {})
  await once('sources', async () => {
    for (const name of DEFAULT_SOURCES) {
      await db.query(
        `INSERT INTO v2_lead_sources (name) SELECT $1
          WHERE NOT EXISTS (SELECT 1 FROM v2_lead_sources WHERE name_key = lower(btrim($1)))`,
        [name],
      )
    }
  })
  await once('reasons', async () => {
    for (const name of DEFAULT_LOSS_REASONS) {
      await db.query(
        `INSERT INTO v2_lead_loss_reasons (name) SELECT $1
          WHERE NOT EXISTS (SELECT 1 FROM v2_lead_loss_reasons WHERE name_key = lower(btrim($1)))`,
        [name],
      )
    }
  })
}

/* ------------------------------------------------------------------ stages */

const STAGE_COLUMNS = `s.id, s.kind, s.name, s.position,
  (SELECT count(*) FROM v2_leads l WHERE l.stage_id = s.id AND l.trashed_at IS NULL) AS lead_count`

/** New, then active stages in the owner's order, then Won, then Lost. */
const STAGE_ORDER = `CASE s.kind WHEN 'new' THEN 0 WHEN 'won' THEN 2 WHEN 'lost' THEN 3 ELSE 1 END, s.position, s.name_key, s.id`

export const listStages = async (): Promise<StageRow[]> => {
  const { rows } = await getDb().query<StageRow>(
    `SELECT ${STAGE_COLUMNS} FROM v2_lead_stages s ORDER BY ${STAGE_ORDER}`,
  )

  return rows
}

export const findStage = async (id: string): Promise<StageRow | null> => {
  const { rows } = await getDb().query<StageRow>(
    `SELECT ${STAGE_COLUMNS} FROM v2_lead_stages s WHERE s.id = $1`,
    [id],
  )

  return rows[0] ?? null
}

export const stageOfKind = async (kind: Exclude<StageKind, 'custom'>): Promise<StageRow> => {
  const { rows } = await getDb().query<StageRow>(
    `SELECT ${STAGE_COLUMNS} FROM v2_lead_stages s WHERE s.kind = $1`,
    [kind],
  )

  return rows[0]!
}

export const stageNameTaken = async (name: string, exceptId?: string): Promise<boolean> => {
  const { rows } = await getDb().query(
    `SELECT 1 FROM v2_lead_stages WHERE name_key = lower(btrim($1)) AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [name, exceptId ?? null],
  )

  return rows.length > 0
}

/** Active stages in order: the ones the owner can reorder. */
export const activeStageIds = async (): Promise<string[]> => {
  const { rows } = await getDb().query<{ id: string }>(
    `SELECT id FROM v2_lead_stages WHERE kind IN ('contacted', 'custom') ORDER BY position, name_key, id`,
  )

  return rows.map((row) => row.id)
}

export const insertStage = async (name: string): Promise<string> => {
  const { rows } = await getDb().query<{ id: string }>(
    `INSERT INTO v2_lead_stages (kind, name, position)
     VALUES ('custom', $1, (SELECT COALESCE(MAX(position), 0) + 1 FROM v2_lead_stages WHERE kind IN ('contacted', 'custom')))
     RETURNING id`,
    [name],
  )

  return rows[0]!.id
}

export const renameStage = async (id: string, name: string): Promise<void> => {
  await getDb().query(
    'UPDATE v2_lead_stages SET name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [id, name],
  )
}

export const writeStageOrder = async (ids: string[]): Promise<void> => {
  for (const [index, id] of ids.entries()) {
    await getDb().query(
      'UPDATE v2_lead_stages SET position = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND position IS DISTINCT FROM $2',
      [id, index + 1],
    )
  }
}

export const deleteStage = async (id: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_lead_stages WHERE id = $1', [id])
}

export const lockStages = async (): Promise<void> => {
  await getDb().query(`SELECT pg_advisory_xact_lock(hashtext('v2_lead_stages.order'))`)
}

/* ----------------------------------------------------- sources and reasons */

export type ChoiceTable = 'sources' | 'reasons'

const TABLE: Record<ChoiceTable, { table: string; locked: string; leadColumn: string }> = {
  sources: { table: 'v2_lead_sources', locked: 'is_unknown', leadColumn: 'source_id' },
  reasons: { table: 'v2_lead_loss_reasons', locked: 'is_other', leadColumn: 'lost_reason_id' },
}

const choiceColumns = (kind: ChoiceTable) => {
  const t = TABLE[kind]

  // Trash included: a Lead in Trash still holds its source.
  return `c.id, c.name, c.hidden, c.${t.locked} AS locked,
    (SELECT count(*) FROM v2_leads l WHERE l.${t.leadColumn} = c.id) AS lead_count`
}

const likePattern = (text: string): string => `%${text.replace(/[\\%_]/gu, (c) => `\\${c}`)}%`

/** The locked choice first, then A–Z, the id breaking ties. */
export const listChoices = async (
  kind: ChoiceTable,
  query: ChoiceListQuery,
): Promise<{ rows: ChoiceRow[]; total: number }> => {
  const t = TABLE[kind]
  const where: string[] = []
  const values: unknown[] = []
  const add = (value: unknown) => {
    values.push(value)

    return `$${values.length}`
  }

  if (query.hidden === 'exclude') where.push('c.hidden = false')
  if (query.search !== '') where.push(`c.name ILIKE ${add(likePattern(query.search))}`)

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const db = getDb()
  const { rows: counted } = await db.query<{ total: string | number }>(
    `SELECT count(*) AS total FROM ${t.table} c ${clause}`,
    values,
  )
  const limit = add(query.pageSize)
  const offset = add((query.page - 1) * query.pageSize)
  const { rows } = await db.query<ChoiceRow>(
    `SELECT ${choiceColumns(kind)} FROM ${t.table} c ${clause}
      ORDER BY c.${t.locked} DESC, c.name_key, c.id LIMIT ${limit} OFFSET ${offset}`,
    values,
  )

  return { rows, total: Number(counted[0]?.total ?? 0) }
}

export const findChoice = async (kind: ChoiceTable, id: string): Promise<ChoiceRow | null> => {
  const { rows } = await getDb().query<ChoiceRow>(
    `SELECT ${choiceColumns(kind)} FROM ${TABLE[kind].table} c WHERE c.id = $1`,
    [id],
  )

  return rows[0] ?? null
}

export const choiceNameTaken = async (
  kind: ChoiceTable,
  name: string,
  exceptId?: string,
): Promise<boolean> => {
  const { rows } = await getDb().query(
    `SELECT 1 FROM ${TABLE[kind].table} WHERE name_key = lower(btrim($1)) AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [name, exceptId ?? null],
  )

  return rows.length > 0
}

/** Matches a typed name, in any letter case — for CSV rows. */
export const choiceByName = async (kind: ChoiceTable, name: string): Promise<ChoiceRow | null> => {
  const { rows } = await getDb().query<ChoiceRow>(
    `SELECT ${choiceColumns(kind)} FROM ${TABLE[kind].table} c WHERE c.name_key = lower(btrim($1))`,
    [name],
  )

  return rows[0] ?? null
}

export const insertChoice = async (kind: ChoiceTable, name: string): Promise<string> => {
  const { rows } = await getDb().query<{ id: string }>(
    `INSERT INTO ${TABLE[kind].table} (name) VALUES ($1) RETURNING id`,
    [name],
  )

  return rows[0]!.id
}

export const updateChoice = async (
  kind: ChoiceTable,
  id: string,
  patch: { name?: string; hidden?: boolean },
): Promise<void> => {
  await getDb().query(
    `UPDATE ${TABLE[kind].table}
        SET name = COALESCE($2, name), hidden = COALESCE($3, hidden), updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [id, patch.name ?? null, patch.hidden ?? null],
  )
}

export const deleteChoice = async (kind: ChoiceTable, id: string): Promise<void> => {
  await getDb().query(`DELETE FROM ${TABLE[kind].table} WHERE id = $1`, [id])
}
