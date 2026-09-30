/**
 * The one rule for an email address, shared by every place that takes one:
 * mail arriving, the Inbox composer and its Send, and the public Contact form
 * in the browser and on the server. An address is never accepted in one of
 * those places and refused in another — a reply can always go to an address
 * the Inbox let in.
 *
 * Permissive where real people's addresses are unusual: an apostrophe
 * (`sean.o'neill@example.ie`), a double hyphen or punycode in the domain
 * (`anna@my--agency.de`, `info@xn--…`), a domain with umlauts
 * (`info@bäckerei-müller.de`, sent in its `xn--` form). Strict only where it
 * matters: exactly one address — no display name, no list, no spaces, no
 * quotes — and a real domain with a dot.
 *
 * Pure TypeScript with no validation library, so the public page can carry it.
 */

export const EMAIL_MAX_LENGTH = 254

/**
 * Before the `@`: anything printable except what would make it a display
 * name, a list, a quoted string or a second address. Letters outside A–Z are
 * allowed here, because mail from such an address does arrive.
 */
// eslint-disable-next-line no-control-regex
const LOCAL_PART = /^[^\s@<>()[\]\\,;:"\u0000-\u001f\u007f]{1,64}$/u

/** Letters A–Z, digits and the RFC 5322 punctuation — what every mail service delivers to. */
const ASCII_LOCAL_PART = /^[\x21-\x7e]+$/u

const LABEL = /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/u

/**
 * The domain as mail servers need it: lower case, with a Unicode name in its
 * punycode (`xn--`) form. Null when it is not a domain at all.
 */
export const emailDomainToAscii = (domain: string): string | null => {
  // Characters a URL would read as a path, port, user or query — or strip as
  // control characters — must not be quietly dropped by the conversion below.
  // eslint-disable-next-line no-control-regex
  if (domain === '' || /[\s/\\?#:@%[\]<>,;"()\u0000-\u001f\u007f]/u.test(domain)) return null

  let ascii: string

  if (/^[\x21-\x7e]+$/u.test(domain)) {
    ascii = domain.toLowerCase()
  } else {
    try {
      // The platform's own IDNA conversion — the same in the browser, Bun and Node.
      ascii = new URL(`http://${domain}`).hostname
    } catch {
      return null
    }
  }

  const labels = ascii.split('.')

  if (ascii.length > 253 || labels.length < 2 || !labels.every((label) => LABEL.test(label))) return null

  // A top-level domain is never only digits: `1.2.3.4` is not a mail domain.
  if (/^\d+$/u.test(labels.at(-1)!)) return null

  return ascii
}

const split = (address: string): { local: string; domain: string } | null => {
  const at = address.indexOf('@')

  if (at <= 0 || at !== address.lastIndexOf('@')) return null

  return { local: address.slice(0, at), domain: address.slice(at + 1) }
}

/** Whether this is one email address. Mail from it is accepted; a reply to it is attempted. */
export const isEmailAddress = (address: string): boolean => {
  if (address.length > EMAIL_MAX_LENGTH) return false

  const parts = split(address)

  return parts !== null && LOCAL_PART.test(parts.local) && emailDomainToAscii(parts.domain) !== null
}

/**
 * Whether the part before the `@` uses only A–Z, digits and ordinary
 * punctuation. The email service (Resend) cannot deliver to letters outside
 * that range there, and a visitor who typed `jürgen@` usually means
 * `juergen@` — so the Contact form asks, while the visitor can still fix it.
 */
export const hasAsciiLocalPart = (address: string): boolean => {
  const parts = split(address)

  return parts !== null && ASCII_LOCAL_PART.test(parts.local)
}

/** An address the Contact form takes: one address, answerable from the Inbox. */
export const isSendableEmailAddress = (address: string): boolean =>
  isEmailAddress(address) && hasAsciiLocalPart(address)

/**
 * The address as it is handed to the email service: the domain in its
 * punycode form. An address that is not one is returned unchanged, for the
 * service to refuse with its own reason.
 */
export const toSendableAddress = (address: string): string => {
  const parts = split(address)
  const domain = parts ? emailDomainToAscii(parts.domain) : null

  return parts && domain ? `${parts.local}@${domain}` : address
}
