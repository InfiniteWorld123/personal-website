import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import {
  DealMoveSchema,
  DealWriteSchema,
  LeadQuerySchema,
  isOpenStage,
} from '#/shared/validation/lead.validation'

/**
 * The rules the lead system must never break, pinned where they are cheap to
 * check: in the contract, not in a database round trip.
 *
 * Two of them are the whole reason the section was rebuilt.
 * - **Losing and saying why are one act.** `0015` refuses the half-state at
 *   the table; this refuses it before the request is even sent.
 * - **The two kinds of money never meet.** There is no field, and no helper
 *   anywhere in the section, that holds their sum.
 */

const write = (overrides: Record<string, unknown> = {}) => ({
  title: 'Website — fertige Vorlage',
  buildEuros: 990,
  monthlyEuros: 49,
  nextStep: '',
  followUpOn: null,
  ...overrides,
})

describe('a deal, as it arrives from the form', () => {
  it('counts money in cents, so nothing rounds twice', () => {
    const parsed = v.parse(DealWriteSchema, write({ buildEuros: 990, monthlyEuros: 49 }))

    expect(parsed.buildEuros).toBe(99_000)
    expect(parsed.monthlyEuros).toBe(4_900)
  })

  it('reads the number a text input hands back', () => {
    // An `<input type="number">` gives a string, and an empty one gives ''.
    const parsed = v.parse(DealWriteSchema, write({ buildEuros: '1490', monthlyEuros: 0 }))

    expect(parsed.buildEuros).toBe(149_000)
    expect(parsed.monthlyEuros).toBe(0)
  })

  it('refuses a negative price', () => {
    expect(() => v.parse(DealWriteSchema, write({ buildEuros: -5 }))).toThrow()
  })

  it('refuses a deal with no name', () => {
    expect(() => v.parse(DealWriteSchema, write({ title: '   ' }))).toThrow()
  })

  it('takes a follow-up as the day he picked, or as nothing at all', () => {
    expect(v.parse(DealWriteSchema, write({ followUpOn: '2026-09-24' })).followUpOn).toBe(
      '2026-09-24',
    )
    expect(v.parse(DealWriteSchema, write({ followUpOn: null })).followUpOn).toBeNull()
    expect(() => v.parse(DealWriteSchema, write({ followUpOn: '24.09.2026' }))).toThrow()
  })
})

describe('moving a deal', () => {
  it('refuses to lose one without saying why', () => {
    expect(() =>
      v.parse(DealMoveSchema, { stage: 'LOST', lostReason: null, lostNote: '' }),
    ).toThrow(/why/i)
  })

  it('accepts a loss that carries its reason', () => {
    const parsed = v.parse(DealMoveSchema, {
      stage: 'LOST',
      lostReason: 'TOO_EXPENSIVE',
      lostNote: 'Wix für 20 € im Monat',
    })

    expect(parsed.lostReason).toBe('TOO_EXPENSIVE')
    expect(parsed.lostNote).toBe('Wix für 20 € im Monat')
  })

  it('refuses a reason nobody chose from the six', () => {
    expect(() =>
      v.parse(DealMoveSchema, { stage: 'LOST', lostReason: 'HE_WAS_RUDE', lostNote: '' }),
    ).toThrow()
  })

  it('needs no reason for any other move', () => {
    expect(v.parse(DealMoveSchema, { stage: 'WON' }).stage).toBe('WON')
    expect(v.parse(DealMoveSchema, { stage: 'PROPOSAL' }).stage).toBe('PROPOSAL')
  })

  it('knows which stages are still moving', () => {
    expect(isOpenStage('NEW')).toBe(true)
    expect(isOpenStage('PROPOSAL')).toBe(true)
    expect(isOpenStage('WON')).toBe(false)
    expect(isOpenStage('LOST')).toBe(false)
  })
})

describe('the list query', () => {
  it('asks about everyone unless told otherwise', () => {
    const parsed = v.parse(LeadQuerySchema, {})

    expect(parsed.stage).toBe('ALL')
    expect(parsed.search).toBe('')
  })

  it('keeps "no deal yet" as a real answer, not an absence', () => {
    expect(v.parse(LeadQuerySchema, { stage: 'NONE' }).stage).toBe('NONE')
  })

  it('refuses a stage that is not one', () => {
    expect(() => v.parse(LeadQuerySchema, { stage: 'MAYBE' })).toThrow()
  })

  it('coerces the limit a query string carries, and caps it', () => {
    expect(v.parse(LeadQuerySchema, { limit: '300' }).limit).toBe(300)
    expect(() => v.parse(LeadQuerySchema, { limit: '5000' })).toThrow()
  })
})
