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
