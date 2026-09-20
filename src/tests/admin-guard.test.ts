import { Elysia } from 'elysia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The admin surface is guarded twice: once on the `/admin` group as a whole,
 * and again inside each feature module. Either layer alone refuses a stranger,
 * which is the point — but it also means a deleted guard leaves no trace at
 * runtime, because the other layer quietly covers for it until it too goes.
 *
 * So both layers are tested apart. Each module is mounted alone to prove it
 * carries its own guard, then the assembled app is walked to prove the group
 * guard and the routes hanging directly off it. Removing either one goes red
 * on the first mistake rather than the second.
 */

let currentSession: unknown = null

vi.mock('#/backend/shared/auth', () => ({
  auth: { api: { getSession: async () => currentSession } },
}))

// No request reaches a handler, so none of this needs a real database — but
// the module graph still imports the client, which reads the environment.
vi.mock('#/shared/env', () => ({
  env: { DATABASE_URL: 'postgres://localhost/test', BASE_URL: 'http://localhost:3000' },
}))
vi.mock('pg', () => ({
  Pool: class {
    query = vi.fn(async () => ({ rows: [] }))
    end = vi.fn(async () => {})
  },
}))

const { app } = await import('#/backend/app')
const { AppError } = await import('#/backend/shared/error')
const { handleError } = await import('#/backend/shared/error-handler')

const { adminBookingRoutes } = await import('#/backend/modules/bookings/booking.route')
const { adminCallRoutes } = await import('#/backend/modules/calls/call.route')
const { adminContentRoutes } = await import('#/backend/modules/content/content.route')
const { adminInboxRoutes } = await import('#/backend/modules/inbox/inbox.route')
const { adminInvoiceRoutes } = await import('#/backend/modules/invoices/invoice.route')
const { adminLeadRoutes } = await import('#/backend/modules/leads/lead.route')
const { adminPostRoutes } = await import('#/backend/modules/posts/post.route')
const { adminProjectRoutes } = await import('#/backend/modules/projects/project.route')

/**
 * One real, existing route per module — a path that does not exist answers
 * 404 and would pass every assertion below without proving anything. `path`
 * is relative to the module's own prefix; `mounted` is where the assembled
 * app serves it.
 */
const MODULES = [
  { name: 'projects', routes: adminProjectRoutes, method: 'GET', path: '/projects/' },
  { name: 'posts', routes: adminPostRoutes, method: 'GET', path: '/blog/posts' },
  { name: 'bookings', routes: adminBookingRoutes, method: 'GET', path: '/booking/types' },
  { name: 'content', routes: adminContentRoutes, method: 'GET', path: '/content/' },
  { name: 'inbox', routes: adminInboxRoutes, method: 'GET', path: '/inbox/' },
  { name: 'leads', routes: adminLeadRoutes, method: 'GET', path: '/leads/' },
  { name: 'invoices', routes: adminInvoiceRoutes, method: 'GET', path: '/invoices/' },
  { name: 'calls', routes: adminCallRoutes, method: 'POST', path: '/call/bookings/1/join' },
] as const

/** Served by the `/admin` group itself rather than by any feature module. */
const GROUP_ROUTE = { method: 'GET', path: '/me' } as const

const asGuest = () => {
  currentSession = null
}

const asUser = (role: string) => {
  currentSession = {
    user: { id: 'u1', name: 'Visitor', email: 'visitor@example.com', role },
    session: { id: 's1' },
  }
}

const read = async (response: Response) => ({
  status: response.status,
  body: (await response.json()) as { code?: string },
})

const headers = { origin: 'http://localhost:3000' }

/** The module on its own, so only its own guard can answer. */
const callAlone = async (module: (typeof MODULES)[number]) => {
  const isolated = new Elysia().error({ AppError }).onError(handleError).use(module.routes)

  return read(
    await isolated.fetch(
      new Request(`http://localhost${module.path}`, { method: module.method, headers }),
    ),
  )
}

/** The whole app, as a browser reaches it. */
const callApp = async ({ method, path }: { method: string; path: string }) =>
  read(
    await app.fetch(new Request(`http://localhost/api/admin${path}`, { method, headers })),
  )

beforeEach(asGuest)

describe('each admin module carries its own guard', () => {
  it.each(MODULES)('$name refuses a guest with 401 when mounted alone', async (module) => {
    const { status, body } = await callAlone(module)

    expect(status).toBe(401)
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it.each(MODULES)('$name refuses a non-admin with 403 when mounted alone', async (module) => {
    asUser('USER')

    const { status, body } = await callAlone(module)

    expect(status).toBe(403)
    expect(body.code).toBe('FORBIDDEN')
  })
})

describe('the assembled admin surface', () => {
  const ALL = [...MODULES, GROUP_ROUTE]

  it.each(ALL)('refuses a guest at $path with 401', async (endpoint) => {
    const { status, body } = await callApp(endpoint)

    expect(status).toBe(401)
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it.each(ALL)('refuses a signed-in non-admin at $path with 403', async (endpoint) => {
    asUser('USER')

    const { status, body } = await callApp(endpoint)

    expect(status).toBe(403)
    expect(body.code).toBe('FORBIDDEN')
  })

  /**
   * 401 and 403 are not interchangeable: the first sends the visitor to the
   * login page, the second tells them not to bother.
   */
  it('separates "not signed in" from "signed in, not allowed"', async () => {
    asGuest()
    expect((await callApp(GROUP_ROUTE)).status).toBe(401)

    asUser('USER')
    expect((await callApp(GROUP_ROUTE)).status).toBe(403)
  })

  it('lets an administrator through and names them back', async () => {
    asUser('ADMIN')

    const { status, body } = await callApp(GROUP_ROUTE)

    expect(status).toBe(200)
    expect(body).toMatchObject({ data: { email: 'visitor@example.com', role: 'ADMIN' } })
  })

  /** A role is a fixed word, not something close to one. */
  it.each(['admin', 'Admin', 'ADMINISTRATOR', 'USER', ''])(
    'does not accept the role %j as administrator',
    async (role) => {
      asUser(role)

      expect((await callApp(GROUP_ROUTE)).status).toBe(403)
    },
  )
})
