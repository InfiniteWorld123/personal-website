import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDatabase } from './helpers/backend2-db'

/**
 * Auth V2, end to end, against a real PostgreSQL running inside this process
 * (PGlite) — the same approach the Projects suite uses, for the same reason:
 * the SQL that enforces single-use consumption, absolute expiry and revocation
 * is the thing under test, so a mocked database would prove nothing.
 *
 * Everything under "Verification" in `docs/v2/auth.md` that belongs to the
 * backend is here: every factor, replay and expiry, blocked direct owner API
 * access, CSRF, rate limits, session revocation, reset and email-change links,
 * passkey wrong-origin/wrong-challenge/wrong-user-verification, and
 * legacy/public isolation.
 *
 * The environment is set before Backend2 is imported: the application decides
 * at start-up whether the owner routes exist at all.
 */
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
delete process.env.BACKEND2_OWNER_AUTH

/**
 * The WebAuthn library is mocked, and only the library.
 *
 * A real assertion needs a real authenticator holding a real private key, so
 * the signature checking is `@simplewebauthn/server`'s job and is tested by
 * its own suite. What these tests own is the policy layer on top: that user
 * verification is required *and re-checked*, that the challenge is spent, that
 * a credential belonging to nobody is refused, and that the counter moves.
 * Mocking the verifier is what makes each of those observable.
 */
const verifyAuthenticationResponse = vi.fn()
const verifyRegistrationResponse = vi.fn()

vi.mock('@simplewebauthn/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simplewebauthn/server')>()

  return {
    ...actual,
    verifyAuthenticationResponse: (...args: unknown[]) => verifyAuthenticationResponse(...args),
    verifyRegistrationResponse: (...args: unknown[]) => verifyRegistrationResponse(...args),
  }
})

const { Elysia } = await import('elysia')
const { createAppForTest } = await import('#/backend2/app')
const { normalizeError } = await import('#/backend2/http/error-handler')
const { ownerGuard } = await import('#/backend2/security/owner-guard')
const { runWithDb } = await import('#/backend2/db/client')
const { collectMailForTest, stopCollectingMailForTest } = await import('#/backend2/auth/mail')
const { hashPassword } = await import('#/backend2/auth/crypto')
const { createOwner } = await import('#/backend2/modules/auth/owner.repo')
const { currentTotpCode } = await import('#/backend2/auth/totp')
const { AUTH_RATE_LIMITS, AUTH_TTL } = await import('#/backend2/contracts/auth.contract')

type Json = Record<string, any>

const database = await createTestDatabase()
const app = createAppForTest()

const OWNER_EMAIL = 'owner@example.de'
const OWNER_PASSWORD = 'a long enough passphrase'

afterAll(async () => {
  await database.close()
})

let mailbox: ReturnType<typeof collectMailForTest>

beforeEach(async () => {
  await database.reset()
  mailbox = collectMailForTest()
  verifyAuthenticationResponse.mockReset()
  verifyRegistrationResponse.mockReset()
})

afterEach(() => {
  stopCollectingMailForTest()
  delete process.env.BACKEND2_OWNER_AUTH
})

/* --------------------------------------------------------------- plumbing */

/** A browser's cookie jar, so a session survives from one call to the next. */
type Jar = Record<string, string>

const applySetCookie = (jar: Jar, response: Response): Jar => {
  const headers =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter((value): value is string => Boolean(value))

  for (const header of headers) {
    const [pair = '', ...attributes] = header.split(';')
    const index = pair.indexOf('=')
    const name = pair.slice(0, index).trim()
    const value = decodeURIComponent(pair.slice(index + 1).trim())
    const expired = attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute))

    if (!name) continue
    if (expired || value === '') delete jar[name]
    else jar[name] = value
  }

  return jar
}

