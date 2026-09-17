import { createFileRoute } from '@tanstack/react-router'
import { withRequestScope } from '#/backend/db/client'
import { recordContactMessage } from '#/backend/modules/inbox/contact.service'
import { getTrustedClientIp } from '#/backend/shared/client-ip'
import {
  MAX_CONTACT_ATTACHMENT_BYTES,
  inspectContactAttachment,
} from '#/backend/shared/contact-attachment'
import { isAppError } from '#/backend/shared/error'
import { enforceRateLimit } from '#/backend/shared/rate-limit'
import {
  RequestBodyTooLargeError,
  readFormDataWithinLimit,
} from '#/backend/shared/request-body'
import { assertTurnstile } from '#/backend/shared/turnstile'
import { parseInput } from '#/backend/shared/validate'
import { ContactSchema } from '#/shared/validation/inbox.validation'

/**
 * The contact form's endpoint.
 *
 * A file route rather than part of the Elysia app for one reason: this is the
 * only place on the site that takes an upload from a stranger, and the body
 * has to be read under a byte limit before anything parses it.
 *
 * The order below is load-bearing:
 *
 * 1. Read the multipart body under a ceiling, so a large upload is refused
 *    before it is buffered rather than after.
 * 2. Answer a filled honeypot with an ordinary success and store nothing — a
 *    bot that is told it failed simply tries again differently.
 * 3. Validate the fields, then the bot check, then the file's real bytes.
 * 4. **Store, then notify.** A rejected send used to mean a message that never
 *    existed (D11).
 */
const MAX_REQUEST_BYTES = 6 * 1024 * 1024

const text = (form: FormData, key: string): string => {
  const value = form.get(key)

  return typeof value === 'string' ? value : ''
}

const failure = (message: string, code: string, status: number) =>
  Response.json({ success: false, message, code }, { status })

export const Route = createFileRoute('/api/contact')({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withRequestScope(async () => {
          let form: FormData

          try {
            form = await readFormDataWithinLimit(request, MAX_REQUEST_BYTES)
          } catch (error) {
            if (error instanceof RequestBodyTooLargeError) {
              return failure('That message is too large to send.', 'PAYLOAD_TOO_LARGE', 413)
            }

            return failure('That message could not be read.', 'BAD_REQUEST', 400)
          }

          // Never revealed as a rejection: an ordinary success, nothing stored.
          if (text(form, 'website').trim() !== '') {
            return Response.json({ success: true, message: 'Thank you' }, { status: 202 })
          }

          const clientIp = getTrustedClientIp(request)

          try {
            const input = parseInput(ContactSchema, {
              name: text(form, 'name'),
              email: text(form, 'email'),
              company: text(form, 'company'),
              phone: text(form, 'phone'),
              projectType: text(form, 'projectType'),
              budget: text(form, 'budget'),
              timeline: text(form, 'timeline'),
              message: text(form, 'message'),
              language: text(form, 'language') || 'de',
            })

            /*
             * Limited by address rather than by IP, the way bookings are:
             * `getTrustedClientIp` only returns anything inside a Worker, so
             * an IP rule is silently absent everywhere else. The IP is used as
             * a second rule when it *is* there.
             */
            await enforceRateLimit({
              scope: 'contact-email',
              identity: input.email,
              limit: 5,
              windowSeconds: 24 * 60 * 60,
              message: 'That is a lot of messages for one day. Give me a chance to answer.',
            })

            if (clientIp) {
              await enforceRateLimit({
                scope: 'contact-ip',
                identity: clientIp,
                limit: 20,
                windowSeconds: 60 * 60,
              })
            }

            await assertTurnstile({
              token: text(form, 'cf-turnstile-response'),
              action: 'contact_submit',
              clientIp,
            })

            const file = form.get('attachment')
            let attachment: { name: string; bytes: number } | null = null

            if (file instanceof File && file.size > 0) {
              if (file.size > MAX_CONTACT_ATTACHMENT_BYTES) {
                return failure('That attachment is larger than 5 MB.', 'ATTACHMENT_TOO_LARGE', 413)
              }

              // The declared type is the sender's claim; the bytes are the fact.
              const probed = inspectContactAttachment(new Uint8Array(await file.arrayBuffer()))

              if (!probed) {
                return failure('That kind of file cannot be sent here.', 'ATTACHMENT_REJECTED', 415)
              }

              attachment = { name: file.name, bytes: file.size }
            }

            const { notified } = await recordContactMessage(input, attachment)

            return Response.json(
              {
                success: true,
                message: 'Thank you — your message arrived.',
                // Said plainly rather than hidden: the message is safe either
                // way, and a silent failure here is what made the old panel
                // untrustworthy.
                data: { stored: true, notified },
              },
              { status: 201 },
            )
          } catch (error) {
            if (isAppError(error)) {
              return failure(error.message, error.code, error.status)
            }

            console.error('[contact] failed', error)

            return failure('That message could not be sent.', 'INTERNAL_ERROR', 500)
          }
        }),
    },
  },
})
