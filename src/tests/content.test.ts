import { describe, expect, it } from 'vitest'
import { content, serviceOrder, servicePrices } from '#/frontend/content'
import {
  languages,
  languageFromAcceptLanguage,
  languageFromCountry,
  languageFromPathname,
  withLanguage,
} from '#/frontend/i18n/language'
import { formatEuro } from '#/frontend/lib/format'

describe('site content', () => {
  it('ships every language with the same navigation and services', () => {
    for (const language of languages) {
      const copy = content[language]

      expect(copy.shell.nav.map((item) => item.to)).toEqual([
        '/$lang/services',
        '/$lang/work',
        '/$lang/blog',
        '/$lang/about',
        '/$lang/contact',
      ])
      expect(Object.keys(copy.services.items).sort()).toEqual([...serviceOrder].sort())
      expect(copy.home.process.steps).toHaveLength(4)
    }
  })

  it('answers the same questions in every language', () => {
    const shape = (language: (typeof languages)[number]) =>
      content[language].faq.groups.map((group) => group.items.length)

    for (const language of languages) {
      expect(shape(language)).toEqual(shape('de'))
      expect(content[language].faq.groups.length).toBeGreaterThan(0)

      for (const group of content[language].faq.groups) {
        for (const item of group.items) {
          expect(item.question.length).toBeGreaterThan(0)
          expect(item.answer.length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('keeps the footer-only pages out of the header nav', () => {
    for (const language of languages) {
      const { nav, footer } = content[language].shell
      const navPaths = nav.map((item) => item.to)
      const morePaths = footer.more.map((item) => item.to)

      for (const path of ['/$lang/faq', '/$lang/stack']) {
        expect(navPaths).not.toContain(path)
        expect(morePaths).toContain(path)
      }
    }
  })

  it('carries the legally required pages in every language', () => {
    for (const language of languages) {
      const legalPaths = content[language].shell.footer.legal.map((item) => item.to)
      expect(legalPaths).toEqual(['/$lang/impressum', '/$lang/datenschutz'])

      for (const document of ['impressum', 'privacy'] as const) {
        const copy = content[language].legal[document]
        expect(copy.sections.length).toBeGreaterThan(0)
        // Every section says something: a paragraph or a list, never neither.
        for (const section of copy.sections) {
          expect(section.body ?? section.lines?.join('')).toBeTruthy()
        }
      }

      // The address is a fact, not copy: it must not drift between languages.
      expect(content[language].legal.impressum.sections[0]?.lines).toEqual(
        expect.arrayContaining(['Mhd Yaman Warda', 'Warschauer Str. 9', '99089 Erfurt']),
      )
    }
  })

  it('states the published starting prices from docs/services', () => {
    expect(servicePrices).toEqual({ websites: 990, shopify: 2490, software: 2990 })
    expect(content.de.services.items.websites.price).toBe('ab 990 €')
    expect(content.en.services.items.shopify.price).toBe('from €2,490')
    expect(content.ar.services.items.software.price).toBe('من 2.990 €')
  })
})

describe('language helpers', () => {
  it('reads and swaps the language segment of public paths', () => {
    expect(languageFromPathname('/ar/services')).toBe('ar')
    expect(languageFromPathname('/dashboard')).toBeNull()
    expect(withLanguage('/de/work/inknest', 'en')).toBe('/en/work/inknest')
    expect(withLanguage('/', 'ar')).toBe('/ar')
  })

  it('picks the best supported language from Accept-Language', () => {
    expect(languageFromAcceptLanguage('ar-SY,ar;q=0.9,en;q=0.8')).toBe('ar')
    expect(languageFromAcceptLanguage('fr-FR,fr;q=0.9,en-US;q=0.8')).toBe('en')
  })

  it('says nothing when the browser asks for a language the site does not publish', () => {
    expect(languageFromAcceptLanguage('fr')).toBeNull()
    expect(languageFromAcceptLanguage(null)).toBeNull()
  })

  it('falls back to the visitor country, and only for the languages it can serve', () => {
    expect(languageFromCountry('DE')).toBe('de')
    expect(languageFromCountry('at')).toBe('de')
    expect(languageFromCountry('SY')).toBe('ar')
    expect(languageFromCountry('AE')).toBe('ar')
    expect(languageFromCountry('US')).toBeNull()
    expect(languageFromCountry(null)).toBeNull()
  })

  it('formats euro amounts the way each language writes them', () => {
    expect(formatEuro(990, 'de')).toBe('990\u00a0€')
    expect(formatEuro(2490, 'en')).toBe('€2,490')
    expect(formatEuro(2990, 'ar')).toBe('2.990\u00a0€')
  })
})
