import { Elysia } from 'elysia'
import { HttpStatusCode } from '#/backend/shared/http'
import { responseOk } from '#/backend/shared/response'
import { parseInput } from '#/backend/shared/validate'
import {
  InboxPreferencesSchema,
  LeadBulkSchema,
  LeadFilterSchema,
  LeadNoteWriteSchema,
  LeadReplySchema,
  LeadStatusWriteSchema,
  type InboxPreferences,
} from '#/shared/validation/lead.validation'
import * as v from 'valibot'
import {
  addLeadNote,
  applyLeadBulkAction,
  countUnreadLeads,
  deleteLeadNote,
  getInboxSettings,
  getLeadForAdmin,
  listLeadsForAdmin,
  markLeadRead,
  replyToLead,
  saveInboxPreferences,
  setLeadArchived,
  setLeadJunk,
  setLeadStatus,
} from './lead.service'

const IdSchema = v.pipe(v.string(), v.uuid('That is not a valid id'))

/** Query strings arrive as text; the page number is a number in the contract. */
const FilterQuerySchema = v.pipe(
  v.object({
    tab: v.optional(v.string()),
    search: v.optional(v.string()),
    page: v.optional(v.string()),
    withBookings: v.optional(v.string()),
  }),
  v.transform((query) => ({
    tab: query.tab,
    search: query.search,
    page: query.page ? Number(query.page) : undefined,
    withBookings: query.withBookings === undefined ? undefined : query.withBookings !== 'false',
  })),
)

const FlagSchema = v.object({ value: v.boolean() })

/**
 * The inbox behind the admin guard. Every response is a projection built in
 * the service — never a table row.
 */
export const adminLeadRoutes = new Elysia({ prefix: '/leads' })
  .get('/', async ({ query }) =>
    responseOk({
      data: await listLeadsForAdmin(
        parseInput(LeadFilterSchema, parseInput(FilterQuerySchema, query)),
      ),
      message: 'Messages listed',
    }),
  )
  /** Sits above `/:id`: a literal segment must not be read as an id. */
  .get('/unread', async () =>
    responseOk({ data: await countUnreadLeads(), message: 'Unread counted' }),
  )
  .get('/settings', async () =>
    responseOk({ data: await getInboxSettings(), message: 'Inbox settings read' }),
  )
  .put('/settings', async ({ body }) =>
    responseOk({
      data: await saveInboxPreferences(
        parseInput(InboxPreferencesSchema, body) as InboxPreferences,
      ),
      message: 'Inbox settings saved',
    }),
  )
  .post('/bulk', async ({ body }) =>
    responseOk({
      data: await applyLeadBulkAction(parseInput(LeadBulkSchema, body)),
      message: 'Messages updated',
    }),
  )
  .get('/:id', async ({ params }) =>
    responseOk({
      data: await getLeadForAdmin(parseInput(IdSchema, params.id)),
      message: 'Message loaded',
    }),
  )
  .patch('/:id/status', async ({ params, body }) =>
    responseOk({
      data: await setLeadStatus(
        parseInput(IdSchema, params.id),
        parseInput(LeadStatusWriteSchema, body).status,
      ),
      message: 'Status updated',
    }),
  )
  .patch('/:id/read', async ({ params, body }) =>
    responseOk({
      data: await markLeadRead(parseInput(IdSchema, params.id), parseInput(FlagSchema, body).value),
      message: 'Message updated',
    }),
  )
  .patch('/:id/archived', async ({ params, body }) =>
    responseOk({
      data: await setLeadArchived(
        parseInput(IdSchema, params.id),
        parseInput(FlagSchema, body).value,
      ),
      message: 'Message updated',
    }),
  )
  .patch('/:id/junk', async ({ params, body }) =>
    responseOk({
      data: await setLeadJunk(parseInput(IdSchema, params.id), parseInput(FlagSchema, body).value),
      message: 'Message updated',
    }),
  )
  .post('/:id/notes', async ({ params, body, status }) =>
    status(
      HttpStatusCode.CREATED,
      responseOk({
        data: await addLeadNote(
          parseInput(IdSchema, params.id),
          parseInput(LeadNoteWriteSchema, body).body,
        ),
        message: 'Note saved',
      }),
    ),
  )
  .delete('/:id/notes/:noteId', async ({ params }) =>
    responseOk({
      data: await deleteLeadNote(parseInput(IdSchema, params.id), parseInput(IdSchema, params.noteId)),
      message: 'Note deleted',
    }),
  )
  .post('/:id/reply', async ({ params, body, status }) =>
    status(
      HttpStatusCode.CREATED,
      responseOk({
        data: await replyToLead(parseInput(IdSchema, params.id), parseInput(LeadReplySchema, body)),
        message: 'Reply sent',
      }),
    ),
  )
