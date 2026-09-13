import { createFileRoute } from '@tanstack/react-router'
import { withRequestScope } from '#/backend/db/client'
import { isAppError } from '#/backend/shared/error'
import {
  inspectContactAttachment,
  MAX_CONTACT_ATTACHMENT_BYTES,
} from '#/backend/shared/contact-attachment'
import { getTrustedClientIp } from '#/backend/shared/client-ip'
import {
  readFormDataWithinLimit,
  RequestBodyTooLargeError,
} from '#/backend/shared/request-body'
import { assertTurnstile } from '#/backend/shared/turnstile'
import { parseInput } from '#/backend/shared/validate'
import { submitContactMessage, type ContactAttachment } from '#/backend/modules/leads/lead.service'
import { ContactSubmitSchema } from '#/shared/validation/lead.validation'

/**
 * The contact form's endpoint.
 *
 * It stays a file route rather than moving into the Elysia app with the rest
 * of the leads module for one reason: this is the only endpoint on the site
 * that takes a file, and multipart bodies are read here straight off the
 * request, under a byte limit, before anything can buffer them.
 *
 * What changed in B4 is where the message goes. It used to be handed to Resend
 * and forgotten — a rejected send was a message that never existed. Now it is
 * written to the database first, and the mail is only a notification (D11).
 */

/** Kept in step with the client: one file, 5 MB, PDF or a common image. */
const MAX_REQUEST_BYTES = 6 * 1024 * 1024

/**
 * A browser sends the file's own name; a script can send anything. Strip the
 * directory parts and keep the result short, so the name can never read as a
 * path once it reaches a mail client.
 */
const safeFilename = (name: string) =>
  (name.split(/[\\/]/).pop() ?? 'anhang')
    .replace(/[^\w.\- ]+/g, '_')
    .slice(-120) || 'anhang'

const isFile = (value: FormDataEntryValue | null): value is File =>
  typeof value === 'object' && value !== null && 'arrayBuffer' in value

/**
 * The bytes are base64'd for Resend and never stored: the database keeps the
 * name and the size, and the file itself travels on in the notification mail.
 * Uploading it to the bucket belongs to B6.
 */
const toAttachment = async (file: File): Promise<ContactAttachment | null> => {
  if (file.size > MAX_CONTACT_ATTACHMENT_BYTES) return null

  const bytes = new Uint8Array(await file.arrayBuffer())
  const basename = safeFilename(file.name).replace(/\.[^.]+$/, '') || 'anhang'
  const inspected = inspectContactAttachment(bytes)

  return inspected
    ? {
        filename: `${basename}.${inspected.extension}`,
        content: Buffer.from(bytes).toString('base64'),
        bytes: file.size,
      }
    : null
}

const errorResponse = (error: unknown): Response => {
  if (isAppError(error)) {
    const headers = new Headers()
    const retryAfter =
      typeof error.details === 'object' && error.details && 'retryAfter' in error.details
        ? Number(error.details.retryAfter)
        : Number.NaN

    if (error.code === 'RATE_LIMITED' && Number.isFinite(retryAfter)) {
      headers.set('Retry-After', String(Math.ceil(retryAfter)))
    }

    return Response.json({ message: error.message, code: error.code }, { status: error.status, headers })
  }

  console.error('Contact request failed', {
    name: error instanceof Error ? error.name : 'UnknownError',
  })

  return Response.json({ message: 'Could not send message.' }, { status: 500 })
}

export const Route = createFileRoute('/api/contact')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) =>
        withRequestScope(async () => {
          try {
            let formData: FormData
            try {
              formData = await readFormDataWithinLimit(request, MAX_REQUEST_BYTES)
            } catch (error) {
              if (error instanceof RequestBodyTooLargeError) {
                return Response.json({ message: 'The request is too large.' }, { status: 413 })
              }
              throw error
            }

            const text = (key: string) => String(formData.get(key) ?? '').trim()

            // A bot gets an ordinary success response and no clue that its
            // hidden field exposed it. Nothing is stored and nothing is sent.
            if (text('website')) return Response.json({ message: 'Message sent.' })

            const input = parseInput(ContactSubmitSchema, {
              name: text('name'),
              email: text('email'),
              message: text('message'),
              company: text('company'),
              phone: text('phone'),
              projectType: text('projectType'),
              budget: text('budget'),
              timeline: text('timeline'),
              language: text('language') || undefined,
            })

            const clientIp = getTrustedClientIp(request)

            await assertTurnstile({
              token: text('cf-turnstile-response'),
              action: 'contact_submit',
              clientIp,
            })

            const file = formData.get('attachment')
            const sent = isFile(file) && file.size > 0 ? file : null
            const attachment = sent ? await toAttachment(sent) : null

            if (sent && !attachment) {
              return Response.json(
                { message: 'The attachment must be a real PDF, PNG, JPG, or WEBP file of at most 5 MB.' },
                { status: 400 },
              )
            }

            await submitContactMessage(input, { clientIp, attachment })

            return Response.json({ message: 'Message sent.' }, { status: 201 })
          } catch (error) {
            return errorResponse(error)
          }
        }),
    },
  },
})
