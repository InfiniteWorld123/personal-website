import { describe, expect, it } from 'vitest'
import {
  billingDate,
  firstPeriod,
  LAST_BILLING_DAY,
  nextPeriod,
  periodLabel,
  periodOf,
  plannedInvoices,
  subscriptionDraftUntouched,
  subscriptionLine,
  VAT_RATE_LABEL,
  VAT_RATES,
} from '#/shared/validation/invoice.validation'

/**
 * The calendar a subscription runs on.
 *
 * Every bug this file guards against is the same shape: a date that does not
 * exist, or a month that gets billed at the wrong moment. Neither is visible
 * on the screen — the first one he would meet as a February that silently
 * skipped, the second as a client asking why they were invoiced three weeks
 * after the month ended.
 */

describe('nextPeriod', () => {
  it('walks month to month', () => {
    expect(nextPeriod('2026-01-01')).toBe('2026-02-01')
    expect(nextPeriod('2026-09-01')).toBe('2026-10-01')
  })

  it('crosses the year', () => {
    expect(nextPeriod('2026-12-01')).toBe('2027-01-01')
  })

  it('pads the month, so the string stays sortable and comparable', () => {
    // These dates are compared with `<` and `>` throughout the generator. An
    // unpadded '2026-9-01' sorts after '2026-10-01' and the catch-up loop
    // would walk backwards.
    expect(nextPeriod('2026-08-01')).toBe('2026-09-01')
    expect(nextPeriod('2027-01-01')).toBe('2027-02-01')
  })

  it('walks a whole year without drifting', () => {
    let period = '2026-01-01'

    for (let month = 0; month < 12; month += 1) period = nextPeriod(period)

    expect(period).toBe('2027-01-01')
  })
})

describe('billingDate', () => {
  it('lands inside the period it bills', () => {
    expect(billingDate('2026-10-01', 1)).toBe('2026-10-01')
    expect(billingDate('2026-10-01', 25)).toBe('2026-10-25')
  })

  it('never produces a day that does not exist', () => {
    /*
     * The reason `billing_day` is capped at 28. February has 28 days in every
     * year, leap or not, so the highest allowed day is real in every month —
     * and there is no rule to invent about what the 31st means in February.
     */
    for (let month = 1; month <= 12; month += 1) {
      const period = `2026-${String(month).padStart(2, '0')}-01`
      const date = new Date(`${billingDate(period, LAST_BILLING_DAY)}T00:00:00Z`)

      expect(Number.isNaN(date.getTime())).toBe(false)
      expect(date.toISOString().slice(0, 10)).toBe(billingDate(period, LAST_BILLING_DAY))
    }
  })
})

describe('firstPeriod', () => {
  it('bills this month when the day has not passed', () => {
    // Added on the 20th, bills on the 25th: that money is genuinely due in
    // five days, so this month is right.
    expect(firstPeriod('2026-09-20', 25)).toBe('2026-09-01')
  })

  it('bills this month when added exactly on the day', () => {
    expect(firstPeriod('2026-09-25', 25)).toBe('2026-09-01')
  })

  it('waits for next month when the day is already gone', () => {
    // Added on the 20th, bills on the 1st. Without this he would get an
    // invoice for a month three weeks gone, every single time he adds one.
    expect(firstPeriod('2026-09-20', 1)).toBe('2026-10-01')
  })

  it('rolls into the new year', () => {
    expect(firstPeriod('2026-12-20', 1)).toBe('2027-01-01')
  })
})

describe('periodOf', () => {
  it('reduces any day to the first of its month', () => {
    expect(periodOf('2026-09-20')).toBe('2026-09-01')
    expect(periodOf('2026-09-01')).toBe('2026-09-01')
  })
})

describe('the line a client reads', () => {
  it('names the month in the language of the paper', () => {
    expect(subscriptionLine('Website-Betreuung', '2026-10-01', 'de')).toBe(
      'Website-Betreuung · Oktober 2026',
    )
    expect(subscriptionLine('Website care', '2026-10-01', 'en')).toBe(
      'Website care · October 2026',
    )
  })

  it('names every month of the year in both languages', () => {
    // Hand-rolled rather than `Intl`, because the Worker's ICU data is not
    // something this code controls — so the table itself has to be right.
    for (let month = 1; month <= 12; month += 1) {
      const period = `2026-${String(month).padStart(2, '0')}-01`

      expect(periodLabel(period, 'de')).not.toBe(period)
      expect(periodLabel(period, 'en')).not.toBe(period)
      expect(periodLabel(period, 'de')).toContain('2026')
    }

    expect(periodLabel('2026-03-01', 'de')).toBe('März 2026')
    expect(periodLabel('2026-12-01', 'en')).toBe('December 2026')
  })
})

