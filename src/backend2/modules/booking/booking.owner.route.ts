import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  AppointmentListQuerySchema,
  AvailabilitySchema,
  ManualAppointmentSchema,
  OwnerAppointmentPatchSchema,
  OwnerCancelSchema,
  SettingsSchema,
  StatusSchema,
  TypeInputSchema,
  TypeListQuerySchema,
  TypePatchSchema,
} from '../../contracts/booking.contract'
import { readJsonBody } from '../../http/body'
import { HttpStatus } from '../../http/status'
import { parseInput } from '../../http/validate'
import { ownerGuard } from '../../security/owner-guard'
import { ownerJson } from '../media/media.http'
import {
  cancelByOwner,
  createManualAppointment,
  getAppointment,
  listAppointments,
  patchAppointment,
  sendInvitation,
  setOutcome,
} from './appointment.service'
import {
  createType,
  deleteType,
  getAvailability,
  getSettings,
  getType,
  listTypes,
  patchType,
  putAvailability,
  putSettings,
} from './booking.config.service'
import { ownerEnd, ownerJoin } from './video.service'

/**
 * The owner's calendar, over HTTP. Thin, behind `ownerGuard`, `no-store`.
 */

const Id = v.pipe(v.string(), v.uuid('That is not a valid id'))

export const ownerCalendarRoutes = new Elysia({ prefix: '/calendar' })
  .use(ownerGuard)

  .get('/appointments', async ({ query }) =>
    ownerJson({
      data: await listAppointments(parseInput(AppointmentListQuerySchema, query)),
      message: 'Appointments loaded',
    }),
  )

  /** Save only, or Save & send invitation. */
  .post('/appointments', async ({ request }) =>
    ownerJson({
      data: await createManualAppointment(parseInput(ManualAppointmentSchema, await readJsonBody(request))),
      message: 'Appointment saved',
      status: HttpStatus.CREATED,
    }),
  )

  .get('/appointments/:id', async ({ params }) =>
    ownerJson({ data: await getAppointment(parseInput(Id, params.id)), message: 'Appointment loaded' }),
  )

  .patch('/appointments/:id', async ({ params, request }) =>
    ownerJson({
      data: await patchAppointment(parseInput(Id, params.id), parseInput(OwnerAppointmentPatchSchema, await readJsonBody(request))),
      message: 'Appointment saved',
    }),
  )

  .post('/appointments/:id/send-invitation', async ({ params }) =>
    ownerJson({ data: await sendInvitation(parseInput(Id, params.id)), message: 'Invitation' }),
  )

  .post('/appointments/:id/cancel', async ({ params, request }) =>
    ownerJson({
      data: await cancelByOwner(parseInput(Id, params.id), parseInput(OwnerCancelSchema, await readJsonBody(request))),
      message: 'Appointment cancelled',
    }),
  )

  .post('/appointments/:id/status', async ({ params, request }) => {
    const { status } = parseInput(StatusSchema, await readJsonBody(request))

    return ownerJson({ data: await setOutcome(parseInput(Id, params.id), status), message: 'Status saved' })
  })

  .post('/appointments/:id/video/join', async ({ params }) =>
    ownerJson({ data: await ownerJoin(parseInput(Id, params.id)), message: 'Joined' }),
  )

  .post('/appointments/:id/video/end', async ({ params }) =>
    ownerJson({ data: await ownerEnd(parseInput(Id, params.id)), message: 'Call ended' }),
  )

  .get('/types', async ({ query }) =>
    ownerJson({ data: await listTypes(parseInput(TypeListQuerySchema, query)), message: 'Types loaded' }),
  )

  .post('/types', async ({ request }) =>
    ownerJson({
      data: await createType(parseInput(TypeInputSchema, await readJsonBody(request))),
      message: 'Type created',
      status: HttpStatus.CREATED,
    }),
  )

  .get('/types/:id', async ({ params }) =>
    ownerJson({ data: await getType(parseInput(Id, params.id)), message: 'Type loaded' }),
  )

  .patch('/types/:id', async ({ params, request }) =>
    ownerJson({
      data: await patchType(parseInput(Id, params.id), parseInput(TypePatchSchema, await readJsonBody(request))),
      message: 'Type saved',
    }),
  )

  .delete('/types/:id', async ({ params }) =>
    ownerJson({ data: await deleteType(parseInput(Id, params.id)), message: 'Type deleted' }),
  )

  .get('/settings', async () => ownerJson({ data: await getSettings(), message: 'Settings loaded' }))

  .put('/settings', async ({ request }) =>
    ownerJson({ data: await putSettings(parseInput(SettingsSchema, await readJsonBody(request))), message: 'Settings saved' }),
  )

  .get('/availability', async () => ownerJson({ data: await getAvailability(), message: 'Availability loaded' }))

  .put('/availability', async ({ request }) =>
    ownerJson({
      data: await putAvailability(parseInput(AvailabilitySchema, await readJsonBody(request))),
      message: 'Availability saved',
    }),
  )

const SAMPLE = '11111111-1111-4111-8111-111111111111'

/** Every owner route, for the tests that walk the fence. */
export const ownerCalendarPaths = [
  { method: 'GET', path: '/api/v2/owner/calendar/appointments' },
  { method: 'POST', path: '/api/v2/owner/calendar/appointments' },
  { method: 'GET', path: `/api/v2/owner/calendar/appointments/${SAMPLE}` },
  { method: 'PATCH', path: `/api/v2/owner/calendar/appointments/${SAMPLE}` },
  { method: 'POST', path: `/api/v2/owner/calendar/appointments/${SAMPLE}/send-invitation` },
  { method: 'POST', path: `/api/v2/owner/calendar/appointments/${SAMPLE}/cancel` },
  { method: 'POST', path: `/api/v2/owner/calendar/appointments/${SAMPLE}/status` },
  { method: 'POST', path: `/api/v2/owner/calendar/appointments/${SAMPLE}/video/join` },
  { method: 'POST', path: `/api/v2/owner/calendar/appointments/${SAMPLE}/video/end` },
  { method: 'GET', path: '/api/v2/owner/calendar/types' },
  { method: 'POST', path: '/api/v2/owner/calendar/types' },
  { method: 'GET', path: `/api/v2/owner/calendar/types/${SAMPLE}` },
  { method: 'PATCH', path: `/api/v2/owner/calendar/types/${SAMPLE}` },
  { method: 'DELETE', path: `/api/v2/owner/calendar/types/${SAMPLE}` },
  { method: 'GET', path: '/api/v2/owner/calendar/settings' },
  { method: 'PUT', path: '/api/v2/owner/calendar/settings' },
  { method: 'GET', path: '/api/v2/owner/calendar/availability' },
  { method: 'PUT', path: '/api/v2/owner/calendar/availability' },
] as const
