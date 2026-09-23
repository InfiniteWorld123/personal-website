import { createFileRoute } from '@tanstack/react-router'
import { ImportPage } from '#/frontend/pages/dashboard/leads/ImportPage'

/** A reviewed CSV import: file, columns, check each row, import. */
export const Route = createFileRoute('/dashboard/leads/import')({
  head: () => ({
    meta: [
      { title: 'Import leads · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: ImportPage,
})