const call = async (
  method: string,
  path: string,
  body?: unknown,
  options: { jar?: Jar; host?: string; headers?: Record<string, string>; csrf?: string } = {},
): Promise<{ status: number; body: Json; response: Response }> => {
  const jar = options.jar
  const host = options.host ?? 'localhost:3000'
  const cookie = jar
    ? Object.entries(jar)
        .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
        .join('; ')
    : undefined

  // A real Dashboard reads the CSRF cookie and echoes it in the header. The
  // helper does the same, so every test exercises the check rather than
  // skipping it.
  const csrf = options.csrf ?? jar?.v2_csrf

  const request = new Request(`http://${host}/api/v2${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...(csrf && method !== 'GET' ? { 'x-v2-csrf': csrf } : {}),
      ...options.headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const response = await runWithDb(database.db, async () => app.fetch(request))
  const text = await response.clone().text()

  if (jar) applySetCookie(jar, response)

  return { status: response.status, body: text === '' ? {} : JSON.parse(text), response }
}

const seedOwner = async () =>
  runWithDb(database.db, async () =>
    createOwner({ email: OWNER_EMAIL, passwordHash: await hashPassword(OWNER_PASSWORD) }),
  )

/** The secret an authenticator app would have scanned out of the QR code. */
const secretFromUri = (uri: string): string =>
  new URL(uri.replace('otpauth://', 'https://')).searchParams.get('secret') ?? ''

/** The one-use token out of a captured email, as a click would carry it. */
const tokenFromMail = (mail: { text: string }): string => {
  const line = mail.text.split('\n').find((candidate) => candidate.includes('token='))

  expect(line, `no link in: ${mail.text}`).toBeTruthy()

  return new URL(line!.trim()).searchParams.get('token')!
}

/**
 * The owner's TOTP secret, read straight out of the database — the one thing
 * nothing but a test may do. A step-up proof has to produce a real code, and
 * there is no other way to know what it should be.
 */
const ownerTotpSecret = async (): Promise<string> => {
  const { decryptSecret } = await import('#/backend2/auth/crypto')
  const { rows } = await database.db.query('SELECT totp_secret FROM v2_owner')

  return decryptSecret(process.env.AUTH_V2_SECRET!, rows[0].totp_secret) ?? ''
}

/** Proves it is the owner again, for one action. */
const stepUpFor = async (jar: Jar, scope: string) => {
  await pretendTimePassed()

  return call(
    'POST',
    '/owner/security/reverify',
    { scope, password: OWNER_PASSWORD, totpCode: currentTotpCode(await ownerTotpSecret()) },
    { jar },
  )
}

/**
 * Moves the TOTP replay watermark out of the way.
 *
 * Signing in twice inside one 30-second window is refused on purpose — a
 * correct code used twice is one code, and the crypto suite proves that rule
 * directly. A test that signs in several times in a few milliseconds is not
 * exercising that rule, it is standing in for half a minute passing.
 */
const pretendTimePassed = async (): Promise<void> => {
  await database.db.query('UPDATE v2_owner SET totp_last_step = NULL')
}

/**
 * Bootstrap, first password sign-in, enrollment — the whole setup, the way the
 * owner will actually do it once.
 */
const signInFresh = async (): Promise<{ jar: Jar; totpSecret: string; recoveryCodes: string[] }> => {
  await seedOwner()

  const jar: Jar = {}
  const start = await call(
    'POST',
    '/auth/password/start',
    { email: OWNER_EMAIL, password: OWNER_PASSWORD },
    { jar },
  )

  expect(start.status, JSON.stringify(start.body)).toBe(200)
  expect(start.body.data.mode).toBe('enroll')

  const enroll = await call(
    'POST',
    '/auth/enrollment/totp/start',
    { challengeId: start.body.data.challengeId },
    { jar },
  )

  expect(enroll.status, JSON.stringify(enroll.body)).toBe(200)

  const totpSecret = secretFromUri(enroll.body.data.uri)
  const confirm = await call(
    'POST',
    '/auth/enrollment/totp/confirm',
    { challengeId: start.body.data.challengeId, code: currentTotpCode(totpSecret) },
    { jar },
  )

  expect(confirm.status, JSON.stringify(confirm.body)).toBe(200)

  return { jar, totpSecret, recoveryCodes: confirm.body.data.recoveryCodes }
}

/** A second sign-in on a fresh browser, once enrollment is done. */
const signInWithTotp = async (totpSecret: string): Promise<Jar> => {
  await pretendTimePassed()

  const jar: Jar = {}
  const start = await call(
    'POST',
    '/auth/password/start',
    { email: OWNER_EMAIL, password: OWNER_PASSWORD },
    { jar },
  )

  expect(start.body.data.mode).toBe('mfa')

  const finish = await call(
    'POST',
    '/auth/password/finish',
    { challengeId: start.body.data.challengeId, totpCode: currentTotpCode(totpSecret) },
    { jar },
  )

  expect(finish.status, JSON.stringify(finish.body)).toBe(200)

  return jar
}

/* ------------------------------------------------------------- the owner */

describe('the single owner', () => {
  it('exists once, and setup refuses to create a second', async () => {
    await seedOwner()

    await expect(seedOwner()).rejects.toThrow()

    const { rows } = await database.db.query('SELECT count(*)::int AS count FROM v2_owner')

    expect(rows[0].count).toBe(1)
  })

  it('has no registration route anywhere in the API', () => {
    const paths = (app as unknown as { routes: Array<{ path: string }> }).routes.map(
      (route) => route.path,
    )

    for (const path of paths) {
      expect(path).not.toMatch(/sign-?up|register$|registration$/i)
    }
  })

  it('stores no password in a form anything could read back', async () => {
    const owner = await seedOwner()

    expect(owner.password_hash).not.toContain(OWNER_PASSWORD)
    expect(owner.password_hash?.startsWith('scrypt$')).toBe(true)
  })
})

/* ------------------------------------------------------ password sign-in */

describe('the fallback sign-in', () => {
  it('answers the same way for a wrong password and an unknown address', async () => {
    await seedOwner()

    const wrong = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: 'not the right passphrase',
    })
    const unknown = await call('POST', '/auth/password/start', {
      email: 'nobody@example.de',
      password: 'not the right passphrase',
    })

    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrong.body.message).toBe(unknown.body.message)
    expect(wrong.body).toEqual(unknown.body)
  })

  it('limits guesses at one account even from ever-changing addresses', async () => {
    await seedOwner()

    const guess = (n: number, email = OWNER_EMAIL) =>
      call('POST', '/auth/password/start', { email, password: `guess ${n}` }, { headers: { 'cf-connecting-ip': `203.0.113.${n % 250}` } })

    for (let n = 0; n < 30; n++) expect((await guess(n)).status).toBe(401)

    expect((await guess(30)).status).toBe(429)
    // Letter case does not open a second allowance.
    expect((await guess(31, OWNER_EMAIL.toUpperCase())).status).toBe(429)
    // Another account is unaffected.
    expect((await guess(32, 'nobody@example.de')).status).toBe(401)
  }, 60_000)

  it('never sets a cookie for a wrong password', async () => {
    await seedOwner()

    const jar: Jar = {}

    await call('POST', '/auth/password/start', { email: OWNER_EMAIL, password: 'wrong' }, { jar })

    expect(jar).toEqual({})
  })

  it('gives a correct password a challenge and nothing else', async () => {
    await seedOwner()

    const jar: Jar = {}
    const result = await call(
      'POST',
      '/auth/password/start',
      { email: OWNER_EMAIL, password: OWNER_PASSWORD },
      { jar },
    )

    expect(result.status).toBe(200)
    expect(result.body.data.challengeId).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // The whole point: a correct password is not a session.
    expect(jar).toEqual({})

    const { rows } = await database.db.query('SELECT count(*)::int AS count FROM v2_owner_sessions')

    expect(rows[0].count).toBe(0)
  })

  it('refuses to finish an enrollment challenge as if it were a sign-in', async () => {
    await seedOwner()

    const start = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    })

    const finish = await call('POST', '/auth/password/finish', {
      challengeId: start.body.data.challengeId,
      totpCode: '000000',
    })

    expect(finish.status).toBe(400)
  })

  it('signs in with the authenticator code, and the session lasts exactly seven days', async () => {
    const { totpSecret } = await signInFresh()
    const jar = await signInWithTotp(totpSecret)

    expect(jar.v2_owner_session).toBeTruthy()
    expect(jar.v2_csrf).toBeTruthy()

    const { rows } = await database.db.query(
      `SELECT extract(epoch FROM (expires_at - authenticated_at))::int AS seconds, method
         FROM v2_owner_sessions ORDER BY created_at DESC LIMIT 1`,
    )

    expect(rows[0].seconds).toBe(AUTH_TTL.sessionSeconds)
    expect(rows[0].method).toBe('password_totp')
  })

  it('refuses a wrong code, and the challenge dies after five attempts', async () => {
    const { totpSecret } = await signInFresh()

    const start = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    })
    const challengeId = start.body.data.challengeId

    for (let attempt = 0; attempt < AUTH_RATE_LIMITS.secondFactor.limit; attempt += 1) {
      const wrong = await call('POST', '/auth/password/finish', {
        challengeId,
        totpCode: '000000',
      })

      expect(wrong.status).toBe(401)
    }

    // Now even the right code is too late: the challenge itself is spent.
    const correct = await call('POST', '/auth/password/finish', {
      challengeId,
      totpCode: currentTotpCode(totpSecret),
    })

    expect(correct.status).toBe(401)
  })

  it('refuses the same authenticator code twice inside its own window', async () => {
    const { totpSecret } = await signInFresh()
    const code = currentTotpCode(totpSecret)

    await pretendTimePassed()

    const first = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    })

    expect(
      (await call('POST', '/auth/password/finish', {
        challengeId: first.body.data.challengeId,
        totpCode: code,
      })).status,
    ).toBe(200)

    // A fresh challenge, the same still-displayed code: one code is one
    // sign-in, so the second is refused without the watermark being cleared.
    const second = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    })

    expect(
      (await call('POST', '/auth/password/finish', {
        challengeId: second.body.data.challengeId,
        totpCode: code,
      })).status,
    ).toBe(401)
  })

  it('refuses a replayed challenge', async () => {
    const { totpSecret } = await signInFresh()

    await pretendTimePassed()

    const start = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    })
    const payload = {
      challengeId: start.body.data.challengeId,
      totpCode: currentTotpCode(totpSecret),
    }

    expect((await call('POST', '/auth/password/finish', payload)).status).toBe(200)
    expect((await call('POST', '/auth/password/finish', payload)).status).toBe(401)
  })

  it('refuses an expired challenge', async () => {
    const { totpSecret } = await signInFresh()

    await pretendTimePassed()

    const start = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    })

    await database.db.query(
      "UPDATE v2_auth_challenges SET expires_at = CURRENT_TIMESTAMP - interval '1 second'",
    )

    const finish = await call('POST', '/auth/password/finish', {
      challengeId: start.body.data.challengeId,
      totpCode: currentTotpCode(totpSecret),
    })

    expect(finish.status).toBe(401)
  })

  it('refuses a request that sends both factors at once', async () => {
    const { totpSecret, recoveryCodes } = await signInFresh()

    const start = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    })

    const both = await call('POST', '/auth/password/finish', {
      challengeId: start.body.data.challengeId,
      totpCode: currentTotpCode(totpSecret),
      recoveryCode: recoveryCodes[0],
    })

    expect(both.status).toBe(422)
  })
})

/* ------------------------------------------------------------- enrollment */

describe('first-time enrollment', () => {
  it('shows a QR and a manual key, but grants nothing until a code is verified', async () => {
    await seedOwner()

    const jar: Jar = {}
    const start = await call(
      'POST',
      '/auth/password/start',
      { email: OWNER_EMAIL, password: OWNER_PASSWORD },
      { jar },
    )
    const enroll = await call(
      'POST',
      '/auth/enrollment/totp/start',
      { challengeId: start.body.data.challengeId },
      { jar },
    )

    expect(enroll.body.data.uri).toContain('otpauth://totp/')
    expect(enroll.body.data.manualKey).toMatch(/^[A-Z2-7]{4}( [A-Z2-7]{4})+$/)
    // Showing the QR is not enrollment.
    expect(jar).toEqual({})

    const { rows } = await database.db.query(
      'SELECT totp_confirmed_at, recovery_codes_issued_at FROM v2_owner',
    )

    expect(rows[0].totp_confirmed_at).toBeNull()
    expect(rows[0].recovery_codes_issued_at).toBeNull()
  })

  it('refuses a wrong first code', async () => {
    await seedOwner()

    const start = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    })

    await call('POST', '/auth/enrollment/totp/start', {
      challengeId: start.body.data.challengeId,
    })

    const confirm = await call('POST', '/auth/enrollment/totp/confirm', {
      challengeId: start.body.data.challengeId,
      code: '000000',
    })

    expect(confirm.status).toBe(401)
  })

  it('issues ten recovery codes exactly once, with the session', async () => {
    const { jar, recoveryCodes } = await signInFresh()

    expect(recoveryCodes).toHaveLength(10)
    expect(new Set(recoveryCodes).size).toBe(10)
    expect(jar.v2_owner_session).toBeTruthy()

    const { rows } = await database.db.query(
      'SELECT count(*)::int AS count FROM v2_owner_recovery_codes WHERE used_at IS NULL',
    )

    expect(rows[0].count).toBe(10)

    // Stored as hashes, never as the codes themselves.
    const stored = await database.db.query('SELECT code_hash FROM v2_owner_recovery_codes')

    for (const row of stored.rows) {
      expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/)

      for (const code of recoveryCodes) {
        expect(row.code_hash).not.toContain(code.replace('-', ''))
      }
    }
  })

  it('refuses to enroll twice', async () => {
    const { totpSecret } = await signInFresh()

    const start = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    })

    expect(start.body.data.mode).toBe('mfa')

    const enroll = await call('POST', '/auth/enrollment/totp/start', {
      challengeId: start.body.data.challengeId,
    })

    // The challenge is not in setup mode any more, so the route does not
    // recognise it at all.
    expect(enroll.status).toBe(401)
    expect(currentTotpCode(totpSecret)).toMatch(/^\d{6}$/)
  })

  it('does not let a setup challenge reach the Dashboard API', async () => {
    await seedOwner()
    process.env.BACKEND2_OWNER_AUTH = 'required'

    const start = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    })

    // The only thing a setup challenge is: a string. It is not a cookie, so
    // there is nothing to present to an owner route.
    const attempt = await call('GET', '/owner/security', undefined, {
      headers: { cookie: `v2_owner_session=${start.body.data.challengeId}` },
    })

    expect(attempt.status).toBe(401)
  })
})

/* ------------------------------------------------------- recovery codes */

describe('recovery codes', () => {
  it('sign in once, and then never again', async () => {
    const { recoveryCodes } = await signInFresh()
    const code = recoveryCodes[0]

    const first = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    })
    const used = await call('POST', '/auth/password/finish', {
      challengeId: first.body.data.challengeId,
      recoveryCode: code,
    })

    expect(used.status).toBe(200)

    const second = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    })
    const again = await call('POST', '/auth/password/finish', {
      challengeId: second.body.data.challengeId,
      recoveryCode: code,
    })

    expect(again.status).toBe(401)

    const { rows } = await database.db.query(
      'SELECT count(*)::int AS count FROM v2_owner_recovery_codes WHERE used_at IS NULL',
    )

    expect(rows[0].count).toBe(9)
  })

  it('records the sign-in as the recovery route it was', async () => {
    const { recoveryCodes } = await signInFresh()

    const start = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    })

    await call('POST', '/auth/password/finish', {
      challengeId: start.body.data.challengeId,
      recoveryCode: recoveryCodes[1],
    })

    const { rows } = await database.db.query(
      'SELECT method FROM v2_owner_sessions ORDER BY created_at DESC LIMIT 1',
    )

    expect(rows[0].method).toBe('password_recovery')
  })
})

/* -------------------------------------------------------------- passkeys */

describe('passkeys', () => {
  const PUBLIC_KEY = new Uint8Array([1, 2, 3, 4])

  it('issues a sign-in challenge without revealing that an account exists', async () => {
    // No owner in the database at all.
    const empty = await call('POST', '/auth/passkey/start', {})

    await seedOwner()

    const withOwner = await call('POST', '/auth/passkey/start', {})

    expect(empty.status).toBe(200)
    expect(withOwner.status).toBe(200)
    expect(empty.body.data.options.allowCredentials ?? []).toEqual([])
    expect(withOwner.body.data.options.allowCredentials ?? []).toEqual([])
    expect(empty.body.message).toBe(withOwner.body.message)
  })

  it('refuses a credential nobody registered', async () => {
    await seedOwner()

    const start = await call('POST', '/auth/passkey/start', {})
    const finish = await call('POST', '/auth/passkey/finish', {
      challengeId: start.body.data.challengeId,
      credential: { id: 'never-seen-before', response: {} },
    })

    expect(finish.status).toBe(401)
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled()
  })

  it('spends the challenge even when the credential turns out to be unknown', async () => {
    await seedOwner()

    const start = await call('POST', '/auth/passkey/start', {})
    const payload = {
      challengeId: start.body.data.challengeId,
      credential: { id: 'never-seen-before', response: {} },
    }

    await call('POST', '/auth/passkey/finish', payload)

    const { rows } = await database.db.query(
      "SELECT consumed_at FROM v2_auth_challenges WHERE kind = 'webauthn_auth'",
    )

    expect(rows[0].consumed_at).not.toBeNull()
  })

  it('signs in when the assertion verifies with user verification', async () => {
    const { jar } = await signInFresh()

    await database.db.query(
      `INSERT INTO v2_owner_passkeys (owner_id, credential_id, public_key, counter, name)
       SELECT id, 'cred-1', $1, 4, 'Laptop' FROM v2_owner`,
      [Buffer.from(PUBLIC_KEY)],
    )

    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        credentialID: 'cred-1',
        newCounter: 9,
        userVerified: true,
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
      },
    })

    const fresh: Jar = {}
    const start = await call('POST', '/auth/passkey/start', {}, { jar: fresh })
    const finish = await call(
      'POST',
      '/auth/passkey/finish',
      { challengeId: start.body.data.challengeId, credential: { id: 'cred-1', response: {} } },
      { jar: fresh },
    )

    expect(finish.status, JSON.stringify(finish.body)).toBe(200)
    expect(fresh.v2_owner_session).toBeTruthy()
    expect(jar.v2_owner_session).not.toBe(fresh.v2_owner_session)

    // No password and no TOTP were asked for.
    const { rows } = await database.db.query(
      'SELECT method FROM v2_owner_sessions ORDER BY created_at DESC LIMIT 1',
    )

    expect(rows[0].method).toBe('passkey')

    // The signature counter moved, which is what makes a cloned authenticator
    // detectable later.
    const counter = await database.db.query('SELECT counter, last_used_at FROM v2_owner_passkeys')

    expect(Number(counter.rows[0].counter)).toBe(9)
    expect(counter.rows[0].last_used_at).not.toBeNull()
  })

  it('refuses an assertion the device did not verify the person for', async () => {
    await signInFresh()

    await database.db.query(
      `INSERT INTO v2_owner_passkeys (owner_id, credential_id, public_key, counter, name)
       SELECT id, 'cred-1', $1, 4, 'Laptop' FROM v2_owner`,
      [Buffer.from(PUBLIC_KEY)],
    )

    // The library said the signature is fine, but the device never checked
    // who was holding it. Without this refusal the passwordless route would
    // be "whoever has the laptop".
    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        credentialID: 'cred-1',
        newCounter: 9,
        userVerified: false,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
      },
    })

    const start = await call('POST', '/auth/passkey/start', {})
    const finish = await call('POST', '/auth/passkey/finish', {
      challengeId: start.body.data.challengeId,
      credential: { id: 'cred-1', response: {} },
    })

    expect(finish.status).toBe(401)
  })

  it('refuses when the library rejects the origin, the RP ID or the challenge', async () => {
    await signInFresh()

    await database.db.query(
      `INSERT INTO v2_owner_passkeys (owner_id, credential_id, public_key, counter, name)
       SELECT id, 'cred-1', $1, 4, 'Laptop' FROM v2_owner`,
      [Buffer.from(PUBLIC_KEY)],
    )

    for (const message of [
      'Unexpected authentication response origin "https://evil.example"',
      'Unexpected RP ID hash',
      'Custom challenge verification failed',
    ]) {
      verifyAuthenticationResponse.mockRejectedValueOnce(new Error(message))

      const start = await call('POST', '/auth/passkey/start', {})
      const finish = await call('POST', '/auth/passkey/finish', {
        challengeId: start.body.data.challengeId,
        credential: { id: 'cred-1', response: {} },
      })

      expect(finish.status).toBe(401)
      // The library's message names the origin it expected. It must not travel.
      expect(JSON.stringify(finish.body)).not.toContain('evil.example')
      expect(JSON.stringify(finish.body)).not.toContain('RP ID')
    }
  })

  it('demands user verification and the configured origin when it asks the library', async () => {
    await signInFresh()

    await database.db.query(
      `INSERT INTO v2_owner_passkeys (owner_id, credential_id, public_key, counter, name)
       SELECT id, 'cred-1', $1, 4, 'Laptop' FROM v2_owner`,
      [Buffer.from(PUBLIC_KEY)],
    )

    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        credentialID: 'cred-1',
        newCounter: 9,
        userVerified: true,
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
      },
    })

    const start = await call('POST', '/auth/passkey/start', {})

    await call('POST', '/auth/passkey/finish', {
      challengeId: start.body.data.challengeId,
      credential: { id: 'cred-1', response: {} },
    })

    const [options] = verifyAuthenticationResponse.mock.calls[0] as [Json]

    expect(options.requireUserVerification).toBe(true)
    expect(options.expectedRPID).toBe('localhost')
    expect(options.expectedOrigin).toContain('http://localhost:3000')
    // The challenge checked is the one that was issued, not one the client chose.
    expect(options.expectedChallenge).toBe(start.body.data.options.challenge)
  })

  it('asks the browser for a verified, discoverable credential at registration', async () => {
    const { jar } = await signInFresh()
    const granted = await stepUpFor(jar, 'passkeys')

    expect(granted.status, JSON.stringify(granted.body)).toBe(200)

    const start = await call('POST', '/owner/security/passkeys/start', {}, {
      jar,
      headers: { 'x-v2-step-up': granted.body.data.stepUpToken },
    })

    expect(start.status, JSON.stringify(start.body)).toBe(200)
    expect(start.body.data.options.authenticatorSelection).toMatchObject({
      residentKey: 'required',
      userVerification: 'required',
    })
    // Registering a passkey may not be reached without the fresh proof.
    expect((await call('POST', '/owner/security/passkeys/start', {}, { jar })).status).toBe(403)
  })

  it('registers one, and refuses one the device did not verify the person for', async () => {
    const { jar } = await signInFresh()
    const granted = await stepUpFor(jar, 'passkeys')
    const start = await call('POST', '/owner/security/passkeys/start', {}, {
      jar,
      headers: { 'x-v2-step-up': granted.body.data.stepUpToken },
    })

    verifyRegistrationResponse.mockResolvedValueOnce({
      verified: true,
      registrationInfo: {
        credential: { id: 'new-cred', publicKey: new Uint8Array([9, 9]), counter: 0 },
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
        userVerified: false,
      },
    })

    const unverified = await call(
      'POST',
      '/owner/security/passkeys/finish',
      { challengeId: start.body.data.challengeId, credential: { id: 'new-cred', response: {} }, name: 'Phone' },
      { jar, headers: { 'x-v2-step-up': granted.body.data.stepUpToken } },
    )

    expect(unverified.status).toBe(400)

    const { rows } = await database.db.query('SELECT count(*)::int AS count FROM v2_owner_passkeys')

    expect(rows[0].count).toBe(0)

    const second = await stepUpFor(jar, 'passkeys')
    const retry = await call('POST', '/owner/security/passkeys/start', {}, {
      jar,
      headers: { 'x-v2-step-up': second.body.data.stepUpToken },
    })

    verifyRegistrationResponse.mockResolvedValueOnce({
      verified: true,
      registrationInfo: {
        credential: { id: 'new-cred', publicKey: new Uint8Array([9, 9]), counter: 0 },
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
        userVerified: true,
      },
    })

    const registered = await call(
      'POST',
      '/owner/security/passkeys/finish',
      { challengeId: retry.body.data.challengeId, credential: { id: 'new-cred', response: {} }, name: 'Phone' },
      { jar, headers: { 'x-v2-step-up': second.body.data.stepUpToken } },
    )

    expect(registered.status, JSON.stringify(registered.body)).toBe(200)
    expect(registered.body.data.name).toBe('Phone')
    expect(registered.body.data.syncedAcrossDevices).toBe(true)

    const after = await database.db.query('SELECT credential_id FROM v2_owner_passkeys')

    expect(after.rows).toHaveLength(1)
    expect(after.rows[0].credential_id).toBe('new-cred')
  })
})

/* ------------------------------------------------------------- the guard */

describe('the owner API', () => {
  it('is 404 from a non-local host, before any question of a session', async () => {
    const { jar } = await signInFresh()

    const remote = await call('GET', '/owner/security', undefined, {
      jar,
      host: 'yamanwarda.de',
    })

    expect(remote.status).toBe(404)
    expect(remote.body.code).toBe('NOT_FOUND')
    // Never 401 or 403: those confirm that a private API is there.
    expect(remote.status).not.toBe(401)
  })

  it('is 401 with no session, once past the fence', async () => {
    await signInFresh()

    const result = await call('GET', '/owner/security')

    expect(result.status).toBe(401)
    expect(result.body.code).toBe('UNAUTHORIZED')
    expect(JSON.stringify(result.body)).not.toContain(OWNER_EMAIL)
  })

  it('is 401 with a made-up cookie', async () => {
    await signInFresh()

    const result = await call('GET', '/owner/security', undefined, {
      jar: { v2_owner_session: 'a'.repeat(43), v2_csrf: 'b'.repeat(43) },
    })

    expect(result.status).toBe(401)
  })

  it('is 401 once the session has expired, whatever the cookie still says', async () => {
    const { jar } = await signInFresh()

    expect((await call('GET', '/owner/security', undefined, { jar })).status).toBe(200)

    await database.db.query(
      "UPDATE v2_owner_sessions SET expires_at = CURRENT_TIMESTAMP - interval '1 second'",
    )

    expect((await call('GET', '/owner/security', undefined, { jar })).status).toBe(401)
  })

  it('is 401 once the session is revoked', async () => {
    const { jar } = await signInFresh()

    await database.db.query('UPDATE v2_owner_sessions SET revoked_at = CURRENT_TIMESTAMP')

    expect((await call('GET', '/owner/security', undefined, { jar })).status).toBe(401)
  })

  it('refuses a write that does not echo the CSRF cookie', async () => {
    const { jar } = await signInFresh()

    const forged = await call(
      'POST',
      '/owner/security/reverify',
      { scope: 'password', password: OWNER_PASSWORD, totpCode: '000000' },
      { jar, csrf: 'not the value in the cookie' },
    )

    expect(forged.status).toBe(401)

    const missing = await call('POST', '/owner/security/sessions/revoke-all', {}, {
      jar,
      headers: { 'x-v2-csrf': '' },
      csrf: '',
    })

    expect(missing.status).toBe(401)
  })

  it('never caches an authenticated reply', async () => {
    const { jar } = await signInFresh()
    const result = await call('GET', '/owner/security', undefined, { jar })

    expect(result.response.headers.get('cache-control')).toContain('no-store')
  })
})

/**
 * The guard a later module mounts.
 *
 * Projects and media are not in this commit, so nothing else uses
 * `ownerGuard` yet — it is tested here directly, on a throwaway route, rather
 * than left unproven until the module that needs it arrives.
 */
describe('the switchable owner guard', () => {
  const probeApp = () =>
    new Elysia({ prefix: '/api/v2' })
      .onError(({ error }) => {
        const normalized = normalizeError(error)

        return new Response(JSON.stringify(normalized.body), { status: normalized.status })
      })
      .group('/owner', (owner) =>
        owner.use(ownerGuard).get('/probe', () => ({ success: true, data: null })),
      )

  const probe = async (options: { jar?: Jar; host?: string } = {}) => {
    const host = options.host ?? 'localhost:3000'
    const cookie = options.jar
      ? Object.entries(options.jar)
          .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
          .join('; ')
      : undefined

    const response = await runWithDb(database.db, async () =>
      probeApp().fetch(
        new Request(`http://${host}/api/v2/owner/probe`, {
          headers: cookie ? { cookie } : {},
        }),
      ),
    )

    return response.status
  }

  it('keeps the local-only fence while the switch is off', async () => {
    await signInFresh()

    expect(await probe({ host: 'yamanwarda.de' })).toBe(404)
    // Reaches the handler: the fence, not a session, is what guards it today.
    expect(await probe()).toBe(200)
  })

  it('demands a session once the switch is on', async () => {
    const { jar } = await signInFresh()

    process.env.BACKEND2_OWNER_AUTH = 'required'

    expect(await probe()).toBe(401)
    expect(await probe({ jar })).toBe(200)
  })

  it('still answers 404, not 401, from a non-local host with the switch on', async () => {
    const { jar } = await signInFresh()

    process.env.BACKEND2_OWNER_AUTH = 'required'

    expect(await probe({ jar, host: 'yamanwarda.de' })).toBe(404)
  })
})

