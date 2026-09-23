import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  MANAGE_TOKEN_HEADER,
  PublicBookingSchema,
  PublicTypesQuerySchema,
  SlotsQuerySchema,
  VisitorCancelSchema,
  VisitorRescheduleSchema,
} from '../../contracts/booking.contract'
import { requestIdentity } from '../../auth/rate-limit'
import { readJsonBody } from '../../http/body'
import { verificationFailed } from '../../http/error'
import { HttpStatus } from '../../http/status'
import { parseInput } from '../../http/validate'
import { ownerJson } from '../media/media.http'
import {
  availableSlots,
  cancelByVisitor,
  createPublicAppointment,
  getVisitorAppointment,
  rescheduleByVisitor,
} from './appointment.service'
import { publicTypes } from './booking.config.service'
import { limitCreate, limitManage, limitSlots, verifyHuman } from './booking.guard'
import { visitorJoin, visitorPreflight } from './video.service'

/**
 * The visitor's booking API. No account; the private manage credential is
 * sent in a header, never in the URL, so it cannot reach a log or a Referer.
 * Every reply is `no-store`: a visitor's appointment must not sit in a cache.
 */

const Reference = v.pipe(v.string(), v.trim(), v.maxLength(20))

const credentials = (params: { reference?: string }, request: Request) => ({
  reference: parseInput(Reference, params.reference ?? ''),
  token: (request.headers.get(MANAGE_TOKEN_HEADER) ?? '').slice(0, 200),
})

export const publicBookingRoutes = new Elysia({ prefix: '/public/booking' })
  .get('/types', async ({ query }) => {
    const { language } = parseInput(PublicTypesQuerySchema, query)

    return ownerJson({ data: await publicTypes(language), message: 'Types loaded' })
  })

  .get('/types/:slug/slots', async ({ params, query, request }) => {
    await limitSlots(requestIdentity(request))

    const input = parseInput(SlotsQuerySchema, query)

    return ownerJson({
      data: await availableSlots({ typeSlug: String(params.slug).slice(0, 80), ...input }),
      message: 'Slots loaded',
    })
  })

  .post('/appointments', async ({ request }) => {
    const input = parseInput(PublicBookingSchema, await readJsonBody(request))
    const ip = requestIdentity(request)

    // Filled in by a bot, never by a person. Refused like a failed check.
    if (input.website.trim() !== '') throw verificationFailed()

    await limitCreate(ip, input.email)
    await verifyHuman(input.turnstileToken, ip)

    const { turnstileToken: _turnstile, website: _website, ...booking } = input

    return ownerJson({
      data: await createPublicAppointment(booking),
      message: 'Appointment confirmed',
      status: HttpStatus.CREATED,
    })
  })

  .get('/appointments/:reference', async ({ params, request }) => {
    await limitManage(requestIdentity(request))

    const { reference, token } = credentials(params, request)

    return ownerJson({ data: await getVisitorAppointment(reference, token), message: 'Appointment loaded' })
  })

  .post('/appointments/:reference/reschedule', async ({ params, request }) => {
    await limitManage(requestIdentity(request))

    const { reference, token } = credentials(params, request)
    const input = parseInput(VisitorRescheduleSchema, await readJsonBody(request))

    return ownerJson({
      data: await rescheduleByVisitor({ reference, token, ...input }),
      message: 'Appointment moved',
    })
  })

  .post('/appointments/:reference/cancel', async ({ params, request }) => {
    await limitManage(requestIdentity(request))

    const { reference, token } = credentials(params, request)
    const input = parseInput(VisitorCancelSchema, await readJsonBody(request))

    return ownerJson({
      data: await cancelByVisitor({ reference, token, ...input }),
      message: 'Appointment cancelled',
    })
  })

  .post('/appointments/:reference/video/preflight', async ({ params, request }) => {
    await limitManage(requestIdentity(request))

    return ownerJson({ data: await visitorPreflight(credentials(params, request)), message: 'Preflight' })
  })

  .post('/appointments/:reference/video/join', async ({ params, request }) => {
    await limitManage(requestIdentity(request))

    return ownerJson({ data: await visitorJoin(credentials(params, request)), message: 'Joined' })
  })
