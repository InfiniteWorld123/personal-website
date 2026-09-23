import type { MediaAsset } from '../../contracts/media.contract'
import { notFound, unsupportedFileType } from '../../http/error'
import { requireMediaStore, type MediaStore } from '../../media/store'
import { getAsset, uploadAsset } from '../media/media.service'
import { mediaAcceptsType } from './inbox.files'
import * as repo from './inbox.repo'

/**
 * Files that arrived with an email: a private download, and — only when the
 * owner asks and Media accepts the type — a copy into the shared library.
 */

export type OpenedIncoming = {
  body: ReadableStream<Uint8Array>
  fileName: string
  /** Only a type Media also accepts is named; anything else is opaque bytes. */
  contentType: string
  byteSize: number
}

export const openIncomingAttachment = async (id: string, store?: MediaStore): Promise<OpenedIncoming> => {
  const row = await repo.findAttachment(id)

  if (!row || row.status !== 'stored' || !row.storage_key) throw notFound('That attachment is not available')

  const object = await (store ?? (await requireMediaStore())).get(row.storage_key)

  if (!object) throw notFound('That attachment is missing from storage')

  return {
    body: object.body,
    fileName: row.file_name,
    contentType: mediaAcceptsType(row.detected_type) ? row.detected_type! : 'application/octet-stream',
    byteSize: Number(row.byte_size),
  }
}

/**
 * The owner's explicit Save to Media.
 *
 * The bytes go through the ordinary Media upload, so the library's own type
 * check runs again on them — this route cannot put anything into Media that
 * an upload from the owner's computer could not. The copy is the library's:
 * deleting this conversation later leaves it where it is.
 *
 * Saving the same attachment twice returns the copy already made, as long as
 * it is still in the library.
 */
export const saveAttachmentToMedia = async (input: {
  id: string
  folderId: string | null
  store?: MediaStore
}): Promise<{ asset: MediaAsset; alreadySaved: boolean }> => {
  const row = await repo.findAttachment(input.id)

  if (!row || row.status !== 'stored' || !row.storage_key) throw notFound('That attachment is not available')

  if (!mediaAcceptsType(row.detected_type)) {
    throw unsupportedFileType(
      'The Media library does not accept this type of file. Download it to your computer instead.',
    )
  }

  if (row.saved_media_asset_id) {
    try {
      return { asset: await getAsset(row.saved_media_asset_id), alreadySaved: true }
    } catch {
      // The earlier copy was deleted from Media; make a new one.
    }
  }

  const store = input.store ?? (await requireMediaStore())
  const object = await store.get(row.storage_key)

  if (!object) throw notFound('That attachment is missing from storage')

  const { asset } = await uploadAsset({
    body: object.body,
    declaredSize: Number(row.byte_size),
    fileName: row.file_name,
    folderId: input.folderId,
    store,
  })

  await repo.setSavedMediaAsset(row.id, asset.id)

  return { asset, alreadySaved: false }
}
