import { createFileRoute } from '@tanstack/react-router'
import { withRequestScope } from '#/backend/db/client'
import {
  type IncomingFile,
  recordMail,
  recordReply,
} from '#/backend/modules/inbox/message.service'
import { RequestBodyTooLargeError, readTextWithinLimit } from '#/backend/shared/request-body'
import { env } from '#/shared/env'

/**
 * Where a client's answer comes back in.
 *
 * The chain, end to end: the admin sends with `Reply-To: reply+<token>@`, a
 * Cloudflare Email Routing rule points `reply@` at the `yamanwarda-inbound-
 * email` Worker, and that Worker posts signed JSON here.
 *
 * Two settings must both be true or nothing arrives, and both are outside this
 * repository: **`Enable subaddressing` in Email Routing → Settings**, which is
 * off by default and without which `reply+<token>@` never matches the rule;
 * and `INBOUND_MAIL_SECRET` identical on this Worker and the mail Worker.
 *
 * `src/start.ts` exempts exactly this path from the Origin check — a forwarder
 * sends no Origin header, and without that exemption every client reply was
 * refused with `FORBIDDEN_ORIGIN`.
 *
 * The order below is load-bearing, because the signature covers the bytes as
 * they were received: read raw, verify, *then* parse. Parsing first and
 * re-encoding changes the bytes the signature was computed over.
 */
/**
 * Large enough for a letter with its files.
 *
 * The Worker base64-encodes every attachment into this JSON, which inflates
 * the bytes by a third, and it refuses anything over ten megabytes per file
 * before it gets here. One megabyte — the old ceiling — was a limit on text,
 * and it silently made every attachment impossible.
 */
const MAX_BODY_BYTES = 30 * 1024 * 1024

type InboundPayload = {
  to?: unknown
  from?: unknown
  subject?: unknown
  text?: unknown
  messageId?: unknown
  inReplyTo?: unknown
  fromName?: unknown
  files?: unknown
}

const json = (body: unknown, status: number) => Response.json(body, { status })

/** Constant-time compare, so a wrong signature cannot be found byte by byte. */
const sameSignature = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false

  let differences = 0

  for (let index = 0; index < a.length; index += 1) {
    differences |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }

  return differences === 0
}

const hmacHex = async (secret: string, body: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** `reply+<token>@domain` → `<token>`, for whichever recipient carries one. */
const tokenFrom = (recipients: string[], address: string): string | null => {
  const [localPart, domain] = address.split('@')

  if (!localPart || !domain) return null

  const prefix = `${localPart.split('+')[0]}+`

  for (const recipient of recipients) {
    const cleaned = recipient.trim().toLowerCase().replace(/^.*</, '').replace(/>.*$/, '')

    if (!cleaned.endsWith(`@${domain.toLowerCase()}`)) continue
    if (!cleaned.startsWith(prefix.toLowerCase())) continue

    const token = cleaned.slice(prefix.length, cleaned.indexOf('@'))

    if (token !== '') return token
  }

  return null
}

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const asString = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * The attachments, taken from a body that is signed but not otherwise trusted.
 *
 * Shape-checked here and nowhere else: `keepIncomingFiles` hands these to the
 * same allowlist and size ceiling every uploaded file passes, so a bad type or
 * a huge file is refused there. What this guards against is the payload simply
 * not being the shape the Worker promises.
 */
const asFiles = (value: unknown): IncomingFile[] => {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return []

    const { filename, contentType, content } = item as Record<string, unknown>

    if (typeof filename !== 'string' || typeof content !== 'string' || content === '') return []

    return [
      {
        filename,
        contentType: typeof contentType === 'string' ? contentType : 'application/octet-stream',
        content,
      },
    ]
  })
}

export const Route = createFileRoute('/api/inbound-email')({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withRequestScope(async () => {
          const address = env.INBOUND_MAIL_ADDRESS
          const secret = env.INBOUND_MAIL_SECRET

          // Refused outright rather than half-configured: a handler that
          // accepts letters it cannot thread is worse than one that is off.
          // An address needs only to be an address — `reply@` and `reply+@`
          // are both fine, and `withToken` writes the token into either.
          if (!address || !address.includes('@') || !secret) {
            return json({ message: 'Inbound email is not configured.', code: 'INBOUND_DISABLED' }, 503)
          }

          let raw: string

          try {
            raw = await readTextWithinLimit(request, MAX_BODY_BYTES)
          } catch (error) {
            const tooLarge = error instanceof RequestBodyTooLargeError

            return json(
              { message: tooLarge ? 'That letter is too large.' : 'That body could not be read.' },
              tooLarge ? 413 : 400,
            )
          }

          const provided = request.headers.get('x-inbound-signature') ?? ''
          const expected = await hmacHex(secret, raw)

          if (!sameSignature(provided, expected)) {
            return json({ message: 'Bad signature.', code: 'BAD_SIGNATURE' }, 401)
          }

          let payload: InboundPayload

          try {
            payload = JSON.parse(raw) as InboundPayload
          } catch {
            return json({ message: 'That body is not JSON.' }, 400)
          }

          const token = tokenFrom(asStrings(payload.to), address)

          /*
           * No token means this is not an answer — it is ordinary mail to the
           * owner's own address, which the inbox is now his real mailbox for.
           * It becomes a person with no deal: in the inbox, never on the
           * board. Dropping it, which is what this handler used to do, would
           * lose an invoice or a first-time enquiry.
           */
          if (!token) {
            const filed = await recordMail({
              from: asString(payload.from),
              fromName: asString(payload.fromName),
              to: asStrings(payload.to)[0] ?? address,
              subject: asString(payload.subject),
              text: asString(payload.text) || '(empty message)',
              messageId: asString(payload.messageId) || null,
              inReplyTo: asString(payload.inReplyTo) || null,
              files: asFiles(payload.files),
            })

            return json(
              { message: filed.recorded ? 'Mail recorded' : 'Already recorded, or no sender; dropped.' },
              200,
            )
          }

          const result = await recordReply({
            token,
            from: asString(payload.from),
            to: asStrings(payload.to)[0] ?? address,
            subject: asString(payload.subject),
            text: asString(payload.text) || '(empty message)',
            messageId: asString(payload.messageId) || null,
            inReplyTo: asString(payload.inReplyTo) || null,
            files: asFiles(payload.files),
          })

          // A webhook that fires twice must not write the reply twice, and
          // saying "already recorded" is honest where claiming a new write
          // is not.
          return json(
            {
              message: result.recorded
                ? 'Reply recorded'
                : result.matched
                  ? 'Already recorded'
                  : 'No conversation matched; dropped.',
            },
            200,
          )
        }),
    },
  },
})
