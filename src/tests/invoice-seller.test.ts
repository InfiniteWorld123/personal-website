import { describe, expect, it } from 'vitest'
import {
  chooseSeller,
  isSellerReady,
  resolveSeller,
  SELLER,
  sellerGaps,
  TEST_SELLER,
  USE_TEST_DETAILS,
} from '#/backend/modules/invoices/seller'

/**
 * Which details get printed, and the two ways that could go badly wrong.
 *
 * `TEST_SELLER` exists because of a real dead end: the one part of the
 * section that cannot run on his laptop is sending, so it can only be tried
 * on the live site — and the live site refused to issue anything at all while
 * his own details still said TODO. He could not reach the thing he needed to
 * test.
 *
 * Its bank account does not exist. Two failures matter:
 *
 *   1. Shipping it **by accident**, so real clients receive invoices naming an
 *      account nobody can pay into.
 *   2. Shipping it **after filling his own details in**, by leaving the switch
 *      on — the likelier of the two, because by then he has stopped thinking
 *      about it.
 *
 * `chooseSeller` closes the second one structurally: real details win, always,
 * whatever the switch says. The first is his own deliberate act, and every
 * page it draws is stamped TEST.
 */

const real: Seller = { ...TEST_SELLER, isTest: undefined }
const placeholders = SELLER

type Seller = typeof TEST_SELLER

describe('which details get printed', () => {
  it('prints his own the moment they are real, switch or no switch', () => {
    // The failure that would otherwise be likeliest: details filled in, switch
    // forgotten, invented bank account shipped to real clients.
    expect(chooseSeller(real, true, TEST_SELLER)).toBe(real)
    expect(chooseSeller(real, false, TEST_SELLER)).toBe(real)
  })

  it('prints the invented set only while his own are placeholders and he asked', () => {
    expect(chooseSeller(placeholders, true, TEST_SELLER)).toBe(TEST_SELLER)
  })

  it('falls back to the placeholders when the switch is off', () => {
    // Which blocks issuing, because placeholders fail `isSellerReady`. That
    // is the behaviour from before the switch existed, and the safe default.
    expect(chooseSeller(placeholders, false, TEST_SELLER)).toBe(placeholders)
    expect(isSellerReady(chooseSeller(placeholders, false, TEST_SELLER))).toBe(false)
  })
})

describe('what this file is set to right now', () => {
  it('is on, while his own details are still TODO', () => {
    // Both lines change together the day he fills `seller.ts` in: the gaps
    // disappear, and this file should be edited to turn the switch off. If the
    // second is forgotten, the first still wins — see above.
    expect(USE_TEST_DETAILS).toBe(true)
    expect(sellerGaps(SELLER).length).toBeGreaterThan(0)
    expect(resolveSeller()).toBe(TEST_SELLER)
  })
})

describe('what makes the invented set survivable', () => {
  it('carries a mark that follows it onto every page it draws', () => {
    // `paperRules` stamps on this, so a page that escaped as a file still
    // cannot be mistaken for one a client could pay.
    expect(TEST_SELLER.isTest).toBe(true)
    expect(SELLER.isTest).toBeUndefined()
  })

  it('names an account that cannot receive money', () => {
    // DE00 fails the IBAN check digits by construction: no bank accepts it,
    // and no banking app will turn the payment code into a transfer.
    expect(TEST_SELLER.iban.replace(/\s+/g, '')).toMatch(/^DE00/)
  })

  it('is complete, or it would block issuing just like the placeholders', () => {
    expect(sellerGaps(TEST_SELLER)).toEqual([])
  })
})
