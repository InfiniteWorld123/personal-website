import { createFileRoute } from '@tanstack/react-router'
import { InvoicePage } from '#/frontend/pages/dashboard/invoices/InvoicePage'

/**
 * One invoice: the editor while it is a draft, the record once issued.
 * `?check=1` opens a draft with the issue check already shown.
 */
export const Route = createFileRoute('/dashboard/invoices/$invoiceId/')({
  validateSearch: (search: Record<string, unknown>): { check?: boolean } => ({
    check: search.check === true || search.check === 'true' || search.check === 1 || search.check === '1' ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Invoice · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: function InvoiceRoute() {
    return <InvoicePage invoiceId={Route.useParams().invoiceId} check={Route.useSearch().check} />
  },
})
