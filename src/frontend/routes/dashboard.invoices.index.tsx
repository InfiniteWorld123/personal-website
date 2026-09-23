import { createFileRoute } from '@tanstack/react-router'
import { parseInvoicesSearch } from '#/frontend/features/invoices-v2/invoice-search'
import { InvoicesPage } from '#/frontend/pages/dashboard/invoices/InvoicesPage'

/**
 * The invoice list (`docs/v2/invoices.md`). The status view, the search and
 * the page live in the address, so a link or the back button keeps them.
 */
export const Route = createFileRoute('/dashboard/invoices/')({
  validateSearch: parseInvoicesSearch,
  head: () => ({
    meta: [
      { title: 'Invoices · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: function InvoicesRoute() {
    return <InvoicesPage search={Route.useSearch()} />
  },
})
