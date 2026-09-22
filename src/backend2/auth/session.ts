import { AUTH_TTL, type SignInMethod } from '../contracts/auth.contract'
import { getDb } from '../db/client'
import { unauthorized } from '../http/error'
import { hashAddress } from './audit'
import {
  V2_CSRF_COOKIE,
  V2_SESSION_COOKIE,
  useSecureCookies,
} from './config'
import { constantTimeEqual, hashOpaqueSecret, newOpaqueSecret } from './crypto'

/**
 * The V2 owner session: server-side, absolute, revocable.
 *
 * Three properties from `docs/v2/auth.md` shape everything here.
 *
 *  - **Seven days, absolutely.** `expires_at` is written once, from
 *    `authenticated_at`, and no code path moves it. There is no sliding
 *    window, no idle timeout and no "trust this device".
 *  - **The cookie is a lookup key, not a claim.** It carries 32 random bytes;
 *    the row is found by hashing them. Nothing about the owner, the expiry or
 *    the sign-in method is encoded in it, so it cannot be read or forged into
 *    something else.
 *  - **Rotation does not extend.** A new token may replace an old one inside
 *    the period; `authenticated_at` and `expires_at` stay where they were.
 */

export type OwnerSession = {
  id: string
  ownerId: string
  email: string
  method: SignInMethod
  authenticatedAt: Date
  expiresAt: Date
  /** True once TOTP is verified and a recovery set has been shown. */
  enrolled: boolean
}

/* ------------------------------------------------------------------ cookies */

export const parseCookies = (request: Request): Record<string, string> => {
  const header = request.headers.get('cookie')

  if (!header) return {}

  const cookies: Record<string, string> = {}

  for (const part of header.split(';')) {
    const index = part.indexOf('=')

    if (index < 1) continue

    const name = part.slice(0, index).trim()

    if (!name || name in cookies) continue

    cookies[name] = decodeURIComponent(part.slice(index + 1).trim())
  }

  return cookies
}

/**
 * `Max-Age` mirrors the server's own deadline rather than being a round
 * number, so the browser forgets the cookie at the same moment the row stops
 * being accepted. A cookie that outlives its session only produces a
 * confusing 401 later.
 */
const buildCookie = (options: {
  name: string
  value: string
  maxAgeSeconds: number
  httpOnly: boolean
}): string => {
  const attributes = [
    `${options.name}=${encodeURIComponent(options.value)}`,
    'Path=/',
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
    // Lax, not Strict: an email-change confirmation arrives as a top-level
    // navigation, and Strict would make the owner look signed out on it.
    // Cross-site writes are stopped by the CSRF pair below, not by the cookie.
    'SameSite=Lax',
  ]

  if (options.httpOnly) attributes.push('HttpOnly')
  if (useSecureCookies()) attributes.push('Secure')

  return attributes.join('; ')
}

/**
 * The two cookies a signed-in owner carries.
 *
 * The session cookie is HttpOnly, so no script can read it. The CSRF cookie
 * deliberately is not: the Dashboard has to read it to echo it back in a
 * header, which is the whole mechanism. It is a random value with no authority
 * of its own — holding it proves nothing without the session cookie.
 */
export const sessionCookies = (options: {
  token: string
  csrfToken: string
  expiresAt: Date
}): string[] => {
  const maxAgeSeconds = Math.floor((options.expiresAt.getTime() - Date.now()) / 1000)

  return [
    buildCookie({
      name: V2_SESSION_COOKIE,
      value: options.token,
      maxAgeSeconds,
      httpOnly: true,
    }),
    buildCookie({
      name: V2_CSRF_COOKIE,
      value: options.csrfToken,
      maxAgeSeconds,
      httpOnly: false,
    }),
  ]
}

export const clearedSessionCookies = (): string[] => [
  buildCookie({ name: V2_SESSION_COOKIE, value: '', maxAgeSeconds: 0, httpOnly: true }),
  buildCookie({ name: V2_CSRF_COOKIE, value: '', maxAgeSeconds: 0, httpOnly: false }),
]

/* ----------------------------------------------------------------- lifetime */

type SessionRow = {
  id: string
  owner_id: string
  email: string
  method: SignInMethod
  authenticated_at: Date
  expires_at: Date
  totp_confirmed_at: Date | null
  recovery_codes_issued_at: Date | null
}

/**
 * Starts a session. Only ever called after a factor was actually verified —
 * a passkey assertion with user verification, or a password followed by a
 * second factor.
 */
