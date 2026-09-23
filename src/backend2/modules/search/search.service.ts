import type { SearchHit, SearchQuery, SearchResult, SearchSection, SearchSectionResult } from '../../contracts/search.contract'
import * as repo from './search.repo'

/**
 * One question to every section at once (`docs/v2/search.md`).
 *
 * Each section is asked on its own: one that fails comes back as `error` and
 * the others still answer, so a broken module never empties the palette.
 */

type SectionDef = {
  key: SearchSection
  label: string
  find: (q: string, limit: number) => Promise<repo.Row[]>
  href: (id: string) => string
  moreHref: (q: string) => string
}

const enc = encodeURIComponent

const SECTIONS: SectionDef[] = [
  { key: 'clients', label: 'Clients', find: repo.clients, href: (id) => `/dashboard/clients?client=${id}`, moreHref: () => '/dashboard/clients' },
  { key: 'leads', label: 'Leads', find: repo.leads, href: (id) => `/dashboard/leads?lead=${id}`, moreHref: () => '/dashboard/leads' },
  { key: 'invoices', label: 'Invoices', find: repo.invoices, href: (id) => `/dashboard/invoices/${id}`, moreHref: (q) => `/dashboard/invoices?q=${enc(q)}` },
  {
    key: 'subscriptions',
    label: 'Subscriptions',
    find: repo.subscriptions,
    href: (id) => `/dashboard/invoices/subscriptions?sub=${id}`,
    moreHref: () => '/dashboard/invoices/subscriptions',
  },
  { key: 'inbox', label: 'Inbox', find: repo.inbox, href: (id) => `/dashboard/inbox?c=${id}`, moreHref: (q) => `/dashboard/inbox?q=${enc(q)}` },
  { key: 'calendar', label: 'Calendar', find: repo.calendar, href: (id) => `/dashboard/calendar?id=${id}`, moreHref: (q) => `/dashboard/calendar?q=${enc(q)}` },
  { key: 'blog', label: 'Blog', find: repo.blog, href: (id) => `/dashboard/blog/${id}`, moreHref: () => '/dashboard/blog' },
  { key: 'projects', label: 'Projects', find: repo.projects, href: (id) => `/dashboard/projects/${id}`, moreHref: () => '/dashboard/projects' },
  { key: 'services', label: 'Services', find: repo.services, href: (id) => `/dashboard/services/${id}`, moreHref: () => '/dashboard/services' },
  { key: 'media', label: 'Media', find: repo.media, href: () => '/dashboard/media', moreHref: () => '/dashboard/media' },
]

const toHit = (row: repo.Row, def: SectionDef): SearchHit => ({
  id: row.id,
  title: row.title,
  subtitle: (row.subtitle ?? '').slice(0, 160),
  badge: row.badge,
  href: def.href(row.id),
})

export const search = async ({ q, limit }: SearchQuery): Promise<SearchResult> => {
  const sections = await Promise.all(
    SECTIONS.map(async (def): Promise<SearchSectionResult> => {
      try {
        const rows = await def.find(q, limit)

        return {
          key: def.key,
          label: def.label,
          state: 'ready',
          items: rows.slice(0, limit).map((row) => toHit(row, def)),
          hasMore: rows.length > limit,
          moreHref: def.moreHref(q),
        }
      } catch (error) {
        console.error('Search section failed', def.key, error instanceof Error ? error.message : error)

        return { key: def.key, label: def.label, state: 'error', items: [], hasMore: false, moreHref: def.moreHref(q) }
      }
    }),
  )

  return { q, sections }
}
