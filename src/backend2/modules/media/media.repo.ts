import type { MediaKind, MediaListQuery } from '../../contracts/media.contract'
import { MEDIA_LIMITS } from '../../contracts/media.contract'
import { getDb } from '../../db/client'

/**
 * Every statement the Media module runs. No SQL anywhere else in the module —
 * the routes parse and respond, the services decide, and this file is the only
 * thing that knows what the tables are called.
 */

/* --------------------------------------------------------------------- rows */

export type FolderRow = {
  id: string
  parent_id: string | null
  name: string
  depth: number
  created_at: Date | string
  updated_at: Date | string
}

export type AssetRow = {
  id: string
  folder_id: string | null
  storage_key: string
  kind: MediaKind
  content_type: string
  original_name: string
  display_name: string
  byte_size: string | number
  checksum: string
  width: number | null
  height: number | null
  created_at: Date | string
  updated_at: Date | string
}

/** An asset as the library lists it: the row, plus what uses it. */
export type AssetWithUseRow = AssetRow & {
  reference_count: string | number
  is_published: boolean
}

export type ReferenceRow = {
  id: string
  asset_id: string
  module: string
  scope: string
  owner_type: string
  owner_id: string
  usage: string
  position: number
  label: string
  created_at: Date | string
}

const count = (value: string | number | null | undefined): number => Number(value ?? 0)

/* ------------------------------------------------------------------ folders */

export const insertFolder = async (input: {
  name: string
  parentId: string | null
  depth: number
}): Promise<FolderRow> => {
  const { rows } = await getDb().query<FolderRow>(
    `INSERT INTO v2_media_folders (name, parent_id, depth)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [input.name, input.parentId, input.depth],
  )

  return rows[0]!
}

export const findFolder = async (id: string): Promise<FolderRow | null> => {
  const { rows } = await getDb().query<FolderRow>(
    'SELECT * FROM v2_media_folders WHERE id = $1',
    [id],
  )

  return rows[0] ?? null
}

/**
 * The whole tree, bounded.
 *
 * A folder tree is navigation rather than a browsable collection, so it is not
 * paginated — but it is still capped, because "not a list" is not a licence to
 * return an unbounded number of rows. The service reports when the cap is hit.
 */
export const listFolders = async (): Promise<Array<FolderRow & { file_count: number }>> => {
  const { rows } = await getDb().query<FolderRow & { file_count: string | number }>(
    `SELECT f.*,
            (SELECT count(*) FROM v2_media_assets a WHERE a.folder_id = f.id) AS file_count
       FROM v2_media_folders f
      ORDER BY f.depth ASC, lower(f.name) ASC, f.id ASC
      LIMIT $1`,
    [MEDIA_LIMITS.maxFolders + 1],
  )

  return rows.map((row) => ({ ...row, file_count: count(row.file_count) }))
}

export const countFoldersInParent = async (input: {
  parentId: string | null
  excludeId?: string
  name: string
}): Promise<number> => {
  const { rows } = await getDb().query<{ total: string | number }>(
    `SELECT count(*) AS total FROM v2_media_folders
      WHERE lower(name) = lower($1)
        AND parent_id IS NOT DISTINCT FROM $2
        AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [input.name, input.parentId, input.excludeId ?? null],
  )

  return count(rows[0]?.total)
}

/**
 * The chain from a folder up to the root.
 *
 * This is what refuses a move that would make a folder its own ancestor: the
 * proposed parent's ancestry is walked, and if the folder being moved appears
 * in it, the move would cut a subtree loose into a cycle.
 */
export const ancestorIds = async (folderId: string): Promise<string[]> => {
  const { rows } = await getDb().query<{ id: string }>(
    `WITH RECURSIVE chain AS (
        SELECT id, parent_id FROM v2_media_folders WHERE id = $1
        UNION ALL
        SELECT f.id, f.parent_id
          FROM v2_media_folders f
          JOIN chain c ON f.id = c.parent_id
     )
     SELECT id FROM chain`,
    [folderId],
  )

  return rows.map((row) => row.id)
}

