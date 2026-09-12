import { describe, expect, it } from 'vitest'
import { handleError } from '#/backend/shared/error-handler'
import { notFoundError } from '#/backend/shared/error'

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
  ;(handleError as unknown as (context: unknown) => unknown)({ code, error, status })

  return captured as { status: number; body: { message: string; code: string } }
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
})
