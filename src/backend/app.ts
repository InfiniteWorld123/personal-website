import { Elysia } from 'elysia'
import { adminRoutes } from './modules/admin/admin.route'
import { authRoutes } from './modules/auth/auth.route'
import { AppError } from './shared/error'
import { handleError } from './shared/error-handler'
import { HttpStatusCode } from './shared/http'
import { responseError, responseOk } from './shared/response'

export const app = new Elysia({ prefix: '/api' })
  .error({ AppError })
  .onError(handleError)
  .use(adminRoutes)
  .use(authRoutes)
  .get('/', () => responseOk({ data: { status: 'ok' }, message: 'API is running' }))

export type App = typeof app

/**
 * Elysia returns an empty 404 body for unmatched routes. Normalize that into
 * the standard error envelope so every API response has the same shape.
 */
export const handleApiRequest = async (request: Request) => {
  const response = await app.fetch(request)

  if (response.status !== HttpStatusCode.NOT_FOUND) return response

  const body = await response.clone().text()

  if (body.trim() !== '') return response

  return Response.json(responseError({ message: 'Route not found', code: 'NOT_FOUND' }), {
    status: HttpStatusCode.NOT_FOUND,
  })
}
