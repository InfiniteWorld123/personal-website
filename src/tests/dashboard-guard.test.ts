import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDatabase } from './helpers/backend2-db'

/**
 * The Dashboard's door after the legacy admin was removed (24 Sep 2026): the
 * V2 owner session is the only way in, whatever `BACKEND2_OWNER_AUTH` says.
 * There is no second, legacy session that could open it any more.
 *
 * `createServerFn` is replaced by a stand-in that runs the handler, and the
 * request is whatever the test hands `getRequest`; Backend2 reads a real
 * PostgreSQL inside this process.
 */

const current = vi.hoisted(() => ({ request: new Request('https://yamanwarda.de/dashboard') }))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: (fn: () => unknown) => () => fn() }),
}))
vi.mock('@tanstack/react-start/server', () => ({ getRequest: () => current.request }))

process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
delete process.env.BACKEND2_OWNER_AUTH
delete process.env.BACKEND2_OWNER_API

const { runWithDb } = await import('#/backend2/db/client')
const { createSession } = await import('#/backend2/auth/session')
const { getOwnerRouteSession } = await import('#/frontend/features/auth-v2/server/getOwnerSession')
const { Route } = await import('#/frontend/routes/dashboard')

const database = await createTestDatabase()

const withCookie = (cookie?: string) =>
  new Request('https://yamanwarda.de/dashboard/projects', { headers: cookie ? { cookie } : {} })

const beforeLoad = (href: string) =>
  (Route.options.beforeLoad as unknown as (context: { location: { href: string } }) => Promise<unknown>)({
    location: { href },
  })

beforeEach(async () => {
  await database.reset()
  current.request = withCookie()
})

afterAll(async () => {
  await database.close()
})

describe('the Dashboard guard', () => {
  it('finds nobody without a V2 session, even with the V2 sign-in switch unset', async () => {
    expect(await runWithDb(database.db, () => getOwnerRouteSession())).toEqual({ session: null })
  })

  it('finds nobody when no V2 database is configured', async () => {
    const saved = process.env.DATABASE_URL_V2
    delete process.env.DATABASE_URL_V2

    try {
      expect(await getOwnerRouteSession()).toEqual({ session: null })
    } finally {
      process.env.DATABASE_URL_V2 = saved
    }
  })

  it('refuses an unknown session token', async () => {
    current.request = withCookie('v2_owner_session=not-a-real-token')

    expect(await runWithDb(database.db, () => getOwnerRouteSession())).toEqual({ session: null })
  })

  it('names the owner of a real V2 session', async () => {
    const { rows } = await database.db.query(
      `INSERT INTO v2_owner (email, password_hash, totp_confirmed_at, recovery_codes_issued_at)
       VALUES ('owner@example.de', 'not-a-real-hash', now(), now()) RETURNING id`,
    )
    const session = await runWithDb(database.db, () => createSession({ ownerId: rows[0].id, method: 'password_totp' }))
    current.request = withCookie(`v2_owner_session=${encodeURIComponent(session.token)}`)

    const owner = await runWithDb(database.db, () => getOwnerRouteSession())

    expect(owner.session?.email).toBe('owner@example.de')
  })

  it('sends a visitor without a session to the V2 sign-in, never to /admin', async () => {
    const thrown = await runWithDb(database.db, () => beforeLoad('/dashboard/projects')).catch((error: unknown) => error)

    expect(thrown).toMatchObject({ options: { to: '/dashboard/login', search: { redirect: '/dashboard/projects' } } })
  })
})
