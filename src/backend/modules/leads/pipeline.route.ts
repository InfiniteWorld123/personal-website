import { Elysia } from 'elysia'
import * as v from 'valibot'
import { responseOk } from '#/backend/shared/response'
import { parseInput } from '#/backend/shared/validate'
import {
  LeadFieldsWriteSchema,
  LeadPreferencesSchema,
  LeadSnoozeSchema,
  LeadStageWriteSchema,
  ManualLeadSchema,
  PipelineFilterSchema,
  SuggestionDecisionSchema,
  readLeadPreferences,
} from '#/shared/validation/pipeline.validation'
import {
  applySuggestion,
  createManualLead,
  getLeadSettings,
  listCallsWithLeads,
  listServices,
  markCallNoShow,
  readPipeline,
  readStats,
  readToday,
  reopenLead,
  saveLeadPreferences,
  setLeadFields,
  setLeadStage,
  snoozeLead,
} from './pipeline.service'

const IdSchema = v.pipe(v.string(), v.uuid('That is not a valid id'))

/** Query strings arrive as text; the contract wants a boolean and a picklist. */
const FilterQuerySchema = v.pipe(
  v.object({
    service: v.optional(v.string()),
    search: v.optional(v.string()),
    sort: v.optional(v.string()),
    withClosed: v.optional(v.string()),
  }),
  v.transform((query) => ({
    service: query.service,
    search: query.search,
    sort: query.sort,
    withClosed: query.withClosed === undefined ? undefined : query.withClosed !== 'false',
  })),
)

/**
 * The pipeline behind the admin guard, mounted beside the inbox rather than
 * under it: the same records, a different question. Every response is a
 * projection built in the service — never a table row.
 */
export const adminPipelineRoutes = new Elysia({ prefix: '/pipeline' })
  .get('/', async ({ query }) =>
    responseOk({
      data: await readPipeline(parseInput(PipelineFilterSchema, parseInput(FilterQuerySchema, query))),
      message: 'Pipeline read',
    }),
  )
  /** Literal segments sit above `/:id` so none of them is read as an id. */
  .get('/today', async () => responseOk({ data: await readToday(), message: 'Today read' }))
  .get('/stats', async () => responseOk({ data: await readStats(), message: 'Numbers read' }))
  .get('/services', async () => responseOk({ data: await listServices(), message: 'Services listed' }))
  .get('/calls', async ({ query }) =>
    responseOk({
      data: await listCallsWithLeads(parseInput(PipelineFilterSchema, parseInput(FilterQuerySchema, query))),
      message: 'Calls listed',
    }),
  )
  .get('/settings', async () => responseOk({ data: await getLeadSettings(), message: 'Lead settings read' }))
  .put('/settings', async ({ body }) =>
    responseOk({
      // Parsed for shape, then read through the same reader the service uses,
      // so a stored row that predates a switch still returns the full set.
      data: await saveLeadPreferences(readLeadPreferences(parseInput(LeadPreferencesSchema, body))),
      message: 'Lead settings saved',
    }),
  )
  .post('/leads', async ({ body }) =>
    responseOk({
      data: await createManualLead(parseInput(ManualLeadSchema, body)),
      message: 'Lead added',
    }),
  )
  .patch('/:id/stage', async ({ params, body }) => {
    const input = parseInput(LeadStageWriteSchema, body)

    return responseOk({
      data: await setLeadStage(parseInput(IdSchema, params.id), input.status, input.lostReason),
      message: 'Stage updated',
    })
  })
  .patch('/:id/fields', async ({ params, body }) =>
    responseOk({
      data: await setLeadFields(parseInput(IdSchema, params.id), parseInput(LeadFieldsWriteSchema, body)),
      message: 'Lead updated',
    }),
  )
  .post('/:id/snooze', async ({ params, body }) =>
    responseOk({
      data: await snoozeLead(parseInput(IdSchema, params.id), parseInput(LeadSnoozeSchema, body).days),
      message: 'Snoozed',
    }),
  )
  .post('/:id/suggestion', async ({ params, body }) =>
    responseOk({
      data: await applySuggestion(parseInput(IdSchema, params.id), parseInput(SuggestionDecisionSchema, body)),
      message: 'Suggestion handled',
    }),
  )
  .post('/:id/no-show', async ({ params }) =>
    responseOk({ data: await markCallNoShow(parseInput(IdSchema, params.id)), message: 'Marked as a no-show' }),
  )
  /** The undo beside an automatic close. */
  .post('/:id/reopen', async ({ params }) =>
    responseOk({ data: await reopenLead(parseInput(IdSchema, params.id)), message: 'Reopened' }),
  )
