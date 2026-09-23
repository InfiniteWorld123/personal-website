import { Elysia } from 'elysia'
import { ownerJson } from '../media/media.http'
import { handleStripeEvent, readVerifiedEvent } from './stripe.webhook'

/**
 * `POST /api/v2/stripe/webhook` — Stripe, and nobody else.
 *
 * Outside the owner fence because Stripe's servers call it, and inside its
 * own: without `STRIPE_WEBHOOK_SECRET` it takes nothing, and every delivery is
 * refused until its signature and timestamp check out. It reads no cookie and
 * answers nothing private — only whether the event was taken.
 *
 * 2xx means "recorded, or already had it"; a 4xx tells Stripe the delivery
 * will never be accepted; a 5xx (a failed effect, rolled back) makes Stripe
 * retry later.
 */
export const stripeWebhookRoutes = new Elysia().post('/stripe/webhook', async ({ request }) => {
  const event = await readVerifiedEvent(request)
  const result = await handleStripeEvent(event)

  return ownerJson({
    data: { received: true, outcome: result.outcome },
    message: result.duplicate ? 'Already recorded' : 'Recorded',
  })
})
