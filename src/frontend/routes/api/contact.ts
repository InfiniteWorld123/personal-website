import { createFileRoute } from '@tanstack/react-router'
import { withRequestScope } from '#/backend/db/client'
import { isAppError } from '#/backend/shared/error'
import {
  inspectContactAttachment,
  MAX_CONTACT_ATTACHMENT_BYTES,
} from '#/backend/shared/contact-attachment'
import { getTrustedClientIp } from '#/backend/shared/client-ip'
import { enforceRateLimit } from '#/backend/shared/rate-limit'
import {
  readFormDataWithinLimit,
  RequestBodyTooLargeError,
} from '#/backend/shared/request-body'
import { assertTurnstile } from '#/backend/shared/turnstile'
import { env } from '#/shared/env'

/**
 * Legacy contact endpoint: forwards the form as an email through Resend.
 * Replaced in B4 by the leads module, which persists the lead first.
 */
const RESEND_API_URL = 'https://api.resend.com/emails'

/**
 * Everything the form asks besides name, email, and the message itself. The
 * order here is the order of the rows in the notification mail.
 */
const QUALIFYING_FIELDS = ['company', 'phone', 'preferred', 'projectType', 'budget', 'timeline'] as const

/** The mail is written in German, so its rows are labelled in German. */
const FIELD_LABELS: Record<(typeof QUALIFYING_FIELDS)[number], string> = {
  company: 'Unternehmen',
  phone: 'Telefon',
  preferred: 'Bevorzugter Kontakt',
  projectType: 'Worum geht es',
  budget: 'Budgetrahmen',
  timeline: 'Zeitrahmen',
}

/** Kept in step with the client: one file, 5 MB, PDF or a common image. */
const MAX_REQUEST_BYTES = 6 * 1024 * 1024

const FIELD_LIMITS = {
  name: 120,
  email: 254,
  message: 5000,
  company: 160,
  phone: 40,
  preferred: 20,
  projectType: 60,
  budget: 60,
  timeline: 60,
} as const

type Attachment = { filename: string; content: string }

type ContactPayload = {
  name: string
  email: string
  message: string
  details: Array<{ label: string; value: string }>
  attachment: File | null
  turnstileToken: string
  website: string
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

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

const parsePayload = async (request: Request): Promise<ContactPayload> => {
  const formData = await readFormDataWithinLimit(request, MAX_REQUEST_BYTES)
  const text = (key: string) => String(formData.get(key) ?? '').trim()
  const file = formData.get('attachment')

  return {
    name: text('name'),
    email: text('email'),
    message: text('message'),
    details: QUALIFYING_FIELDS.map((field) => ({
      label: FIELD_LABELS[field],
      value: text(field),
    })).filter((entry) => entry.value !== ''),
    attachment: isFile(file) && file.size > 0 ? file : null,
    turnstileToken: text('cf-turnstile-response'),
    website: text('website'),
  }
}

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const fieldsAccepted = (payload: ContactPayload): boolean => {
  if (
    payload.name.length > FIELD_LIMITS.name ||
    payload.email.length > FIELD_LIMITS.email ||
    payload.message.length > FIELD_LIMITS.message
  ) {
    return false
  }

  return payload.details.every((entry) => {
    const field = QUALIFYING_FIELDS.find((name) => FIELD_LABELS[name] === entry.label)

    return field ? entry.value.length <= FIELD_LIMITS[field] : false
  })
}

const toAttachment = async (file: File): Promise<Attachment | null> => {
  if (file.size > MAX_CONTACT_ATTACHMENT_BYTES) return null

  const bytes = new Uint8Array(await file.arrayBuffer())
  const basename = safeFilename(file.name).replace(/\.[^.]+$/, '') || 'anhang'
  const inspected = inspectContactAttachment(bytes)

  return inspected
    ? {
        filename: `${basename}.${inspected.extension}`,
        content: Buffer.from(bytes).toString('base64'),
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
            const clientIp = getTrustedClientIp(request)
            if (clientIp) {
              await enforceRateLimit({
                scope: 'contact-ip',
                identity: clientIp,
                limit: 5,
                windowSeconds: 15 * 60,
                message: 'Please wait before sending another message.',
              })
            }

            let payload: ContactPayload
            try {
              payload = await parsePayload(request)
            } catch (error) {
              if (error instanceof RequestBodyTooLargeError) {
                return Response.json({ message: 'The request is too large.' }, { status: 413 })
              }
              throw error
            }

            // A bot gets an ordinary success response and no clue that its hidden
            // field exposed it. Nothing is sent and no personal data is retained.
            if (payload.website) return Response.json({ message: 'Message sent.' })

            if (!payload.name || !payload.email || !payload.message) {
              return Response.json(
                { message: 'Name, email, and message are required.' },
                { status: 400 },
              )
            }

            if (!isValidEmail(payload.email) || !fieldsAccepted(payload)) {
              return Response.json(
                { message: 'Please check the length and format of the submitted fields.' },
                { status: 400 },
              )
            }

            await assertTurnstile({
              token: payload.turnstileToken,
              action: 'contact_submit',
              clientIp,
            })

            await enforceRateLimit({
              scope: 'contact-email',
              identity: payload.email.toLowerCase(),
              limit: 3,
              windowSeconds: 60 * 60,
              message: 'Please wait before sending another message.',
            })

            const attachment = payload.attachment ? await toAttachment(payload.attachment) : undefined
            if (payload.attachment && !attachment) {
              return Response.json(
                { message: 'The attachment must be a real PDF, PNG, JPG, or WEBP file of at most 5 MB.' },
                { status: 400 },
              )
            }

            const apiKey = env.RESEND_API_KEY
            const from = env.EMAIL_FROM
            const to = env.CONTACT_TO_EMAIL

            if (!apiKey || !from || !to) {
              return Response.json({ message: 'Contact email is not configured.' }, { status: 500 })
            }

            const detailRows = payload.details
              .map(
                (entry) =>
                  `<p><strong>${escapeHtml(entry.label)}:</strong> ${escapeHtml(entry.value)}</p>`,
              )
              .join('')

            const attachments = attachment ? [attachment] : []
            const attachmentRow = attachment
              ? `<p><strong>Anhang:</strong> ${escapeHtml(attachment.filename)}</p>`
              : ''

            const response = await fetch(RESEND_API_URL, {
              method: 'POST',
              headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from,
                to: [to],
                reply_to: payload.email,
                subject: `Anfrage von ${payload.name}`,
                html: `
              <h2>Neue Anfrage über die Website</h2>
              <p><strong>Name:</strong> ${escapeHtml(payload.name)}</p>
              <p><strong>E-Mail:</strong> ${escapeHtml(payload.email)}</p>
              ${detailRows}
              ${attachmentRow}
              <p><strong>Nachricht:</strong></p>
              <p>${escapeHtml(payload.message).replaceAll('\n', '<br />')}</p>
                `,
                ...(attachments.length > 0 ? { attachments } : {}),
              }),
            })

            if (!response.ok) {
              return Response.json({ message: 'Could not send message.' }, { status: 502 })
            }

            return Response.json({ message: 'Message sent.' })
          } catch (error) {
            return errorResponse(error)
          }
        }),
    },
  },
})
