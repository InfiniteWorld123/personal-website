import { createFileRoute } from '@tanstack/react-router'
import { withRequestScope } from '#/backend/db/client'
import {
  applyStripeEvent,
  verifyStripeSignature,
} from '#/backend/modules/invoices/stripe.service'
import { RequestBodyTooLargeError, readTextWithinLimit } from '#/backend/shared/request-body'
import { env } from '#/shared/env'

/**
 * Where Stripe says the money arrived.
 *
 * Public, because Stripe has no session and never will. That makes the
 * signature the only thing standing between a stranger and an invoice marked
 * paid — so this handler is written to refuse first and act last.
 *
 * The order is load-bearing, exactly as it is in `inbound-email.ts`: **read
 * raw, verify, then parse.** The signature covers the bytes as they were
 * received; parsing first and re-encoding changes them, and every genuine
 * message would then be refused.
 *
 * `src/start.ts` exempts this path from the Origin check, for the same reason
 * it exempts the mail forwarder: a machine sends no `Origin` header. That is
 * safe here because nothing below reads a cookie or a session, and nothing is
 * believed that is not signed with `STRIPE_WEBHOOK_SECRET` — which no web page
 * can produce.
 */

/** A webhook is a small JSON object. Anything near this is not one. */
const MAX_BODY_BYTES = 512 * 1024

const json = (body: Record<string, unknown>, status: number) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

export const Route = createFileRoute('/api/stripe-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withRequestScope(async () => {
          /*
           * No secret, no listening.
           *
           * Fails closed rather than open: a handler that accepted unverified
           * messages "until the secret is set" is a handler that marks
           * invoices paid for anyone who finds the URL.
           */
          if (!env.STRIPE_WEBHOOK_SECRET) {
            return json({ message: 'Stripe is not configured here.' }, 503)
          }

          let raw: string

          try {
            raw = await readTextWithinLimit(request, MAX_BODY_BYTES)
          } catch (error) {
            const tooLarge = error instanceof RequestBodyTooLargeError

            return json({ message: 'That body could not be read.' }, tooLarge ? 413 : 400)
          }

          const signed = await verifyStripeSignature(raw, request.headers.get('stripe-signature'))

          if (!signed) {
            // Deliberately says nothing about why. A caller probing for the
            // difference between a bad timestamp and a bad digest is not
            // Stripe.
            return json({ message: 'Not signed.' }, 400)
          }

          let event: unknown

          try {
            event = JSON.parse(raw)
          } catch {
            return json({ message: 'That was not JSON.' }, 400)
          }

          /*
           * Answered 200 whatever happened next.
           *
           * Stripe retries anything that is not 2xx, for days. An event this
           * system does not care about, or one whose invoice has since been
           * deleted, is not a failure worth being asked about again every
           * hour — and a handler that returned 500 on its own bug would turn
           * one mistake into a retry storm.
           */
          try {
            const outcome = await applyStripeEvent(event as never)

            return json({ received: true, outcome }, 200)
          } catch (error) {
            console.error('[stripe] could not apply event', error)

            return json({ received: true, outcome: 'failed' }, 200)
          }
        }),
    },
  },
})
