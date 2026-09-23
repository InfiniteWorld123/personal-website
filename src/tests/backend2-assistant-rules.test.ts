import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { AskSchema, SettingsPatchSchema } from '#/backend2/contracts/assistant.contract'
import { extractiveAnswer, fallbackAnswer, publishedAmounts } from '#/backend2/modules/assistant/assistant.compose'
import {
  type KnowledgeDocument,
  formatEuros,
  priceLineOf,
  richTextToPlain,
} from '#/backend2/modules/assistant/assistant.knowledge'
import { detectLanguage } from '#/backend2/modules/assistant/assistant.language'
import {
  buildPrompt,
  configuredProvider,
  dailyProviderCap,
  dailyQuestionLimit,
  UNKNOWN_TOKEN,
} from '#/backend2/modules/assistant/assistant.provider'
import { indexDocuments, search } from '#/backend2/modules/assistant/assistant.retrieval'
import {
  amountsIn,
  asksAboutPrice,
  asksForContact,
  inventedAmounts,
  isSmalltalk,
} from '#/backend2/modules/assistant/assistant.text'

/**
 * The assistant's rules that need no database: language detection, the money
 * guard, price wording, retrieval thresholds and the provider switches.
 */

describe('language detection', () => {
  it.each([
    ['Was kostet eine Website?', null, 'de'],
    ['Wie lange dauert ein Projekt?', 'en', 'de'],
    ['Können Sie mir helfen?', 'ar', 'de'],
    ['How much does a website cost?', 'de', 'en'],
    ['Do you build online stores?', null, 'en'],
    ['كم سعر الموقع؟', 'de', 'ar'],
    ['مرحبا', 'en', 'ar'],
    ['Shopify?', 'de', 'de'],
    ['Shopify?', 'ar', 'en'],
    ['WordPress', null, 'en'],
  ] as const)('%s (page %s) → %s', (message, page, expected) => {
    expect(detectLanguage(message, page)).toBe(expected)
  })
})

describe('the money guard', () => {
  it('reads amounts however they are written', () => {
    expect(amountsIn('Ab 1.490 € einmalig')).toEqual([1490])
    expect(amountsIn('from €1,490 one-time')).toEqual([1490])
    expect(amountsIn('costs 990,50 EUR')).toEqual([990.5])
    expect(amountsIn('1,490.00 euros')).toEqual([1490])
    expect(amountsIn('السعر ١٬٤٩٠ يورو')).toEqual([1490])
    expect(amountsIn('ابتداءً من 1,490 €')).toEqual([1490])
    expect(amountsIn('In 2026 we built 3 shops.')).toEqual([])
  })

  it('flags any amount the published snippets do not state', () => {
    expect(inventedAmounts('It starts at €1,490.', [1490])).toEqual([])
    expect(inventedAmounts('Only 999 € for you!', [1490])).toEqual([999])
    expect(inventedAmounts('From 1.490 € or 1.290 € with the offer', [1490, 1290])).toEqual([])
    expect(inventedAmounts('No price here.', [])).toEqual([])
  })
})

describe('price wording', () => {
  it('formats euros per language', () => {
    expect(formatEuros(149_000, 'de')).toBe('1.490 €')
    expect(formatEuros(149_000, 'en')).toBe('€1,490')
    expect(formatEuros(149_050, 'ar')).toBe('1,490.50 €')
  })

  it('keeps the published qualifications: from, period, an active offer, a quote', () => {
    expect(
      priceLineOf(
        { mode: 'from', currency: 'EUR', amountCents: 149_000, period: 'monthly', promotion: null },
        'de',
      ),
    ).toBe('Preis: ab 1.490 € pro Monat')
    expect(
      priceLineOf(
        {
          mode: 'fixed',
          currency: 'EUR',
          amountCents: 149_000,
          period: 'one_time',
          promotion: { amountCents: 129_000, label: 'Autumn' },
        },
        'en',
      ),
    ).toBe('Price: €1,490 one-time (Offer – Autumn: €1,290)')
    expect(priceLineOf({ mode: 'quote' }, 'ar')).toBe('السعر: السعر عند الطلب')
    expect(priceLineOf(null, 'en')).toBeNull()
  })
})

describe('rich text as prose', () => {
  it('keeps the words and one line per block, and drops images', () => {
    expect(
      richTextToPlain({
        content: [
          { type: 'heading', content: [{ type: 'text', text: 'Title' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'One ' }, { type: 'text', text: 'two.' }] },
          { type: 'image', attrs: { src: '/x', alt: 'secret alt' } },
          {
            type: 'bulletList',
            content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }] }],
          },
        ],
      }),
    ).toBe('Title\nOne two.\nItem')
    expect(richTextToPlain(null)).toBe('')
  })
})

describe('intents', () => {
  it('recognises price, contact and greeting questions', () => {
    expect(asksAboutPrice('Was kostet das?')).toBe(true)
    expect(asksAboutPrice('What are your prices?')).toBe(true)
    expect(asksAboutPrice('ما هي الأسعار؟')).toBe(true)
    expect(asksAboutPrice('Do you build shops?')).toBe(false)
    expect(asksForContact('How can I contact you?')).toBe(true)
    expect(asksForContact('Ich möchte einen Termin buchen')).toBe(true)
    expect(asksForContact('أريد حجز موعد')).toBe(true)
    expect(isSmalltalk('Hallo!')).toBe(true)
    expect(isSmalltalk('thank you')).toBe(true)
    expect(isSmalltalk('مرحبا')).toBe(true)
    expect(isSmalltalk('Hello, what does a shop cost?')).toBe(false)
  })
})

