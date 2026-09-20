import { describe, expect, it } from 'vitest'
import { epcPayload, money } from '#/backend/modules/invoices/pdf.service'
import type { Seller } from '#/backend/modules/invoices/seller'
import {
  balanceOf,
  payLinkUsable,
  settlementOf,
  THE_CURRENCY,
  totalsOf,
  vatConflict,
  type InvoiceKind,
  type InvoiceStatus,
} from '#/shared/validation/invoice.validation'

/**
 * The arithmetic that decides what a client is told they owe.
 *
 * `totalsOf` is imported by the draft editor, by the service that stores the
 * totals and by the correction path, so one wrong rounding rule here would
 * show up as a screen and a PDF disagreeing by a cent — which is a phone call
 * from a client, not a cosmetic bug.
 */

const line = (quantity: number, unitEuros: number, taxRate = 0) => ({
  quantity,
  unitEuros,
  taxRate,
})

describe('totalsOf', () => {
  it('multiplies a line and keeps everything in cents', () => {
    expect(totalsOf([line(1, 49_000)])).toEqual({
      netCents: 49_000,
      taxCents: 0,
      totalCents: 49_000,
    })
  })

  it('handles a fractional quantity without leaving a fraction of a cent', () => {
    // Half a day at 490 €. `0.5 * 49000` is exact, but the rounding has to
    // happen once, on the line, or the sum drifts.
    expect(totalsOf([line(0.5, 49_000)]).netCents).toBe(24_500)
    expect(totalsOf([line(1.5, 8_990)]).netCents).toBe(13_485)
  })

  it('is immune to the floating-point trap that costs a cent', () => {
    // 0.1 + 0.2 arithmetic, in the shape money actually takes: three lines at
    // 39,90 € must come to 119,70 € and never 119,69 €.
    expect(totalsOf([line(3, 3_990)]).totalCents).toBe(11_970)
    expect(totalsOf([line(1, 3_990), line(1, 3_990), line(1, 3_990)]).totalCents).toBe(11_970)
  })

  it('rounds tax per line, not on the sum', () => {
    // Two lines at 19 % where the sum would round the other way. §14 expects
    // the per-line result, and so does every German accounting package.
    const perLine = totalsOf([line(1, 1_005, 19), line(1, 1_005, 19)])

    expect(perLine.taxCents).toBe(191 + 191)
    expect(perLine.totalCents).toBe(2_010 + 382)
  })

  it('leaves tax at zero under §19, which is every line he writes this year', () => {
    expect(totalsOf([line(1, 99_000), line(1, 49_000)])).toEqual({
      netCents: 148_000,
      taxCents: 0,
      totalCents: 148_000,
    })
  })

  it('returns zeroes for no lines rather than throwing', () => {
    expect(totalsOf([])).toEqual({ netCents: 0, taxCents: 0, totalCents: 0 })
  })
})

