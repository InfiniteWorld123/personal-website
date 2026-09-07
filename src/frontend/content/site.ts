import type { ProjectSlug, ServiceSlug } from './types'

/** Language-independent facts about the site and its owner. */
export const site = {
  name: 'Yaman Warda',
  url: 'https://yamanwarda.dev',
  email: 'yamanwarda06@gmail.com',
  city: 'Erfurt',
  country: 'DE',
  github: 'https://github.com/InfiniteWorld123',
  linkedin: 'https://linkedin.com/in/yaman-warda',
  portrait: '/images/portrait.jpg',
  ogImage: '/images/portrait.jpg',
  contactEndpoint: '/api/contact',
} as const

/**
 * Published starting prices. Owned by `docs/services/README.md`; every
 * language renders these same numbers.
 */
export const serviceOrder: ServiceSlug[] = ['websites', 'shopify', 'software']

export const servicePrices: Record<ServiceSlug, number> = {
  websites: 990,
  shopify: 2490,
  software: 2990,
}

export type ProjectStatus = 'live' | 'building'

export type ProjectFacts = {
  slug: ProjectSlug
  status: ProjectStatus
  website?: string
  source?: string
  stack: string[]
}

export const projectOrder: ProjectSlug[] = ['tech-store', 'inknest', 'prime-estate']

export const projects: Record<ProjectSlug, ProjectFacts> = {
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
  'prime-estate': {
    slug: 'prime-estate',
    status: 'building',
    stack: ['TanStack Start', 'Elysia', 'PostgreSQL', 'TypeScript'],
  },
}
