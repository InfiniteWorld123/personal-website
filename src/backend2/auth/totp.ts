import { hmac } from '@noble/hashes/hmac.js'
import { sha1 } from '@noble/hashes/legacy.js'
import { randomBytes } from '@noble/hashes/utils.js'

/**
 * TOTP, RFC 6238, on top of an audited HMAC implementation.
 *
 * SHA-1 and a 30-second step are not a weak choice here but the only
 * interoperable one: Google Authenticator, 1Password, Aegis and the rest all
 * assume them, and an `otpauth://` URI that says otherwise is silently
 * misread by several of them. The security of TOTP rests on the secret, which
 * never leaves the database unencrypted.
 */

const STEP_SECONDS = 30
const DIGITS = 6

/** How far either side of now a code is still accepted: one step, so ±30s. */
const DRIFT_STEPS = 1

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export const toBase32 = (bytes: Uint8Array): string => {
  let bits = 0
  let value = 0
  let output = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]

  return output
}

export const fromBase32 = (value: string): Uint8Array => {
  const cleaned = value.replace(/[\s=-]/g, '').toUpperCase()
  const bytes: number[] = []
  let bits = 0
  let accumulator = 0

  for (const character of cleaned) {
    const index = BASE32_ALPHABET.indexOf(character)

    if (index === -1) throw new Error('That is not a base32 secret')

    accumulator = (accumulator << 5) | index
    bits += 5

    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255)
      bits -= 8
    }
  }

  return Uint8Array.from(bytes)
}

/** 20 bytes, the SHA-1 block size RFC 4226 recommends. */
export const generateTotpSecret = (): string => toBase32(randomBytes(20))

const counterBytes = (counter: number): Uint8Array => {
  const bytes = new Uint8Array(8)
  const view = new DataView(bytes.buffer)

  // Two 32-bit halves: a single setBigUint64 would need BigInt for a value
  // that never exceeds 2^53 anyway.
  view.setUint32(0, Math.floor(counter / 2 ** 32))
  view.setUint32(4, counter >>> 0)

  return bytes
}

export const totpCodeAt = (secret: string, counter: number): string => {
  const digest = hmac(sha1, fromBase32(secret), counterBytes(counter))
  const offset = digest[digest.length - 1]! & 0x0f
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!

  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0')
}

export const currentTotpCode = (secret: string, now = Date.now()): string =>
  totpCodeAt(secret, Math.floor(now / 1000 / STEP_SECONDS))

/**
 * Checks a code, allowing one step of clock drift either way.
 *
 * Returns the step it matched so the caller can refuse a replay of the very
 * same code inside its own window — a correct code used twice is one code,
 * not two.
 */
export const verifyTotp = (
  secret: string,
  code: string,
  options: { now?: number; lastUsedStep?: number | null } = {},
): { valid: boolean; step: number | null } => {
  const cleaned = code.replace(/[\s-]/g, '')

  if (!/^\d{6}$/.test(cleaned)) return { valid: false, step: null }

  const current = Math.floor((options.now ?? Date.now()) / 1000 / STEP_SECONDS)

  for (let drift = -DRIFT_STEPS; drift <= DRIFT_STEPS; drift += 1) {
    const step = current + drift

    if (options.lastUsedStep != null && step <= options.lastUsedStep) continue

    /*
     * Compared digit by digit over a fixed six characters. Both sides are
     * already public-length, so the loop leaks nothing an attacker could not
     * measure from the six-digit format itself.
     */
    const expected = totpCodeAt(secret, step)
    let difference = 0

    for (let index = 0; index < DIGITS; index += 1) {
      difference |= expected.charCodeAt(index) ^ cleaned.charCodeAt(index)
    }

    if (difference === 0) return { valid: true, step }
  }

  return { valid: false, step: null }
}

/**
 * The `otpauth://` URI an authenticator app scans.
 *
 * The label carries the issuer and the account's email, so the owner can tell
 * this entry apart from others in the same authenticator app.
 */
export const totpUri = (options: { secret: string; email: string; issuer: string }): string => {
  const label = encodeURIComponent(`${options.issuer}:${options.email}`)
  const parameters = new URLSearchParams({
    secret: options.secret,
    issuer: options.issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  })

  return `otpauth://totp/${label}?${parameters.toString()}`
}

/** Grouped in fours, the way every authenticator app prints a manual key. */
export const formatSetupKey = (secret: string): string =>
  secret.match(/.{1,4}/g)?.join(' ') ?? secret

export const TOTP_STEP_SECONDS = STEP_SECONDS