describe('settlementOf', () => {
  const base = {
    status: 'ISSUED' as InvoiceStatus,
    kind: 'INVOICE' as InvoiceKind,
    dueOn: '2026-10-02',
    totalCents: 148_000,
    paidCents: 0,
    today: '2026-09-18',
  }

  it('reads a draft as a draft, whatever its dates say', () => {
    expect(settlementOf({ ...base, status: 'DRAFT', dueOn: null })).toBe('DRAFT')
  })

  it('is open before the due date and overdue after it', () => {
    expect(settlementOf(base)).toBe('OPEN')
    expect(settlementOf({ ...base, today: '2026-10-03' })).toBe('OVERDUE')
  })

  it('is still open on the due date itself', () => {
    // A client who pays on the last day has paid on time. Off by one here
    // would put a red row on the screen a day early and send a reminder to
    // somebody who did nothing wrong.
    expect(settlementOf({ ...base, today: '2026-10-02' })).toBe('OPEN')
  })

  it('never reads as overdue without a due date', () => {
    // An invoice with no term is unusual but not late, whatever the date.
    expect(settlementOf({ ...base, dueOn: null, today: '2027-01-01' })).toBe('OPEN')
  })

  it('reads a correction as a document, not as a debt', () => {
    /*
     * This case used to come out `OPEN`, which the list drew as "still owed"
     * while the figure above it counted nothing — `getSummary` filters on
     * `kind = 'INVOICE'`. The row and the total disagreed and the row was
     * wrong. Nobody has ever owed money on a cancellation.
     */
    const cancellation = { ...base, kind: 'CANCELLATION' as InvoiceKind, dueOn: null }

    expect(settlementOf(cancellation)).toBe('ISSUED')
    expect(settlementOf({ ...cancellation, today: '2030-01-01' })).toBe('ISSUED')
    expect(settlementOf({ ...base, kind: 'CREDIT_NOTE' as InvoiceKind, dueOn: null })).toBe('ISSUED')
  })

  it('still reads a cancelled correction as cancelled', () => {
    // Status wins over kind: the row is void, and that is the louder fact.
    expect(
      settlementOf({ ...base, kind: 'CANCELLATION' as InvoiceKind, status: 'CANCELLED' }),
    ).toBe('CANCELLED')
  })

  it('separates a deposit from a settled invoice', () => {
    expect(settlementOf({ ...base, paidCents: 59_200 })).toBe('PART')
    expect(settlementOf({ ...base, paidCents: 148_000 })).toBe('PAID')
  })

  it('counts an overpayment as paid rather than as still owed', () => {
    expect(settlementOf({ ...base, paidCents: 150_000, today: '2026-11-01' })).toBe('PAID')
  })

  it('keeps a cancelled invoice out of every other state', () => {
    expect(settlementOf({ ...base, status: 'CANCELLED', today: '2027-01-01' })).toBe('CANCELLED')
  })
})

describe('money on the paper', () => {
  it('writes German and English the way each language does', () => {
    expect(money(148_000, 'de')).toBe('1.480,00 €')
    expect(money(148_000, 'en')).toBe('€1,480.00')
    expect(money(0, 'de')).toBe('0,00 €')
    expect(money(2_450, 'de')).toBe('24,50 €')
  })

  it('groups past a million, where a missing separator is hardest to see', () => {
    expect(money(123_456_789, 'de')).toBe('1.234.567,89 €')
  })
})

describe('epcPayload', () => {
  const seller = {
    name: 'Yaman Warda',
    bic: 'HELADEF1WEM',
    iban: 'DE89 3704 0044 0532 0130 00',
  } as Seller

  it('lays the eleven lines out in the order a banking app reads them', () => {
    const lines = epcPayload({ seller, amountCents: 148_000, reference: 'Rechnung 2026-001' }).split(
      '\n',
    )

    expect(lines).toHaveLength(11)
    expect(lines[0]).toBe('BCD')
    expect(lines[1]).toBe('002')
    expect(lines[3]).toBe('SCT')
    expect(lines[4]).toBe('HELADEF1WEM')
    // The IBAN travels without its spaces, or the app refuses the code.
    expect(lines[6]).toBe('DE89370400440532013000')
    expect(lines[7]).toBe('EUR1480.00')
    // Only the unstructured remittance field is used; the structured one above
    // it must stay empty, because filling both is invalid.
    expect(lines[9]).toBe('')
    expect(lines[10]).toBe('Rechnung 2026-001')
  })

  it('writes the amount with a decimal point, never a comma', () => {
    // The standard is not the German number format, and a comma here is the
    // kind of thing that fails silently in one bank's app and not another's.
    expect(epcPayload({ seller, amountCents: 2_450, reference: 'x' }).split('\n')[7]).toBe(
      'EUR24.50',
    )
  })
})

/**
 * The one combination that must never reach paper.
 *
 * A `Kleinunternehmer` charges no VAT and the invoice says so, in a sentence
 * that is a legal statement. Put a rate on a line anyway and the document says
 * both at once — and under `§14c(2) UStG` the VAT shown is then owed to the
 * Finanzamt regardless of whether it was allowed to be charged.
 *
 * So this is a refusal, not a tidy-up. Dropping the sentence would leave the
 * VAT standing and the liability with it; dropping the VAT would change what
 * he charged. Only he can say which he meant.
 */