/* -------------------------------------------------------------- step-up */

describe('changing a sign-in factor', () => {
  it('is refused with a valid session but no fresh proof', async () => {
    const { jar } = await signInFresh()

    const result = await call('POST', '/owner/security/recovery-codes/rotate', {}, { jar })

    expect(result.status).toBe(403)
    expect(result.body.code).toBe('STEP_UP_REQUIRED')
  })

  it('is refused when the proof is wrong', async () => {
    const { jar } = await signInFresh()

    const wrongPassword = await call(
      'POST',
      '/owner/security/reverify',
      { scope: 'password', password: 'not the passphrase', totpCode: '000000' },
      { jar },
    )
    const wrongCode = await call(
      'POST',
      '/owner/security/reverify',
      { scope: 'password', password: OWNER_PASSWORD, totpCode: '000000' },
      { jar },
    )

    expect(wrongPassword.status).toBe(403)
    expect(wrongCode.status).toBe(403)
  })

  it('grants a capability that is scoped, short-lived and single-use', async () => {
    const { jar } = await signInFresh()
    const granted = await stepUpFor(jar, 'recovery-codes')

    expect(granted.status, JSON.stringify(granted.body)).toBe(200)

    const token = granted.body.data.stepUpToken
    const lifetime = Date.parse(granted.body.data.expiresAt) - Date.now()

    expect(lifetime).toBeLessThanOrEqual(AUTH_TTL.stepUpSeconds * 1000 + 2000)

    // Wrong scope: the same token cannot change the password.
    const wrongScope = await call(
      'POST',
      '/owner/security/password/change',
      { newPassword: 'another long passphrase' },
      { jar, headers: { 'x-v2-step-up': token } },
    )

    expect(wrongScope.status).toBe(403)

    const first = await call('POST', '/owner/security/recovery-codes/rotate', {}, {
      jar,
      headers: { 'x-v2-step-up': token },
    })

    expect(first.status, JSON.stringify(first.body)).toBe(200)

    // Spent.
    const second = await call('POST', '/owner/security/recovery-codes/rotate', {}, {
      jar,
      headers: { 'x-v2-step-up': token },
    })

    expect(second.status).toBe(403)
  })

  it('is bound to the session that earned it', async () => {
    const { jar, totpSecret } = await signInFresh()
    const other = await signInWithTotp(totpSecret)
    const granted = await stepUpFor(jar, 'recovery-codes')

    const stolen = await call('POST', '/owner/security/recovery-codes/rotate', {}, {
      jar: other,
      headers: { 'x-v2-step-up': granted.body.data.stepUpToken },
    })

    expect(stolen.status).toBe(403)
  })

  it('replaces every recovery code at once, and the old ones stop working', async () => {
    const { jar, recoveryCodes } = await signInFresh()
    const granted = await stepUpFor(jar, 'recovery-codes')

    const rotated = await call('POST', '/owner/security/recovery-codes/rotate', {}, {
      jar,
      headers: { 'x-v2-step-up': granted.body.data.stepUpToken },
    })

    expect(rotated.body.data.recoveryCodes).toHaveLength(10)
    expect(rotated.body.data.recoveryCodes).not.toEqual(recoveryCodes)

    const start = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    })
    const old = await call('POST', '/auth/password/finish', {
      challengeId: start.body.data.challengeId,
      recoveryCode: recoveryCodes[0],
    })

    expect(old.status).toBe(401)
  })

  it('changes the password, revokes every session, and says so by email', async () => {
    const { jar, totpSecret } = await signInFresh()
    const other = await signInWithTotp(totpSecret)
    const granted = await stepUpFor(jar, 'password')

    const changed = await call(
      'POST',
      '/owner/security/password/change',
      { newPassword: 'an entirely different passphrase' },
      { jar, headers: { 'x-v2-step-up': granted.body.data.stepUpToken } },
    )

    expect(changed.status, JSON.stringify(changed.body)).toBe(200)

    // Both browsers, including the one that made the change.
    expect((await call('GET', '/owner/security', undefined, { jar })).status).toBe(401)
    expect((await call('GET', '/owner/security', undefined, { jar: other })).status).toBe(401)

    const old = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    })

    expect(old.status).toBe(401)

    const fresh = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: 'an entirely different passphrase',
    })

    expect(fresh.status).toBe(200)
    expect(mailbox.map((mail) => mail.subject)).toContain(
      'A security setting on your dashboard changed',
    )
  })

  it('never leaves the account with no way in', async () => {
    const { jar } = await signInFresh()

    await database.db.query(
      `INSERT INTO v2_owner_passkeys (owner_id, credential_id, public_key, counter, name)
       SELECT id, 'only-key', $1, 0, 'Laptop' FROM v2_owner`,
      [Buffer.from([1, 2, 3])],
    )

    const granted = await stepUpFor(jar, 'passkeys')
    const { rows } = await database.db.query('SELECT id FROM v2_owner_passkeys')

    /*
     * Break the fallback *after* the proof is in hand. The password is what
     * goes, not the authenticator: an account with no verified TOTP has no
     * usable session at all, so it could never reach this route to be tested.
     */
    await database.db.query('UPDATE v2_owner SET password_hash = NULL')

    const removal = await call('DELETE', `/owner/security/passkeys/${rows[0].id}`, undefined, {
      jar,
      headers: { 'x-v2-step-up': granted.body.data.stepUpToken },
    })

    expect(removal.status).toBe(409)
    expect(
      (await database.db.query('SELECT count(*)::int AS count FROM v2_owner_passkeys')).rows[0]
        .count,
    ).toBe(1)
  })

  it('removes a passkey when the password and authenticator still work', async () => {
    const { jar } = await signInFresh()

    await database.db.query(
      `INSERT INTO v2_owner_passkeys (owner_id, credential_id, public_key, counter, name)
       SELECT id, 'only-key', $1, 0, 'Laptop' FROM v2_owner`,
      [Buffer.from([1, 2, 3])],
    )

    const granted = await stepUpFor(jar, 'passkeys')
    const { rows } = await database.db.query('SELECT id FROM v2_owner_passkeys')
    const removal = await call('DELETE', `/owner/security/passkeys/${rows[0].id}`, undefined, {
      jar,
      headers: { 'x-v2-step-up': granted.body.data.stepUpToken },
    })

    expect(removal.status, JSON.stringify(removal.body)).toBe(200)
  })
})

