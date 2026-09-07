export const languages = ['de', 'en', 'ar'] as const

export type Language = (typeof languages)[number]

export const defaultLanguage: Language = 'de'

/** Storage key is shared with the SSR inline script in __root.tsx. */
export const LANGUAGE_STORAGE_KEY = 'portfolio-language'

export const rtlLanguages: readonly Language[] = ['ar']

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (languages as readonly string[]).includes(value)

export const directionFor = (language: Language): 'rtl' | 'ltr' =>
  rtlLanguages.includes(language) ? 'rtl' : 'ltr'
