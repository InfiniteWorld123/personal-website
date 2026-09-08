import type { ServiceSlug } from './types'

/** Language-independent facts about the site and its owner. */
export const site = {
  name: 'Yaman Warda',
  url: 'https://yamanwarda.dev',
  email: 'yamanwarda06@gmail.com',
  city: 'Erfurt',
  country: 'DE',
  github: 'https://github.com/InfiniteWorld123',
  linkedin: 'https://linkedin.com/in/yaman-warda',
  /** Transparent cutout of the studio portrait; shown in front of the blob. */
  heroPortrait: '/images/yaman-cutout.png',
  ogImage: '/images/yaman-hero-blue-v3.png',
  contactEndpoint: '/api/contact',
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

export type ProjectFacts = {
  slug: string
  status: ProjectStatus
  website?: string
  source?: string
  stack: string[]
  image?: { src: string; width: number; height: number; alt: Record<'de' | 'en' | 'ar', string> }
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
  },
  inknest: {
    slug: 'inknest',
    status: 'live',
    website: 'https://ink-nest.yamanwarda.dev',
    source: 'https://github.com/InfiniteWorld123/inknest',
    stack: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
  },
} satisfies Record<string, ProjectFacts>

export const projectOrder = Object.keys(projects) as Array<keyof typeof projects>

export const isProjectSlug = (value: string): value is keyof typeof projects =>
  Object.hasOwn(projects, value)
