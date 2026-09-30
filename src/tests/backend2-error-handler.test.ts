import { describe, expect, it, vi } from 'vitest'
import { internalError, stripeUnavailable } from '#/backend2/http/error'
import { normalizeError } from '#/backend2/http/error-handler'

describe('normalizeError', () => {
  it('shows a 503 its written sentence, never its details', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const stripe = normalizeError(stripeUnavailable('Stripe could not be reached.', { stripeMessage: 'secret words' }))

    expect(stripe.status).toBe(503)
    expect(stripe.body).toMatchObject({ message: 'Stripe could not be reached.', code: 'STRIPE_UNAVAILABLE' })
    expect(JSON.stringify(stripe.body)).not.toContain('secret words')
  })

  it('still hides a 500 and anything unknown', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(normalizeError(internalError('row 42 of clients broke')).body).toMatchObject({ message: 'An unexpected error occurred' })
    expect(normalizeError(new Error('Jane Doe')).body).toMatchObject({ message: 'An unexpected error occurred', code: 'INTERNAL_ERROR' })
  })
})
