import { createFileRoute } from '@tanstack/react-router'
import { InvoiceEditor } from '#/frontend/pages/admin/invoices/InvoiceEditor'

/** A blank draft. The saved one lives at `/admin/invoices/$invoiceId`. */
export const Route = createFileRoute('/admin/invoices/new')({
  component: () => <InvoiceEditor invoiceId="" />,
})
