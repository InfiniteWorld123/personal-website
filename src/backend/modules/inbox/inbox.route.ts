import { Elysia } from 'elysia'
import { adminGuard } from '#/backend/modules/admin/admin.guard'
import { badRequestError } from '#/backend/shared/error'
import { readFormDataWithinLimit } from '#/backend/shared/request-body'
import { HttpStatusCode } from '#/backend/shared/http'
import { responseOk } from '#/backend/shared/response'
import { parseInput } from '#/backend/shared/validate'
import {
  ComposeSchema,
  IdSchema,
  InboxQuerySchema,
  NoteSchema,
  PersonWriteSchema,
  ReplySchema,
  SignatureSchema,
  SnippetsSchema,
} from '#/shared/validation/inbox.validation'
import { deleteAttachment, readAttachment, storeAttachment } from './attachment.service'
import { compose, reply, setMessageRead } from './message.service'
import {
  addNote,
  deleteNote,
  getPerson,
  listInbox,
  setArchived,
  setRead,
  setStarred,
  updateNote,
  updatePerson,
} from './person.service'
import { getSettings, saveSignature, saveSnippets } from './settings.service'

const id = (value: unknown) => parseInput(IdSchema, value)

/**
 * One letter with its files. Twenty-five megabytes, read through a ceiling.
 *
 * Each file is refused above ten on its own; this is the whole multipart body,
 * so a handful of large ones cannot be buffered into memory together.
 */
const MAX_COMPOSE_BYTES = 25 * 1024 * 1024

/**
 * The inbox. One section, behind the admin guard.
 *
 * Static paths are declared before `/:personId` so `compose`, `settings` and
 * `attachments` are never read as somebody's id.
 */
export const adminInboxRoutes = new Elysia({ prefix: '/inbox' })
  .use(adminGuard)

  .get('/', async ({ query }) =>
    responseOk({ data: await listInbox(parseInput(InboxQuerySchema, query)), message: 'Inbox listed' }),
  )

  /* ------------------------------------------------------------- settings */
  .get('/settings', async () =>
    responseOk({ data: await getSettings(), message: 'Settings loaded' }),
  )
  .put('/settings/signature', async ({ body }) =>
    responseOk({
      data: await saveSignature(parseInput(SignatureSchema, body)),
      message: 'Signature saved',
    }),
  )
  .put('/settings/snippets', async ({ body }) =>
    responseOk({
      data: await saveSnippets(parseInput(SnippetsSchema, body)),
      message: 'Snippets saved',
    }),
  )

  /* ---------------------------------------------------------- one letter */
  /*
   * Multipart, not JSON, because the letter and its files are one act.
   *
   * Writing to a new address has to create the person before a file can belong
   * to them, so splitting this into "create, then upload, then send" would let
   * a refused attachment leave a person in the inbox he never wrote to — and
   * that is on top of the fault it replaces, where the compose page uploaded
   * *after* sending and lost the file in silence.
   */
  .post('/compose', async ({ request, status }) => {
    const form = await readFormDataWithinLimit(request, MAX_COMPOSE_BYTES).catch(() => null)

    if (!form) throw badRequestError('That message could not be read')

    const written = form.get('message')

    if (typeof written !== 'string') throw badRequestError('That message could not be read')

    let parsed: unknown

    try {
      parsed = JSON.parse(written)
    } catch {
      throw badRequestError('That message could not be read')
    }

    const files = form.getAll('file').filter((file): file is File => file instanceof File)

    return status(
      HttpStatusCode.CREATED,
      responseOk({
        data: await compose(parseInput(ComposeSchema, parsed), files),
        message: 'Message sent',
      }),
    )
  })

  /* ---------------------------------------------------------- attachments */
  // Streamed through the guard, never from the bucket's public URL: these are
  // strangers' documents, and an unguessable key is not a permission check.
  .get('/attachments/:attachmentId', async ({ params }) => readAttachment(id(params.attachmentId)))

  /* -------------------------------------------------------------- people */
  .get('/:personId', async ({ params }) =>
    responseOk({ data: await getPerson(id(params.personId)), message: 'Person loaded' }),
  )
  .put('/:personId', async ({ params, body }) =>
    responseOk({
      data: await updatePerson(id(params.personId), parseInput(PersonWriteSchema, body)),
      message: 'Saved',
    }),
  )
  .post('/:personId/star', async ({ params }) =>
    responseOk({ data: await setStarred(id(params.personId), true), message: 'Starred' }),
  )
  .post('/:personId/unstar', async ({ params }) =>
    responseOk({ data: await setStarred(id(params.personId), false), message: 'Star removed' }),
  )
  .post('/:personId/archive', async ({ params }) =>
    responseOk({ data: await setArchived(id(params.personId), true), message: 'Filed' }),
  )
  .post('/:personId/unarchive', async ({ params }) =>
    responseOk({ data: await setArchived(id(params.personId), false), message: 'Back in the inbox' }),
  )
  .post('/:personId/read', async ({ params }) =>
    responseOk({ data: await setRead(id(params.personId), true), message: 'Marked read' }),
  )
  .post('/:personId/unread', async ({ params }) =>
    responseOk({ data: await setRead(id(params.personId), false), message: 'Marked unread' }),
  )

  /* --------------------------------------------------------------- notes */
  .post('/:personId/notes', async ({ params, body, status }) =>
    status(
      HttpStatusCode.CREATED,
      responseOk({
        data: await addNote(id(params.personId), parseInput(NoteSchema, body)),
        message: 'Note saved',
      }),
    ),
  )
  .put('/:personId/notes/:noteId', async ({ params, body }) =>
    responseOk({
      data: await updateNote(id(params.personId), id(params.noteId), parseInput(NoteSchema, body)),
      message: 'Note saved',
    }),
  )
  .delete('/:personId/notes/:noteId', async ({ params }) =>
    responseOk({
      data: await deleteNote(id(params.personId), id(params.noteId)),
      message: 'Note removed',
    }),
  )

  /* ----------------------------------------------------------- answering */
  .post('/:personId/reply', async ({ params, body, status }) =>
    status(
      HttpStatusCode.CREATED,
      responseOk({
        data: await reply(id(params.personId), parseInput(ReplySchema, body)),
        message: 'Reply sent',
      }),
    ),
  )
  .post('/:personId/messages/:messageId/read', async ({ params }) => {
    await setMessageRead(id(params.personId), id(params.messageId), true)

    return responseOk({ data: { read: true }, message: 'Marked read' })
  })
  .post('/:personId/messages/:messageId/unread', async ({ params }) => {
    await setMessageRead(id(params.personId), id(params.messageId), false)

    return responseOk({ data: { read: false }, message: 'Marked unread' })
  })

  /* --------------------------------------------------------- attachments */
  .post('/:personId/attachments', async ({ params, request, status }) => {
    const form = await request.formData().catch(() => null)
    const file = form?.get('file')

    if (!(file instanceof File)) throw badRequestError('No file arrived')

    return status(
      HttpStatusCode.CREATED,
      responseOk({
        data: await storeAttachment({ personId: id(params.personId), file, direction: 'OUT' }),
        message: 'File stored',
      }),
    )
  })
  .delete('/:personId/attachments/:attachmentId', async ({ params }) => {
    await deleteAttachment(id(params.personId), id(params.attachmentId))

    return responseOk({ data: { deleted: true }, message: 'File removed' })
  })
