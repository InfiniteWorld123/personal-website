import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  CreateFolderSchema,
  MediaListQuerySchema,
  UpdateAssetSchema,
  UpdateFolderSchema,
} from '../../contracts/media.contract'
import { PageQuerySchema } from '../../contracts/pagination.contract'
import { readJsonBody } from '../../http/body'
import { HttpStatus } from '../../http/status'
import { parseInput } from '../../http/validate'
import { ownerGuard } from '../../security/owner-guard'
import {
  fileResponse,
  ownerJson,
  readDeclaredSize,
  readFileNameHeader,
  readFolderHeader,
} from './media.http'
import { createFolder, deleteFolder, folderTree, renameOrMoveFolder } from './folder.service'
import {
  deleteAsset,
  getAsset,
  getAssetReferences,
  listLibrary,
  openOwnerAsset,
  renameOrMoveAsset,
  uploadAsset,
} from './media.service'

/**
 * The owner's library, over HTTP.
 *
 * Thin, like every other Backend2 route file: parse, delegate, respond. The
 * whole group sits behind `ownerGuard`, which is the deployment fence plus —
 * once `BACKEND2_OWNER_AUTH=required` — a real V2 owner session. Nothing here
 * re-implements that check, and nothing here is reachable without it.
 */

const IdSchema = v.pipe(v.string(), v.uuid('That is not a valid id'))

export const ownerMediaRoutes = new Elysia({ prefix: '/media' })
  .use(ownerGuard)

  /* ------------------------------------------------------------- the library */

  .get('/files', async ({ query }) => {
    const filter = parseInput(MediaListQuerySchema, query)
    const page = parseInput(PageQuerySchema, query)

    return ownerJson({
      data: await listLibrary({ query: filter, page: page.page, pageSize: page.pageSize }),
      message: 'Library loaded',
    })
  })

  /**
   * One file, from the owner's computer.
   *
   * The body is the file itself rather than a multipart envelope: the ceiling
   * is 100 MB, `request.formData()` buffers all of it, and a Worker has 128 MB
   * of memory. Sent as a raw body it streams through, and the browser still
   * reports progress — `XMLHttpRequest.upload` does that for a `File` body.
   */
  .post('/files', async ({ request }) => {
    const result = await uploadAsset({
      body: request.body,
      declaredSize: readDeclaredSize(request),
      fileName: readFileNameHeader(request),
      folderId: readFolderHeader(request),
    })

    return ownerJson({
      data: result,
      message: 'Added to the library',
      status: HttpStatus.CREATED,
    })
  })

  .get('/files/:id', async ({ params }) =>
    ownerJson({ data: await getAsset(parseInput(IdSchema, params.id)), message: 'File loaded' }),
  )

  .patch('/files/:id', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const input = parseInput(UpdateAssetSchema, await readJsonBody(request))

    return ownerJson({
      data: await renameOrMoveAsset({ id, ...input }),
      message: 'File updated',
    })
  })

  /**
   * Refused while anything still points at the file, including a draft nobody
   * has published. The refusal carries the uses, so the dashboard can say where
   * rather than only no.
   */
  .delete('/files/:id', async ({ params }) => {
    const result = await deleteAsset({ id: parseInput(IdSchema, params.id) })

    return ownerJson({
      data: result,
      message: result.storageRemoved
        ? 'File deleted'
        : 'The file was removed from the library, but its stored copy could not be deleted yet. It is queued for cleanup.',
    })
  })

  /** Private preview and download. Never cached, by anything, anywhere. */
  .get('/files/:id/content', async ({ params }) =>
    fileResponse(await openOwnerAsset(parseInput(IdSchema, params.id)), {
      cacheControl: 'no-store, no-cache, must-revalidate, private',
    }),
  )

  .get('/files/:id/references', async ({ params, query }) => {
    const page = parseInput(PageQuerySchema, query)

    return ownerJson({
      data: await getAssetReferences({
        assetId: parseInput(IdSchema, params.id),
        page: page.page,
        pageSize: page.pageSize,
      }),
      message: 'Uses loaded',
    })
  })

  /* ------------------------------------------------------------------ folders */

  .get('/folders', async () => ownerJson({ data: await folderTree(), message: 'Folders loaded' }))

  .post('/folders', async ({ request }) => {
    const input = parseInput(CreateFolderSchema, await readJsonBody(request))

    return ownerJson({
      data: await createFolder({ name: input.name, parentId: input.parentId ?? null }),
      message: 'Folder created',
      status: HttpStatus.CREATED,
    })
  })

  .patch('/folders/:id', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const input = parseInput(UpdateFolderSchema, await readJsonBody(request))

    return ownerJson({ data: await renameOrMoveFolder({ id, ...input }), message: 'Folder updated' })
  })

  .delete('/folders/:id', async ({ params }) => {
    await deleteFolder(parseInput(IdSchema, params.id))

    return ownerJson({ data: { deleted: true }, message: 'Folder deleted' })
  })
