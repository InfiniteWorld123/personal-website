import { Elysia } from 'elysia'
import { ownerJson } from '../media/media.http'
import { recordInbound, verifyIngress } from './ingress.service'

/**
 * `POST /api/v2/inbound-email` — the Cloudflare inbound Worker, and nobody
 * else.
 *
 * Outside the owner fence because a machine on Cloudflare's network calls it,
 * and inside its own: a missing `INBOX_INGRESS_SECRET` turns it off entirely,
 * and every delivery is refused until its HMAC and timestamp check out. It
 * reads no cookie and returns nothing private — only whether the letter was
 * taken, which the Worker needs to decide whether to bounce.
 *
 * Status codes are chosen for the Worker: 2xx means "taken, or already had
 * it"; 4xx means "this letter will never be accepted, do not retry"; 5xx
 * means "try again / tell the sender".
 */
export const inboundEmailRoutes = new Elysia().post('/inbound-email', async ({ request }) => {
  const payload = await verifyIngress(request)
  const result = await recordInbound(payload)

  return ownerJson({
    data: { outcome: result.outcome },
    message: result.outcome === 'duplicate' ? 'Already recorded' : 'Recorded',
  })
})
