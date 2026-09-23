import { getDb } from '../../db/client'
import type {
  ContentHistoryAction,
  ContentHistoryQuery,
  ContentSlot,
  ContentValue,
} from '../../contracts/content.contract'

/**
 * Every statement Content runs, against the shape `0007_content.sql`
 * installed. No business rule lives here: `content.service.ts` decides what
 * should happen, this writes it down.
 *
 * Queries run one after another, never `Promise.all` — the same rule as the
 * other modules, for the same reason (a Worker's socket limit, and the local
 * database answering one connection at a time).
 */

export type ValueRow = {
  field_key: string
  language: ContentSlot
  value: ContentValue
  revision: number
  import_id: string | null
  updated_at: Date
}

export type HistoryRow = {
  id: string
  field_key: string
  language: ContentSlot
  action: ContentHistoryAction
  before_value: ContentValue
  after_value: ContentValue
  revision: number
  restored_from: string | null
  created_at: Date
}

const json = (value: ContentValue): string => JSON.stringify(value)

/* ------------------------------------------------------------------ values */

export const listValues = async (): Promise<ValueRow[]> =>
  (
    await getDb().query<ValueRow>(
      `SELECT field_key, language, value, revision, import_id, updated_at
         FROM v2_content_values`,
    )
  ).rows

export const listValuesForKey = async (key: string): Promise<ValueRow[]> =>
  (
    await getDb().query<ValueRow>(
      `SELECT field_key, language, value, revision, import_id, updated_at
         FROM v2_content_values WHERE field_key = $1`,
      [key],
    )
  ).rows

/** The public read: one language and the shared facts, values only. */
export const listPublicValues = async (
  language: ContentSlot,
): Promise<Array<{ field_key: string; language: ContentSlot; value: ContentValue }>> =>
  (
    await getDb().query<{ field_key: string; language: ContentSlot; value: ContentValue }>(
      `SELECT field_key, language, value FROM v2_content_values
        WHERE language = $1 OR language = 'shared'`,
      [language],
    )
  ).rows

/** Locks the row for the rest of the transaction; `null` when it does not exist yet. */
export const lockValue = async (key: string, slot: ContentSlot): Promise<ValueRow | null> =>
  (
    await getDb().query<ValueRow>(
      `SELECT field_key, language, value, revision, import_id, updated_at
         FROM v2_content_values
        WHERE field_key = $1 AND language = $2
          FOR UPDATE`,
      [key, slot],
    )
  ).rows[0] ?? null

export const updateValue = async (input: {
  key: string
  slot: ContentSlot
  value: ContentValue
  expectedRevision: number
}): Promise<ValueRow | null> =>
  (
    await getDb().query<ValueRow>(
      `UPDATE v2_content_values
          SET value = $3::jsonb, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE field_key = $1 AND language = $2 AND revision = $4
      RETURNING field_key, language, value, revision, import_id, updated_at`,
      [input.key, input.slot, json(input.value), input.expectedRevision],
    )
  ).rows[0] ?? null

/**
 * The first V2 save of a field. `ON CONFLICT DO NOTHING`, so two first saves
 * racing each other cannot both succeed: the loser gets `null` and is refused.
 */
export const insertValue = async (input: {
  key: string
  slot: ContentSlot
  value: ContentValue
  importId?: string
}): Promise<ValueRow | null> =>
  (
    await getDb().query<ValueRow>(
      `INSERT INTO v2_content_values (field_key, language, value, import_id)
            VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (field_key, language) DO NOTHING
       RETURNING field_key, language, value, revision, import_id, updated_at`,
      [input.key, input.slot, json(input.value), input.importId ?? null],
    )
  ).rows[0] ?? null

export const countValues = async (): Promise<number> =>
  Number(
    (await getDb().query<{ total: string }>('SELECT count(*) AS total FROM v2_content_values'))
      .rows[0]?.total ?? 0,
  )

/* ----------------------------------------------------------------- history */

