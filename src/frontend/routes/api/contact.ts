import { createFileRoute } from '@tanstack/react-router'
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
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
const ATTACHMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
const ATTACHMENT_EXTENSIONS = /\.(pdf|png|jpe?g|webp)$/i

type Attachment = { filename: string; content: string }

type ContactPayload = {
  name: string
  email: string
  message: string
  details: Array<{ label: string; value: string }>
  attachment: File | null
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
  const formData = await request.formData()
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
  }
}

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const attachmentAccepted = (file: File) => {
  if (file.size > MAX_ATTACHMENT_BYTES) return false
  if (file.type) return ATTACHMENT_TYPES.includes(file.type)
  return ATTACHMENT_EXTENSIONS.test(file.name)
}

const toAttachment = async (file: File): Promise<Attachment> => ({
  filename: safeFilename(file.name),
  content: Buffer.from(await file.arrayBuffer()).toString('base64'),
})

export const Route = createFileRoute('/api/contact')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const payload = await parsePayload(request)

        if (!payload.name || !payload.email || !payload.message) {
          return Response.json({ message: 'Name, email, and message are required.' }, { status: 400 })
        }

        if (!isValidEmail(payload.email)) {
          return Response.json({ message: 'Please provide a valid email address.' }, { status: 400 })
        }

        if (payload.attachment && !attachmentAccepted(payload.attachment)) {
          return Response.json(
            { message: 'The attachment must be a PDF, PNG, JPG, or WEBP file of at most 5 MB.' },
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
          .map((entry) => `<p><strong>${escapeHtml(entry.label)}:</strong> ${escapeHtml(entry.value)}</p>`)
          .join('')

        const attachments = payload.attachment ? [await toAttachment(payload.attachment)] : []
        const attachmentRow = payload.attachment
          ? `<p><strong>Anhang:</strong> ${escapeHtml(safeFilename(payload.attachment.name))}</p>`
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
      },
    },
  },
})
