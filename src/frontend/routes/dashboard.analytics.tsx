import { createFileRoute } from '@tanstack/react-router'
import { type AnalyticsSearch, parseAnalyticsSearch } from '#/frontend/features/analytics-v2/analytics-search'
import { AnalyticsPage } from '#/frontend/pages/dashboard/analytics/AnalyticsPage'

/**
 * The owner's Analytics (`docs/v2/analytics.md`). The address keeps the tab,
 * the period and the Sales origin filter, so a link opens exactly that view.
 */
export const Route = createFileRoute('/dashboard/analytics')({
  validateSearch: (search: Record<string, unknown>): AnalyticsSearch => parseAnalyticsSearch(search),
  head: () => ({
    meta: [
      { title: 'Analytics · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: function AnalyticsRoute() {
    return <AnalyticsPage search={Route.useSearch()} />
  },
})
