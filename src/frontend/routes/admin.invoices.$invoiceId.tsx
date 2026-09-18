import { createFileRoute } from '@tanstack/react-router'
import { InvoiceEditor } from '#/frontend/pages/admin/invoices/InvoiceEditor'

/**
 * One document, in whichever of its two states it is in.
 *
 * `InvoiceEditor` draws the form while it is a draft and hands over to
 * `IssuedInvoice` once it has a number — deliberately one route, so nobody can
 * arrive at an editor for something that can no longer be edited.
 */
function Screen() {
  const { invoiceId } = Route.useParams()

  return <InvoiceEditor invoiceId={invoiceId} />
}

export const Route = createFileRoute('/admin/invoices/$invoiceId')({
  component: Screen,
})
