import { createFileRoute } from '@tanstack/react-router'
import { withRequestScope } from '#/backend/db/client'
import { readTextWithinLimit, RequestBodyTooLargeError } from '#/backend/shared/request-body'
import {
  inboundIsConfigured,
  tokenFromRecipients,
  verifyInboundSignature,
} from '#/backend/modules/leads/lead.inbound'
import { recordInboundReply } from '#/backend/modules/leads/lead.service'

/**
 * Where a client's answer comes back in.
 *
 * This is a public URL that writes into the owner's inbox, so it is deliberately
 * suspicious: it reads the raw bytes, checks an HMAC signature over exactly
 * those bytes, and only then looks at what they say. An unsigned, badly signed,
 * or unconfigured request is refused without touching the database.
 *
 * It stays a file route, like the contact endpoint, because the signature
 * covers the bytes received and anything that parses the body first would
 * change them.
 *
 * The forwarder — a Cloudflare Email Worker, or a provider's inbound webhook —
 * is expected to POST JSON:
 *
 *   { "to": ["reply+<token>@domain"], "from": "…", "subject": "…",
 *     "text": "…", "messageId": "…" }
 *
 * with `x-inbound-signature: <hex HMAC-SHA256 of the body, keyed with
 * INBOUND_MAIL_SECRET>`.
 */

const MAX_INBOUND_BYTES = 1024 * 1024

type InboundPayload = {
  to?: unknown
  recipient?: unknown
  subject?: unknown
  text?: unknown
  html?: unknown
  messageId?: unknown
  'message-id'?: unknown
}

const asStrings = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string')

  return []
}

const asText = (value: unknown): string => (typeof value === 'string' ? value : '')

/** A letter that only came as HTML still has to read as words in the thread. */
const htmlToText = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export const Route = createFileRoute('/api/inbound-email')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) =>
        withRequestScope(async () => {
          if (!inboundIsConfigured()) {
            return Response.json(
              { message: 'Inbound email is not configured.' },
              { status: 503 },
            )
          }

          let raw: string
          try {
            raw = await readTextWithinLimit(request, MAX_INBOUND_BYTES)
          } catch (error) {
            if (error instanceof RequestBodyTooLargeError) {
              return Response.json({ message: 'That letter is too large.' }, { status: 413 })
            }
            throw error
          }

          const signed = await verifyInboundSignature(
            raw,
            request.headers.get('x-inbound-signature'),
          )

          if (!signed) return Response.json({ message: 'Not signed.' }, { status: 401 })

          let payload: InboundPayload
          try {
            payload = JSON.parse(raw) as InboundPayload
          } catch {
            return Response.json({ message: 'That is not JSON.' }, { status: 400 })
          }

          const token = tokenFromRecipients([
            ...asStrings(payload.to),
            ...asStrings(payload.recipient),
          ])

          // A signed letter addressed to nothing we know is accepted and
          // dropped: the forwarder must not retry it forever.
          if (!token) return Response.json({ message: 'No conversation matched.' }, { status: 202 })

          const text = asText(payload.text) || htmlToText(asText(payload.html))

          if (!text.trim()) return Response.json({ message: 'Empty letter.' }, { status: 202 })

          const { matched } = await recordInboundReply({
            token,
            body: text,
            subject: asText(payload.subject),
            externalId: asText(payload.messageId) || asText(payload['message-id']) || null,
          })

          return Response.json(
            { message: matched ? 'Reply recorded.' : 'No conversation matched.' },
            { status: matched ? 201 : 202 },
          )
        }),
    },
  },
})
