import { createFileRoute } from '@tanstack/react-router'
import { ContentPage, parseContentSearch } from '#/frontend/pages/dashboard/content/ContentPage'

/**
 * The website's static copy, in three languages. `docs/v2/content.md` owns
 * what it does; the page, language and view travel in the address.
 */
export const Route = createFileRoute('/dashboard/content')({
  validateSearch: parseContentSearch,
  head: () => ({
    meta: [
      { title: 'Content · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: ContentPage,
})
