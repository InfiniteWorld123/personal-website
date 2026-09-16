import { createFileRoute } from '@tanstack/react-router'

/**
 * The contact form's endpoint — **switched off while the lead system is
 * rebuilt.**
 *
 * The route is kept, rather than deleted, so the public form keeps a real URL
 * to post to and the new system has one place to reconnect. Until then every
 * submission is refused with 503 and nothing is written or sent.
 *
 * What this handler did, and what the replacement has to do again:
 *
 * 1. Read the multipart body under a byte limit — this is the only endpoint on
 *    the site that takes a file, which is why it stays a file route rather than
 *    moving into the Elysia app.
 *    `readFormDataWithinLimit` · `MAX_REQUEST_BYTES` was 6 MB
 * 2. Answer a filled honeypot field with an ordinary success and store nothing.
 *    The field is named `website`.
 * 3. Validate the fields, then verify the Turnstile token.
 *    `assertTurnstile` with action `contact_submit`
 * 4. Sniff the attachment's real bytes and refuse anything that is not a PDF,
 *    PNG, JPG or WEBP of at most 5 MB.
 *    `inspectContactAttachment` · `MAX_CONTACT_ATTACHMENT_BYTES`
 * 5. Store the message first and let the mail be only a notification (D11) —
 *    a rejected send used to be a message that never existed.
 *
 * Every helper above still exists under `backend/shared`; only the leads module
 * that consumed them is gone.
 */
export const Route = createFileRoute('/api/contact')({
  server: {
    handlers: {
      POST: async () =>
        Response.json(
          { message: 'The contact form is temporarily unavailable.', code: 'CONTACT_DISABLED' },
          { status: 503 },
        ),
    },
  },
})
