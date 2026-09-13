import { env } from '#/shared/env'

/**
 * Threading a reply back onto the lead it belongs to.
 *
 * A reply is matched by an address, not by the sender: people answer from a
 * second address, forward the thread to a colleague, or write from their
 * phone's alias, and matching on the From header would file all three
 * wrongly — or, worse, let a stranger write into someone else's conversation
 * by spoofing a From header, which costs nothing.
 *
 * So every outbound reply carries `reply+<token>@domain` as its Reply-To, the
 * token is 24 random bytes belonging to that one lead, and the webhook reads
 * it back out of the address the letter was sent to.
 *
 * Built on Web Crypto rather than `node:crypto` so the same code runs on a
 * Worker, on a server, and in tests.
 */

const TOKEN_BYTES = 24

const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

export const createReplyToken = (): string => toHex(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)))

/**
 * `reply@yamanwarda.de` + a token becomes `reply+<token>@yamanwarda.de`.
 * A configured address that already carries a `+part` has it replaced, so
 * setting `INBOUND_MAIL_ADDRESS=reply+test@…` while wiring things up cannot
 * send every lead's replies to one bucket.
 */
export const replyAddressFor = (token: string): string | null => {
  const configured = env.INBOUND_MAIL_ADDRESS?.trim()
  if (!configured || !configured.includes('@')) return null

  const [local, domain] = [configured.slice(0, configured.lastIndexOf('@')), configured.slice(configured.lastIndexOf('@') + 1)]
  const base = local.split('+')[0]

  if (!base || !domain) return null

  return `${base}+${token}@${domain}`
}

/**
 * The token out of any of the addresses a letter was delivered to.
 *
 * The length floor is deliberate: a real token is 48 hex characters, so
 * anything shorter is either a person's own `+tag` or a guess, and neither
 * should be looked up.
 */
export const tokenFromAddress = (address: string): string | null => {
  const match = /\+([a-f0-9]{16,64})@/i.exec(address)

  return match ? match[1].toLowerCase() : null
}

export const tokenFromRecipients = (recipients: string[]): string | null => {
  for (const recipient of recipients) {
    const token = tokenFromAddress(recipient)
    if (token) return token
  }

  return null
}

/** Constant-time: a timing oracle on a signature is a signature. */
const equals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false

  let difference = 0
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }

  return difference === 0
}

/**
 * The webhook is a public URL that writes into the owner's inbox, so it
 * believes nothing it is not shown a signature for: HMAC-SHA256 over the exact
 * bytes received, keyed with a secret only the forwarder knows.
 *
 * Without a configured secret this returns false rather than true — an
 * unconfigured inbound endpoint accepts nothing at all.
 */
export const verifyInboundSignature = async (
  rawBody: string,
  signature: string | null,
): Promise<boolean> => {
  const secret = env.INBOUND_MAIL_SECRET?.trim()
  if (!secret || !signature) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))

  return equals(toHex(new Uint8Array(mac)), signature.trim().replace(/^sha256=/i, '').toLowerCase())
}

export const inboundIsConfigured = (): boolean =>
  Boolean(env.INBOUND_MAIL_ADDRESS?.trim() && env.INBOUND_MAIL_SECRET?.trim())

/**
 * Mail clients quote the letter they answer. Everything from the first quote
 * marker on is the owner's own words coming back, so the thread keeps only
 * what the person actually typed.
 */
const QUOTE_MARKERS = [
  /^>.*$/m,
  /^-{2,}\s*(original message|ursprüngliche nachricht)/im,
  /^on .+ wrote:$/im,
  /^am .+ schrieb .+:$/im,
  /^في .+ كتب .+:$/im,
]

export const stripQuotedReply = (body: string): string => {
  let cut = body.length

  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(body)
    if (match && match.index < cut) cut = match.index
  }

  const kept = body.slice(0, cut).trim()

  // A reply that is nothing but a quote is kept whole rather than stored
  // empty: an empty row in the thread reads as a bug, not as a quiet answer.
  return kept === '' ? body.trim() : kept
}