/* --------------------------------------------------------- reset by email */

describe('a forgotten password', () => {
  it('says the same thing for an address that exists and one that does not', async () => {
    await signInFresh()

    const known = await call('POST', '/auth/password-reset/request', { email: OWNER_EMAIL })
    const unknown = await call('POST', '/auth/password-reset/request', {
      email: 'nobody@example.de',
    })

    expect(known.status).toBe(200)
    expect(unknown.status).toBe(200)
    expect(known.body).toEqual(unknown.body)
  })

  it('never puts the link in the response', async () => {
    await signInFresh()

    const result = await call('POST', '/auth/password-reset/request', { email: OWNER_EMAIL })

    expect(mailbox).toHaveLength(1)
    expect(JSON.stringify(result.body)).not.toContain('token=')
    expect(JSON.stringify(result.body)).not.toContain('/reset')
  })

  it('sets the new password, ends every session, and still demands a second factor', async () => {
    const { jar, totpSecret } = await signInFresh()

    await call('POST', '/auth/password-reset/request', { email: OWNER_EMAIL })

    const token = tokenFromMail(mailbox[0]!)

    const completed = await call('POST', '/auth/password-reset/complete', {
      token,
      newPassword: 'a brand new long passphrase',
    })

    expect(completed.status, JSON.stringify(completed.body)).toBe(200)
    expect((await call('GET', '/owner/security', undefined, { jar })).status).toBe(401)

    // A reset is not a way around MFA: the new password still only buys a
    // pending challenge.
    const start = await call('POST', '/auth/password/start', {
      email: OWNER_EMAIL,
      password: 'a brand new long passphrase',
    })

    expect(start.body.data.mode).toBe('mfa')

    await pretendTimePassed()

    const finish = await call('POST', '/auth/password/finish', {
      challengeId: start.body.data.challengeId,
      totpCode: currentTotpCode(totpSecret),
    })

    expect(finish.status, JSON.stringify(finish.body)).toBe(200)

    const { rows } = await database.db.query(
      'SELECT totp_confirmed_at FROM v2_owner',
    )

    expect(rows[0].totp_confirmed_at).not.toBeNull()
  })

  it('spends the link once', async () => {
    await signInFresh()
    await call('POST', '/auth/password-reset/request', { email: OWNER_EMAIL })

    const token = tokenFromMail(mailbox[0]!)

    expect(
      (await call('POST', '/auth/password-reset/complete', { token, newPassword: 'passphrase one x' }))
        .status,
    ).toBe(200)
    expect(
      (await call('POST', '/auth/password-reset/complete', { token, newPassword: 'passphrase two x' }))
        .status,
    ).toBe(401)
  })

  it('invalidates an older link when a new one is asked for', async () => {
    await signInFresh()

    await call('POST', '/auth/password-reset/request', { email: OWNER_EMAIL })
    await call('POST', '/auth/password-reset/request', { email: OWNER_EMAIL })

    const tokens = mailbox.map(
      (mail) => tokenFromMail(mail),
    )

    expect(tokens).toHaveLength(2)
    expect(
      (await call('POST', '/auth/password-reset/complete', {
        token: tokens[0],
        newPassword: 'the older link xx',
      })).status,
    ).toBe(401)
    expect(
      (await call('POST', '/auth/password-reset/complete', {
        token: tokens[1],
        newPassword: 'the newer link xx',
      })).status,
    ).toBe(200)
  })

  it('refuses an expired link', async () => {
    await signInFresh()
    await call('POST', '/auth/password-reset/request', { email: OWNER_EMAIL })

    const token = tokenFromMail(mailbox[0]!)

    await database.db.query(
      "UPDATE v2_auth_tokens SET expires_at = CURRENT_TIMESTAMP - interval '1 second'",
    )

    expect(
      (await call('POST', '/auth/password-reset/complete', { token, newPassword: 'too late now x' }))
        .status,
    ).toBe(401)
  })
})

