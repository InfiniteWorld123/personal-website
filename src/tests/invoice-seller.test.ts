import { describe, expect, it } from 'vitest'
import {
  isSellerReady,
  resolveSeller,
  SELLER,
  sellerGaps,
  TEST_SELLER,
  type Seller,
} from '#/backend/modules/invoices/seller'

/**
 * Which details get printed, and the one way that could go badly wrong.
 *
 * `TEST_SELLER` exists so the section can be walked through before the
 * Finanzamt has answered: invoices issue, take numbers, land in the register.
 * Its bank account does not exist.
 *
 * The danger is obvious and worth stating: if that set ever reached the live
 * site, real clients would receive real invoices naming an account nobody can
 * pay into, and the first anyone would hear of it is a client saying the
 * transfer bounced.
 *
 * So `resolveSeller` asks for a positive `NODE_ENV === 'development'`. The
 * negative form — `!== 'production'` — is the one that fails the wrong way:
 * a runtime that leaves the variable unset would hand a live Worker the
 * invented IBAN. This file exists to keep anyone from "simplifying" it back.
 */

/**
 * `resolveSeller` reads the variable when it is called, not when the module
 * loads, so this is a plain set-call-restore rather than a module reset.
 */
const withNodeEnv = (value: string | undefined): Seller => {
  const before = process.env.NODE_ENV

  try {
    if (value === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = value

    return resolveSeller()
  } finally {
    if (before === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = before
  }
}

describe('which details get printed', () => {
  it('uses the invented set on his own machine, while his own are TODO', () => {
    expect(withNodeEnv('development')).toBe(TEST_SELLER)
  })

  it('never uses it in production', () => {
    expect(withNodeEnv('production')).toBe(SELLER)
  })

  it('never uses it when NODE_ENV is missing', () => {
    // The whole reason the check is positive. An unset variable must land on
    // his real details — which still say TODO, which blocks issuing — rather
    // than on an IBAN nobody can pay into.
    expect(withNodeEnv(undefined)).toBe(SELLER)
  })

  it('never uses it under a name nobody anticipated', () => {
    expect(withNodeEnv('staging')).toBe(SELLER)
    expect(withNodeEnv('test')).toBe(SELLER)
  })
})

describe('what blocks issuing', () => {
  it('his own details are still placeholders, so the live site refuses', () => {
    // The day this fails is the day he filled seller.ts in, and this line
    // should be deleted along with TEST_SELLER.
    expect(sellerGaps(SELLER).length).toBeGreaterThan(0)
    expect(isSellerReady(SELLER)).toBe(false)
  })

  it('the invented set is complete, or it would block issuing too', () => {
    expect(sellerGaps(TEST_SELLER)).toEqual([])
  })

  it('carries a mark that follows it onto every page it draws', () => {
    // `paperRules` stamps on this, so a test invoice that escapes as a file
    // still cannot be mistaken for one a client could pay.
    expect(TEST_SELLER.isTest).toBe(true)
    expect(SELLER.isTest).toBeUndefined()
  })

  it('names an account that cannot receive money', () => {
    // DE00 fails the IBAN check digits by construction: no bank accepts it,
    // and no banking app will turn the payment code into a transfer.
    expect(TEST_SELLER.iban.replace(/\s+/g, '')).toMatch(/^DE00/)
  })
})
