import { AUTH_LIMITS } from '../contracts/auth.contract'
import { randomBytes } from './crypto'

/**
 * One-time recovery codes: what stands in for the authenticator app when the
 * phone is gone.
 *
 * They are written down by hand and typed back in under stress, so the
 * alphabet drops every character that is read wrong on paper — no `i`/`l`/`1`,
 * no `o`/`0`. Ten characters from 31 symbols is about 49 bits, which is far
 * past what the server-side attempt limit will ever let anyone search.
 */

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const CODE_LENGTH = 10

/**
 * Rejection sampling rather than `% ALPHABET.length`.
 *
 * The modulo would make the first eight letters very slightly likelier than
 * the rest; the cost of doing it properly is a few extra random bytes.
 */
const pickCharacter = (): string => {
  const ceiling = 256 - (256 % ALPHABET.length)

  for (;;) {
    const byte = randomBytes(1)[0]!

    if (byte < ceiling) return ALPHABET[byte % ALPHABET.length]!
  }
}

// Annotated, not inferred: `AUTH_LIMITS` is `as const`, so taking the type
// from the default value would narrow the parameter to the literal 10 and
// refuse every other count.
export const generateRecoveryCodes = (count: number = AUTH_LIMITS.recoveryCodeCount): string[] =>
  Array.from({ length: count }, () =>
    Array.from({ length: CODE_LENGTH }, pickCharacter).join(''),
  )

/**
 * What the owner sees: `abcde-fghij`. The dash is cosmetic — the normaliser
 * strips it — and it exists so a ten-character string can be copied without
 * losing your place.
 */
export const formatRecoveryCode = (code: string): string => `${code.slice(0, 5)}-${code.slice(5)}`

/** How a typed code is turned into the form that was hashed. */
export const normalizeRecoveryCode = (code: string): string =>
  code.replace(/[\s-]/g, '').toLowerCase()
