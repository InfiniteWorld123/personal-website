import { Elysia } from 'elysia'
import { adminGuard } from '#/backend/modules/admin/admin.guard'
import { HttpStatusCode } from '#/backend/shared/http'
import { responseOk } from '#/backend/shared/response'
import { parseInput } from '#/backend/shared/validate'
import {
  DealMoveSchema,
  DealWriteSchema,
  EventNoteSchema,
  IdSchema,
  LeadQuerySchema,
} from '#/shared/validation/lead.validation'
import { createDeal, deleteDeal, moveDeal, updateDeal } from './deal.service'
import { addLine, deleteLine } from './event.service'
import { getBoard, getLeadFile, listLeads, overdueCount } from './lead.service'

const id = (value: unknown) => parseInput(IdSchema, value)

/**
 * The lead system, behind the admin guard.
 *
 * Static paths are declared before `/:personId`, so `board` and `overdue` are
 * never read as somebody's id.
 *
 * Every write answers with the **whole file** rather than with the one thing
 * it changed. Moving a deal changes its stage, the history, the follow-up
 * grouping and three of the four numbers at once; handing back a fragment
 * would leave the screen to guess the rest, and guessing is how the last panel
 * started showing figures nobody could trace.
 */
export const adminLeadRoutes = new Elysia({ prefix: '/leads' })
  .use(adminGuard)

  .get('/', async ({ query }) =>
    responseOk({ data: await listLeads(parseInput(LeadQuerySchema, query)), message: 'Leads listed' }),
  )

  .get('/board', async () => responseOk({ data: await getBoard(), message: 'Board loaded' }))

  /** One number, for the count on the sidebar. Its own route because it is
   *  asked for on every admin page, and the list is not. */
  .get('/overdue', async () =>
    responseOk({ data: { count: await overdueCount() }, message: 'Counted' }),
  )

  .get('/:personId', async ({ params }) =>
    responseOk({ data: await getLeadFile(id(params.personId)), message: 'File loaded' }),
  )

  /* --------------------------------------------------------------- deals */
  .post('/:personId/deals', async ({ params, body, status }) => {
    const personId = id(params.personId)

    await createDeal(personId, parseInput(DealWriteSchema, body))

    return status(
      HttpStatusCode.CREATED,
      responseOk({ data: await getLeadFile(personId), message: 'Deal opened' }),
    )
  })

  .put('/:personId/deals/:dealId', async ({ params, body }) => {
    const personId = id(params.personId)

    await updateDeal(personId, id(params.dealId), parseInput(DealWriteSchema, body))

    return responseOk({ data: await getLeadFile(personId), message: 'Saved' })
  })

  /**
   * Moving between stages, reason included.
   *
   * Losing is not a save with a different value in it: the schema refuses a
   * move to `LOST` without a reason, and so does the table.
   */
  .post('/:personId/deals/:dealId/move', async ({ params, body }) => {
    const personId = id(params.personId)

    await moveDeal(personId, id(params.dealId), parseInput(DealMoveSchema, body))

    return responseOk({ data: await getLeadFile(personId), message: 'Moved' })
  })

  .delete('/:personId/deals/:dealId', async ({ params }) => {
    const personId = id(params.personId)

    await deleteDeal(personId, id(params.dealId))

    return responseOk({ data: await getLeadFile(personId), message: 'Deal removed' })
  })

  /* ------------------------------------------------------------- history */
  .post('/:personId/events', async ({ params, body, status }) => {
    const personId = id(params.personId)

    await addLine(personId, parseInput(EventNoteSchema, body))

    return status(
      HttpStatusCode.CREATED,
      responseOk({ data: await getLeadFile(personId), message: 'Written down' }),
    )
  })

  .delete('/:personId/events/:eventId', async ({ params }) => {
    const personId = id(params.personId)

    await deleteLine(personId, id(params.eventId))

    return responseOk({ data: await getLeadFile(personId), message: 'Line removed' })
  })
