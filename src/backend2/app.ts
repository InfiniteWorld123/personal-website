import { Elysia } from 'elysia'
import { isDatabaseConfigured, withRequestScope } from './db/client'
import { isApiError } from './http/error'
import { normalizeError } from './http/error-handler'
import { responseFailure, responseOk } from './http/response'
import { HttpStatus } from './http/status'
import { ownerRoutesEnabled } from './security/local-only'
import { publicAuthRoutes } from './modules/auth/auth.route'
import { ownerSecurityRoutes } from './modules/auth/security.route'
import { ownerBlogRoutes } from './modules/blog/blog.owner.route'
import { ownerClientRoutes } from './modules/clients/client.owner.route'
import { ownerNicheRoutes } from './modules/niches/niche.owner.route'
import { ownerContentRoutes } from './modules/content/content.owner.route'
import { publicContentRoutes } from './modules/content/content.public.route'
import { publicBlogRoutes } from './modules/blog/blog.public.route'
import { ownerMediaRoutes } from './modules/media/media.owner.route'
import { publicMediaRoutes } from './modules/media/media.public.route'
import { ownerProjectRoutes } from './modules/projects/project.owner.route'
import { publicProjectRoutes } from './modules/projects/project.public.route'
import { ownerServiceRoutes } from './modules/services/service.owner.route'
import { publicServiceRoutes } from './modules/services/service.public.route'

/**
 * Backend2.
 *
 * A separate Elysia application from the legacy one, mounted under `/api/v2`,
 * importing nothing from `src/backend/`. Duplicating a small envelope and an
 * error module is the price of being able to delete the legacy backend at
 * cutover without breaking V2.
 *
 * Authentication is the first module here. Every later one registers itself in
 * `buildApp` beside it — public reads outside the fence, owner routes inside
 * the `/owner` group, which `ownerSessionGuard` already protects.
 */

/**
 * Elysia compiles its router with `new Function`, which Cloudflare Workers
 * forbid. The capability is probed rather than keyed off a build flag, so one
 * bundle runs on a Worker and on a Node server without a second code path.
 */
const supportsCodeGeneration = (() => {
  try {
    new Function('')

    return true
  } catch {
    return false
  }
})()

/**
 * The owner half exists only where it is allowed to.
 *
 * This is the first of the two layers: with the opt-in flag absent — which is
 * every deployment — these routes are never registered, so there is nothing to
 * reach. The per-request guard is the second, and either alone refuses a
 * stranger.
 */
const buildApp = () => {
  const app = new Elysia({ prefix: '/api/v2', aot: supportsCodeGeneration }).onError(
    ({ code, error, status }) => {
      /*
       * Our own errors are answered first, on purpose. Elysia derives `code`
       * from the error's own `code` field, and ours uses `NOT_FOUND` — the
       * same name Elysia gives an unmatched route. Checked in the other order,
       * every "that project does not exist" arrives as "Route not found".
       */
      if (!isApiError(error)) {
        if (code === 'NOT_FOUND') {
          return status(
            HttpStatus.NOT_FOUND,
            responseFailure({ message: 'Route not found', code: 'NOT_FOUND' }),
          )
        }

        if (code === 'PARSE') {
          return status(
            HttpStatus.BAD_REQUEST,
            responseFailure({ message: 'The request could not be read', code: 'BAD_REQUEST' }),
          )
        }
      }

      const normalized = normalizeError(error)

      return status(normalized.status, normalized.body)
    },
  )

  /*
   * Auth V2 rides the same fence, for now.
   *
   * `docs/v2/auth.md`: "Introduce V2 auth behind the current local-only
   * fence... Only then switch to V2 session authorization and enable remote
   * owner routes in a separately reviewed environment." So the sign-in routes
   * are public *by contract* but not yet reachable from a deployment; making
   * them so is one deliberate change to `security/local-only.ts`, reviewed on
   * its own, rather than a side effect of this module landing.
   */
  if (ownerRoutesEnabled()) {
    app.use(publicAuthRoutes)

    app.group('/owner', (owner) =>
      owner
        .use(ownerSecurityRoutes)
        .use(ownerMediaRoutes)
        .use(ownerProjectRoutes)
        .use(ownerServiceRoutes)
        .use(ownerClientRoutes)
        .use(ownerNicheRoutes)
        .use(ownerBlogRoutes)
        .use(ownerContentRoutes),
    )
  }

  /*
   * Media's public half is outside the fence, because it is genuinely public:
   * `GET /api/v2/media/:id` serves an asset only while a live published
   * snapshot references it, and answers 404 for everything else — including
   * every private file, every draft's image and the existence of the library.
   *
   * Registered only when the V2 database is configured. Without one the route
   * could not answer the "is this published?" question it exists to ask, and a
   * 404 from an unmounted route is a better answer than a 500 from a missing
   * connection string.
   */
  /*
   * The same reasoning covers the public Projects reads (D13): they answer
   * only where a V2 database exists, so `DATABASE_URL_V2` being absent in
   * production means `/api/v2/projects` simply does not answer there and
   * nothing on the live site changes.
   */
  /*
   * And the public Services reads (`docs/v2/services.md`), for the same
   * reason: where no V2 database exists they do not answer, so the live
   * `/services` page keeps its current content until an approved cutover.
   */
  /*
   * And the public Blog (`docs/v2/blog.md`): the reads, and a visitor's
   * comments, reads and likes. Where no V2 database exists none of it
   * answers, so the live `/blog` keeps reading the legacy backend until an
   * approved cutover.
   */
  /*
   * And the public static copy (`docs/v2/content.md`). Where no V2 database
   * exists it does not answer, so the live site keeps its current wording
   * until an approved cutover.
   */
  if (isDatabaseConfigured()) {
    app
      .use(publicMediaRoutes)
      .use(publicProjectRoutes)
      .use(publicServiceRoutes)
      .use(publicBlogRoutes)
      .use(publicContentRoutes)
  }

  return app.get('/', () =>
    responseOk({ data: { status: 'ok', version: 2 }, message: 'Backend2 is running' }),
  )
}

export const app = buildApp()

export type Backend2App = typeof app

/**
 * Rebuilds the application. Only for tests, which need to see what a different
 * environment would have mounted.
 */
export const createAppForTest = () => buildApp()

/**
 * Elysia returns an empty 404 body for an unmatched route. Normalised here so
 * every Backend2 response has the same envelope.
 */
export const handleApiV2Request = (request: Request): Promise<Response> =>
  withRequestScope(async () => {
    const response = await app.fetch(request)

    if (response.status !== HttpStatus.NOT_FOUND) return response

    const body = await response.clone().text()

    if (body.trim() !== '') return response

    return Response.json(
      responseFailure({ message: 'Route not found', code: 'NOT_FOUND' }),
      { status: HttpStatus.NOT_FOUND, headers: { 'Cache-Control': 'no-store' } },
    )
  })
