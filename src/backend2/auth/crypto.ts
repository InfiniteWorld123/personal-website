import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hmac } from '@noble/hashes/hmac.js'
import { scryptAsync } from '@noble/hashes/scrypt.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { randomBytes } from '@noble/hashes/utils.js'

/**
 * The cryptographic primitives Auth V2 uses, and nothing invented.
 *
 * `@noble/hashes` and `@noble/ciphers` are audited implementations that were
 * already in the tree — Better Auth depends on both — and they are pure
 * JavaScript, so they run unchanged on a Cloudflare Worker where a native
 * bcrypt or argon2 binding cannot.
 *
 * `docs/v2/auth.md`: "Use library-supported password hashing, TOTP and
 * WebAuthn verification rather than inventing cryptography."
 */

const encoder = new TextEncoder()

/* ------------------------------------------------------------- base64url */

export const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ''

  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const fromBase64Url = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)

  return bytes
}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

/* ------------------------------------------------------- opaque secrets */

/**
 * A new opaque secret: 32 bytes of CSPRNG output, base64url.
 *
 * This is what a session cookie, a challenge id and an emailed link all carry.
 * It decodes to nothing — the server finds the row by hashing it — so an
 * intercepted value reveals no account, no expiry and no scope.
 */
export const newOpaqueSecret = (): string => toBase64Url(randomBytes(32))

/**
 * The only form a secret is ever stored in.
 *
 * SHA-256 rather than a password hash on purpose: these are 256-bit random
 * values, so there is no dictionary to slow an attacker down with, and a
 * per-request scrypt on every authenticated call would be a denial-of-service
 * surface of our own making.
 */
export const hashOpaqueSecret = (secret: string): string => toHex(sha256(encoder.encode(secret)))

/**
 * A keyed hash, for values that must be unlinkable rather than merely hidden:
 * the rate-limit key, and the address a session was created from.
 */
export const keyedHash = (secret: string, value: string): string =>
  toHex(hmac(sha256, encoder.encode(secret), encoder.encode(value)))

/**
 * Comparison that does not leak where two strings first differ.
 *
 * Both sides are hashed first, so the loop always runs over 32 equal-length
 * bytes whatever the inputs were.
 */
export const constantTimeEqual = (a: string, b: string): boolean => {
  const left = sha256(encoder.encode(a))
  const right = sha256(encoder.encode(b))
  let difference = 0

  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!

  return difference === 0
}

/* ------------------------------------------------------ password hashing */

/**
 * scrypt with the parameters Better Auth itself defaults to (N=16384, r=16,
 * p=1), which land comfortably inside a Worker's CPU budget while costing an
 * offline attacker real memory per guess.
 *
 * The stored form carries its own parameters and salt, so raising the cost
 * later does not invalidate what is already stored.
 */
const SCRYPT = { N: 16_384, r: 16, p: 1, dkLen: 64 } as const

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16)
  const key = await scryptAsync(encoder.encode(password.normalize('NFKC')), salt, SCRYPT)

  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${toBase64Url(salt)}$${toBase64Url(key)}`
}

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const parts = stored.split('$')

  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [, n, r, p, salt, expected] = parts as [string, string, string, string, string, string]
  const expectedBytes = fromBase64Url(expected)

  const key = await scryptAsync(encoder.encode(password.normalize('NFKC')), fromBase64Url(salt), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    dkLen: expectedBytes.length,
  })

  let difference = key.length ^ expectedBytes.length

  for (let index = 0; index < key.length; index += 1) {
    difference |= (key[index] ?? 0) ^ (expectedBytes[index] ?? 0)
  }

  return difference === 0
}

/* ------------------------------------------------- encryption at rest */

/**
 * The key for the TOTP secret, derived from `AUTH_V2_SECRET` rather than used
 * directly, so the same environment value can also key the rate-limit HMAC
 * without the two sharing a key.
 */
const encryptionKey = (secret: string): Uint8Array =>
  hmac(sha256, encoder.encode(secret), encoder.encode('v2-auth-secret-encryption'))

/**
 * Authenticated encryption for a value that must come back out again — the
 * TOTP shared secret is the only one. A hash would be useless here: verifying
 * a code needs the secret itself.
 */
export const encryptSecret = (secret: string, plaintext: string): string => {
  const nonce = randomBytes(24)
  const sealed = xchacha20poly1305(encryptionKey(secret), nonce).encrypt(
    encoder.encode(plaintext),
  )

  return `xc20p$${toBase64Url(nonce)}$${toBase64Url(sealed)}`
}

export const decryptSecret = (secret: string, stored: string): string | null => {
  const parts = stored.split('$')

  if (parts.length !== 3 || parts[0] !== 'xc20p') return null

  try {
    const opened = xchacha20poly1305(encryptionKey(secret), fromBase64Url(parts[1]!)).decrypt(
      fromBase64Url(parts[2]!),
    )

    return new TextDecoder().decode(opened)
  } catch {
    // A wrong key or a tampered ciphertext fails the Poly1305 tag. Both mean
    // the same thing to a caller: there is no usable secret here.
    return null
  }
}

export { randomBytes }