/* ------------------------------------------------------------ email change */

describe('changing the login address', () => {
  it('keeps the old address working until the new one is confirmed', async () => {
    const { jar } = await signInFresh()
    const granted = await stepUpFor(jar, 'email')

    expect(granted.status, JSON.stringify(granted.body)).toBe(200)

    const requested = await call(
      'POST',
      '/owner/security/email-change/request',
      { newEmail: 'new@example.de' },
      { jar, headers: { 'x-v2-step-up': granted.body.data.stepUpToken } },
    )

    expect(requested.status, JSON.stringify(requested.body)).toBe(200)

    // Still the old address.
    const { rows } = await database.db.query('SELECT email FROM v2_owner')

    expect(rows[0].email).toBe(OWNER_EMAIL)

    const overview = await call('GET', '/owner/security', undefined, { jar })

    expect(overview.body.data.pendingEmailChange.newEmail).toBe('new@example.de')

    // The confirmation goes to the new address; the warning to the old one.
    expect(mailbox.map((mail) => mail.to)).toContain('new@example.de')
    expect(mailbox.map((mail) => mail.to)).toContain(OWNER_EMAIL)

    const confirmation = mailbox.find((mail) => mail.to === 'new@example.de')!
    const token = tokenFromMail(confirmation)

    const confirmed = await call('POST', '/auth/email-change/confirm', { token })

    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)

    const after = await database.db.query('SELECT email FROM v2_owner')

    expect(after.rows[0].email).toBe('new@example.de')

    // And every session ended, so the next sign-in uses the new address.
    expect((await call('GET', '/owner/security', undefined, { jar })).status).toBe(401)
    expect(
      (await call('POST', '/auth/password/start', { email: OWNER_EMAIL, password: OWNER_PASSWORD }))
        .status,
    ).toBe(401)
    expect(
      (await call('POST', '/auth/password/start', {
        email: 'new@example.de',
        password: OWNER_PASSWORD,
      })).status,
    ).toBe(200)
  })
})

