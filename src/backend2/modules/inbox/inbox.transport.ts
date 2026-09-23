import { isProductionEnvironment } from '../../security/runtime-mode'

/**
 * How an email leaves: Resend in a live deployment, a fake everywhere else.
 *
 * The fake is the default, and live sending is an explicit opt-in
 * (`INBOX_SEND_MODE=live`). That is deliberate: the development `.env`
 * already holds a working Resend key for the legacy site, so "send if a key
 * exists" would have made the first local test of this module a real email
 * to a real address. `docs/v2/inbox.md`: "Use fake provider calls and safe
 * fixtures locally; do not send real mail."
 *
 * The fake says it is a fake. A message it takes is recorded with provider
 * `fake`, and the Dashboard says so — it never claims a delivery that did not
 * happen.
 */

type Env = Record<string, string | undefined>

export type OutgoingEmail = {
  from: string
  to: string
  replyTo: string
  subject: string
  html: string
  text: string
  headers: Record<string, string>
  attachments: Array<{ filename: string; contentType: string; content: Uint8Array }>
  /**
   * The same key on every attempt for the same message. Resend answers a
   * repeat within 24 hours with the first result instead of sending again, so
   * a retry after a timeout cannot deliver the email twice.
   */
  idempotencyKey: string
}

export type TransportResult =
  | { ok: true; provider: 'resend' | 'fake'; providerMessageId: string }
  | { ok: false; provider: 'resend' | 'fake' | null; reason: string }

export type InboxTransport = {
  mode: 'live' | 'fake'
  send(email: OutgoingEmail): Promise<TransportResult>
}

let override: InboxTransport | undefined

export const useInboxTransportForTest = (transport: InboxTransport | undefined): void => {
  override = transport
}

export const inboxSendMode = (environment: Env = process.env): 'live' | 'fake' =>
  environment.INBOX_SEND_MODE?.trim() === 'live' ? 'live' : 'fake'

/** Where outgoing mail says it comes from. `docs/v2/inbox.md`: info@. */
export const inboxFromAddress = (environment: Env = process.env): string =>
  environment.INBOX_FROM_ADDRESS?.trim() || 'info@yamanwarda.de'

export const inboxFromName = (environment: Env = process.env): string =>
  environment.INBOX_FROM_NAME?.trim() || 'Yaman Warda'

/**
 * The base of the controlled reply address. `reply@yamanwarda.de` becomes
 * `reply+<token>@yamanwarda.de`. Email Routing needs subaddressing enabled
 * for that to arrive — a check for cutover, not for this module.
 */
export const inboxReplyAddress = (environment: Env = process.env): string =>
  environment.INBOX_REPLY_ADDRESS?.trim() || 'reply@yamanwarda.de'

export const withReplyToken = (address: string, token: string): string => {
  const [local = 'reply', domain = 'yamanwarda.de'] = address.split('@')

  return `${local.split('+')[0]}+${token}@${domain}`
}

/** The domain our generated Message-IDs carry. */
export const messageIdDomain = (environment: Env = process.env): string =>
  inboxFromAddress(environment).split('@')[1] ?? 'yamanwarda.de'

const SEND_TIMEOUT_MS = 20_000

const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }

  return btoa(binary)
}

const fakeTransport: InboxTransport = {
  mode: 'fake',
  send: async (email) => {
    // The subject and body never reach the console: they are private.
    console.info(
      `[inbox v2] fake send: 1 email, ${email.attachments.length} attachment(s). Nothing left this computer.`,
    )

    return { ok: true, provider: 'fake', providerMessageId: `fake-${email.idempotencyKey}` }
  },
}

const resendTransport = (apiKey: string): InboxTransport => ({
  mode: 'live',
  send: async (email) => {
    let response: Response

    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': email.idempotencyKey,
        },
        body: JSON.stringify({
          from: email.from,
          to: [email.to],
          reply_to: email.replyTo,
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers: email.headers,
          attachments: email.attachments.map((file) => ({
            filename: file.filename,
            content: toBase64(file.content),
            content_type: file.contentType,
          })),
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      })
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError'

      return {
        ok: false,
        provider: 'resend',
        reason: timedOut
          ? 'The email service did not answer in time. It may or may not have been sent — retrying is safe and will not send it twice.'
          : 'The email service could not be reached. Nothing was confirmed as sent.',
      }
    }

    if (!response.ok) {
      // The provider's body can quote the recipient back. Only the status is logged.
      console.error('Backend2 inbox send failed', { status: response.status })

      return {
        ok: false,
        provider: 'resend',
        reason:
          response.status === 429
            ? 'The email service is busy. Try again in a minute.'
            : response.status >= 500
              ? 'The email service had a problem. Try again.'
              : 'The email service refused this email. Check the address and attachments.',
      }
    }

    const body = (await response.json().catch(() => ({}))) as { id?: unknown }

    return {
      ok: true,
      provider: 'resend',
      providerMessageId: typeof body.id === 'string' ? body.id : '',
    }
  },
})

/**
 * The transport for this environment.
 *
 * Production without the opt-in, or without a key, gets one that fails
 * honestly: the message is kept as "failed" with the text intact, rather
 * than a fake that would claim it went.
 */
export const resolveInboxTransport = (environment: Env = process.env): InboxTransport => {
  if (override) return override

  const apiKey = environment.RESEND_API_KEY?.trim()

  if (inboxSendMode(environment) === 'live' && apiKey) return resendTransport(apiKey)

  if (isProductionEnvironment(environment)) {
    return {
      mode: 'live',
      send: async () => ({
        ok: false,
        provider: null,
        reason: 'Sending email is not configured on this server. Nothing was sent.',
      }),
    }
  }

  return fakeTransport
}
