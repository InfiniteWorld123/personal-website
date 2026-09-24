import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase } from './helpers/backend2-db'

/**
 * On a Cloudflare Worker Elysia cannot compile (`new Function` is forbidden),
 * and uncompiled it read every JSON body before the route could — so every
 * sign-in and every save answered 500 on the preview. These run the app the
 * way a Worker does and send real bodies through.
 */
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.NODE_ENV = 'development'

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { createSession } = await import('#/backend2/auth/session')

const REMOTE = {
  BACKEND2_OWNER_API: 'remote',
  AUTH_V2_SECRET: 'test-only-auth-secret-at-least-32-chars-long',
  AUTH_V2_ORIGIN: 'https://yamanwarda.de',
  AUTH_V2_RP_ID: 'yamanwarda.de',
}

const database = await createTestDatabase()

describe('request bodies without compilation (as on a Worker)', () => {
  const saved = { ...process.env }
  let app: ReturnType<typeof createAppForTest>
  let cookie = ''
  let csrf = ''

  beforeAll(async () => {
    Object.assign(process.env, REMOTE)
    delete process.env.BACKEND2_OWNER_AUTH
    app = createAppForTest({ aot: false })

    const { rows } = await database.db.query(
      `INSERT INTO v2_owner (email, password_hash, totp_secret, totp_confirmed_at, recovery_codes_issued_at)
       VALUES ('owner@example.org', 'x', 'x', now(), now()) RETURNING id`,
    )
    const session = await runWithDb(database.db, () => createSession({ ownerId: rows[0].id, method: 'password_totp' }))
    csrf = session.csrfToken
    cookie = `v2_owner_session=${encodeURIComponent(session.token)}; v2_csrf=${encodeURIComponent(csrf)}`
  })

  afterAll(async () => {
    for (const key of Object.keys(REMOTE)) delete process.env[key]
    Object.assign(process.env, saved)
    await database.close()
  })

  const post = (path: string, body: unknown, withCookie = false) =>
    runWithDb(database.db, async () =>
      app.fetch(
        new Request(`https://yamanwarda.de/api/v2${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'https://yamanwarda.de',
            ...(withCookie ? { cookie, 'x-v2-csrf': csrf } : {}),
          },
          body: JSON.stringify(body),
        }),
      ),
    )

  it('reads the sign-in body and refuses wrong credentials, not a 500', async () => {
    const response = await post('/auth/password/start', { email: 'nobody@example.org', password: 'wrong-password-123' })

    expect(response.status).toBe(401)
  })

  it('saves an owner record from its JSON body', async () => {
    const response = await post('/owner/niches', { name: 'Bakeries' }, true)
    const payload = (await response.json()) as { data: { name: string } }

    expect(response.status).toBeLessThan(300)
    expect(payload.data.name).toBe('Bakeries')
  })

  it('still answers malformed JSON with 400', async () => {
    const response = await runWithDb(database.db, async () =>
      app.fetch(
        new Request('https://yamanwarda.de/api/v2/owner/niches', {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'https://yamanwarda.de', cookie, 'x-v2-csrf': csrf },
          body: '{not json',
        }),
      ),
    )

    expect(response.status).toBe(400)
  })
})
