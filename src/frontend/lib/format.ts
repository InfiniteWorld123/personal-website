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
