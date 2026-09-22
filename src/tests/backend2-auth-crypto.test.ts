import { describe, expect, it } from 'vitest'
import {
  constantTimeEqual,
  decryptSecret,
  encryptSecret,
  fromBase64Url,
  hashOpaqueSecret,
  hashPassword,
  newOpaqueSecret,
  toBase64Url,
  verifyPassword,
} from '#/backend2/auth/crypto'
import {
  formatRecoveryCode,
  generateRecoveryCodes,
  normalizeRecoveryCode,
} from '#/backend2/auth/recovery'
import {
  currentTotpCode,
  fromBase32,
  generateTotpSecret,
  toBase32,
  totpCodeAt,
  totpUri,
  verifyTotp,
} from '#/backend2/auth/totp'
import {
  readExpectedOrigins,
  readRpId,
  readAuthSecret,
  useSecureCookies,
} from '#/backend2/auth/config'
import { RecoveryCodeSchema, TotpCodeSchema } from '#/backend2/contracts/auth.contract'
import * as v from 'valibot'

/**
 * The primitives, on their own.
 *
 * The integration suite proves the flows; this proves the pieces they are made
 * of, including the two things a flow test cannot easily show: that TOTP
 * agrees with the RFC rather than merely with itself, and that a tampered
 * ciphertext is refused rather than silently returning rubbish.
 */

describe('password hashing', () => {
  it('accepts the right password and refuses the wrong one', async () => {
    const stored = await hashPassword('a correct horse battery staple')

    expect(stored.startsWith('scrypt$')).toBe(true)
    expect(await verifyPassword('a correct horse battery staple', stored)).toBe(true)
    expect(await verifyPassword('a correct horse battery stapl', stored)).toBe(false)
    expect(await verifyPassword('', stored)).toBe(false)
  })

  it('salts, so the same password never produces the same stored value', async () => {
    const [first, second] = await Promise.all([hashPassword('same'), hashPassword('same')])

    expect(first).not.toBe(second)
  })

  it('normalises Unicode, so a password typed on another keyboard still matches', async () => {
    // Two spellings of "é": composed, and e + combining accent.
    const stored = await hashPassword('café passphrase!')

    expect(await verifyPassword('café passphrase!', stored)).toBe(true)
  })

  it('refuses a stored value it does not recognise instead of throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('x', '')).toBe(false)
    expect(await verifyPassword('x', 'bcrypt$1$2$3$4$5')).toBe(false)
  })
})

describe('opaque secrets', () => {
  it('are long, random, and URL-safe', () => {
    const secrets = new Set(Array.from({ length: 200 }, newOpaqueSecret))

    expect(secrets.size).toBe(200)

    for (const secret of secrets) {
      expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    }
  })

  it('hash to a stable value that is not the secret', () => {
    const secret = newOpaqueSecret()

    expect(hashOpaqueSecret(secret)).toBe(hashOpaqueSecret(secret))
    expect(hashOpaqueSecret(secret)).not.toContain(secret)
    expect(hashOpaqueSecret(secret)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('survive base64url in both directions, including bytes that need padding', () => {
    for (const length of [1, 2, 3, 16, 31, 32, 64]) {
      const bytes = new Uint8Array(length).map((_, index) => (index * 37) % 256)

      expect([...fromBase64Url(toBase64Url(bytes))]).toEqual([...bytes])
    }
  })

  it('compares without leaking where two values diverge', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
    expect(constantTimeEqual('abc', '')).toBe(false)
    expect(constantTimeEqual('', '')).toBe(true)
  })
})

describe('encryption at rest', () => {
  const secret = 'a'.repeat(40)

  it('returns exactly what was put in', () => {
    const sealed = encryptSecret(secret, 'JBSWY3DPEHPK3PXP')

    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP')
    expect(decryptSecret(secret, sealed)).toBe('JBSWY3DPEHPK3PXP')
  })

  it('refuses a different key', () => {
    expect(decryptSecret('b'.repeat(40), encryptSecret(secret, 'value'))).toBeNull()
  })

  it('refuses a tampered ciphertext rather than returning rubbish', () => {
    const sealed = encryptSecret(secret, 'value')
    const parts = sealed.split('$')
    const flipped = [...fromBase64Url(parts[2]!)]

    flipped[0] = (flipped[0]! ^ 1) as number

    expect(decryptSecret(secret, `${parts[0]}$${parts[1]}$${toBase64Url(Uint8Array.from(flipped))}`)).toBeNull()
  })

  it('refuses a value that is not in its own format', () => {
    expect(decryptSecret(secret, 'plain text')).toBeNull()
    expect(decryptSecret(secret, '')).toBeNull()
  })
})

describe('TOTP', () => {
  /**
   * RFC 6238 Appendix B, SHA-1. The secret is the ASCII "12345678901234567890",
   * which is what the RFC's test table is computed from.
   */
  const RFC_SECRET = toBase32(new TextEncoder().encode('12345678901234567890'))

  it.each([
    [59, '287082'],
    [1_111_111_109, '081804'],
    [1_111_111_111, '050471'],
    [1_234_567_890, '005924'],
    [2_000_000_000, '279037'],
  ])('matches the RFC 6238 vector at t=%i', (seconds, expected) => {
    expect(totpCodeAt(RFC_SECRET, Math.floor(seconds / 30))).toBe(expected)
  })

  it('round-trips base32 in both directions', () => {
    for (const text of ['a', 'ab', 'abc', 'abcd', 'abcde', '1234567890']) {
      const bytes = new TextEncoder().encode(text)

      expect([...fromBase32(toBase32(bytes))]).toEqual([...bytes])
    }
  })

  it('generates a 32-character secret every time', () => {
    const secrets = new Set(Array.from({ length: 50 }, generateTotpSecret))

    expect(secrets.size).toBe(50)

    for (const secret of secrets) expect(secret).toMatch(/^[A-Z2-7]{32}$/)
  })

  it('accepts the current code, and one step either side', () => {
    const secret = generateTotpSecret()
    const now = 1_700_000_000_000

    for (const drift of [-30_000, 0, 30_000]) {
      const code = currentTotpCode(secret, now + drift)

      expect(verifyTotp(secret, code, { now }).valid).toBe(true)
    }
  })

  it('refuses a code two steps away', () => {
    const secret = generateTotpSecret()
    const now = 1_700_000_000_000

    expect(verifyTotp(secret, currentTotpCode(secret, now + 90_000), { now }).valid).toBe(false)
    expect(verifyTotp(secret, currentTotpCode(secret, now - 90_000), { now }).valid).toBe(false)
  })

  it('refuses a correct code that was already spent in its own window', () => {
    const secret = generateTotpSecret()
    const now = 1_700_000_000_000
    const first = verifyTotp(secret, currentTotpCode(secret, now), { now })

    expect(first.valid).toBe(true)

    // The same code, the same window, a second time.
    expect(
      verifyTotp(secret, currentTotpCode(secret, now), { now, lastUsedStep: first.step }).valid,
    ).toBe(false)
  })

  it.each(['', '12345', '1234567', 'abcdef', '12 34 56x'])('refuses %o as a code', (code) => {
    expect(verifyTotp(generateTotpSecret(), code).valid).toBe(false)
  })

  it('tolerates the spaces an authenticator app puts in the code', () => {
    const secret = generateTotpSecret()
    const now = 1_700_000_000_000
    const code = currentTotpCode(secret, now)

    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, { now }).valid).toBe(true)
    expect(v.parse(TotpCodeSchema, `${code.slice(0, 3)} ${code.slice(3)}`)).toBe(code)
  })

  it('builds a URI every authenticator app can read', () => {
    const uri = totpUri({ secret: 'ABCD', email: 'a@b.de', issuer: 'Dashboard' })

    expect(uri.startsWith('otpauth://totp/Dashboard%3Aa%40b.de?')).toBe(true)
    expect(uri).toContain('secret=ABCD')
    expect(uri).toContain('issuer=Dashboard')
    expect(uri).toContain('algorithm=SHA1')
    expect(uri).toContain('digits=6')
    expect(uri).toContain('period=30')
  })
})

