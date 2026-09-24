import type { ServiceSlug } from './types'

/** Language-independent facts about the site and its owner. */
export const site = {
  name: 'Yaman Warda',
  url: 'https://yamanwarda.de',
  email: 'info@yamanwarda.de',
  /**
   * Empty until the owner fills it in from the Dashboard's Content editor. Every place that
   * shows it checks first, so an unset number is absent rather than blank.
   */
  phone: '',
  city: 'Erfurt',
  country: 'DE',
  github: 'https://github.com/InfiniteWorld123',
  linkedin: 'https://linkedin.com/in/yaman-warda',
  /** Transparent cutout of the studio portrait; shown in front of the blob. */
  heroPortrait: '/images/yaman-cutout.png',
  /**
   * Subjects claimed in the `Person` node's `knowsAbout`. Every entry is
   * covered by a published service or by a published project;
   * nothing is listed here that the site cannot back up.
   */
  knowsAbout: [
    'Web development',
    'TypeScript',
    'React',
    'Node.js',
    'PostgreSQL',
    'E-commerce',
    'Shopify',
    'Stripe payments',
    'Custom business software',
  ],
} as const

/**
 * Published starting prices. Owned by `docs/services/README.md`; every
 * language renders these same numbers.
 */
export const serviceOrder: ServiceSlug[] = ['software', 'websites', 'shopify']

export const servicePrices: Record<ServiceSlug, number> = {
  websites: 990,
  shopify: 2490,
  software: 2990,
}
