import type {
  MediaAsset,
  MediaFolder,
  MediaKind,
  MediaReference,
} from '../../contracts/media.contract'
import type { AssetRow, AssetWithUseRow, FolderRow, ReferenceRow } from './media.repo'

/**
 * Rows to the shapes the owner's dashboard receives.
 *
 * The one thing this file exists to guarantee is what it leaves out:
 * `storage_key` has no field in `MediaAsset` and no line here, so an object key
 * cannot reach a response by someone spreading a row into a body.
 */

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()

export const toFolder = (row: FolderRow): MediaFolder => ({
  id: row.id,
  parentId: row.parent_id,
  name: row.name,
  depth: row.depth,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
})

export const toAsset = (row: AssetWithUseRow): MediaAsset => ({
  id: row.id,
  folderId: row.folder_id,
  kind: row.kind as MediaKind,
  contentType: row.content_type,
  displayName: row.display_name,
  originalName: row.original_name,
  byteSize: Number(row.byte_size),
  checksum: row.checksum,
  width: row.width,
  height: row.height,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  referenceCount: Number(row.reference_count),
  isPublished: row.is_published === true,
})

/** For the moment right after an insert, when the use counts are known to be zero. */
export const toFreshAsset = (row: AssetRow): MediaAsset =>
  toAsset({ ...row, reference_count: 0, is_published: false })

export const toReference = (row: ReferenceRow): MediaReference => ({
  id: row.id,
  module: row.module as MediaReference['module'],
  scope: row.scope as MediaReference['scope'],
  ownerType: row.owner_type,
  ownerId: row.owner_id,
  usage: row.usage as MediaReference['usage'],
  position: row.position,
  label: row.label,
  createdAt: iso(row.created_at),
})
