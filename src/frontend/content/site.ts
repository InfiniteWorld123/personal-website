import type { ServiceSlug } from './types'

/** Language-independent facts about the site and its owner. */
export const site = {
  name: 'Yaman Warda',
  url: 'https://yamanwarda.de',
  email: 'info@yamanwarda.de',
  /**
   * Empty until the owner fills it in from `/admin/content`. Every place that
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
   * covered by a published service or by a project in the registry below;
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

export type ProjectStatus = 'live' | 'building'

/**
 * One screenshot of a project. Captured from the live deployment, so the
 * dimensions are the real file's. Alternative text is translated because it
 * carries the proof for anyone who cannot see the image.
 */
export type ProjectImage = {
  src: string
  width: number
  height: number
  alt: Record<'de' | 'en' | 'ar', string>
}

export type ProjectFacts = {
  slug: string
  status: ProjectStatus
  website?: string
  source?: string
  stack: string[]
  /** First entry is the card's lead image; the rest fill the detail gallery. */
  images?: ProjectImage[]
}

export const projects = {
  'prime-estate': {
    slug: 'prime-estate',
    status: 'building',
    stack: ['TanStack Start', 'Elysia', 'PostgreSQL', 'TypeScript'],
  },
  'tech-store': {
    slug: 'tech-store',
    status: 'live',
    website: 'https://tech-store.yamanwarda.dev',
    source: 'https://github.com/InfiniteWorld123/tech-store',
    stack: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Stripe'],
    images: [
      {
        src: '/images/work/tech-store/catalog.jpg',
        width: 1600,
        height: 1000,
        alt: {
          de: 'Katalog des Tech Store: 500 Produkte mit Filtern für Kategorie, Farbe, Speicher und Arbeitsspeicher.',
          en: 'Tech Store catalogue: 500 products with filters for category, colour, storage, and memory.',
          ar: 'كتالوج Tech Store: ٥٠٠ منتج مع فلاتر للفئة واللون والسعة والذاكرة.',
        },
      },
      {
        src: '/images/work/tech-store/home.jpg',
        width: 1600,
        height: 1000,
        alt: {
          de: 'Startseite des Tech Store mit Hero-Bereich und ausgewählten Produkten.',
          en: 'Tech Store home page with the hero section and featured products.',
          ar: 'الصفحة الرئيسية لـ Tech Store مع القسم الافتتاحي والمنتجات المختارة.',
        },
      },
      {
        src: '/images/work/tech-store/categories.jpg',
        width: 1600,
        height: 1000,
        alt: {
          de: 'Kategorieübersicht des Tech Store mit zehn Kategorien und dem Footer mit Widerruf, Rücksendung und Versand.',
          en: 'Tech Store category overview with ten categories and the footer carrying withdrawal, returns, and shipping pages.',
          ar: 'نظرة عامة على فئات Tech Store مع عشر فئات وتذييل يحتوي صفحات الإرجاع والاسترداد والشحن.',
        },
      },
      {
        src: '/images/work/tech-store/mobile.jpg',
        width: 360,
        height: 780,
        alt: {
          de: 'Der Tech Store auf einem Handy-Bildschirm.',
          en: 'The Tech Store on a phone screen.',
          ar: 'متجر Tech Store على شاشة هاتف.',
        },
      },
    ],
  },
  inknest: {
    slug: 'inknest',
    status: 'live',
    website: 'https://ink-nest.yamanwarda.dev',
    source: 'https://github.com/InfiniteWorld123/inknest',
    stack: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
    images: [
      {
        src: '/images/work/inknest/discover.jpg',
        width: 1600,
        height: 977,
        alt: {
          de: 'Entdecken-Seite von InkNest: Suche, Kategorie- und Schlagwortfilter über 106 veröffentlichte Beiträge.',
          en: 'InkNest discover page: search plus category and tag filters across 106 published stories.',
          ar: 'صفحة الاستكشاف في InkNest: بحث وفلاتر للفئات والوسوم عبر ١٠٦ مقالة منشورة.',
        },
      },
      {
        src: '/images/work/inknest/home.jpg',
        width: 1600,
        height: 1000,
        alt: {
          de: 'Startseite von InkNest mit dem Editor- und Veröffentlichungsangebot.',
          en: 'InkNest home page with the editor and publishing pitch.',
          ar: 'الصفحة الرئيسية لـ InkNest مع عرض المحرّر والنشر.',
        },
      },
      {
        src: '/images/work/inknest/mobile.jpg',
        width: 360,
        height: 780,
        alt: {
          de: 'InkNest auf einem Handy-Bildschirm.',
          en: 'InkNest on a phone screen.',
          ar: 'InkNest على شاشة هاتف.',
        },
      },
    ],
  },
} satisfies Record<string, ProjectFacts>

export const projectOrder = Object.keys(projects) as Array<keyof typeof projects>

export const isProjectSlug = (value: string): value is keyof typeof projects =>
  Object.hasOwn(projects, value)
