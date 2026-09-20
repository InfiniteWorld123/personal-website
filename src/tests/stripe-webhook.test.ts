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

/* -------------------------------------------------------------------------- */
/* Which messages mean the money is here                                       */
/* -------------------------------------------------------------------------- */

const { paidSessionOf } = await import('#/backend/modules/invoices/stripe.service')

const session = (overrides: Record<string, unknown> = {}) => ({
  id: 'cs_1',
  payment_intent: 'pi_1',
  payment_status: 'paid',
  amount_total: 99_000,
  currency: 'eur',
  metadata: { invoice_id: 'inv-1', invoice_number: '2026-001' },
  ...overrides,
})

const event = (type: string, object: Record<string, unknown> = session()) => ({
  id: 'evt_1',
  type,
  data: { object },
})

describe('a session that was paid', () => {
  it('is recorded against the invoice it names, by its payment intent', () => {
    expect(paidSessionOf(event('checkout.session.completed'))).toEqual({
      invoiceId: 'inv-1',
      amountCents: 99_000,
      currency: 'eur',
      external: 'pi_1',
    })
  })

  it('is recorded when the money arrives later, by SEPA or a bank redirect', () => {
    // A debit completes the session on the day it is submitted and pays days
    // later. This is the event that says it did.
    expect(
      paidSessionOf(event('checkout.session.async_payment_succeeded', session({ payment_status: 'paid' }))),
    ).toMatchObject({ invoiceId: 'inv-1', amountCents: 99_000 })
  })

  it('falls back to the session id, then the event id, when there is no payment intent', () => {
    expect(
      paidSessionOf(event('checkout.session.completed', session({ payment_intent: undefined }))),
    ).toMatchObject({ external: 'cs_1' })

    expect(
      paidSessionOf(
        event('checkout.session.completed', session({ payment_intent: undefined, id: undefined })),
      ),
    ).toMatchObject({ external: 'evt_1' })
  })

  it('carries the currency the client was charged in, lower-cased', () => {
    expect(
      paidSessionOf(event('checkout.session.completed', session({ currency: 'USD' }))),
    ).toMatchObject({ currency: 'usd' })
  })
})

describe('a session that was not', () => {
  it('is ignored while a completed session is still waiting for the money', () => {
    /*
     * The bug this pins: `completed` fires the moment a client submits a SEPA
     * mandate, with `payment_status: unpaid`, and the debit can still fail. An
     * invoice marked paid on this event would read Paid with nothing behind
     * it — and no later event was listened for that could have put it right.
     */
    expect(
      paidSessionOf(event('checkout.session.completed', session({ payment_status: 'unpaid' }))),
    ).toBeNull()

    expect(
      paidSessionOf(
        event('checkout.session.completed', session({ payment_status: 'no_payment_required' })),
      ),
    ).toBeNull()
  })

  it('is ignored when the payment failed, whatever the session says', () => {
    expect(paidSessionOf(event('checkout.session.async_payment_failed'))).toBeNull()
    expect(paidSessionOf(event('checkout.session.expired'))).toBeNull()
    expect(paidSessionOf(event('payment_intent.succeeded'))).toBeNull()
  })

  it('is ignored when it does not say which invoice it pays', () => {
    expect(
      paidSessionOf(event('checkout.session.completed', session({ metadata: {} }))),
    ).toBeNull()
  })

  it('is ignored when nothing was charged', () => {
    expect(
      paidSessionOf(event('checkout.session.completed', session({ amount_total: 0 }))),
    ).toBeNull()
  })

  it('is ignored when the message has no session at all', () => {
    expect(paidSessionOf({ id: 'evt_1', type: 'checkout.session.completed' })).toBeNull()
    expect(paidSessionOf({})).toBeNull()
  })
})
