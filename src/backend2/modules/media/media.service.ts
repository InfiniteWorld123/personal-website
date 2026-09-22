import type {
  MediaAsset,
  MediaListQuery,
  MediaReference,
} from '../../contracts/media.contract'
import type { Page } from '../../contracts/pagination.contract'
import { toPage } from '../../contracts/pagination.contract'
import { withTransaction } from '../../db/client'
import { deleteBlockedByReferences, nameTaken, notFound } from '../../http/error'
import { sanitizeFileName } from '../../media/naming'
import { requireMediaStore, type MediaStore } from '../../media/store'
import { storeUploadedFile } from '../../media/upload'
import { assertFolderExists } from './folder.service'
import { toAsset, toFreshAsset, toReference } from './media.mapper'
import * as repo from './media.repo'

/**
 * The vault itself.
 *
 * One private library, persistent by default. The rules that matter most are
 * the two this file refuses to break: an upload either becomes a library row
 * or leaves nothing behind, and a file that anything still uses cannot be
 * deleted — not by a module, not by a cleanup job, and not by the owner until
 * they have removed the last use themselves.
 */

/* ------------------------------------------------------------------ reading */

export const listLibrary = async (input: {
  query: MediaListQuery
  page: number
  pageSize: number
}): Promise<Page<MediaAsset>> => {
  const { rows, total } = await repo.listAssets({
    query: input.query,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  })

  return toPage({
    items: rows.map(toAsset),
    page: input.page,
    pageSize: input.pageSize,
    total,
  })
}

export const getAsset = async (id: string): Promise<MediaAsset> => {
  const row = await repo.findAssetWithUse(id)

  if (!row) throw notFound('That file is not in the library')

  return toAsset(row)
}

export const getAssetReferences = async (input: {
  assetId: string
  page: number
  pageSize: number
}): Promise<Page<MediaReference>> => {
  if (!(await repo.findAsset(input.assetId))) throw notFound('That file is not in the library')

  const { rows, total } = await repo.listReferences({
    assetId: input.assetId,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  })

  return toPage({
    items: rows.map(toReference),
    page: input.page,
    pageSize: input.pageSize,
    total,
  })
}

/* ---------------------------------------------------------------- uploading */

/**
 * One file, from the owner's computer into the shared library.
 *
 * The order is the whole point. The intention to hold an object is written
 * down *before* the bytes are sent, the row is written *after* they have
 * landed, and the note is cleared last. A process that dies at any point
 * leaves either nothing, or a key the sweep knows to collect — never a library
 * entry pointing at a file that does not exist.
 */
export const uploadAsset = async (input: {
  body: ReadableStream<Uint8Array> | null
  declaredSize: number | null
  fileName: string
  folderId: string | null
  store?: MediaStore
  now?: Date
}): Promise<{ asset: MediaAsset; duplicateOf: string[] }> => {
  const store = input.store ?? (await requireMediaStore())

  await assertFolderExists(input.folderId)

  const stored = await storeUploadedFile({
    body: input.body,
    declaredSize: input.declaredSize,
    store,
    now: input.now,
    fileName: input.fileName,
    beforeWrite: (storageKey) => repo.markPendingObject({ storageKey, purpose: 'upload' }),
  })

  try {
    const asset = await withTransaction(async () => {
      const row = await repo.insertAsset({
        folderId: input.folderId,
        storageKey: stored.storageKey,
        kind: stored.probe.kind,
        contentType: stored.probe.contentType,
        originalName: input.fileName.slice(0, 400),
        displayName: await uniqueName({
          folderId: input.folderId,
          desired: sanitizeFileName(input.fileName, stored.probe.extension),
        }),
        byteSize: stored.byteSize,
        checksum: stored.checksum,
        width: stored.probe.width ?? null,
        height: stored.probe.height ?? null,
      })

      await repo.clearPendingObject(stored.storageKey)

      return row
    })

    /*
     * Not a refusal: the same picture may legitimately be uploaded twice, and
     * silently folding the second into the first would mean deleting one use
     * could surprise another. The library simply says so, and the dashboard
     * can offer the existing file instead.
     */
    const duplicates = (await repo.findAssetsByChecksum(stored.checksum))
      .filter((row) => row.id !== asset.id)
      .map((row) => row.id)

    return { asset: toFreshAsset(asset), duplicateOf: duplicates }
  } catch (error) {
    // The bytes are not going to be pointed at by anything. Take them back.
    await store.remove(stored.storageKey).catch(() => {})
    await repo.clearPendingObject(stored.storageKey).catch(() => {})

    throw error
  }
}

