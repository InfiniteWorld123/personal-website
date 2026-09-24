import { getDb } from '../../db/client'

/**
 * The V2 side of "Copy from the old site": the import log, and the few
 * questions about V2 the plan has to ask. Never the legacy database — that is
 * `legacy.source.ts`, and only there.
 */

export type LogKind = 'project' | 'service' | 'post' | 'booking_type' | 'availability' | 'image'

export type LogRow = {
  kind: LogKind
  legacy_key: string
  outcome: 'created' | 'failed'
  v2_id: string | null
  note: string
}

export const readLog = async (): Promise<Map<string, LogRow>> => {
  const { rows } = await getDb().query<LogRow>(
    'SELECT kind, legacy_key, outcome, v2_id, note FROM v2_legacy_imports',
  )

  return new Map(rows.map((row) => [`${row.kind}:${row.legacy_key}`, row]))
}

/**
 * Writes one entry. `false` when an entry was already there — another run got
 * to it first — which is what keeps two presses of the button from creating
 * anything twice.
 */
export const record = async (entry: {
  kind: LogKind
  key: string
  outcome: 'created' | 'failed'
  v2Id?: string | null
  note?: string
}): Promise<boolean> => {
  const { rows } = await getDb().query(
    `INSERT INTO v2_legacy_imports (kind, legacy_key, outcome, v2_id, note)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (kind, legacy_key) DO NOTHING
     RETURNING kind`,
    [entry.kind, entry.key, entry.outcome, entry.v2Id ?? null, (entry.note ?? '').slice(0, 1000)],
  )

  return rows.length > 0
}

const exists = async (text: string, values: unknown[]): Promise<boolean> =>
  (await getDb().query(text, values)).rows.length > 0

/** Held now, held by a draft, or held once — V2 never hands an old address to a second record. */
export const projectSlugTaken = (slug: string) =>
  exists(
    `SELECT 1 FROM v2_project_slugs WHERE slug = $1
     UNION ALL SELECT 1 FROM v2_project_versions WHERE slug = $1 LIMIT 1`,
    [slug],
  )

export const serviceSlugTaken = (slug: string) =>
  exists(
    `SELECT 1 FROM v2_service_slugs WHERE slug = $1
     UNION ALL SELECT 1 FROM v2_service_versions WHERE slug = $1 LIMIT 1`,
    [slug],
  )

export const postSlugTaken = (slug: string) =>
  exists(
    `SELECT 1 FROM v2_blog_posts WHERE slug = $1
     UNION ALL SELECT 1 FROM v2_blog_post_versions WHERE slug = $1 LIMIT 1`,
    [slug],
  )

export const bookingTypeSlugTaken = (slug: string) =>
  exists('SELECT 1 FROM v2_booking_types WHERE slug = $1', [slug])

export const weeklyHoursCount = async (): Promise<number> => {
  const { rows } = await getDb().query<{ total: number }>(
    'SELECT count(*)::int AS total FROM v2_booking_weekly_hours',
  )

  return Number(rows[0]?.total ?? 0)
}

export const rootFolderId = async (name: string): Promise<string | null> => {
  const { rows } = await getDb().query<{ id: string }>(
    'SELECT id FROM v2_media_folders WHERE parent_id IS NULL AND lower(name) = lower($1)',
    [name],
  )

  return rows[0]?.id ?? null
}

/** Only the asset ids that still exist: a copied file the owner deleted is copied again. */
export const existingAssets = async (ids: string[]): Promise<Set<string>> => {
  if (ids.length === 0) return new Set()

  const { rows } = await getDb().query<{ id: string }>(
    'SELECT id::text FROM v2_media_assets WHERE id = ANY($1::uuid[])',
    [ids],
  )

  return new Set(rows.map((row) => row.id))
}

export const forgetImage = async (src: string): Promise<void> => {
  await getDb().query(`DELETE FROM v2_legacy_imports WHERE kind = 'image' AND legacy_key = $1`, [src])
}