/* ------------------------------------------------------------- sessions */

describe('the session list', () => {
  it('shows every open session, marks the current one, and is paginated', async () => {
    const { jar, totpSecret } = await signInFresh()

    await signInWithTotp(totpSecret)

    const result = await call('GET', '/owner/security/sessions', undefined, { jar })

    expect(result.status).toBe(200)
    expect(result.body.data.total).toBe(2)
    expect(result.body.data.page).toBe(1)
    expect(result.body.data.pageSize).toBe(20)
    expect(result.body.data.items.filter((item: Json) => item.isCurrent)).toHaveLength(1)

    for (const item of result.body.data.items) {
      expect(item.inferredDevice).toBeTruthy()
      // Everything the list says about a device comes from one header, and
      // nothing in it claims to be a place.
      expect(JSON.stringify(item)).not.toMatch(/latitude|city|country/i)
    }
  })

  it('signs one device out without a step-up, and all of them with one', async () => {
    const { jar, totpSecret } = await signInFresh()
    const other = await signInWithTotp(totpSecret)

    const list = await call('GET', '/owner/security/sessions', undefined, { jar })
    const target = list.body.data.items.find((item: Json) => !item.isCurrent)

    const revoked = await call('DELETE', `/owner/security/sessions/${target.id}`, undefined, { jar })

    expect(revoked.status).toBe(200)
    expect((await call('GET', '/owner/security', undefined, { jar: other })).status).toBe(401)
    expect((await call('GET', '/owner/security', undefined, { jar })).status).toBe(200)

    const withoutProof = await call('POST', '/owner/security/sessions/revoke-all', {}, { jar })

    expect(withoutProof.status).toBe(403)

    const granted = await stepUpFor(jar, 'sessions')

    expect(granted.status, JSON.stringify(granted.body)).toBe(200)
    const all = await call('POST', '/owner/security/sessions/revoke-all', {}, {
      jar,
      headers: { 'x-v2-step-up': granted.body.data.stepUpToken },
    })

    expect(all.status, JSON.stringify(all.body)).toBe(200)
    expect(jar.v2_owner_session).toBeUndefined()
  })

  it('signs out and clears the cookie', async () => {
    const { jar } = await signInFresh()

    const result = await call('POST', '/auth/logout', {}, { jar })

    expect(result.status).toBe(200)
    expect(jar.v2_owner_session).toBeUndefined()
    expect(jar.v2_csrf).toBeUndefined()

    const { rows } = await database.db.query(
      'SELECT revoked_at FROM v2_owner_sessions ORDER BY created_at DESC LIMIT 1',
    )

    expect(rows[0].revoked_at).not.toBeNull()
  })
})

