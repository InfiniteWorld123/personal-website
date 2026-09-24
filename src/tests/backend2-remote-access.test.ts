import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase } from './helpers/backend2-db'

/**
 * `BACKEND2_OWNER_API=remote` (`docs/v2/remote-access.md`): the Dashboard from
 * the internet at the site's own address, only for that host, and always
 * behind the V2 session. Every missing piece keeps the door shut; strangers
 * still get 404.
 */
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.NODE_ENV = 'development'

const { remoteOwnerConfig, ownerRoutesEnabled, ownerAuthRequired, decideOwnerRequest } = await import(
  '#/backend2/security/local-only'
)
const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { createSession } = await import('#/backend2/auth/session')

const REMOTE = {
  BACKEND2_OWNER_API: 'remote',
  AUTH_V2_SECRET: 'test-only-auth-secret-at-least-32-chars-long',
  AUTH_V2_ORIGIN: 'https://yamanwarda.de',
  AUTH_V2_RP_ID: 'yamanwarda.de',
}

describe('the remote configuration', () => {
  it('is off unless every piece is set', () => {
    expect(remoteOwnerConfig(REMOTE)).toEqual({ host: 'yamanwarda.de' })

    for (const missing of ['AUTH_V2_SECRET', 'AUTH_V2_ORIGIN', 'AUTH_V2_RP_ID'] as const) {
      expect(remoteOwnerConfig({ ...REMOTE, [missing]: '' }), missing).toBeNull()
    }

    expect(remoteOwnerConfig({ ...REMOTE, AUTH_V2_SECRET: 'short' })).toBeNull()
    expect(remoteOwnerConfig({ ...REMOTE, AUTH_V2_ORIGIN: 'http://yamanwarda.de' })).toBeNull()
    expect(remoteOwnerConfig({ ...REMOTE, AUTH_V2_ORIGIN: 'https://yamanwarda.de/dashboard' })).toBeNull()
    expect(remoteOwnerConfig({ ...REMOTE, BACKEND2_OWNER_API: 'local' })).toBeNull()
    expect(remoteOwnerConfig({ ...REMOTE, BACKEND2_OWNER_API: undefined })).toBeNull()
  })

  it('mounts the owner routes in a production build and always demands a session', () => {
    const production = { ...REMOTE, NODE_ENV: 'production' }

    expect(ownerRoutesEnabled(production)).toBe(true)
    expect(ownerAuthRequired({ ...production, BACKEND2_OWNER_AUTH: '' })).toBe(true)
    expect(ownerRoutesEnabled({ ...production, AUTH_V2_SECRET: '' })).toBe(false)
    // `local` still never opens in production.
    expect(ownerRoutesEnabled({ BACKEND2_OWNER_API: 'local', NODE_ENV: 'production' })).toBe(false)
  })

  it('accepts only the configured host', async () => {
    expect(await decideOwnerRequest(new Request('https://yamanwarda.de/api/v2/owner/x'), REMOTE)).toEqual({ allowed: true })
    expect(await decideOwnerRequest(new Request('https://personal-website.example.workers.dev/api/v2/owner/x'), REMOTE)).toMatchObject({ allowed: false })
    expect(await decideOwnerRequest(new Request('http://localhost:3000/api/v2/owner/x'), REMOTE)).toMatchObject({ allowed: false })
    expect(
      await decideOwnerRequest(new Request('http://localhost:3000/api/v2/owner/x'), { BACKEND2_OWNER_API: 'local', NODE_ENV: 'development' }),
    ).toEqual({ allowed: true })
  })
})

const database = await createTestDatabase()

describe('owner routes in remote mode', () => {
  const saved = { ...process.env }
  let app: ReturnType<typeof createAppForTest>

  beforeAll(() => {
    Object.assign(process.env, REMOTE)
    delete process.env.BACKEND2_OWNER_AUTH
    app = createAppForTest()
  })

  afterAll(async () => {
    for (const key of Object.keys(REMOTE)) delete process.env[key]
    Object.assign(process.env, saved)
    await database.close()
  })

  const call = async (path: string, host: string, options: { method?: string; cookie?: string } = {}) =>
    (
      await runWithDb(database.db, async () =>
        app.fetch(
          new Request(`https://${host}/api/v2${path}`, {
            method: options.method ?? 'GET',
            headers: {
              ...(options.cookie ? { cookie: options.cookie } : {}),
              ...(options.method === 'POST' ? { 'content-type': 'application/json', origin: `https://${host}` } : {}),
            },
            body: options.method === 'POST' ? JSON.stringify({ email: 'x@example.org', password: 'wrong' }) : undefined,
          }),
        ),
      )
    ).status

  it('answers 404 on any other host, 401 without a session on the site host', async () => {
    expect(await call('/owner/clients', 'personal-website.example.workers.dev')).toBe(404)
    expect(await call('/owner/clients', 'yamanwarda.de')).toBe(401)
  })

  it('reaches the sign-in API only on the site host', async () => {
    expect(await call('/auth/password/start', 'other.example', { method: 'POST' })).toBe(404)
    expect(await call('/auth/password/start', 'yamanwarda.de', { method: 'POST' })).toBe(401)
  })

  it('lets a signed-in, enrolled owner in', async () => {
    const { rows } = await database.db.query(
      `INSERT INTO v2_owner (email, password_hash, totp_secret, totp_confirmed_at, recovery_codes_issued_at)
       VALUES ('owner@example.org', 'x', 'x', now(), now()) RETURNING id`,
    )
    const { token } = await runWithDb(database.db, () => createSession({ ownerId: rows[0].id, method: 'password_totp' }))

    expect(await call('/owner/clients', 'yamanwarda.de', { cookie: `v2_owner_session=${token}` })).toBe(200)
  })
})
