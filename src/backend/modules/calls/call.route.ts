import { Elysia } from 'elysia'
import { adminGuard } from '#/backend/modules/admin/admin.guard'
import { responseOk } from '#/backend/shared/response'
import { parseInput } from '#/backend/shared/validate'
import { BookingTokenSchema } from '#/shared/validation/booking.validation'
import * as v from 'valibot'
import { getHostCallAccess, getVisitorCallAccess } from './call.service'

const IdSchema = v.pipe(v.string(), v.uuid('That is not a valid id'))

/**
 * Two doors into one room.
 *
 * `POST` rather than `GET` on both: nothing is read here. A ticket is minted,
 * relay credentials are bought, and neither should ever be served from a
 * cache — which is exactly what a `GET` invites a browser or a proxy to do.
 */
export const publicCallRoutes = new Elysia({ prefix: '/call' }).post(
  '/bookings/:reference/join',
  async ({ params, request }) =>
    responseOk({
      data: await getVisitorCallAccess(
        params.reference,
        // The same header the cancel and reschedule routes read. The visitor
        // has no account and is not being given one: the token in their email
        // is the whole of their identity here.
        parseInput(BookingTokenSchema, request.headers.get('x-booking-token')),
      ),
      message: 'Call ready',
    }),
)

export const adminCallRoutes = new Elysia({ prefix: '/call' })
  .use(adminGuard)
  .post('/bookings/:id/join', async ({ params }) =>
    responseOk({
      data: await getHostCallAccess(parseInput(IdSchema, params.id)),
      message: 'Call ready',
    }),
  )
