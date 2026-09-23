import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  ConversationDeleteSchema,
  ConversationDetailQuerySchema,
  ConversationListQuerySchema,
  ConversationPatchSchema,
  CreateDraftSchema,
  DraftListQuerySchema,
  DraftPatchSchema,
  EmptyTrashSchema,
  SaveToMediaSchema,
  SendDraftSchema,
  SettingsPutSchema,
  SnippetInputSchema,
  SnippetListQuerySchema,
} from '../../contracts/inbox.contract'
import { readJsonBody } from '../../http/body'
import { HttpStatus } from '../../http/status'
import { parseInput } from '../../http/validate'
import { contentDisposition } from '../../media/naming'
import { ownerGuard } from '../../security/owner-guard'
import { ownerJson } from '../media/media.http'
import { openIncomingAttachment, saveAttachmentToMedia } from './attachment.service'
import {
  countInbox,
  deleteConversation,
  emptyTrash,
  getConversation,
  getMessageHtml,
  listConversations,
  patchConversation,
  restoreConversation,
  trashConversation,
} from './conversation.service'
import { createDraft, discardDraft, getDraft, listDrafts, patchDraft } from './draft.service'
import { retryMessage, sendDraft } from './send.service'
import {
  createSnippet,
  deleteSnippet,
  getSettings,
  listSnippets,
  putSettings,
  updateSnippet,
} from './settings.service'

/**
 * The owner's mailbox, over HTTP. Thin: parse, delegate, respond.
 *
 * Behind `ownerGuard` — the deployment fence, plus a V2 owner session where
 * `BACKEND2_OWNER_AUTH=required` — like every other owner module. Every reply
 * is `no-store`: a message body must not survive in any cache.
 */

const Id = (what: string) => v.pipe(v.string(), v.uuid(`That is not a valid ${what} id`))

export const ownerInboxRoutes = new Elysia({ prefix: '/inbox' })
  .use(ownerGuard)

  .get('/counts', async () => ownerJson({ data: await countInbox(), message: 'Counts' }))

  .get('/conversations', async ({ query }) =>
    ownerJson({
      data: await listConversations(parseInput(ConversationListQuerySchema, query)),
      message: 'Conversations loaded',
    }),
  )

  .get('/conversations/:id', async ({ params, query }) => {
    const { page, pageSize } = parseInput(ConversationDetailQuerySchema, query)

    return ownerJson({
      data: await getConversation({ id: parseInput(Id('conversation'), params.id), page, pageSize }),
      message: 'Conversation loaded',
    })
  })

  .patch('/conversations/:id', async ({ params, request }) => {
    const id = parseInput(Id('conversation'), params.id)
    const patch = parseInput(ConversationPatchSchema, await readJsonBody(request))

    return ownerJson({ data: await patchConversation({ id, ...patch }), message: 'Updated' })
  })

  .post('/conversations/:id/trash', async ({ params }) =>
    ownerJson({
      data: await trashConversation(parseInput(Id('conversation'), params.id)),
      message: 'Moved to Trash',
    }),
  )

  .post('/conversations/:id/restore', async ({ params }) =>
    ownerJson({
      data: await restoreConversation(parseInput(Id('conversation'), params.id)),
      message: 'Restored',
    }),
  )

  /** Permanent, from Trash only, and it asks for the conversation's id back. */
  .delete('/conversations/:id', async ({ params, request }) => {
    const id = parseInput(Id('conversation'), params.id)
    const { confirm } = parseInput(ConversationDeleteSchema, await readJsonBody(request))

    return ownerJson({ data: await deleteConversation({ id, confirm }), message: 'Deleted' })
  })

  .post('/trash/empty', async ({ request }) => {
    parseInput(EmptyTrashSchema, await readJsonBody(request))

    return ownerJson({ data: await emptyTrash(), message: 'Trash emptied' })
  })

  /* ----------------------------------------------------------------- drafts */

  .get('/drafts', async ({ query }) =>
    ownerJson({ data: await listDrafts(parseInput(DraftListQuerySchema, query)), message: 'Drafts loaded' }),
  )

  .post('/drafts', async ({ request }) => {
    const input = parseInput(CreateDraftSchema, await readJsonBody(request))
    const { draft, created } = await createDraft(input)

    return ownerJson({
      data: draft,
      message: created ? 'Draft created' : 'Existing reply draft',
      status: created ? HttpStatus.CREATED : HttpStatus.OK,
    })
  })

  .get('/drafts/:id', async ({ params }) =>
    ownerJson({ data: await getDraft(parseInput(Id('draft'), params.id)), message: 'Draft loaded' }),
  )

  /** Autosave. Never sends. */
  .patch('/drafts/:id', async ({ params, request }) => {
    const id = parseInput(Id('draft'), params.id)
    const patch = parseInput(DraftPatchSchema, await readJsonBody(request))

    return ownerJson({ data: await patchDraft({ id, ...patch }), message: 'Draft saved' })
  })

  .delete('/drafts/:id', async ({ params }) =>
    ownerJson({ data: await discardDraft(parseInput(Id('draft'), params.id)), message: 'Draft discarded' }),
  )

  /** The explicit Send. Idempotent per draft. */
  .post('/drafts/:id/send', async ({ params, request }) => {
    const id = parseInput(Id('draft'), params.id)
    const input = parseInput(SendDraftSchema, await readJsonBody(request))

    return ownerJson({
      data: await sendDraft({ draftId: id, ...input }),
      message: 'Sent',
    })
  })

  /* --------------------------------------------------------------- messages */

  .post('/messages/:id/retry', async ({ params }) =>
    ownerJson({ data: await retryMessage(parseInput(Id('message'), params.id)), message: 'Sent' }),
  )

  /**
   * The sender's HTML, as data. The Dashboard shows it inside an iframe with
   * `sandbox` and a CSP that fetches nothing — no script, no remote image, no
   * tracking pixel.
   */
  .get('/messages/:id/html', async ({ params }) =>
    ownerJson({ data: await getMessageHtml(parseInput(Id('message'), params.id)), message: 'HTML' }),
  )

  /* ------------------------------------------------------------ attachments */

  /**
   * Always a download, never shown in the browser: `attachment`, `nosniff`,
   * and a sandbox CSP in case anything tries to render it anyway.
   */
  .get('/attachments/:id', async ({ params }) => {
    const opened = await openIncomingAttachment(parseInput(Id('attachment'), params.id))

    return new Response(opened.body, {
      status: HttpStatus.OK,
      headers: {
        'content-type': opened.contentType,
        'content-length': String(opened.byteSize),
        'content-disposition': contentDisposition(opened.fileName, 'attachment'),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        'referrer-policy': 'no-referrer',
      },
    })
  })

  .post('/attachments/:id/save-to-media', async ({ params, request }) => {
    const id = parseInput(Id('attachment'), params.id)
    const { folderId } = parseInput(SaveToMediaSchema, await readJsonBody(request))
    const result = await saveAttachmentToMedia({ id, folderId })

    return ownerJson({
      data: result,
      message: result.alreadySaved ? 'Already in Media' : 'Saved to Media',
      status: result.alreadySaved ? HttpStatus.OK : HttpStatus.CREATED,
    })
  })

  /* --------------------------------------------------------------- settings */

  .get('/settings', async () => ownerJson({ data: await getSettings(), message: 'Settings loaded' }))

  .put('/settings', async ({ request }) =>
    ownerJson({
      data: await putSettings(parseInput(SettingsPutSchema, await readJsonBody(request))),
      message: 'Settings saved',
    }),
  )

  .get('/snippets', async ({ query }) =>
    ownerJson({
      data: await listSnippets(parseInput(SnippetListQuerySchema, query)),
      message: 'Ready replies loaded',
    }),
  )

  .post('/snippets', async ({ request }) =>
    ownerJson({
      data: await createSnippet(parseInput(SnippetInputSchema, await readJsonBody(request))),
      message: 'Ready reply created',
      status: HttpStatus.CREATED,
    }),
  )

  .patch('/snippets/:id', async ({ params, request }) => {
    const id = parseInput(Id('ready reply'), params.id)
    const input = parseInput(SnippetInputSchema, await readJsonBody(request))

    return ownerJson({ data: await updateSnippet({ id, ...input }), message: 'Ready reply saved' })
  })

  .delete('/snippets/:id', async ({ params }) =>
    ownerJson({ data: await deleteSnippet(parseInput(Id('ready reply'), params.id)), message: 'Deleted' }),
  )