const documentOf = (over: Partial<KnowledgeDocument>): KnowledgeDocument => ({
  id: 'x',
  kind: 'page',
  language: 'en',
  title: 'Title',
  url: '/en',
  text: '',
  priceLine: null,
  amounts: [],
  ...over,
})

const corpus = [
  documentOf({
    id: 'service:shop',
    kind: 'service',
    title: 'Online store',
    url: '/en/services#shop',
    text: 'An online store with products, checkout and payment providers.\nPrice: from €2,490 one-time',
    priceLine: 'Price: from €2,490 one-time',
    amounts: [2490],
  }),
  documentOf({
    id: 'service:website',
    kind: 'service',
    title: 'Website',
    url: '/en/services#website',
    text: 'A clear website that explains your offer.\nPrice: from €1,490 one-time',
    priceLine: 'Price: from €1,490 one-time',
    amounts: [1490],
  }),
  documentOf({
    id: 'post:narwhal',
    kind: 'post',
    title: 'All about narwhal',
    url: '/en/blog/narwhal',
    text: 'A short guide to narwhal.\nThe narwhal method explained step by step.',
  }),
]

describe('retrieval', () => {
  const index = indexDocuments(corpus)

  it('finds the matching service and quotes its published sentence', () => {
    const hits = search(index, 'Do you build online stores with checkout?', 'en')

    expect(hits[0]?.document.id).toBe('service:shop')
    expect(hits[0]?.snippet).toContain('checkout')
  })

  it('answers a bare price question from every published price', () => {
    const hits = search(index, 'What are your prices?', 'en', { priceIntent: true })

    expect(hits.map((hit) => hit.document.id).sort()).toEqual(['service:shop', 'service:website'])
  })

  it('does not answer a question about something the site never mentions', () => {
    expect(search(index, 'Do you have a guide about the walrus method?', 'en')).toEqual([])
    expect(search(index, 'What is the capital city of Mongolia?', 'en')).toEqual([])
    expect(search(index, 'the and of', 'en')).toEqual([])
  })

  it('composes the published wording, price line and links; the fallback has no sources', () => {
    const hits = search(index, 'How much is a website?', 'en', { priceIntent: true })
    const answer = extractiveAnswer({ hits, language: 'en', priceIntent: true, contactIntent: false })

    expect(answer.text).toContain('Price: from €1,490 one-time')
    expect(answer.sources[0]).toEqual({ kind: 'service', title: 'Website', url: '/en/services#website' })
    expect(answer.links.map((link) => link.url)).toEqual(['/en/contact', '/en/booking'])
    expect(publishedAmounts(hits)).toContain(1490)

    expect(fallbackAnswer('de')).toMatchObject({ outcome: 'fallback', sources: [], language: 'de' })
  })
})

describe('the provider switches', () => {
  it('is off unless named, and calls nothing until a daily allowance is set', () => {
    expect(configuredProvider({})).toBe('none')
    expect(configuredProvider({ ASSISTANT_PROVIDER: 'openai' })).toBe('none')
    expect(configuredProvider({ ASSISTANT_PROVIDER: 'workers-ai' })).toBe('workers-ai')
    expect(dailyProviderCap({})).toBe(0)
    expect(dailyProviderCap({ ASSISTANT_DAILY_PROVIDER_CALLS: '-5' })).toBe(0)
    expect(dailyProviderCap({ ASSISTANT_DAILY_PROVIDER_CALLS: 'lots' })).toBe(0)
    expect(dailyProviderCap({ ASSISTANT_DAILY_PROVIDER_CALLS: '40' })).toBe(40)
    expect(dailyQuestionLimit({})).toBe(500)
  })

  it('hands the model only the snippets and tells it how to say "not in these"', () => {
    const prompt = buildPrompt({
      question: 'How much?',
      language: 'de',
      snippets: [{ title: 'Website', text: 'Preis: ab 1.490 € einmalig' }],
    })

    expect(prompt.system).toContain(UNKNOWN_TOKEN)
    expect(prompt.system).toContain('Deutsch')
    expect(prompt.user).toContain('[1] Website\nPreis: ab 1.490 € einmalig')
    expect(prompt.user.endsWith('How much?')).toBe(true)
  })
})

describe('the contract', () => {
  it('trims a question, refuses an empty or oversized one, and checks the handle', () => {
    expect(v.parse(AskSchema, { message: '  Hi\r\n  ' }).message).toBe('Hi')
    expect(v.safeParse(AskSchema, { message: '   ' }).success).toBe(false)
    expect(v.safeParse(AskSchema, { message: 'x'.repeat(1001) }).success).toBe(false)
    expect(v.safeParse(AskSchema, { message: 'Hi', conversationId: 'short' }).success).toBe(false)
    expect(v.safeParse(AskSchema, { message: 'Hi', locale: 'fr' }).success).toBe(false)
  })

  it('needs a number of days for automatic deletion', () => {
    expect(v.safeParse(SettingsPatchSchema, { retentionMode: 'days' }).success).toBe(false)
    expect(v.safeParse(SettingsPatchSchema, { retentionMode: 'days', retentionDays: 0 }).success).toBe(false)
    expect(v.safeParse(SettingsPatchSchema, { retentionMode: 'days', retentionDays: 90 }).success).toBe(true)
    expect(v.safeParse(SettingsPatchSchema, { retentionMode: 'manual' }).success).toBe(true)
  })
})
