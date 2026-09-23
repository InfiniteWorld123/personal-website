import { createFileRoute } from '@tanstack/react-router'
import { PreviewPage } from '#/frontend/pages/dashboard/invoices/PreviewPage'

/** The draft's real PDF, marked DRAFT, and the Issue step. */
export const Route = createFileRoute('/dashboard/invoices/$invoiceId/preview')({
  head: () => ({
    meta: [
      { title: 'Preview invoice · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: function PreviewRoute() {
    return <PreviewPage invoiceId={Route.useParams().invoiceId} />
  },
})
