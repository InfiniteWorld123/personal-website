import { Elysia } from 'elysia'
import { adminGuard } from '#/backend/modules/admin/admin.guard'
import { badRequestError } from '#/backend/shared/error'
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
 * Multipart bodies are read from Elysia's `body`, never from `request`.
 *
 * On Cloudflare `new Function` is forbidden, so Elysia runs without AOT and
 * parses every body itself *before* the handler runs — which consumes the
 * request stream. A handler that then calls `request.formData()` gets nothing,
 * and this route answered "That message could not be read" to every letter on
 * the live site while passing every test on the Node dev server, where AOT is
 * on and the stream is left alone. The ceiling on the body's size lives in
 * `start.ts`, on the Content-Length, before either of them sees it.
 *
 * Elysia hands a repeated field back as an array and a single one bare, and it
 * parses a lone field that starts with `{` as JSON on its own initiative —
 * so both shapes are accepted here rather than assumed.
 */
const filesFrom = (body: unknown): File[] => {
  const field = (body as { file?: unknown } | null)?.file

  return (Array.isArray(field) ? field : [field]).filter((file): file is File => file instanceof File)
}

export const readComposeForm = (body: unknown): { message: unknown; files: File[] } => {
  const written = (body as { message?: unknown } | null)?.message

  if (written === undefined || written === null) {
    throw badRequestError('That message could not be read')
  }

  if (typeof written === 'string') {
    try {
      return { message: JSON.parse(written), files: filesFrom(body) }
    } catch {
      throw badRequestError('That message could not be read')
    }
  }

  return { message: written, files: filesFrom(body) }
}

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
  .post('/compose', async ({ body, status }) => {
    const { message, files } = readComposeForm(body)

    return status(
      HttpStatusCode.CREATED,
      responseOk({
        data: await compose(parseInput(ComposeSchema, message), files),
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
  .post('/:personId/attachments', async ({ params, body, status }) => {
    const [file] = filesFrom(body)

    if (!file) throw badRequestError('No file arrived')

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