/** A folder and everything beneath it, with each one's depth below the root of the walk. */
export const subtree = async (
  folderId: string,
): Promise<Array<{ id: string; relative_depth: number }>> => {
  const { rows } = await getDb().query<{ id: string; relative_depth: string | number }>(
    `WITH RECURSIVE walk AS (
        SELECT id, 0 AS relative_depth FROM v2_media_folders WHERE id = $1
        UNION ALL
        SELECT f.id, w.relative_depth + 1
          FROM v2_media_folders f
          JOIN walk w ON f.parent_id = w.id
     )
     SELECT id, relative_depth FROM walk`,
    [folderId],
  )

  return rows.map((row) => ({ id: row.id, relative_depth: count(row.relative_depth) }))
}

export const setFolderDepth = async (id: string, depth: number): Promise<void> => {
  await getDb().query('UPDATE v2_media_folders SET depth = $2 WHERE id = $1', [id, depth])
}

export const updateFolderRow = async (input: {
  id: string
  name?: string
  parentId?: string | null
  depth?: number
}): Promise<FolderRow | null> => {
  const { rows } = await getDb().query<FolderRow>(
    `UPDATE v2_media_folders
        SET name       = COALESCE($2, name),
            parent_id  = CASE WHEN $4::boolean THEN $3::uuid ELSE parent_id END,
            depth      = COALESCE($5, depth),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *`,
    [
      input.id,
      input.name ?? null,
      input.parentId ?? null,
      input.parentId !== undefined,
      input.depth ?? null,
    ],
  )

  return rows[0] ?? null
}

export const folderChildCount = async (id: string): Promise<number> => {
  const { rows } = await getDb().query<{ total: string | number }>(
    'SELECT count(*) AS total FROM v2_media_folders WHERE parent_id = $1',
    [id],
  )

  return count(rows[0]?.total)
}

export const folderFileCount = async (id: string): Promise<number> => {
  const { rows } = await getDb().query<{ total: string | number }>(
    'SELECT count(*) AS total FROM v2_media_assets WHERE folder_id = $1',
    [id],
  )

  return count(rows[0]?.total)
}

export const deleteFolderRow = async (id: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_media_folders WHERE id = $1', [id])
}

/* ------------------------------------------------------------------- assets */

