import { describe, expect, it } from 'vitest'
import { handleError } from '#/backend/shared/error-handler'
import { notFoundError, rateLimitedError } from '#/backend/shared/error'

/**
 * Elysia derives its `code` from the thrown error's own `code` field, so an
 * application `NOT_FOUND` arrives under the same name as an unmatched route.
 * These pin the two apart.
 */
const run = (code: string, error: unknown) => {
  let captured: { status: number; body: unknown } | undefined
  const status = (s: number, body: unknown) => {
    captured = { status: s, body }
    return captured
  }

  // The handler only reads these three fields.
  const set = { headers: {} as Record<string, string> }
  ;(handleError as unknown as (context: unknown) => unknown)({ code, error, set, status })

  return { ...(captured as { status: number; body: { message: string; code: string } }), headers: set.headers }
}

describe('the central error handler', () => {
  it('keeps the message of an application not-found', () => {
    const result = run('NOT_FOUND', notFoundError('That post does not exist'))

    expect(result.status).toBe(404)
    expect(result.body.message).toBe('That post does not exist')
  })

  it('still answers an unmatched route generically', () => {
    const result = run('NOT_FOUND', new Error('no route'))

    expect(result.status).toBe(404)
    expect(result.body.message).toBe('Route not found')
  })

  it('adds Retry-After to rate-limit responses', () => {
    const result = run('AppError', rateLimitedError('Wait', { retryAfter: 42.1 }))

    expect(result.status).toBe(429)
    expect(result.headers['Retry-After']).toBe('43')
  })

  /**
   * A check constraint is the schema refusing a combination, which is the
   * caller's fault, not the server's. It used to fall through to a bare 500
   * called "An unexpected error occurred" — which is how "Lost" in the inbox
   * came to look like a button that did nothing.
   */
  it('reports a refused check constraint as a client error', () => {
    const result = run(
      'UNKNOWN',
      Object.assign(new Error('new row for relation "leads" violates check constraint'), {
        code: '23514',
        constraint: 'leads_lost_pair_check',
        table: 'leads',
      }),
    )

    expect(result.status).toBe(400)
    expect(result.body.code).toBe('BAD_REQUEST')
    expect(result.body.message).not.toBe('An unexpected error occurred')
  })
})
