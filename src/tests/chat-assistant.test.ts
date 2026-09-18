import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('#/shared/env', () => ({
  env: {
    APP_NAME: 'Yaman Warda',
    CHAT_PROVIDER: 'google',
    CHAT_API_KEY: 'a-local-key-for-the-test',
    CHAT_MODEL: 'a-model',
  },
}))

import { servicePrices } from '#/frontend/content/site'
import { getKnowledge, priceSentence } from '#/backend/modules/chat/chat.knowledge'
import { compose } from '#/backend/modules/chat/chat.provider'
import {
  amountsIn,
  assertNoInventedMoney,
  InventedMoneyError,
  search,
  shapeTone,
} from '#/backend/modules/chat/chat.retrieval'

/**
 * The guards that stand between a rented model and a sentence a stranger
 * reads as the owner's promise (D34).
 *
 * These are the tests that matter. The widget can look wrong and someone
 * notices; a wrong number in an answer is read once, believed, and never
 * reported.
 */

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the book', () => {
  it('carries the published questions in all three languages', () => {
    for (const language of ['de', 'en', 'ar'] as const) {
      const book = getKnowledge(language)

      expect(book).toHaveLength(8)
      expect(book.every((entry) => entry.question.length > 0 && entry.answer.length > 0)).toBe(true)
    }
  })

  it('gives the same entry the same key in every language', () => {
    const keys = (language: 'de' | 'en' | 'ar') => getKnowledge(language).map((entry) => entry.key)

    expect(keys('en')).toEqual(keys('de'))
    expect(keys('ar')).toEqual(keys('de'))
  })
})

describe('the closed book', () => {
  it('finds the entry a visitor is asking about', () => {
    const [best] = search('Wie startet ein Projekt?', 'de')

    expect(best?.entry.key).toBe('faq.start')
  })

  it('reaches the price entry from the word a visitor actually types', () => {
    // The published question asks *why* prices say "ab". Nobody types that.
    const [best] = search('Was kostet eine Website?', 'de')

    expect(best?.entry.key).toBe('faq.price-from')
  })

  it('reads Arabic written without its diacritics or hamza', () => {
    // A visitor types `اسعار`; the site publishes `أسعار`. Without the
    // normalisation in `normalise`, the Arabic assistant knows nothing.
    const [best] = search('كم اسعار الموقع', 'ar')

    expect(best?.entry.key).toBe('faq.price-from')
  })

  /**
   * The first guard, and the whole reason the assistant cannot invent: when
   * this returns nothing, the service never calls a provider at all.
   */
  it('returns nothing for a question the book does not answer', () => {
    expect(search('Entwirfst du auch Logos und Visitenkarten?', 'de')).toEqual([])
    expect(search('Can you repair my laptop screen?', 'en')).toEqual([])
    expect(search('هل تصلح لي شاشة الحاسوب؟', 'ar')).toEqual([])
  })

  /**
   * One cue is enough, and that is the design rather than an accident.
   *
   * A cue is a word the owner wrote into `CUES` specifically to route a
   * question to one entry, so a single one carries a deliberate decision — and
   * an entry reached this way still only ever repeats what the site publishes.
   * Recorded as a test because it is the loosest the threshold ever gets, and
   * the place to look first if the assistant is ever confidently off-topic.
   */
  it('lets a single deliberate cue reach its entry', () => {
    const [best] = search('Do you sell hosting?', 'en')

    expect(best?.entry.key).toBe('faq.accounts-and-costs')
  })

  it('is not fooled into a match by common words alone', () => {
    // Every entry contains "und", "das", "ist". A threshold that counted them
    // would answer this confidently from whichever entry sorted first.
    expect(search('und das ist wie der die das', 'de')).toEqual([])
  })
})

describe('the money guard', () => {
  it('reads an amount however it was written', () => {
    expect(amountsIn('ab 990 €')).toEqual([990])
    expect(amountsIn('€990 for the build')).toEqual([990])
    expect(amountsIn('1.490 EUR netto')).toEqual([1490])
    expect(amountsIn('تبدأ من 990 يورو')).toEqual([990])
  })

  it('accepts the figures the site itself publishes', () => {
    for (const amount of Object.values(servicePrices)) {
      expect(() => assertNoInventedMoney(`Das kostet ab ${amount} €.`)).not.toThrow()
    }
  })

  /**
   * The failure this exists for. The owner's real pricing has a build price,
   * an instalment, three monthly tiers and a technical surcharge; a model that
   * has read three of those will produce a fourth that sounds right.
   */
  it('throws away an answer that names a figure nobody published', () => {
    expect(() => assertNoInventedMoney('Für dich mache ich das für 750 €.')).toThrow(
      InventedMoneyError,
    )
  })

  it('catches a German thousands separator, which is where a naive check fails', () => {
    expect(() => assertNoInventedMoney('Der Shop kostet 1.890 EUR.')).toThrow(InventedMoneyError)
  })

  it('passes its own guard on the sentence it is allowed to say', () => {
    for (const language of ['de', 'en', 'ar'] as const) {
      expect(() => assertNoInventedMoney(priceSentence(language))).not.toThrow()
    }
  })
})

describe('the rented brain', () => {
  const entries = getKnowledge('de').slice(0, 1)

  it('answers from the book when the provider refuses', async () => {
    // A free tier says 429 on a busy afternoon. That is an ordinary event, and
    // the visitor must not see it.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('rate limited', { status: 429 })),
    )

    const { reply, producedBy } = await compose({
      question: 'Wie startet ein Projekt?',
      entries,
      language: 'de',
    })

    expect(reply).toBe(entries[0]!.answer)
    expect(producedBy).toBe('google:fell-back')
  })

  it('answers from the book when the provider invents a price', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              candidates: [{ content: { parts: [{ text: 'Das mache ich für 750 €.' }] } }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    )

    const { reply, producedBy } = await compose({
      question: 'Was kostet das?',
      entries,
      language: 'de',
    })

    expect(reply).toBe(entries[0]!.answer)
    expect(producedBy).toBe('google:fell-back')
  })

  it('answers from the book when the provider changes a field name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ output: 'something in a shape we did not expect' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    )

    const { producedBy } = await compose({ question: 'Wie lange?', entries, language: 'de' })

    expect(producedBy).toBe('google:fell-back')
  })
})

describe('tone', () => {
  it('leaves the published wording alone when formal', () => {
    expect(shapeTone('Erster Satz. Zweiter Satz.', 'formal', 'de')).toBe(
      'Erster Satz. Zweiter Satz.',
    )
  })

  it('cuts to the first sentence when terse', () => {
    expect(shapeTone('Erster Satz. Zweiter Satz.', 'terse', 'de')).toBe('Erster Satz.')
  })

  it('cuts at the Arabic question mark, which is a different character', () => {
    expect(shapeTone('نعم؟ ثم لا.', 'terse', 'ar')).toBe('نعم؟')
  })
})