export const insertHistory = async (input: {
  key: string
  slot: ContentSlot
  action: ContentHistoryAction
  before: ContentValue
  after: ContentValue
  revision: number
  restoredFrom?: string | null
}): Promise<void> => {
  await getDb().query(
    `INSERT INTO v2_content_history
       (field_key, language, action, before_value, after_value, revision, restored_from)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
    [
      input.key,
      input.slot,
      input.action,
      json(input.before),
      json(input.after),
      input.revision,
      input.restoredFrom ?? null,
    ],
  )
}

export const findHistory = async (id: string): Promise<HistoryRow | null> =>
  (
    await getDb().query<HistoryRow>(
      `SELECT id, field_key, language, action, before_value, after_value, revision,
              restored_from, created_at
         FROM v2_content_history WHERE id = $1`,
      [id],
    )
  ).rows[0] ?? null

/**
 * One page of history, newest first. `keys` narrows it to the fields the
 * registry still knows, so a retired field's past never reaches the editor.
 */
export const pageHistory = async (
  query: ContentHistoryQuery & { keys: string[] },
): Promise<{ rows: HistoryRow[]; total: number }> => {
  const where = ['field_key = ANY($1::text[])']
  const values: unknown[] = [query.keys]

  if (query.key) {
    values.push(query.key)
    where.push(`field_key = $${values.length}`)
  }

  if (query.language) {
    values.push(query.language)
    where.push(`language = $${values.length}`)
  }

  const clause = where.join(' AND ')

  const total = Number(
    (
      await getDb().query<{ total: string }>(
        `SELECT count(*) AS total FROM v2_content_history WHERE ${clause}`,
        values,
      )
    ).rows[0]?.total ?? 0,
  )

  const rows = (
    await getDb().query<HistoryRow>(
      `SELECT id, field_key, language, action, before_value, after_value, revision,
              restored_from, created_at
         FROM v2_content_history
        WHERE ${clause}
        ORDER BY created_at DESC, seq DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    )
  ).rows

  return { rows, total }
}

/* ------------------------------------------------------------ review flags */

export const listReviewFlags = async (): Promise<Array<{ field_key: string; language: ContentSlot }>> =>
  (
    await getDb().query<{ field_key: string; language: ContentSlot }>(
      'SELECT field_key, language FROM v2_content_review_flags',
    )
  ).rows

export const flagForReview = async (key: string, languages: ContentSlot[]): Promise<void> => {
  for (const language of languages) {
    await getDb().query(
      `INSERT INTO v2_content_review_flags (field_key, language) VALUES ($1, $2)
       ON CONFLICT (field_key, language) DO UPDATE SET flagged_at = CURRENT_TIMESTAMP`,
      [key, language],
    )
  }
}

export const clearReviewFlag = async (key: string, language: ContentSlot): Promise<void> => {
  await getDb().query(
    'DELETE FROM v2_content_review_flags WHERE field_key = $1 AND language = $2',
    [key, language],
  )
}

/* ----------------------------------------------------------------- imports */

export const insertImport = async (input: {
  sourceLabel: string
  manifest: unknown
}): Promise<string> =>
  (
    await getDb().query<{ id: string }>(
      `INSERT INTO v2_content_imports (source_label, manifest) VALUES ($1, $2::jsonb) RETURNING id`,
      [input.sourceLabel, JSON.stringify(input.manifest)],
    )
  ).rows[0].id

export const findImport = async (
  id: string,
): Promise<{ id: string; rolled_back_at: Date | null } | null> =>
  (
    await getDb().query<{ id: string; rolled_back_at: Date | null }>(
      'SELECT id, rolled_back_at FROM v2_content_imports WHERE id = $1 FOR UPDATE',
      [id],
    )
  ).rows[0] ?? null

/** Rows from an import that have been edited since, which block a rollback. */
export const listEditedImportRows = async (
  importId: string,
): Promise<Array<{ field_key: string; language: ContentSlot }>> =>
  (
    await getDb().query<{ field_key: string; language: ContentSlot }>(
      `SELECT field_key, language FROM v2_content_values
        WHERE import_id = $1 AND revision > 1
        ORDER BY field_key, language`,
      [importId],
    )
  ).rows

export const deleteImportRows = async (importId: string): Promise<number> =>
  (
    await getDb().query<{ field_key: string }>(
      'DELETE FROM v2_content_values WHERE import_id = $1 RETURNING field_key',
      [importId],
    )
  ).rows.length

export const markImportRolledBack = async (importId: string): Promise<void> => {
  await getDb().query(
    'UPDATE v2_content_imports SET rolled_back_at = CURRENT_TIMESTAMP WHERE id = $1',
    [importId],
  )
}
