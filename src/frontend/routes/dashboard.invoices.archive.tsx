import { createFileRoute } from '@tanstack/react-router'
import { ArchivePage } from '#/frontend/pages/dashboard/invoices/ArchivePage'

/** One ZIP per year for the tax adviser; real documents only. */
export const Route = createFileRoute('/dashboard/invoices/archive')({
  head: () => ({
    meta: [
      { title: 'Tax adviser archive · Invoices · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: ArchivePage,
})
