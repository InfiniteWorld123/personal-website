import { getDb, withTransaction } from '../../db/client'
import { badRequest, invalidSignature, stripeUnavailable } from '../../http/error'
import { readLimited } from '../../http/body'
import { recordStripePayment } from './invoice.payments'
import { chargeFailed, chargeSucceeded } from './subscription.billing'
import { resolveStripeGateway } from './stripe.gateway'

/**
 * `POST /api/v2/stripe/webhook`.
 *
 * Nothing in the body is believed until the `Stripe-Signature` header proves
 * it: an HMAC-SHA256, keyed with `STRIPE_WEBHOOK_SECRET`, over
 * `<timestamp>.<exact raw body>`, compared in constant time, and refused when
 * the timestamp is more than five minutes away (Stripe's own tolerance).
 * Without the secret the route takes nothing at all.
 *
 * Each event id is recorded once, in the same transaction as its effect. A
 * redelivered event finds its id and changes nothing; an effect that fails
 * rolls the id back too, so Stripe's retry gets a second chance.
 */

export const WEBHOOK_TOLERANCE_SECONDS = 300
const MAX_BODY = 512 * 1024

const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const hmacHex = async (secret: string, value: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))
}

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false

  let difference = 0

  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index)

  return difference === 0
}

/** Signs like Stripe does. For tests and the local webhook forwarder. */
export const signStripePayload = async (input: {
  secret: string
  payload: string
  timestamp: number
}): Promise<string> => `t=${input.timestamp},v1=${await hmacHex(input.secret, `${input.timestamp}.${input.payload}`)}`

export const verifyStripeSignature = async (input: {
  secret: string
  payload: string
  header: string | null
  nowSeconds: number
}): Promise<boolean> => {
  if (!input.header) return false

  const parts = input.header.split(',').map((part) => part.trim().split('='))
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1])
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value ?? '')

  if (!Number.isFinite(timestamp) || signatures.length === 0) return false
  if (Math.abs(input.nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false

  const expected = await hmacHex(input.secret, `${timestamp}.${input.payload}`)

  return signatures.some((signature) => constantTimeEqual(signature, expected))
}

type StripeEvent = {
  id: string
  type: string
  livemode: boolean
  data: { object: Record<string, any> }
}

/** Reads and verifies one delivery. Throws before anything is trusted. */
export const readVerifiedEvent = async (
  request: Request,
  environment: Record<string, string | undefined> = process.env,
): Promise<StripeEvent> => {
  const secret = environment.STRIPE_WEBHOOK_SECRET?.trim()

  if (!secret) throw stripeUnavailable('Stripe webhooks are not configured here')

  const payload = new TextDecoder().decode(await readLimited(request, MAX_BODY))
  const valid = await verifyStripeSignature({
    secret,
    payload,
    header: request.headers.get('stripe-signature'),
    nowSeconds: Math.floor(Date.now() / 1000),
  })

  if (!valid) throw invalidSignature()

  let event: StripeEvent

  try {
    event = JSON.parse(payload) as StripeEvent
  } catch {
    throw badRequest('That event is not JSON')
  }

  if (typeof event?.id !== 'string' || typeof event.type !== 'string' || !event.data?.object) {
    throw badRequest('That is not a Stripe event')
  }

  return event
}

/** What one verified event does. Runs inside the recording transaction. */
const apply = async (event: StripeEvent): Promise<string> => {
  const object = event.data.object
  const metadata = (object.metadata ?? {}) as Record<string, string>

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      if (object.mode === 'setup' && metadata.v2_subscription_id) {
        return saveCard(event, metadata.v2_subscription_id, String(object.setup_intent ?? ''))
      }

      if (object.mode !== 'payment' || object.payment_status !== 'paid' || !metadata.v2_invoice_id) {
        return 'ignored'
      }

      return recordStripePayment({
        invoiceId: metadata.v2_invoice_id,
        amountMinor: Number(object.amount_total),
        currency: String(object.currency ?? ''),
        paymentIntentId: String(object.payment_intent ?? object.id),
        eventId: event.id,
        livemode: event.livemode,
      })
    }

    case 'payment_intent.succeeded': {
      if (!metadata.v2_charge_id) return 'ignored'

      return chargeSucceeded({
        chargeId: metadata.v2_charge_id,
        paymentIntentId: String(object.id),
        amountMinor: Number(object.amount_received ?? object.amount),
        currency: String(object.currency ?? ''),
        eventId: event.id,
        livemode: event.livemode,
      })
    }

    case 'payment_intent.payment_failed': {
      if (!metadata.v2_charge_id) return 'ignored'

      return chargeFailed({
        chargeId: metadata.v2_charge_id,
        paymentIntentId: String(object.id),
        message: String(object.last_payment_error?.message ?? 'The card payment failed').slice(0, 300),
        livemode: event.livemode,
      })
    }

    default:
      return 'ignored'
  }
}

/**
 * The card a customer saved through the setup link. Its details are read
 * back from Stripe rather than taken from the event, and only for a
 * subscription whose mode matches the event's.
 */
const saveCard = async (event: StripeEvent, subscriptionId: string, setupIntentId: string): Promise<string> => {
  const { rows } = await getDb().query<{ id: string; mode: 'test' | 'live' }>(
    'SELECT id, mode FROM v2_subscriptions WHERE id = $1 FOR UPDATE',
    [subscriptionId],
  )
  const subscription = rows[0]

  if (!subscription || (subscription.mode === 'live') !== event.livemode || !setupIntentId) return 'ignored'

  const card = await resolveStripeGateway(subscription.mode).retrieveSetupIntent(setupIntentId)

  if (!card.paymentMethodId) return 'ignored'

  await getDb().query(
    `UPDATE v2_subscriptions
        SET stripe_payment_method_id = $2, card_status = 'valid', card_label = $3,
            card_consent_at = COALESCE(card_consent_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [subscription.id, card.paymentMethodId, card.cardLabel],
  )
  // A charge that was waiting for a card is due again.
  await getDb().query(
    `UPDATE v2_subscription_charges SET status = 'scheduled'
      WHERE subscription_id = $1 AND status = 'waiting_for_card'`,
    [subscription.id],
  )
  await getDb().query(
    `INSERT INTO v2_invoice_events (subscription_id, kind, detail) VALUES ($1, 'card_saved', $2)`,
    [subscription.id, JSON.stringify({ card: card.cardLabel })],
  )

  return 'card_saved'
}

export const handleStripeEvent = async (
  event: StripeEvent,
): Promise<{ outcome: string; duplicate: boolean }> =>
  withTransaction(async () => {
    const { rows } = await getDb().query<{ id: string }>(
      `INSERT INTO v2_stripe_events (id, type, livemode) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [event.id, event.type, event.livemode],
    )

    if (rows.length === 0) return { outcome: 'duplicate', duplicate: true }

    const outcome = await apply(event)

    await getDb().query('UPDATE v2_stripe_events SET outcome = $2 WHERE id = $1', [event.id, outcome])

    return { outcome, duplicate: false }
  })
