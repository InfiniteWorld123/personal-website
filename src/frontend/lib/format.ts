import type { Language } from '#/frontend/i18n/language'

/**
 * Euro amounts as the site writes them: `990 €` in German and Arabic,
 * `€990` in English. Arabic uses Western digits on this site, matching the
 * copy in `content/ar.ts`.
 */
export const formatEuro = (amount: number, language: Language) => {
  const locale = language === 'en' ? 'en-GB' : 'de-DE'

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * A publication date as the reader's language writes it. The stored value is
 * a plain day (`2026-09-12`), so it is read back in UTC: parsing it as local
 * time would show the day before to anyone west of Greenwich.
 */
export const formatPostDate = (day: string, language: Language) => {
  const locale = { de: 'de-DE', en: 'en-GB', ar: 'ar' }[language]

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
    // The Arabic copy on this site uses Western digits throughout.
    numberingSystem: 'latn',
  }).format(new Date(`${day}T00:00:00.000Z`))
}