describe('recovery codes', () => {
  it('generates ten distinct codes with no character that is read wrong on paper', () => {
    const codes = generateRecoveryCodes()

    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)

    for (const code of codes) {
      expect(code).toMatch(/^[a-hj-km-np-z2-9]{10}$/)
      expect(code).not.toMatch(/[ilo01]/)
    }
  })

  it('accepts what it printed, however the owner types it back', () => {
    const [code] = generateRecoveryCodes(1) as [string]
    const printed = formatRecoveryCode(code)

    expect(printed).toMatch(/^[a-z0-9]{5}-[a-z0-9]{5}$/)

    for (const typed of [printed, printed.toUpperCase(), code, ` ${printed} `]) {
      expect(normalizeRecoveryCode(typed)).toBe(code)
      expect(v.parse(RecoveryCodeSchema, typed)).toBe(code)
    }
  })

  it('does not draw every code from the same few letters', () => {
    const letters = new Set(generateRecoveryCodes(40).join(''))

    // Rejection sampling should reach most of a 31-symbol alphabet in 400 draws.
    expect(letters.size).toBeGreaterThan(24)
  })
})

describe('configuration', () => {
  const base = { NODE_ENV: 'production', AUTH_V2_SECRET: 'x'.repeat(40) }

  it('refuses to run in production without its own secret', () => {
    expect(() => readAuthSecret({ NODE_ENV: 'production' })).toThrow(/AUTH_V2_SECRET/)
    expect(() => readAuthSecret({ NODE_ENV: 'production', AUTH_V2_SECRET: 'short' })).toThrow(
      /too short/,
    )
  })

  it('has a development secret, and it is not the legacy one', () => {
    const secret = readAuthSecret({ NODE_ENV: 'development', BETTER_AUTH_SECRET: 'legacy' })

    expect(secret).not.toBe('legacy')
    expect(secret.length).toBeGreaterThanOrEqual(32)
  })

  it('refuses to guess the production domain or origin', () => {
    expect(() => readRpId(base)).toThrow(/AUTH_V2_RP_ID/)
    expect(() => readExpectedOrigins(base)).toThrow(/AUTH_V2_ORIGIN/)
  })

  it('reads several origins, and strips a trailing slash', () => {
    expect(
      readExpectedOrigins({ AUTH_V2_ORIGIN: 'https://a.de/, https://b.de' }),
    ).toEqual(['https://a.de', 'https://b.de'])
  })

  it('marks the cookie Secure unless a plain-HTTP origin is in use', () => {
    expect(useSecureCookies({ ...base, AUTH_V2_RP_ID: 'a.de', AUTH_V2_ORIGIN: 'https://a.de' })).toBe(true)
    expect(useSecureCookies({ NODE_ENV: 'development' })).toBe(false)
    expect(
      useSecureCookies({ NODE_ENV: 'development', AUTH_V2_ORIGIN: 'https://staging.a.de' }),
    ).toBe(true)
  })
})
