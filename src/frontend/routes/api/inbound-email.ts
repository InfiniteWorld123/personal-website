import { createFileRoute } from '@tanstack/react-router'

/**
 * Where a client's answer comes back in — **switched off while the lead system
 * is rebuilt.**
 *
 * The route is kept for two reasons. The forwarder pointed at it stays pointed
 * at a real URL instead of bouncing, and `src/start.ts` exempts exactly this
 * path from the Origin check — an exemption that is easier to keep than to
 * rediscover. A forwarder sends no Origin header, so without that exemption
 * every client reply was refused with `FORBIDDEN_ORIGIN`.
 *
 * What the replacement has to do again, in this order, because the signature
 * covers the bytes as received:
 *
 * 1. Refuse everything when the inbound address or secret is unset.
 *    `INBOUND_MAIL_ADDRESS` must contain a `+` · `INBOUND_MAIL_SECRET`
 * 2. Read the raw body under a 1 MB limit — never parse first, or the bytes
 *    the signature covers are no longer the bytes being checked.
 * 3. Verify an HMAC-SHA256 of that raw body, hex, against the header.
 *    `x-inbound-signature`
 * 4. Only then parse the JSON and pull the conversation token out of the
 *    recipients, accepting-and-dropping what matches nothing so the forwarder
 *    does not retry it forever.
 * 5. Answer a letter delivered twice with 200 "Already recorded" rather than
 *    claiming it wrote a reply it did not write.
 *
 * The expected payload was:
 *
 *   { "to": ["reply+<token>@domain"], "from": "…", "subject": "…",
 *     "text": "…", "messageId": "…" }
 */
export const Route = createFileRoute('/api/inbound-email')({
  server: {
    handlers: {
      POST: async () =>
        Response.json(
          { message: 'Inbound email is not configured.', code: 'INBOUND_DISABLED' },
          { status: 503 },
        ),
    },
  },
})
