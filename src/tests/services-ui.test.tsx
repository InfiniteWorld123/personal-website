// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { emptyServiceDraft, publicPriceOf, publishBlockers } from '#/backend2/contracts/service.contract'
import { formatCents, parseServiceBody, priceParts } from '#/frontend/features/services/service-display'
import {
  blockerTarget,
  emptyFormValues,
  fieldErrors,
  parseAmount,
  priceSummary,
  toDraft,
  toFormValues,
} from '#/frontend/features/services/service-form'
import { PriceText, StateBadge } from '#/frontend/pages/dashboard/services/service-parts'

/**
 * The Services screens' own rules: how the owner's typing becomes a draft,
 * and how a price reads to a visitor in each language — the words approved
 * with the Design Lab on 22 Sep 2026.
 */

afterEach(cleanup)

describe('typing a price', () => {
  it('reads euros and cents the way the owner writes them', () => {
    expect(parseAmount('990')).toEqual({ cents: 99000 })
    expect(parseAmount('49,90')).toEqual({ cents: 4990 })
    expect(parseAmount('49.9')).toEqual({ cents: 4990 })
    expect(parseAmount(' 1490 € ')).toEqual({ cents: 149000 })
    expect(parseAmount('')).toEqual({ cents: null })
  })

  it('names what is wrong instead of guessing', () => {
    // "1.490" is German for 1490 — or 1.49. Refused rather than guessed.
    expect(parseAmount('1.490').error).toBe('Write the price like 990 or 49,90')
    expect(parseAmount('0').error).toBe('A price must be more than 0 €')
    expect(parseAmount('abc').error).toBeDefined()
  })
})

describe('the form and the draft', () => {
  it('goes there and back without losing anything', () => {
    const draft = emptyServiceDraft()

    draft.slug = 'websites'
    draft.price = { mode: 'from', amountCents: 4990, period: 'monthly', promotion: { active: true, amountCents: 3990 } }
    draft.texts.de = { ...draft.texts.de, name: 'Websites', included: ['Hosting'] }

    expect(toDraft(toFormValues(draft))).toEqual(draft)
  })

  it('trims, drops blank lines and clears the number from a price on request', () => {
    const values = emptyFormValues()

    values.slug = ' websites '
    values.mode = 'quote'
    values.amount = '990'
    values.promoOn = true
    values.texts.en.included = ['  Hosting ', '', '   ']

    const draft = toDraft(values)

    expect(draft.slug).toBe('websites')
    expect(draft.texts.en.included).toEqual(['Hosting'])
    expect(draft.price).toEqual({ mode: 'quote', amountCents: null, period: null, promotion: { active: false, amountCents: null } })
  })

  it('flags shape only — an unfinished draft still saves', () => {
    const values = emptyFormValues()

    expect(fieldErrors(values)).toEqual({})

    values.slug = 'Not Valid'
    values.mode = 'fixed'
    values.amount = '12,345'

    expect(Object.keys(fieldErrors(values))).toEqual(['slug', 'amount'])
  })

  it('points each checklist sentence at its field', () => {
    for (const sentence of publishBlockers(toDraft(emptyFormValues()))) {
      expect(blockerTarget(sentence), sentence).not.toBeNull()
    }

    expect(blockerTarget('AR: the name is empty')).toEqual({ id: 'service-ar-name', language: 'ar' })
  })

  it('summarises a price for the owner in English', () => {
    expect(priceSummary({ mode: 'from', amountCents: 99000, period: 'one_time', promotion: { active: false, amountCents: null } })).toBe(
      'From €990 · one-time',
    )
    expect(priceSummary({ mode: 'quote', amountCents: null, period: null, promotion: { active: false, amountCents: null } })).toBe('On request')
    expect(priceSummary({ mode: null, amountCents: null, period: null, promotion: { active: false, amountCents: null } })).toBe('Price not set')
  })
})

describe('a price as a visitor reads it', () => {
  const from = publicPriceOf({ mode: 'from', amountCents: 99000, period: 'one_time', promotion: { active: false, amountCents: null } }, '')!
  const monthlyOffer = publicPriceOf(
    { mode: 'fixed', amountCents: 4900, period: 'monthly', promotion: { active: true, amountCents: 3900 } },
    'Startangebot',
  )!

  it('writes euros as the site does in each language', () => {
    expect(formatCents(99000, 'de')).toBe('990 €')
    expect(formatCents(99000, 'en')).toBe('€990')
    expect(formatCents(4990, 'ar')).toBe('49,90 €')
  })

  it('uses the approved words', () => {
    expect(priceParts(from, 'de')).toMatchObject({ lead: 'ab', caption: 'einmalig', period: null })
    expect(priceParts(from, 'ar')).toMatchObject({ lead: 'من', caption: 'دفعة واحدة' })
    expect(priceParts(monthlyOffer, 'en')).toMatchObject({ regular: '€49', amount: '€39', period: '/ month', label: 'Startangebot' })
    expect(priceParts({ mode: 'quote' }, 'de').amount).toBe('Preis auf Anfrage')
  })

  it('shows "einmalig" only where asked — the service page', () => {
    const { rerender } = render(<PriceText price={from} language="de" />)

    expect(screen.queryByText('einmalig')).toBeNull()

    rerender(<PriceText price={from} language="de" withCaption />)
    expect(screen.getByText('einmalig')).toBeTruthy()
  })

  it('says so when the price is not finished, instead of inventing one', () => {
    render(<PriceText price={null} language="de" />)

    expect(screen.getByText('Price not finished yet')).toBeTruthy()
  })

  it('never shows an offer that is off or not lower', () => {
    expect(publicPriceOf({ mode: 'fixed', amountCents: 4900, period: 'monthly', promotion: { active: false, amountCents: 3900 } }, 'x')!).toMatchObject({ promotion: null })
    expect(publicPriceOf({ mode: 'fixed', amountCents: 4900, period: 'monthly', promotion: { active: true, amountCents: 4900 } }, 'x')!).toMatchObject({ promotion: null })
  })
})

describe('the longer description', () => {
  it('turns plain text into paragraphs, lists and small headings', () => {
    const blocks = parseServiceBody('Erster Absatz.\nNoch ein Satz.\n\nPasst, wenn du:\n- A\n- B\n\nZum Preis:\nDer Startpreis.')

    expect(blocks).toEqual([
      { type: 'p', text: 'Erster Absatz. Noch ein Satz.' },
      { type: 'h', text: 'Passt, wenn du' },
      { type: 'ul', items: ['A', 'B'] },
      { type: 'h', text: 'Zum Preis' },
      { type: 'p', text: 'Der Startpreis.' },
    ])
  })

  it('does not make a heading of a sentence that merely ends in a colon mid-paragraph', () => {
    expect(parseServiceBody('Ein Satz.\nUnd dann:')).toEqual([{ type: 'p', text: 'Ein Satz. Und dann:' }])
  })
})

describe('the state words', () => {
  it('says "Live · edited" for saved changes that are not published', () => {
    render(<StateBadge state="published_with_pending_changes" />)

    expect(screen.getByText('Live · edited')).toBeTruthy()
  })
})
