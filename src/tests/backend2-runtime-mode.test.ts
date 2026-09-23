import { describe, expect, it } from 'vitest'
import { isProductionEnvironment } from '#/backend2/security/runtime-mode'
import { decideLocalOnly, isLocalOwnerRequest, ownerRoutesEnabled } from '#/backend2/security/local-only'

/**
 * The production switch every "refuse in production" rule reads. Under Vitest
 * the code is not a production build, so `NODE_ENV` decides; a Vite production
 * build answers `true` regardless (not reproducible here, by design).
 */
describe('isProductionEnvironment', () => {
  it('follows NODE_ENV outside a production build', () => {
    expect(isProductionEnvironment({ NODE_ENV: 'production' })).toBe(true)
    expect(isProductionEnvironment({ NODE_ENV: 'development' })).toBe(false)
    expect(isProductionEnvironment({})).toBe(false)
  })

  it('keeps the owner fence shut when production is detected', () => {
    const production = { BACKEND2_OWNER_API: 'local', NODE_ENV: 'production' }

    expect(ownerRoutesEnabled(production)).toBe(false)
    expect(isLocalOwnerRequest(new Request('http://localhost:3000/api/v2/owner/x'), production)).toEqual({
      allowed: false,
      reason: 'production',
    })
    expect(decideLocalOnly({ flag: 'local', nodeEnv: 'development', hostname: 'localhost' })).toEqual({ allowed: true })
  })
})

describe('requestIdentity', () => {
  it('trusts Cloudflare’s address, and x-forwarded-for only outside production', async () => {
    const { requestIdentity } = await import('#/backend2/auth/rate-limit')
    const request = (headers: Record<string, string>) => new Request('http://localhost/', { headers })
    const before = process.env.NODE_ENV

    expect(requestIdentity(request({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '1.1.1.1' }))).toBe('203.0.113.9')
    expect(requestIdentity(request({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }))).toBe('198.51.100.7')

    process.env.NODE_ENV = 'production'
    try {
      expect(requestIdentity(request({ 'x-forwarded-for': '198.51.100.7' }))).toBe('unknown-source')
    } finally {
      process.env.NODE_ENV = before
    }
  })
})
