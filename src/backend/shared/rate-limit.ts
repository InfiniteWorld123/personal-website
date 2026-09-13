import { env } from '#/shared/env'
import type { Db } from '../db/client'
import { getDb } from '../db/client'
import { rateLimitedError } from './error'

type RateLimitRule = {
  scope: string
  identity: string
  limit: number
  windowSeconds: number
}

export type RateLimitResult = {
  allowed: boolean
  retryAfter: number | null
}

const encoder = new TextEncoder()
let hmacKey: Promise<CryptoKey> | undefined

const getRateLimitSecret = (): string => {
  if (env.RATE_LIMIT_SECRET) return env.RATE_LIMIT_SECRET
  if (process.env.NODE_ENV !== 'production') return env.BETTER_AUTH_SECRET

  throw new Error('Environment variable RATE_LIMIT_SECRET is missing')
}

const getHmacKey = (): Promise<CryptoKey> =>
  (hmacKey ??= crypto.subtle.importKey(
    'raw',
    encoder.encode(getRateLimitSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  ))

const toHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

export const createRateLimitKey = async (scope: string, identity: string): Promise<string> => {
  const digest = await crypto.subtle.sign('HMAC', await getHmacKey(), encoder.encode(identity))

  return `v1:${scope}:${toHex(digest)}`
}

/** One SQL statement owns both the check and increment, including concurrent requests. */
export const consumeRateLimit = async (
  db: Db,
  rule: RateLimitRule,
): Promise<RateLimitResult> => {
  if (rule.limit < 1 || rule.windowSeconds < 1) {
    throw new Error('Rate-limit rules require positive limits and windows')
  }

  const key = await createRateLimitKey(rule.scope, rule.identity)

  await db.query(
    "DELETE FROM request_rate_limits WHERE window_started_at < CURRENT_TIMESTAMP - interval '2 days';",
  )

  const result = await db.query<{ allowed: boolean; retry_after: number | null }>(
    `WITH consumed AS (
       INSERT INTO request_rate_limits (rate_key, window_started_at, request_count)
       VALUES ($1, CURRENT_TIMESTAMP, 1)
       ON CONFLICT (rate_key) DO UPDATE
         SET request_count = CASE
               WHEN request_rate_limits.window_started_at <= CURRENT_TIMESTAMP - make_interval(secs => $2) THEN 1
               ELSE request_rate_limits.request_count + 1
             END,
             window_started_at = CASE
               WHEN request_rate_limits.window_started_at <= CURRENT_TIMESTAMP - make_interval(secs => $2)
                 THEN CURRENT_TIMESTAMP
               ELSE request_rate_limits.window_started_at
             END
         WHERE request_rate_limits.window_started_at <= CURRENT_TIMESTAMP - make_interval(secs => $2)
            OR request_rate_limits.request_count < $3
       RETURNING window_started_at
     )
     SELECT TRUE AS allowed, NULL::integer AS retry_after FROM consumed
     UNION ALL
     SELECT FALSE AS allowed,
            GREATEST(
              1,
              CEIL(EXTRACT(EPOCH FROM (
                window_started_at + make_interval(secs => $2) - CURRENT_TIMESTAMP
              )))::integer
            ) AS retry_after
       FROM request_rate_limits
      WHERE rate_key = $1 AND NOT EXISTS (SELECT 1 FROM consumed)
      LIMIT 1;`,
    [key, rule.windowSeconds, rule.limit],
  )

  const row = result.rows[0]
  if (!row) return { allowed: false, retryAfter: rule.windowSeconds }

  return { allowed: row.allowed, retryAfter: row.retry_after }
}

export const enforceRateLimit = async (
  rule: RateLimitRule & { message?: string; db?: Db },
): Promise<void> => {
  const result = await consumeRateLimit(rule.db ?? getDb(), rule)

  if (!result.allowed) {
    throw rateLimitedError(rule.message, { retryAfter: result.retryAfter ?? rule.windowSeconds })
  }
}
