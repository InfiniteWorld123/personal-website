import { Elysia } from 'elysia'
import { adminRoutes } from './modules/admin/admin.route'
import { publicBookingRoutes } from './modules/bookings/booking.route'
import { publicPostRoutes } from './modules/posts/post.route'
import { publicProjectRoutes } from './modules/projects/project.route'
import { handleAuthRequest, isAuthRequest } from './modules/auth/auth.route'
import { withRequestScope } from './db/client'
import { AppError } from './shared/error'
import { handleError } from './shared/error-handler'
import { HttpStatusCode } from './shared/http'
import { responseError, responseOk } from './shared/response'

/**
 * Elysia compiles its router and validators with `new Function`, which
 * Cloudflare Workers forbid — the API answered every request with
 * `EvalError: Code generation from strings disallowed` until this was found.
 *
 * The capability is probed rather than keyed off a build flag, so one bundle
 * runs on a Worker and on a Node server without a second code path (D22).
 */
const supportsCodeGeneration = (() => {
  try {
    new Function('')

    return true
  } catch {
    return false
  }
})()

export const app = new Elysia({ prefix: '/api', aot: supportsCodeGeneration })
  .error({ AppError })
  .onError(handleError)
  .use(adminRoutes)
  .use(publicProjectRoutes)
  .use(publicPostRoutes)
  .use(publicBookingRoutes)
  .get('/', () => responseOk({ data: { status: 'ok' }, message: 'API is running' }))

export type App = typeof app

/**
 * Elysia returns an empty 404 body for unmatched routes. Normalize that into
 * the standard error envelope so every API response has the same shape.
 */
export const handleApiRequest = (request: Request) =>
  withRequestScope(async () => {
    // Handed over before Elysia sees it — see `auth.route.ts` for why.
    if (isAuthRequest(new URL(request.url).pathname)) return handleAuthRequest(request)

    const response = await app.fetch(request)

    if (response.status !== HttpStatusCode.NOT_FOUND) return response

    const body = await response.clone().text()

    if (body.trim() !== '') return response

    return Response.json(responseError({ message: 'Route not found', code: 'NOT_FOUND' }), {
      status: HttpStatusCode.NOT_FOUND,
    })
  })
