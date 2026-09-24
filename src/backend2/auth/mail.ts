import { internalError } from '../http/error'
import { isProductionEnvironment } from '../security/runtime-mode'

/**
 * The V2 mail adapter.
 *
 * `docs/v2/auth.md`: a V2-owned mail adapter with the configured Resend
 * provider and its own templates. This file talks to Resend over `fetch`,
 * which works unchanged on a Worker.
 *
 * Off production, delivery is faked. The fake writes a line to the server
 * console and nothing else: a reset link must never appear in an HTTP
 * response, because the response is the one place an attacker can read.
 */

export type MailMessage = {
  to: string
  subject: string
  text: string
}

export type SentMail = MailMessage & { sentAt: Date }

type Env = Record<string, string | undefined>

const readSender = (environment: Env): string | undefined =>
  environment.EMAIL_FROM?.trim() || undefined

const readApiKey = (environment: Env): string | undefined =>
  environment.RESEND_API_KEY?.trim() || undefined

/** True when a real message can actually leave the building. */
export const isMailConfigured = (environment: Env = process.env): boolean =>
  Boolean(readSender(environment) && readApiKey(environment))

/**
 * Whether the features that depend on email may run at all.
 *
 * Checked *before* an address is looked up, and the answer is the same for
 * everyone. Refusing only for a registered address would turn a broken mail
 * configuration into an account-enumeration oracle.
 */
export const assertMailAvailable = (environment: Env = process.env): void => {
  if (!isProductionEnvironment(environment)) return
  if (isMailConfigured(environment)) return

  throw internalError('Email delivery is not configured. Password reset is unavailable')
}

/**
 * What a test reads instead of the network. Absent in every other run, so
 * there is no way to turn real delivery into an inspectable log by accident.
 */
let outbox: SentMail[] | undefined

export const collectMailForTest = (): SentMail[] => (outbox = [])
export const stopCollectingMailForTest = (): void => {
  outbox = undefined
}

export const sendMail = async (
  message: MailMessage,
  environment: Env = process.env,
): Promise<void> => {
  if (outbox) {
    outbox.push({ ...message, sentAt: new Date() })

    return
  }

  const sender = readSender(environment)
  const apiKey = readApiKey(environment)

  if (!sender || !apiKey) {
    /*
     * Development. The subject and the recipient go to the console so the
     * flow can be followed; the body — which holds the link — does not, for
     * the same reason it never goes into a response.
     */
    console.info(`[auth v2] would email "${message.subject}" to ${message.to}`)

    return
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: sender,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  })

  if (!response.ok) {
    // The provider's body can quote the recipient back. Only the status goes
    // into the log.
    console.error('Backend2 auth mail failed', { status: response.status })

    throw internalError('That email could not be sent')
  }
}

/* --------------------------------------------------------------- templates */

const signature = 'This is an automated message from the private dashboard.'

export const passwordResetMail = (options: { to: string; link: string }): MailMessage => ({
  to: options.to,
  subject: 'Reset your dashboard password',
  text: [
    'Someone asked to reset the password for your dashboard account.',
    '',
    `Open this link within 30 minutes to choose a new one:`,
    options.link,
    '',
    'The link works once. Your authenticator app and recovery codes are not',
    'affected: you will still be asked for a second factor when you sign in.',
    '',
    'If this was not you, you can ignore this message — nothing has changed.',
    '',
    signature,
  ].join('\n'),
})

export const emailChangeMail = (options: { to: string; link: string }): MailMessage => ({
  to: options.to,
  subject: 'Confirm your new dashboard email address',
  text: [
    'You asked to use this address for your dashboard account.',
    '',
    'Open this link within 24 hours to confirm it:',
    options.link,
    '',
    'Until then the old address keeps working. The link works once.',
    '',
    signature,
  ].join('\n'),
})

/**
 * Sent to the address that is being replaced, not the new one. The old
 * mailbox is where the owner would notice a change they did not make.
 */
export const emailChangeNoticeMail = (options: {
  to: string
  newEmail: string
}): MailMessage => ({
  to: options.to,
  subject: 'Your dashboard email address is being changed',
  text: [
    `A request was made to change this account's address to ${options.newEmail}.`,
    '',
    'This address stays active until the new one is confirmed.',
    '',
    'If this was not you, sign in and change your password immediately: whoever',
    'made the request had a signed-in session.',
    '',
    signature,
  ].join('\n'),
})

export const securityNoticeMail = (options: {
  to: string
  what: string
}): MailMessage => ({
  to: options.to,
  subject: 'A security setting on your dashboard changed',
  text: [
    `${options.what}`,
    '',
    'All existing sessions were signed out where that applies.',
    '',
    'If this was not you, sign in and review your passkeys, authenticator and',
    'active sessions under Settings → Security.',
    '',
    signature,
  ].join('\n'),
})