export const insertAsset = async (input: {
  folderId: string | null
  storageKey: string
  kind: MediaKind
  contentType: string
  originalName: string
  displayName: string
  byteSize: number
  checksum: string
  width: number | null
  height: number | null
}): Promise<AssetRow> => {
  const { rows } = await getDb().query<AssetRow>(
    `INSERT INTO v2_media_assets
       (folder_id, storage_key, kind, content_type, original_name, display_name,
        byte_size, checksum, width, height)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      input.folderId,
      input.storageKey,
      input.kind,
      input.contentType,
      input.originalName,
      input.displayName,
      input.byteSize,
      input.checksum,
      input.width,
      input.height,
    ],
  )

  return rows[0]!
}

export const findAsset = async (id: string): Promise<AssetRow | null> => {
  const { rows } = await getDb().query<AssetRow>('SELECT * FROM v2_media_assets WHERE id = $1', [
    id,
  ])

  return rows[0] ?? null
}

export const findAssetWithUse = async (id: string): Promise<AssetWithUseRow | null> => {
  const { rows } = await getDb().query<AssetWithUseRow>(
    `SELECT a.*,
            (SELECT count(*) FROM v2_media_references r WHERE r.asset_id = a.id) AS reference_count,
            EXISTS (
              SELECT 1 FROM v2_media_references r
               WHERE r.asset_id = a.id AND r.scope = 'published'
            ) AS is_published
       FROM v2_media_assets a
      WHERE a.id = $1`,
    [id],
  )

  return rows[0] ?? null
}

export const findAssetsByChecksum = async (checksum: string): Promise<AssetRow[]> => {
  const { rows } = await getDb().query<AssetRow>(
    'SELECT * FROM v2_media_assets WHERE checksum = $1 ORDER BY created_at ASC LIMIT 5',
    [checksum],
  )

  return rows
}

const ORDER_BY: Record<NonNullable<MediaListQuery['sort']>, string> = {
  newest: 'a.created_at DESC, a.id DESC',
  oldest: 'a.created_at ASC, a.id ASC',
  name: 'lower(a.display_name) ASC, a.id ASC',
  size: 'a.byte_size DESC, a.id DESC',
}

/**
 * Builds the filter once, so the count and the page can never disagree about
 * what is being counted.
 *
 * `LIKE` wildcards in the owner's search text are escaped rather than honoured:
 * a filename containing `%` should find that filename, not every file.
 */
const buildFilter = (
  query: MediaListQuery,
): { where: string; values: unknown[]; nextIndex: number } => {
  const clauses: string[] = []
  const values: unknown[] = []

  if (query.folderId === 'root') {
    clauses.push('a.folder_id IS NULL')
  } else if (query.folderId) {
    values.push(query.folderId)
    clauses.push(`a.folder_id = $${values.length}`)
  }

  if (query.kind) {
    values.push(query.kind)
    clauses.push(`a.kind = $${values.length}`)
  }

  if (query.usage === 'used') {
    clauses.push('EXISTS (SELECT 1 FROM v2_media_references r WHERE r.asset_id = a.id)')
  } else if (query.usage === 'unused') {
    clauses.push('NOT EXISTS (SELECT 1 FROM v2_media_references r WHERE r.asset_id = a.id)')
  } else if (query.usage === 'published') {
    clauses.push(
      "EXISTS (SELECT 1 FROM v2_media_references r WHERE r.asset_id = a.id AND r.scope = 'published')",
    )
  }

  if (query.q) {
    const pattern = `%${query.q.replace(/[\\%_]/gu, (match) => `\\${match}`)}%`

    values.push(pattern)
    clauses.push(
      `(lower(a.display_name) LIKE lower($${values.length}) ESCAPE '\\'` +
        ` OR lower(a.original_name) LIKE lower($${values.length}) ESCAPE '\\')`,
    )
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
    nextIndex: values.length + 1,
  }
}

export const listAssets = async (input: {
  query: MediaListQuery
  limit: number
  offset: number
}): Promise<{ rows: AssetWithUseRow[]; total: number }> => {
  const filter = buildFilter(input.query)
  const db = getDb()

  const totals = await db.query<{ total: string | number }>(
    `SELECT count(*) AS total FROM v2_media_assets a ${filter.where}`,
    filter.values,
  )

  const total = count(totals.rows[0]?.total)

  if (total === 0) return { rows: [], total: 0 }

  const { rows } = await db.query<AssetWithUseRow>(
    `SELECT a.*,
            (SELECT count(*) FROM v2_media_references r WHERE r.asset_id = a.id) AS reference_count,
            EXISTS (
              SELECT 1 FROM v2_media_references r
               WHERE r.asset_id = a.id AND r.scope = 'published'
            ) AS is_published
       FROM v2_media_assets a
       ${filter.where}
      ORDER BY ${ORDER_BY[input.query.sort ?? 'newest']}
      LIMIT $${filter.nextIndex} OFFSET $${filter.nextIndex + 1}`,
    [...filter.values, input.limit, input.offset],
  )

  return { rows, total }
}

export const countAssetsWithName = async (input: {
  folderId: string | null
  displayName: string
  excludeId: string
}): Promise<number> => {
  const { rows } = await getDb().query<{ total: string | number }>(
    `SELECT count(*) AS total FROM v2_media_assets
      WHERE folder_id IS NOT DISTINCT FROM $1
        AND lower(display_name) = lower($2)
        AND id <> $3`,
    [input.folderId, input.displayName, input.excludeId],
  )

  return count(rows[0]?.total)
}

export const updateAssetRow = async (input: {
  id: string
  displayName?: string
  folderId?: string | null
}): Promise<AssetRow | null> => {
  const { rows } = await getDb().query<AssetRow>(
    `UPDATE v2_media_assets
        SET display_name = COALESCE($2, display_name),
            folder_id    = CASE WHEN $4::boolean THEN $3::uuid ELSE folder_id END,
            updated_at   = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *`,
    [input.id, input.displayName ?? null, input.folderId ?? null, input.folderId !== undefined],
  )

  return rows[0] ?? null
}

export const deleteAssetRow = async (id: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_media_assets WHERE id = $1', [id])
}

/* --------------------------------------------------- objects without a home */

export type PendingObjectRow = {
  storage_key: string
  purpose: 'upload' | 'delete'
  created_at: Date | string
  attempts: number
  last_error: string | null
}

/**
 * Records the intention to have an object, or to stop having one.
 *
 * Deliberately *not* a query for "assets nothing references": those are files
 * the owner chose to keep, and deleting them would be the project-scoped
 * cleanup `docs/v2/media.md` says conflicts with a vault.
 */
export const markPendingObject = async (input: {
  storageKey: string
  purpose: 'upload' | 'delete'
}): Promise<void> => {
  await getDb().query(
    `INSERT INTO v2_media_pending_objects (storage_key, purpose)
     VALUES ($1, $2)
     ON CONFLICT (storage_key) DO UPDATE SET purpose = EXCLUDED.purpose`,
    [input.storageKey, input.purpose],
  )
}

export const clearPendingObject = async (storageKey: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_media_pending_objects WHERE storage_key = $1', [storageKey])
}

export const findPendingObjects = async (input: {
  olderThan: Date
  limit: number
}): Promise<PendingObjectRow[]> => {
  const { rows } = await getDb().query<PendingObjectRow>(
    `SELECT * FROM v2_media_pending_objects
      WHERE created_at < $1
      ORDER BY created_at ASC
      LIMIT $2`,
    [input.olderThan, input.limit],
  )

  return rows
}

export const recordPendingObjectFailure = async (input: {
  storageKey: string
  error: string
}): Promise<void> => {
  await getDb().query(
    `UPDATE v2_media_pending_objects
        SET attempts = attempts + 1, last_error = $2
      WHERE storage_key = $1`,
    [input.storageKey, input.error.slice(0, 500)],
  )
}

/* --------------------------------------------------------------- references */

export const countReferences = async (assetId: string): Promise<number> => {
  const { rows } = await getDb().query<{ total: string | number }>(
    'SELECT count(*) AS total FROM v2_media_references WHERE asset_id = $1',
    [assetId],
  )

  return count(rows[0]?.total)
}

/**
 * The public gate, as one indexed lookup.
 *
 * `docs/v2/media.md`: public serving "checks current published references on
 * every request … possession of an opaque ID alone grants no access."
 */
export const hasPublishedReference = async (assetId: string): Promise<boolean> => {
  const { rows } = await getDb().query<{ present: boolean }>(
    `SELECT EXISTS (
        SELECT 1 FROM v2_media_references
         WHERE asset_id = $1 AND scope = 'published'
     ) AS present`,
    [assetId],
  )

  return rows[0]?.present === true
}

export const listReferences = async (input: {
  assetId: string
  limit: number
  offset: number
}): Promise<{ rows: ReferenceRow[]; total: number }> => {
  const db = getDb()

  const totals = await db.query<{ total: string | number }>(
    'SELECT count(*) AS total FROM v2_media_references WHERE asset_id = $1',
    [input.assetId],
  )

  const total = count(totals.rows[0]?.total)

  if (total === 0) return { rows: [], total: 0 }

  const { rows } = await db.query<ReferenceRow>(
    `SELECT * FROM v2_media_references
      WHERE asset_id = $1
      ORDER BY module ASC, scope ASC, owner_id ASC, position ASC, id ASC
      LIMIT $2 OFFSET $3`,
    [input.assetId, input.limit, input.offset],
  )

  return { rows, total }
}

export type ReferenceEntry = {
  assetId: string
  usage: 'cover' | 'gallery' | 'inline' | 'attachment' | 'other'
  position?: number
  label?: string
}

export const deleteReferencesForOwner = async (input: {
  module: string
  ownerType: string
  ownerId: string
  scope: string
}): Promise<void> => {
  await getDb().query(
    `DELETE FROM v2_media_references
      WHERE module = $1 AND owner_type = $2 AND owner_id = $3 AND scope = $4`,
    [input.module, input.ownerType, input.ownerId, input.scope],
  )
}

export const insertReferences = async (input: {
  module: string
  ownerType: string
  ownerId: string
  scope: string
  entries: ReferenceEntry[]
}): Promise<void> => {
  if (input.entries.length === 0) return

  const values: unknown[] = []
  const tuples = input.entries.map((entry, index) => {
    const base = index * 7

    values.push(
      entry.assetId,
      input.module,
      input.scope,
      input.ownerType,
      input.ownerId,
      entry.usage,
      entry.position ?? index,
    )

    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
  })

  await getDb().query(
    `INSERT INTO v2_media_references
       (asset_id, module, scope, owner_type, owner_id, usage, position)
     VALUES ${tuples.join(', ')}`,
    values,
  )
}

/** Labels are set separately so the bulk insert stays one statement shape. */
export const setReferenceLabels = async (input: {
  module: string
  ownerType: string
  ownerId: string
  scope: string
  label: string
}): Promise<void> => {
  await getDb().query(
    `UPDATE v2_media_references SET label = $5
      WHERE module = $1 AND owner_type = $2 AND owner_id = $3 AND scope = $4`,
    [input.module, input.ownerType, input.ownerId, input.scope, input.label],
  )
}
