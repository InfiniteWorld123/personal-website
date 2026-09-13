import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('#/shared/env', () => ({
  env: {
    BETTER_AUTH_SECRET: 'test-better-auth-secret',
    RATE_LIMIT_SECRET: 'test-independent-rate-limit-secret',
  },
}))

import { Pool } from 'pg'
import { consumeRateLimit, createRateLimitKey } from '#/backend/shared/rate-limit'

const databaseUrl = process.env.TEST_DATABASE_URL
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null
const identity = `concurrency-${crypto.randomUUID()}`

describe.skipIf(!pool)('PostgreSQL rate-limit concurrency', () => {
  beforeAll(async () => {
    const key = await createRateLimitKey('test-concurrency', identity)
    await pool!.query('DELETE FROM request_rate_limits WHERE rate_key = $1', [key])
  })

  afterAll(async () => {
    const key = await createRateLimitKey('test-concurrency', identity)
    await pool!.query('DELETE FROM request_rate_limits WHERE rate_key = $1', [key])
    await pool!.end()
  })

  it('allows exactly the configured count under simultaneous requests', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        consumeRateLimit(pool!, {
          scope: 'test-concurrency',
          identity,
          limit: 5,
          windowSeconds: 60,
        }),
      ),
    )

    expect(results.filter(({ allowed }) => allowed)).toHaveLength(5)
    expect(results.filter(({ allowed }) => !allowed)).toHaveLength(15)
    expect(results.filter(({ allowed }) => !allowed).every(({ retryAfter }) => retryAfter! > 0)).toBe(
      true,
    )
  })
})