/**
 * What the screen promises before anything has happened.
 *
 * He said he could not see the generator work and could not test it — he would
 * have to wait a month and hope. The schedule on each subscription is the
 * answer: three dates, written down before they arrive, that he can hold the
 * invoice list against tomorrow. It is only worth that if it agrees with the
 * generator exactly, which is what this checks.
 */

describe('plannedInvoices', () => {
  it('lists the next three months and the day each is dated', () => {
    expect(plannedInvoices('2026-09-01', 25)).toEqual([
      { period: '2026-09-01', on: '2026-09-25' },
      { period: '2026-10-01', on: '2026-10-25' },
      { period: '2026-11-01', on: '2026-11-25' },
    ])
  })

  it('crosses the year without drifting', () => {
    expect(plannedInvoices('2026-12-01', 1)).toEqual([
      { period: '2026-12-01', on: '2026-12-01' },
      { period: '2027-01-01', on: '2027-01-01' },
      { period: '2027-02-01', on: '2027-02-01' },
    ])
  })

  it('walks the same path the generator walks', () => {
    // The screen and the generator must never disagree about which month comes
    // next — a schedule that promises November while the generator writes
    // December is worse than no schedule at all.
    const planned = plannedInvoices('2026-09-01', 14, 6)
    let period = '2026-09-01'

    for (const step of planned) {
      expect(step.period).toBe(period)
      expect(step.on).toBe(billingDate(period, 14))
      period = nextPeriod(period)
    }
  })

  it('never promises a date that does not exist', () => {
    for (const step of plannedInvoices('2026-01-01', LAST_BILLING_DAY, 12)) {
      expect(new Date(`${step.on}T00:00:00Z`).toISOString().slice(0, 10)).toBe(step.on)
    }
  })
})

describe('the rates he can pick', () => {
  it('offers exactly the two that exist for him', () => {
    // Not a free number box: 1,9 instead of 19 would bill wrong every month
    // until somebody read a PDF closely. And 7 % covers books and food, not
    // software, so offering it would be offering a wrong answer.
    expect(VAT_RATES).toEqual([0, 19])
    expect(VAT_RATE_LABEL[0]).toContain('§19')
    expect(VAT_RATE_LABEL[19]).toContain('19 %')
  })
})

describe('subscriptionDraftUntouched', () => {
  const was = { description: 'Website-Betreuung', amountCents: 4_900, taxRate: 0 }
  const line = (overrides: Partial<{ description: string; quantity: number; unitCents: number; taxRate: number }> = {}) => ({
    description: 'Website-Betreuung · Oktober 2026',
    quantity: 1,
    unitCents: 4_900,
    taxRate: 0,
    ...overrides,
  })

  it('recognises the draft the generator wrote, so a price change reaches it', () => {
    expect(subscriptionDraftUntouched([line()], was, '2026-10-01', 'de')).toBe(true)
  })

  it('reads the line in the language the draft was written in', () => {
    expect(
      subscriptionDraftUntouched([line({ description: 'Website-Betreuung · October 2026' })], was, '2026-10-01', 'en'),
    ).toBe(true)
    expect(
      subscriptionDraftUntouched([line({ description: 'Website-Betreuung · October 2026' })], was, '2026-10-01', 'de'),
    ).toBe(false)
  })

  it('leaves a draft he has edited alone', () => {
    // Any of the four things he can change makes the draft his: the wording,
    // the amount, the rate, or a second line. A generator that rewrote it
    // then would be a second author on one document.
    expect(subscriptionDraftUntouched([line({ description: 'Betreuung, wie besprochen' })], was, '2026-10-01', 'de')).toBe(false)
    expect(subscriptionDraftUntouched([line({ unitCents: 5_900 })], was, '2026-10-01', 'de')).toBe(false)
    expect(subscriptionDraftUntouched([line({ taxRate: 19 })], was, '2026-10-01', 'de')).toBe(false)
    expect(subscriptionDraftUntouched([line({ quantity: 2 })], was, '2026-10-01', 'de')).toBe(false)
    expect(subscriptionDraftUntouched([line(), line({ description: 'Extra' })], was, '2026-10-01', 'de')).toBe(false)
  })

  it('does not mistake one month for another', () => {
    expect(subscriptionDraftUntouched([line()], was, '2026-11-01', 'de')).toBe(false)
  })

  it('is false for a draft with no lines at all', () => {
    expect(subscriptionDraftUntouched([], was, '2026-10-01', 'de')).toBe(false)
  })
})
