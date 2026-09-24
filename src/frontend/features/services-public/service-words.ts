import type { Language } from '#/frontend/i18n/language'

/**
 * The public site's new words around Backend2 services, approved with the
 * Services Design Lab on 22 Sep 2026 (`docs/v2/services.md`, choices 1A–6A).
 * The price words themselves live in `features/services/service-display.ts`,
 * shared with the Dashboard preview; everything else on these pages is the
 * site's existing copy.
 */
export const SERVICE_WORDS: Record<
  Language,
  {
    /** The link beside the homepage heading, and back from a service page. */
    all: string
    loadMore: string
    /** `/services` when nothing is published. */
    empty: string
    /** `/services` when the list could not be read. */
    error: string
    retry: string
  }
> = {
  de: {
    all: 'Alle Leistungen',
    loadMore: 'Mehr Leistungen laden',
    empty: 'Die Leistungen werden gerade überarbeitet. Schreib mir gern direkt — ich melde mich.',
    error: 'Die Leistungen konnten gerade nicht geladen werden.',
    retry: 'Erneut versuchen',
  },
  en: {
    all: 'All services',
    loadMore: 'Load more services',
    empty: 'The services are being updated. Write to me directly — I will get back to you.',
    error: 'The services could not be loaded just now.',
    retry: 'Try again',
  },
  ar: {
    all: 'كل الخدمات',
    loadMore: 'حمّل مزيداً من الخدمات',
    empty: 'يتم تحديث الخدمات حاليًا. راسلني مباشرة وسأرد عليك.',
    error: 'تعذّر تحميل الخدمات الآن.',
    retry: 'حاول مرة أخرى',
  },
}

/** Six per batch on `/services`, like `/work`; the homepage shows up to six stars (choice 1A). */
export const SERVICE_BATCH_SIZE = 6
export const HOME_SERVICE_LIMIT = 6

/** The tile on a homepage card: the first letter of the service's name (choice 2A). */
export const initialOf = (name: string, language: Language): string => {
  const first = [...name.trim()][0]

  return first ? first.toLocaleUpperCase(language) : '·'
}
