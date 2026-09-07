import { createFileRoute } from '@tanstack/react-router'
import { env } from '#/shared/env'

/**
 * Legacy contact endpoint: forwards the form as an email through Resend.
 * Replaced in B4 by the leads module, which persists the lead first.
 */
const RESEND_API_URL = 'https://api.resend.com/emails'

const QUALIFYING_FIELDS = ['company', 'projectType', 'budget', 'timeline'] as const

type ContactPayload = {
  name: string
  email: string
  message: string
  details: Array<{ field: string; value: string }>
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const parsePayload = async (request: Request): Promise<ContactPayload> => {
  const formData = await request.formData()
  const text = (key: string) => String(formData.get(key) ?? '').trim()

  return {
    name: text('name'),
    email: text('email'),
    message: text('message'),
    details: QUALIFYING_FIELDS.map((field) => ({ field, value: text(field) })).filter(
      (entry) => entry.value !== '',
    ),
  }
}

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

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

        const apiKey = env.RESEND_API_KEY
        const from = env.EMAIL_FROM
        const to = env.CONTACT_TO_EMAIL

        if (!apiKey || !from || !to) {
          return Response.json({ message: 'Contact email is not configured.' }, { status: 500 })
        }

        const detailRows = payload.details
          .map((entry) => `<p><strong>${escapeHtml(entry.field)}:</strong> ${escapeHtml(entry.value)}</p>`)
          .join('')

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
              <p><strong>Nachricht:</strong></p>
              <p>${escapeHtml(payload.message).replaceAll('\n', '<br />')}</p>
            `,
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
