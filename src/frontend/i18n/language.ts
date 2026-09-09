export const languages = ['de', 'en', 'ar'] as const

export type Language = (typeof languages)[number]

export const defaultLanguage: Language = 'de'

/**
 * Cookie that remembers the visitor's last chosen language. Read only by the
 * `/` redirect; every other page takes its language from the URL.
 */
export const LANGUAGE_COOKIE = 'lang'

export const rtlLanguages: readonly Language[] = ['ar']

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (languages as readonly string[]).includes(value)

export const directionFor = (language: Language): 'rtl' | 'ltr' =>
  rtlLanguages.includes(language) ? 'rtl' : 'ltr'

/** BCP 47 locale for `<html lang>`, Open Graph, and structured data. */
export const localeFor = (language: Language) =>
  ({ de: 'de-DE', en: 'en-GB', ar: 'ar' })[language]

/**
 * Public pages live under `/de`, `/en`, `/ar`. Anything else (admin, api,
 * the bare root) has no language segment.
 */
export const languageFromPathname = (pathname: string): Language | null => {
  const [first] = pathname.split('/').filter(Boolean)
  return isLanguage(first) ? first : null
}

/** Swap the language segment of a public path, keeping the rest of the URL. */
export const withLanguage = (pathname: string, language: Language) => {
  const segments = pathname.split('/').filter(Boolean)

  if (isLanguage(segments[0])) segments[0] = language
  else segments.unshift(language)

  return `/${segments.join('/')}`
}

/** Countries whose visitors are served German first. */
const GERMAN_SPEAKING = new Set(['DE', 'AT', 'CH', 'LI'])

/** Arab League members, where Arabic is the safer first guess than English. */
const ARABIC_SPEAKING = new Set([
  'SY', 'IQ', 'LB', 'JO', 'PS', 'EG', 'SA', 'AE', 'KW', 'QA', 'BH',
  'OM', 'YE', 'LY', 'TN', 'DZ', 'MA', 'SD', 'MR', 'SO', 'DJ', 'KM',
])

/**
 * Language for a visitor's country, used only when the browser sent no
 * language we publish. Returns null for the rest of the world so the caller
 * can fall back to English rather than guessing.
 */
export const languageFromCountry = (country: string | null | undefined): Language | null => {
  if (!country) return null

  const code = country.trim().toUpperCase()
  if (GERMAN_SPEAKING.has(code)) return 'de'
  if (ARABIC_SPEAKING.has(code)) return 'ar'

  return null
}

/**
 * Pick a language from an Accept-Language header. Returns null when the header
 * names no language this site publishes, so the caller can try the country next.
 */
export const languageFromAcceptLanguage = (header: string | null | undefined): Language | null => {
  if (!header) return null

  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';')
      const quality = params
        .map((param) => param.trim())
        .find((param) => param.startsWith('q='))
      const q = quality ? Number.parseFloat(quality.slice(2)) : 1

      return { tag: (tag ?? '').toLowerCase(), q: Number.isNaN(q) ? 0 : q, index }
    })
    .sort((a, b) => b.q - a.q || a.index - b.index)

  for (const { tag } of ranked) {
    const base = tag.split('-')[0]
    if (isLanguage(base)) return base
  }

  return null
}