/* ---------------------------------------------------------- abuse control */

describe('abuse controls', () => {
  it('stops repeated password guesses with a neutral 429', async () => {
    await seedOwner()

    let lastStatus = 0
    let lastBody: Json = {}

    for (let attempt = 0; attempt <= AUTH_RATE_LIMITS.password.limit; attempt += 1) {
      const result = await call('POST', '/auth/password/start', {
        email: OWNER_EMAIL,
        password: 'wrong every time',
      })

      lastStatus = result.status
      lastBody = result.body
    }

    expect(lastStatus).toBe(429)
    expect(lastBody.code).toBe('RATE_LIMITED')
    // Neutral: nothing about the account, the limit or how many tries remain.
    expect(JSON.stringify(lastBody)).not.toContain(OWNER_EMAIL)
    expect(lastBody.message).not.toMatch(/\d+ (attempts|tries)/)
  })

  it('counts in shared storage rather than in this process', async () => {
    await seedOwner()

    await call('POST', '/auth/password/start', { email: OWNER_EMAIL, password: 'wrong' })

    const { rows } = await database.db.query('SELECT key, count FROM v2_auth_rate_limits')

    expect(rows.length).toBeGreaterThan(0)
    // The identity is hashed, so the table is a counter and not a log of who
    // tried to sign in.
    for (const row of rows) {
      expect(row.key).not.toContain(OWNER_EMAIL)
      expect(row.key).toMatch(/^[a-z-]+:[0-9a-f]{64}$/)
    }
  })

  it('counts step-up proofs against the session', async () => {
    const { jar } = await signInFresh()

    let lastStatus = 0

    for (let attempt = 0; attempt <= AUTH_RATE_LIMITS.stepUp.limit; attempt += 1) {
      const result = await call(
        'POST',
        '/owner/security/reverify',
        { scope: 'password', password: 'wrong', totpCode: '000000' },
        { jar },
      )

      lastStatus = result.status
    }

    expect(lastStatus).toBe(429)
  })
})