export const createSession = async (options: {
  ownerId: string
  method: SignInMethod
  request?: Request
  ipAddress?: string | null
}): Promise<{ token: string; csrfToken: string; expiresAt: Date; sessionId: string }> => {
  const token = newOpaqueSecret()
  const csrfToken = newOpaqueSecret()

  const { rows } = await getDb().query<{ id: string; expires_at: Date }>(
    `INSERT INTO v2_owner_sessions
       (owner_id, token_hash, method, expires_at, user_agent, ip_hash, last_seen_at)
     VALUES ($1, $2, $3,
             CURRENT_TIMESTAMP + make_interval(secs => $4::double precision),
             $5, $6, CURRENT_TIMESTAMP)
     RETURNING id, expires_at`,
    [
      options.ownerId,
      hashOpaqueSecret(token),
      options.method,
      AUTH_TTL.sessionSeconds,
      options.request?.headers.get('user-agent')?.slice(0, 400) ?? null,
      hashAddress(options.ipAddress),
    ],
  )

  const row = rows[0]

  if (!row) throw new Error('The session could not be created')

  return {
    token,
    csrfToken,
    expiresAt: new Date(row.expires_at),
    sessionId: row.id,
  }
}

const toSession = (row: SessionRow): OwnerSession => ({
  id: row.id,
  ownerId: row.owner_id,
  email: row.email,
  method: row.method,
  authenticatedAt: new Date(row.authenticated_at),
  expiresAt: new Date(row.expires_at),
  enrolled: Boolean(row.totp_confirmed_at && row.recovery_codes_issued_at),
})

/**
 * Resolves the cookie to a session, or to nothing.
 *
 * Expiry and revocation are both decided in the WHERE clause, by the database
 * clock, so a process with a wrong system time cannot extend anybody's
 * session. `last_seen_at` is touched for the session list; it is not part of
 * any deadline.
 */
export const readSessionFromRequest = async (
  request: Request,
): Promise<OwnerSession | null> => {
  const token = parseCookies(request)[V2_SESSION_COOKIE]

  if (!token) return null

  const { rows } = await getDb().query<SessionRow>(
    `UPDATE v2_owner_sessions AS s
        SET last_seen_at = CURRENT_TIMESTAMP
       FROM v2_owner AS o
      WHERE s.owner_id = o.id
        AND s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > CURRENT_TIMESTAMP
      RETURNING s.id, s.owner_id, o.email, s.method, s.authenticated_at, s.expires_at,
                o.totp_confirmed_at, o.recovery_codes_issued_at`,
    [hashOpaqueSecret(token)],
  )

  const row = rows[0]

  return row ? toSession(row) : null
}

/**
 * The double-submit check for a cookie-authenticated write.
 *
 * A cross-site page can make the browser send the cookie, but it cannot read
 * the CSRF cookie back out to put it in a custom header — that is what the
 * same-origin policy stops it doing. Read methods are exempt because they
 * change nothing.
 */
export const assertCsrf = (request: Request): void => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return

  const cookie = parseCookies(request)[V2_CSRF_COOKIE]
  const header = request.headers.get('x-v2-csrf')

  if (!cookie || !header || !constantTimeEqual(cookie, header)) {
    throw unauthorized('That request could not be verified. Reload the page and try again')
  }
}

/**
 * Replaces the token without touching the deadline.
 *
 * `authenticated_at` and `expires_at` are deliberately absent from the SET
 * clause: `docs/v2/auth.md` asks for rotation "without extending the
 * deadline", and the only way to guarantee that is for the statement to have
 * no way of expressing it.
 */
export const rotateSessionToken = async (
  sessionId: string,
): Promise<{ token: string; csrfToken: string; expiresAt: Date } | null> => {
  const token = newOpaqueSecret()

  const { rows } = await getDb().query<{ expires_at: Date }>(
    `UPDATE v2_owner_sessions
        SET token_hash = $2
      WHERE id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      RETURNING expires_at`,
    [sessionId, hashOpaqueSecret(token)],
  )

  const row = rows[0]

  if (!row) return null

  return { token, csrfToken: newOpaqueSecret(), expiresAt: new Date(row.expires_at) }
}

export const revokeSession = async (
  sessionId: string,
  reason: string,
): Promise<boolean> => {
  const { rows } = await getDb().query<{ id: string }>(
    `UPDATE v2_owner_sessions
        SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = $2
      WHERE id = $1 AND revoked_at IS NULL
      RETURNING id`,
    [sessionId, reason],
  )

  return rows.length > 0
}

/**
 * Ends every session, optionally sparing the one asking.
 *
 * Used by "sign out all devices", and automatically by a password change or
 * reset — `docs/v2/auth.md` requires both to revoke what is already open.
 */
export const revokeAllSessions = async (options: {
  ownerId: string
  reason: string
  exceptSessionId?: string | null
}): Promise<number> => {
  const { rows } = await getDb().query<{ id: string }>(
    `UPDATE v2_owner_sessions
        SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = $2
      WHERE owner_id = $1
        AND revoked_at IS NULL
        AND ($3::uuid IS NULL OR id <> $3::uuid)
      RETURNING id`,
    [options.ownerId, options.reason, options.exceptSessionId ?? null],
  )

  return rows.length
}

/** Drops rows nobody can use any more, so the session list stays honest. */
export const sweepSessions = async (): Promise<void> => {
  await getDb().query(
    `DELETE FROM v2_owner_sessions
      WHERE expires_at < CURRENT_TIMESTAMP - interval '30 days'
         OR (revoked_at IS NOT NULL AND revoked_at < CURRENT_TIMESTAMP - interval '30 days')`,
  )
}