const SAMPLE = '11111111-1111-4111-8111-111111111111'

/** Every owner route, for the tests that walk the fence. */
export const ownerInboxPaths = [
  { method: 'GET', path: '/api/v2/owner/inbox/counts' },
  { method: 'GET', path: '/api/v2/owner/inbox/conversations' },
  { method: 'GET', path: `/api/v2/owner/inbox/conversations/${SAMPLE}` },
  { method: 'PATCH', path: `/api/v2/owner/inbox/conversations/${SAMPLE}` },
  { method: 'POST', path: `/api/v2/owner/inbox/conversations/${SAMPLE}/trash` },
  { method: 'POST', path: `/api/v2/owner/inbox/conversations/${SAMPLE}/restore` },
  { method: 'DELETE', path: `/api/v2/owner/inbox/conversations/${SAMPLE}` },
  { method: 'POST', path: '/api/v2/owner/inbox/trash/empty' },
  { method: 'GET', path: '/api/v2/owner/inbox/drafts' },
  { method: 'POST', path: '/api/v2/owner/inbox/drafts' },
  { method: 'GET', path: `/api/v2/owner/inbox/drafts/${SAMPLE}` },
  { method: 'PATCH', path: `/api/v2/owner/inbox/drafts/${SAMPLE}` },
  { method: 'DELETE', path: `/api/v2/owner/inbox/drafts/${SAMPLE}` },
  { method: 'POST', path: `/api/v2/owner/inbox/drafts/${SAMPLE}/send` },
  { method: 'POST', path: `/api/v2/owner/inbox/messages/${SAMPLE}/retry` },
  { method: 'GET', path: `/api/v2/owner/inbox/messages/${SAMPLE}/html` },
  { method: 'GET', path: `/api/v2/owner/inbox/attachments/${SAMPLE}` },
  { method: 'POST', path: `/api/v2/owner/inbox/attachments/${SAMPLE}/save-to-media` },
  { method: 'GET', path: '/api/v2/owner/inbox/settings' },
  { method: 'PUT', path: '/api/v2/owner/inbox/settings' },
  { method: 'GET', path: '/api/v2/owner/inbox/snippets' },
  { method: 'POST', path: '/api/v2/owner/inbox/snippets' },
  { method: 'PATCH', path: `/api/v2/owner/inbox/snippets/${SAMPLE}` },
  { method: 'DELETE', path: `/api/v2/owner/inbox/snippets/${SAMPLE}` },
] as const
