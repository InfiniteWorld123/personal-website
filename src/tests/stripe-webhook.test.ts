import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The signature is the whole of the security.
 *
 * `/api/stripe-webhook` is public — Stripe has no session and never will —
 * and it can mark any invoice paid. So the only thing between a stranger who
 * finds the URL and a forged payment is this check, and it has to fail closed
 * in every direction there is.
 *
 * The secret is stubbed rather than read from `.env`, so these run identically
 * on a laptop with no Stripe account and on CI.
 */

const SECRET = 'whsec_test_secret_for_the_suite'

vi.mock('#/shared/env', () => ({ env: { STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_SECRET_KEY: undefined } }))

const { verifyStripeSignature } = await import('#/backend/modules/invoices/stripe.service')

/** What Stripe actually sends: `t=<unix>,v1=<hex hmac of "t.payload">`. */
const sign = async (payload: string, at = Math.floor(Date.now() / 1000), secret = SECRET) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${at}.${payload}`))
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')

  return `t=${at},v1=${hex}`
}

const BODY = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' })

afterEach(() => vi.useRealTimers())

describe('a message that really came from Stripe', () => {
  it('is believed', async () => {
    expect(await verifyStripeSignature(BODY, await sign(BODY))).toBe(true)
  })

  it('is believed with the extra fields Stripe adds', async () => {
    // Stripe sends `v0` alongside `v1` for its CLI, and may add more. Parsing
    // must pick `v1` out rather than assume a shape.
    const header = `${await sign(BODY)},v0=ignoreme`

    expect(await verifyStripeSignature(BODY, header)).toBe(true)
  })
})

describe('a message that did not', () => {
  it('is refused when the body was changed by one character', async () => {
    // The attack this stops: replay a genuine event with the amount raised,
    // or the invoice id swapped for a different one.
    const header = await sign(BODY)

    expect(await verifyStripeSignature(BODY.replace('evt_1', 'evt_2'), header)).toBe(false)
  })

  it('is refused when signed with a different secret', async () => {
    const header = await sign(BODY, Math.floor(Date.now() / 1000), 'whsec_not_the_real_one')

    expect(await verifyStripeSignature(BODY, header)).toBe(false)
  })

  it('is refused when there is no signature at all', async () => {
    expect(await verifyStripeSignature(BODY, null)).toBe(false)
    expect(await verifyStripeSignature(BODY, '')).toBe(false)
  })

  it('is refused when the header is nonsense', async () => {
    for (const header of ['t=123', 'v1=abc', 'garbage', 't=,v1=', '=,=']) {
      expect(await verifyStripeSignature(BODY, header)).toBe(false)
    }
  })

  it('is refused when the timestamp is old', async () => {
    /*
     * Without this a signed payload is valid for ever, and anyone who once saw
     * a genuine one — a proxy log, a screenshot, a mirrored request — could
     * replay it a year later. The `external_id` index catches a replay of the
     * same payment; this catches everything else.
     */
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600

    expect(await verifyStripeSignature(BODY, await sign(BODY, tenMinutesAgo))).toBe(false)
  })

  it('is refused when the timestamp is in the future', async () => {
    // Guards the other side of the window too: a clock pushed forward would
    // otherwise hand out signatures valid long after they were made.
    const inTenMinutes = Math.floor(Date.now() / 1000) + 600

    expect(await verifyStripeSignature(BODY, await sign(BODY, inTenMinutes))).toBe(false)
  })

  it('is refused inside the window and accepted at its edge', async () => {
    const now = Math.floor(Date.now() / 1000)

    expect(await verifyStripeSignature(BODY, await sign(BODY, now - 299))).toBe(true)
    expect(await verifyStripeSignature(BODY, await sign(BODY, now - 301))).toBe(false)
  })
})
