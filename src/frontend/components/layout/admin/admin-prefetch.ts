import type { WarmableQuery } from '#/frontend/lib/prefetch'
import { adminPostsQuery } from '#/frontend/features/blog/post-queries'
import { toFilterInput as toPostFilter } from '#/frontend/features/blog/post-filters'
import { adminBookingsQuery } from '#/frontend/features/booking/booking-queries'
import { toBookingFilterInput } from '#/frontend/features/booking/booking-filters'
import { contentSnapshotQuery } from '#/frontend/features/content/content-queries'
import { inboxQuery } from '#/frontend/features/inbox/inbox-queries'
import { invoicesQuery, summaryQuery } from '#/frontend/features/invoices/invoice-queries'
import { boardQuery, leadsQuery, overdueQuery } from '#/frontend/features/leads/lead-queries'
import { adminProjectsQuery } from '#/frontend/features/projects/project-queries'
import { toFilterInput as toProjectFilter } from '#/frontend/features/projects/project-filters'

/**
 * What each section will ask for the moment it opens.
 *
 * Kept out of `admin-navigation.ts` on purpose: that file is the description of
 * the menu and imports nothing but icons. This is the other half — pointing at
 * a row starts the request the row's page would make, so by the time the click
 * lands the answer is usually already in the cache.
 *
 * The arguments are the defaults each page lands on. Where a page keeps its
 * filters in React state rather than the URL — inbox, leads, invoices — those
 * defaults are the component's own initial values, so the prefetched key is
 * the key it will actually read. Get that wrong and the hover warms a cache
 * entry nobody asks for, which costs a request and gains nothing.
 */
const BY_PATH: Record<string, () => WarmableQuery[]> = {
  '/admin': () => [summaryQuery(), overdueQuery(), adminBookingsQuery(toBookingFilterInput({}))],
  '/admin/projects': () => [adminProjectsQuery(toProjectFilter({}))],
  '/admin/bookings': () => [adminBookingsQuery(toBookingFilterInput({}))],
  '/admin/inbox': () => [inboxQuery('inbox', '')],
  '/admin/leads': () => [leadsQuery('ALL', ''), boardQuery()],
  '/admin/content': () => [contentSnapshotQuery()],
  '/admin/blog': () => [adminPostsQuery(toPostFilter({}))],
  '/admin/invoices': () => [invoicesQuery('ALL', ''), summaryQuery()],
}

/** The queries behind an admin path, or none when that path has no data. */
export const queriesFor = (path: string): WarmableQuery[] =>
  BY_PATH[path]?.() ?? []