/* -------------------------------------------------------------- hygiene */

describe('what leaves the server', () => {
  it('never puts a secret in a response body', async () => {
    const { jar } = await signInFresh()

    for (const path of ['/owner/security', '/owner/security/sessions']) {
      const result = await call('GET', path, undefined, { jar })
      const text = JSON.stringify(result.body)

      for (const forbidden of [
        'password_hash',
        'token_hash',
        'secret_hash',
        'code_hash',
        'totp_secret',
        'ip_hash',
        jar.v2_owner_session,
      ]) {
        expect(`${path} leaks ${forbidden}`).toBe(
          `${path} leaks ${text.includes(forbidden!) ? 'IT DOES' : forbidden}`,
        )
      }
    }
  })

  it('writes an audit trail with outcomes and no secrets in it', async () => {
    const { jar } = await signInFresh()

    await call('POST', '/auth/password/start', { email: OWNER_EMAIL, password: 'wrong' })

    const overview = await call('GET', '/owner/security', undefined, { jar })
    const kinds = overview.body.data.recentEvents.map((event: Json) => event.kind)

    expect(kinds).toContain('sign_in_password_totp')
    expect(kinds).toContain('totp_enrolled')
    expect(kinds).toContain('recovery_codes_issued')
    expect(kinds).toContain('sign_in_failed')

    const { rows } = await database.db.query('SELECT detail::text AS detail FROM v2_security_events')

    for (const row of rows) {
      expect(row.detail).not.toContain(OWNER_PASSWORD)
      expect(row.detail).not.toContain(jar.v2_owner_session)
    }
  })

  it('marks the session cookie HttpOnly and SameSite, and the CSRF one readable', async () => {
    await seedOwner()

    const jar: Jar = {}
    const start = await call(
      'POST',
      '/auth/password/start',
      { email: OWNER_EMAIL, password: OWNER_PASSWORD },
      { jar },
    )

    await call(
      'POST',
      '/auth/enrollment/totp/start',
      { challengeId: start.body.data.challengeId },
      { jar },
    )

    const enroll = await call('POST', '/auth/enrollment/totp/start', {
      challengeId: start.body.data.challengeId,
    })
    const secret = secretFromUri(enroll.body.data.uri)

    const confirmed = await call(
      'POST',
      '/auth/enrollment/totp/confirm',
      { challengeId: start.body.data.challengeId, code: currentTotpCode(secret) },
      { jar },
    )

    const cookies =
      typeof confirmed.response.headers.getSetCookie === 'function'
        ? confirmed.response.headers.getSetCookie()
        : []

    const session = cookies.find((cookie) => cookie.startsWith('v2_owner_session='))!
    const csrf = cookies.find((cookie) => cookie.startsWith('v2_csrf='))!

    expect(session).toContain('HttpOnly')
    expect(session).toContain('SameSite=Lax')
    expect(session).toContain('Path=/')
    // The Dashboard has to read this one to echo it back.
    expect(csrf).not.toContain('HttpOnly')

    // Max-Age follows the server's own deadline rather than a round number.
    const maxAge = Number(/Max-Age=(\d+)/.exec(session)?.[1])

    expect(maxAge).toBeGreaterThan(AUTH_TTL.sessionSeconds - 60)
    expect(maxAge).toBeLessThanOrEqual(AUTH_TTL.sessionSeconds)
  })
})

describe('isolation from the legacy system', () => {
  it('imports nothing from the legacy backend', async () => {
    const { readFile, readdir } = await import('node:fs/promises')
    const roots = [
      new URL('../backend2/auth/', import.meta.url),
      new URL('../backend2/modules/auth/', import.meta.url),
    ]

    for (const root of roots) {
      for (const file of await readdir(root)) {
        if (!file.endsWith('.ts')) continue

        const source = await readFile(new URL(file, root), 'utf8')

        expect(`${file} reaches into`).toBe(
          `${file} reaches into${/from '[^']*backend\//.test(source) ? ' src/backend' : ''}`,
        )
        expect(source).not.toContain('better-auth')
      }
    }
  })

  it('leaves the unauthenticated part of the API reachable', async () => {
    await signInFresh()

    process.env.BACKEND2_OWNER_AUTH = 'required'

    // No public read routes exist in this module. The health route is the
    // whole of what a stranger may reach, and it must stay reachable.
    const result = await call('GET', '/')

    expect(result.status).toBe(200)
    expect(result.body.data).toEqual({ status: 'ok', version: 2 })
  })

  it('touches no legacy table', async () => {
    await signInFresh()

    const { rows } = await database.db.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'v2\\_%'`,
    )

    expect(rows).toEqual([])
  })
})