/**
 * Two files in one folder may not share a name.
 *
 * Not a database constraint, because the resolution is not a refusal: the
 * owner uploading `cover.png` twice wants both, and `cover (2).png` is a
 * better answer than an error about something they did not do wrong.
 */
const uniqueName = async (input: {
  folderId: string | null
  desired: string
  excludeId?: string
}): Promise<string> => {
  const dot = input.desired.lastIndexOf('.')
  const base = dot > 0 ? input.desired.slice(0, dot) : input.desired
  const extension = dot > 0 ? input.desired.slice(dot) : ''

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? input.desired : `${base} (${attempt + 1})${extension}`

    const taken = await repo.countAssetsWithName({
      folderId: input.folderId,
      displayName: candidate,
      excludeId: input.excludeId ?? '00000000-0000-0000-0000-000000000000',
    })

    if (taken === 0) return candidate
  }

  return `${base} (${Date.now()})${extension}`
}

/* ------------------------------------------------------- renaming and moving */

/**
 * Neither operation touches the bytes.
 *
 * "Files can move between folders without changing their identities or
 * breaking content references." The storage key is generated once and never
 * rewritten, so every module that already selected this file keeps working.
 */
export const renameOrMoveAsset = async (input: {
  id: string
  displayName?: string
  folderId?: string | null
}): Promise<MediaAsset> => {
  const id = await withTransaction(async () => {
    const asset = await repo.findAsset(input.id)

    if (!asset) throw notFound('That file is not in the library')

    const folderId = input.folderId === undefined ? asset.folder_id : input.folderId

    if (input.folderId !== undefined) await assertFolderExists(input.folderId)

    let displayName: string | undefined

    if (input.displayName !== undefined || input.folderId !== undefined) {
      const extension = asset.display_name.includes('.')
        ? asset.display_name.slice(asset.display_name.lastIndexOf('.') + 1)
        : ''
      const desired = input.displayName
        ? sanitizeFileName(input.displayName, extension)
        : asset.display_name

      const resolved = await uniqueName({ folderId, desired, excludeId: asset.id })

      // Only an explicit rename may be adjusted; a move that collides says so.
      if (input.displayName === undefined && resolved !== desired) {
        throw nameTaken(`There is already a file called “${desired}” in that folder`)
      }

      displayName = resolved
    }

    await repo.updateAssetRow({ id: asset.id, displayName, folderId: input.folderId })

    return asset.id
  })

  // Read back outside the transaction so the response carries the use counts
  // the library list shows, rather than a shape that is missing them.
  return getAsset(id)
}

/* ----------------------------------------------------------------- deleting */

/**
 * Permanent deletion, and everything that has to be true first.
 *
 * `docs/v2/media.md`: "Never remove the bytes first and then discover a
 * reference." So the references are counted, the row is deleted under the
 * `ON DELETE RESTRICT` foreign key that would refuse anyway if a module
 * inserted a use in the meantime, and only a committed transaction is followed
 * by the call that removes the object.
 */
export const deleteAsset = async (input: {
  id: string
  store?: MediaStore
}): Promise<{ storageRemoved: boolean }> => {
  const store = input.store ?? (await requireMediaStore())

  const storageKey = await withTransaction(async () => {
    const asset = await repo.findAsset(input.id)

    if (!asset) throw notFound('That file is not in the library')

    const total = await repo.countReferences(asset.id)

    if (total > 0) {
      const { rows } = await repo.listReferences({ assetId: asset.id, limit: 20, offset: 0 })

      throw deleteBlockedByReferences(
        `That file is used in ${total} place${total === 1 ? '' : 's'}. ` +
          'Remove it there before deleting it.',
        { referenceCount: total, references: rows.map(toReference) },
      )
    }

    // Written inside the same transaction as the delete: either the library
    // forgets the file and the key is recorded, or neither happens.
    await repo.markPendingObject({ storageKey: asset.storage_key, purpose: 'delete' })
    await repo.deleteAssetRow(asset.id)

    return asset.storage_key
  })

  try {
    await store.remove(storageKey)
    await repo.clearPendingObject(storageKey)

    return { storageRemoved: true }
  } catch (error) {
    /*
     * The library entry is gone, which is what the owner asked for, and the
     * object is recorded for the sweep. Reported rather than swallowed: the
     * specification asks that a half-finished deletion never be presented as a
     * clean one.
     */
    await repo
      .recordPendingObjectFailure({
        storageKey,
        error: error instanceof Error ? error.message : String(error),
      })
      .catch(() => {})

    return { storageRemoved: false }
  }
}

