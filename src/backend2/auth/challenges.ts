import { getDb } from '../db/client'
import { hashOpaqueSecret, newOpaqueSecret } from './crypto'

/**
 * Short-lived ceremonies: the WebAuthn challenges, the pending MFA step a
 * correct password buys, and the action-scoped step-up capability.
 *
 * None of these is a session, and the distinction is load-bearing.
 * `docs/v2/auth.md`: "A valid password step produces only a short-lived,
 * one-use, server-side pending challenge, never an authenticated owner
 * session." Nothing in this file can produce a cookie.
 */

export type ChallengeKind = 'webauthn_auth' | 'webauthn_register' | 'mfa_pending' | 'step_up'

export type ChallengeRow = {
  id: string
  kind: ChallengeKind
  owner_id: string | null
  data: Record<string, unknown>
  attempts: number
  expires_at: Date
}

/**
 * Creates one, and hands back the opaque id exactly once.
 *
 * Only the hash is stored, so a database dump cannot be replayed as a
 * half-finished sign-in.
 */
export const createChallenge = async (options: {
  kind: ChallengeKind
  ownerId?: string | null
  data?: Record<string, unknown>
  ttlSeconds: number
}): Promise<{ challengeId: string; id: string; expiresAt: Date }> => {
  const secret = newOpaqueSecret()

  const { rows } = await getDb().query<{ id: string; expires_at: Date }>(
    `INSERT INTO v2_auth_challenges (kind, owner_id, secret_hash, data, expires_at)
     VALUES ($1, $2, $3, $4::jsonb,
             CURRENT_TIMESTAMP + make_interval(secs => $5::double precision))
     RETURNING id, expires_at`,
    [
      options.kind,
      options.ownerId ?? null,
      hashOpaqueSecret(secret),
      JSON.stringify(options.data ?? {}),
      options.ttlSeconds,
    ],
  )

  const row = rows[0]

  if (!row) throw new Error('The challenge could not be created')

  return { challengeId: secret, id: row.id, expiresAt: new Date(row.expires_at) }
}

const parseData = (value: unknown): Record<string, unknown> =>
  typeof value === 'string'
    ? (JSON.parse(value) as Record<string, unknown>)
    : ((value ?? {}) as Record<string, unknown>)

/** Reads a live challenge without spending it. Expiry is decided by the database clock. */
export const readChallenge = async (
  challengeId: string,
  kind: ChallengeKind,
): Promise<ChallengeRow | null> => {
  const { rows } = await getDb().query<ChallengeRow>(
    `SELECT id, kind, owner_id, data, attempts, expires_at
       FROM v2_auth_challenges
      WHERE secret_hash = $1
        AND kind = $2
        AND consumed_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP`,
    [hashOpaqueSecret(challengeId), kind],
  )

  const row = rows[0]

  return row ? { ...row, data: parseData(row.data) } : null
}

/**
 * Spends a challenge, atomically.
 *
 * The `consumed_at IS NULL` in the WHERE clause is what makes "one use" true
 * under concurrency: two simultaneous requests both run the UPDATE, and
 * PostgreSQL lets exactly one of them match. Reading and then writing would
 * let both through.
 */
export const consumeChallenge = async (
  challengeId: string,
  kind: ChallengeKind,
): Promise<ChallengeRow | null> => {
  const { rows } = await getDb().query<ChallengeRow>(
    `UPDATE v2_auth_challenges
        SET consumed_at = CURRENT_TIMESTAMP
      WHERE secret_hash = $1
        AND kind = $2
        AND consumed_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      RETURNING id, kind, owner_id, data, attempts, expires_at`,
    [hashOpaqueSecret(challengeId), kind],
  )

  const row = rows[0]

  return row ? { ...row, data: parseData(row.data) } : null
}

/**
 * Counts a failed attempt, and burns the challenge once the ceiling is
 * reached.
 *
 * Returning `exhausted` rather than throwing lets the caller answer with the
 * same generic message either way, so a stranger cannot tell "wrong code" from
 * "that is enough".
 */
export const recordFailedAttempt = async (
  id: string,
  maxAttempts: number,
): Promise<{ attempts: number; exhausted: boolean }> => {
  const { rows } = await getDb().query<{ attempts: number }>(
    `UPDATE v2_auth_challenges
        SET attempts = attempts + 1,
            consumed_at = CASE WHEN attempts + 1 >= $2 THEN CURRENT_TIMESTAMP ELSE consumed_at END
      WHERE id = $1
      RETURNING attempts`,
    [id, maxAttempts],
  )

  const attempts = Number(rows[0]?.attempts ?? maxAttempts)

  return { attempts, exhausted: attempts >= maxAttempts }
}

/** Invalidates every outstanding challenge of a kind. Used when a factor changes. */
export const revokeChallenges = async (
  ownerId: string,
  kinds: ChallengeKind[],
): Promise<void> => {
  await getDb().query(
    `UPDATE v2_auth_challenges
        SET consumed_at = CURRENT_TIMESTAMP
      WHERE owner_id = $1 AND kind = ANY($2::text[]) AND consumed_at IS NULL`,
    [ownerId, kinds],
  )
}

/**
 * Removes spent and expired rows. Called opportunistically from the sign-in
 * paths: the table is tiny and only the owner ever writes to it, so a
 * scheduled job would be more machinery than the problem deserves.
 */
export const sweepChallenges = async (): Promise<void> => {
  await getDb().query(
    `DELETE FROM v2_auth_challenges
      WHERE expires_at < CURRENT_TIMESTAMP - interval '1 day'
         OR (consumed_at IS NOT NULL AND consumed_at < CURRENT_TIMESTAMP - interval '1 day')`,
  )
}
