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

/** Pick a language from an Accept-Language header, falling back to German. */
export const languageFromAcceptLanguage = (header: string | null | undefined): Language => {
  if (!header) return defaultLanguage

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

  return defaultLanguage
}
