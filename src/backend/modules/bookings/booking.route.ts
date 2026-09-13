import { Elysia } from 'elysia'
import { adminGuard } from '#/backend/modules/admin/admin.guard'
import { getTrustedClientIp } from '#/backend/shared/client-ip'
import { HttpStatusCode } from '#/backend/shared/http'
import { responseOk } from '#/backend/shared/response'
import { parseInput } from '#/backend/shared/validate'
import { assertTurnstile } from '#/backend/shared/turnstile'
import {
  AdminBookingCancelSchema,
  AdminBookingCreateSchema,
  AvailabilityExceptionWriteSchema,
  AvailabilityRulesWriteSchema,
  BOOKING_LANGUAGES,
  BookingCancelSchema,
  BookingCreateSchema,
  BookingFilterSchema,
  BookingRescheduleSchema,
  BookingStatusWriteSchema,
  BookingTokenSchema,
  BookingTypeWriteSchema,
  SlotQuerySchema,
} from '#/shared/validation/booking.validation'
import * as v from 'valibot'
import {
  cancelBookingAsAdmin,
  createBookingAsAdmin,
  cancelBookingByToken,
  createAvailabilityException,
  createBooking,
  createBookingType,
  deleteAvailabilityException,
  deleteBookingType,
  getAvailability,
  getBookingByToken,
  getBookingForAdmin,
  getBookingType,
  getSlots,
  listBookingTypes,
  listBookingsForAdmin,
  listPublicBookingTypes,
  rescheduleBookingByToken,
  saveAvailabilityRules,
  setBookingStatus,
  updateBookingType,
} from './booking.service'

const IdSchema = v.pipe(v.string(), v.uuid('That is not a valid id'))

const LanguageSchema = v.optional(v.picklist(BOOKING_LANGUAGES), 'de')

/**
 * The public booking surface. Every response is an explicit projection built
 * in the service — never a table row — and the only write is guarded by the
 * schedule, the rate limit, and the overlap constraint together.
 */
export const publicBookingRoutes = new Elysia({ prefix: '/booking' })
  .get('/types', async ({ query }) =>
    responseOk({
      data: await listPublicBookingTypes(parseInput(LanguageSchema, query.language)),
      message: 'Call types listed',
    }),
  )
  .get('/types/:slug/slots', async ({ params, query }) =>
    responseOk({
      data: await getSlots(
        params.slug,
        parseInput(LanguageSchema, query.language),
        parseInput(SlotQuerySchema, query),
      ),
      message: 'Slots listed',
    }),
  )
  .post('/bookings', async ({ body, request, status }) => {
    const { turnstileToken, ...input } = parseInput(BookingCreateSchema, body)
    const clientIp = getTrustedClientIp(request)

    await assertTurnstile({ token: turnstileToken, action: 'booking_create', clientIp })

    return status(
      HttpStatusCode.CREATED,
      responseOk({
        data: await createBooking(input, { clientIp }),
        message: 'Booking confirmed',
      }),
    )
  })
  .get('/bookings/:reference', async ({ params, request }) =>
    responseOk({
      data: await getBookingByToken(
        params.reference,
        parseInput(BookingTokenSchema, request.headers.get('x-booking-token')),
      ),
      message: 'Booking loaded',
    }),
  )
  .post('/bookings/:reference/cancel', async ({ params, body, request }) =>
    responseOk({
      data: await cancelBookingByToken(
        params.reference,
        parseInput(BookingTokenSchema, request.headers.get('x-booking-token')),
        parseInput(BookingCancelSchema, body),
      ),
      message: 'Booking cancelled',
    }),
  )
  .post('/bookings/:reference/reschedule', async ({ params, body, request }) =>
    responseOk({
      data: await rescheduleBookingByToken(
        params.reference,
        parseInput(BookingTokenSchema, request.headers.get('x-booking-token')),
        parseInput(BookingRescheduleSchema, body),
      ),
      message: 'Booking moved',
    }),
  )

/** Behind the admin guard: the schedule, the call types, and every booking. */
export const adminBookingRoutes = new Elysia({ prefix: '/booking' })
  .use(adminGuard)
  .get('/types', async () =>
    responseOk({ data: await listBookingTypes(), message: 'Call types listed' }),
  )
  .get('/types/:id', async ({ params }) =>
    responseOk({
      data: await getBookingType(parseInput(IdSchema, params.id)),
      message: 'Call type loaded',
    }),
  )
  .post('/types', async ({ body, status }) =>
    status(
      HttpStatusCode.CREATED,
      responseOk({
        data: await createBookingType(parseInput(BookingTypeWriteSchema, body)),
        message: 'Call type created',
      }),
    ),
  )
  .put('/types/:id', async ({ params, body }) =>
    responseOk({
      data: await updateBookingType(
        parseInput(IdSchema, params.id),
        parseInput(BookingTypeWriteSchema, body),
      ),
      message: 'Call type saved',
    }),
  )
  .delete('/types/:id', async ({ params }) => {
    await deleteBookingType(parseInput(IdSchema, params.id))

    return responseOk({ data: { deleted: true }, message: 'Call type deleted' })
  })
  .get('/availability', async () =>
    responseOk({ data: await getAvailability(), message: 'Availability loaded' }),
  )
  .put('/availability/rules', async ({ body }) =>
    responseOk({
      data: await saveAvailabilityRules(parseInput(AvailabilityRulesWriteSchema, body)),
      message: 'Weekly hours saved',
    }),
  )
  .post('/availability/exceptions', async ({ body, status }) =>
    status(
      HttpStatusCode.CREATED,
      responseOk({
        data: await createAvailabilityException(parseInput(AvailabilityExceptionWriteSchema, body)),
        message: 'Entry added',
      }),
    ),
  )
  .delete('/availability/exceptions/:id', async ({ params }) => {
    await deleteAvailabilityException(parseInput(IdSchema, params.id))

    return responseOk({ data: { deleted: true }, message: 'Entry removed' })
  })
  .post('/bookings', async ({ body, status }) =>
    status(
      HttpStatusCode.CREATED,
      responseOk({
        data: await createBookingAsAdmin(parseInput(AdminBookingCreateSchema, body)),
        message: 'Booking created',
      }),
    ),
  )
  .get('/bookings', async ({ query }) =>
    responseOk({
      data: await listBookingsForAdmin(parseInput(BookingFilterSchema, query)),
      message: 'Bookings listed',
    }),
  )
  .get('/bookings/:id', async ({ params }) =>
    responseOk({
      data: await getBookingForAdmin(parseInput(IdSchema, params.id)),
      message: 'Booking loaded',
    }),
  )
  .post('/bookings/:id/cancel', async ({ params, body }) =>
    responseOk({
      data: await cancelBookingAsAdmin(
        parseInput(IdSchema, params.id),
        parseInput(AdminBookingCancelSchema, body),
      ),
      message: 'Booking cancelled',
    }),
  )
  .patch('/bookings/:id/status', async ({ params, body }) =>
    responseOk({
      data: await setBookingStatus(
        parseInput(IdSchema, params.id),
        parseInput(BookingStatusWriteSchema, body),
      ),
      message: 'Booking updated',
    }),
  )
