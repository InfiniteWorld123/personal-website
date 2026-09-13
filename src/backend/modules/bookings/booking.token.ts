/**
 * The token in a cancel or reschedule link.
 *
 * Never the booking's id: an id in a link is a guess away from letting a
 * stranger cancel someone else's call. The token is 32 random bytes, shown
 * exactly once in the email that carries it, and only its SHA-256 digest is
 * stored — a leaked database backup does not hand out cancel links.
 *
 * Built on Web Crypto rather than `node:crypto` so the same code runs on a
 * Worker, on a server, and in tests.
 */

const TOKEN_BYTES = 32

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export const createManageToken = (): string =>
  toBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)))

export const hashManageToken = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * The short code the visitor sees. Crockford-ish alphabet: no O, I, L, U, or
 * the digits they are misread as, because this code gets typed into an email
 * by hand.
 */
const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

export const createBookingReference = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  const code = [...bytes].map((byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]).join('')

  return `BK-${code}`
}