describe('vatConflict', () => {
  it('catches a rate on a line while he is a Kleinunternehmer', () => {
    expect(vatConflict([{ taxRate: 19 }], true)).toBe(true)
    expect(vatConflict([{ taxRate: 0 }, { taxRate: 7 }], true)).toBe(true)
  })

  it('allows zero-rated lines, which is every line he writes this year', () => {
    expect(vatConflict([{ taxRate: 0 }, { taxRate: 0 }], true)).toBe(false)
    expect(vatConflict([], true)).toBe(false)
  })

  it('allows any rate once he is no longer a Kleinunternehmer', () => {
    // The day he crosses the threshold, 19 % is correct and this must not
    // stand in the way of it.
    expect(vatConflict([{ taxRate: 19 }], false)).toBe(false)
  })
})

/**
 * One currency, and why it is a refusal rather than a feature.
 *
 * The figures on the front page sum `total_cents` across every row and print
 * one € sign over the answer. Correct for exactly as long as every row is in
 * euros, and silently wrong the moment one is not — a total that adds dollars
 * to euros is the kind of number that cost the last system its trust.
 *
 * A client in America pays in euros too; their card does the conversion. The
 * day that stops being good enough, `THE_CURRENCY` is the thread to pull, and
 * the work is the summary grouping by currency — not a column change.
 */

describe('THE_CURRENCY', () => {
  it('is the euro, and the database agrees', () => {
    expect(THE_CURRENCY).toBe('EUR')
  })

  it('is the sign the paper actually prints', () => {
    // The guard against the one number nobody could trace: the front page
    // says EUR because every row is EUR, not because 'EUR' was typed in.
    expect(money(149_000, 'de', THE_CURRENCY)).toContain('€')
    expect(money(149_000, 'en', THE_CURRENCY)).toContain('€')
  })
})

describe('balanceOf', () => {
  it('takes credit notes off what is owed, exactly as it takes payments', () => {
    expect(balanceOf({ totalCents: 99_000, paidCents: 0, creditedCents: 40_000 })).toEqual({
      owed: 59_000,
      over: 0,
    })
  })

  it('names money that came in twice', () => {
    expect(balanceOf({ totalCents: 99_000, paidCents: 120_000, creditedCents: 0 })).toEqual({
      owed: 0,
      over: 21_000,
    })
  })

  it('names the refund a credit note creates on an invoice already paid', () => {
    expect(balanceOf({ totalCents: 99_000, paidCents: 99_000, creditedCents: 40_000 })).toEqual({
      owed: 0,
      over: 40_000,
    })
  })
})

describe('payLinkUsable', () => {
  const link = {
    payUrl: 'https://buy.stripe.com/test',
    status: 'ISSUED' as InvoiceStatus,
    kind: 'INVOICE' as InvoiceKind,
    totalCents: 99_000,
    paidCents: 0,
    creditedCents: 0,
  }

  it('is usable on an issued invoice nobody has touched', () => {
    expect(payLinkUsable(link)).toBe(true)
  })

  it('is dead the moment anything settles against the invoice', () => {
    /*
     * The link charges the full total, and Stripe is told to switch it off
     * once that is no longer what is owed. The reminder letter used to print
     * it anyway — "pay by card" over a page that says the link is inactive,
     * sent to exactly the client who had paid part of it.
     */
    expect(payLinkUsable({ ...link, paidCents: 10_000 })).toBe(false)
    expect(payLinkUsable({ ...link, creditedCents: 10_000 })).toBe(false)
    expect(payLinkUsable({ ...link, paidCents: 99_000 })).toBe(false)
  })

  it('is dead on a cancelled invoice and on every correction', () => {
    expect(payLinkUsable({ ...link, status: 'CANCELLED' })).toBe(false)
    expect(payLinkUsable({ ...link, kind: 'CREDIT_NOTE' })).toBe(false)
    expect(payLinkUsable({ ...link, kind: 'CANCELLATION' })).toBe(false)
  })

  it('is nothing at all when there is no link', () => {
    expect(payLinkUsable({ ...link, payUrl: null })).toBe(false)
  })
})