/* ------------------------------------------------------------------ serving */

export type OpenedAsset = {
  asset: MediaAsset
  body: ReadableStream<Uint8Array>
  contentType: string
}

const open = async (id: string, store: MediaStore): Promise<OpenedAsset> => {
  const row = await repo.findAssetWithUse(id)

  if (!row) throw notFound('That file is not in the library')

  const object = await store.get(row.storage_key)

  if (!object) {
    /*
     * A row pointing at bytes that are not there. Not a 500: the owner needs
     * to know which file is affected so they can replace it.
     */
    throw notFound('That file is missing from storage')
  }

  return { asset: toAsset(row), body: object.body, contentType: row.content_type }
}

/** Any file in the vault, for the owner, behind the owner guard. */
export const openOwnerAsset = async (id: string, store?: MediaStore): Promise<OpenedAsset> =>
  open(id, store ?? (await requireMediaStore()))

/**
 * A file a visitor may have, and only such a file.
 *
 * The check is "does a live published snapshot use this right now", made on
 * every request. An id that was public yesterday is a 404 today if the content
 * that used it was unpublished — "possession of an opaque ID alone grants no
 * access."
 */
export const openPublicAsset = async (id: string, store?: MediaStore): Promise<OpenedAsset> => {
  if (!(await repo.hasPublishedReference(id))) throw notFound('Not found')

  return open(id, store ?? (await requireMediaStore()))
}

/* ------------------------------------------- the contract other modules use */

export type ModuleName = 'projects' | 'blog' | 'services' | 'invoices' | 'content'
export type ReferenceScope = 'draft' | 'scheduled' | 'published' | 'record'

/**
 * How a module declares which files one of its records uses.
 *
 * Called in-process, never over HTTP: a reference is what makes a file
 * undeletable and — at `published` scope — publicly servable, so the picker in
 * the browser must not be able to write one.
 *
 * Replace-in-place, in one transaction: the module sends the complete set for
 * that record and scope, and what it does not send stops being a use. A draft
 * and a published version of the same record are separate scopes on purpose,
 * so saving a draft that drops an image cannot take that image off the live
 * page.
 */
export const replaceReferences = async (input: {
  module: ModuleName
  ownerType: string
  ownerId: string
  scope: ReferenceScope
  label?: string
  entries: repo.ReferenceEntry[]
}): Promise<void> =>
  withTransaction(async () => {
    for (const entry of input.entries) {
      if (!(await repo.findAsset(entry.assetId))) {
        throw notFound('That file is not in the library')
      }
    }

    await repo.deleteReferencesForOwner(input)
    await repo.insertReferences(input)

    if (input.label) await repo.setReferenceLabels({ ...input, label: input.label })
  })

/** Everything one record used, forgotten. The files themselves stay. */
export const releaseReferences = async (input: {
  module: ModuleName
  ownerType: string
  ownerId: string
  scope: ReferenceScope
}): Promise<void> => repo.deleteReferencesForOwner(input)

/* -------------------------------------------------------------------- sweep */

/**
 * Finishes what a crash interrupted, and nothing else.
 *
 * It removes objects the ledger recorded — bytes whose library row was never
 * written, and bytes whose row the owner deleted — after a grace period,
 * because an upload exists for a moment before its row does. It does **not**
 * look for assets nothing references: those are the vault.
 */
export const sweepPendingObjects = async (input: {
  graceHours?: number
  limit?: number
  store?: MediaStore
  now?: Date
}): Promise<{ removed: string[]; failed: string[] }> => {
  const store = input.store ?? (await requireMediaStore())
  const now = input.now ?? new Date()
  const olderThan = new Date(now.getTime() - (input.graceHours ?? 24) * 60 * 60 * 1000)

  const pending = await repo.findPendingObjects({ olderThan, limit: input.limit ?? 200 })
  const removed: string[] = []
  const failed: string[] = []

  for (const row of pending) {
    try {
      await store.remove(row.storage_key)
      await repo.clearPendingObject(row.storage_key)
      removed.push(row.storage_key)
    } catch (error) {
      await repo
        .recordPendingObjectFailure({
          storageKey: row.storage_key,
          error: error instanceof Error ? error.message : String(error),
        })
        .catch(() => {})
      failed.push(row.storage_key)
    }
  }

  return { removed, failed }
}
