import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage, PageHead } from '#/frontend/dashboard/primitives'
import { useInvoiceMode } from '#/frontend/features/invoices-v2/mode'
import { useInvoice } from '#/frontend/features/invoices-v2/queries'
import { LoadFailure } from '../clients/client-parts'
import { InvoiceEditor } from './InvoiceEditor'
import { IssuedInvoice } from './IssuedInvoice'
import { ListSkeleton } from './invoice-parts'

/**
 * One invoice's address. A draft opens in the editor; an issued invoice or a
 * cancellation document opens as the record it now is — it never changes, so
 * there is nothing to edit.
 */

function Frame({ children, title = 'Invoice' }: { children: React.ReactNode; title?: string }) {
  return (
    <DashboardPage className="inv gap-4">
      <PageHead
        eyebrow="MONEY · INVOICE"
        title={title}
        actions={
          <Link to="/dashboard/invoices" className="dash-btn dash-btn-ghost">
            <ArrowLeft className="size-4" aria-hidden="true" />
            All invoices
          </Link>
        }
      />
      {children}
    </DashboardPage>
  )
}

export function NotFoundPanel() {
  return (
    <section className="dash-panel flex flex-col items-start gap-3 p-8">
      <h2 className="text-sm font-semibold">That invoice does not exist</h2>
      <p className="text-[13px] text-[var(--dash-quiet)]">
        It may have been a draft that was deleted. Issued invoices are never deleted.
      </p>
      <Link to="/dashboard/invoices" className="dash-btn dash-btn-quiet">
        All invoices
      </Link>
    </section>
  )
}

export function NewInvoicePage() {
  const { mode, settings } = useInvoiceMode()

  if (settings.isError) {
    return (
      <Frame title="New invoice">
        <section className="dash-panel">
          <LoadFailure
            title="Your invoice settings could not be loaded"
            message="The editor needs your tax setup to show the right totals. Nothing has been changed."
            onRetry={() => void settings.refetch()}
          />
        </section>
      </Frame>
    )
  }

  if (!settings.data) {
    return (
      <Frame title="New invoice">
        <section className="dash-panel">
          <ListSkeleton rows={8} />
        </section>
      </Frame>
    )
  }

  return <InvoiceEditor invoice={null} settings={settings.data} mode={mode} />
}

export function InvoicePage({ invoiceId, check }: { invoiceId: string; check?: boolean }) {
  const query = useInvoice(invoiceId)
  const { settings } = useInvoiceMode()

  if (query.isError || settings.isError) {
    const missing = query.error instanceof ApiRequestError && (query.error.status === 404 || query.error.status === 422)

    return (
      <Frame>
        {missing ? (
          <NotFoundPanel />
        ) : (
          <section className="dash-panel">
            <LoadFailure
              title="This invoice could not be loaded"
              message="The server did not answer. Nothing has been changed."
              onRetry={() => {
                void query.refetch()
                void settings.refetch()
              }}
            />
          </section>
        )}
      </Frame>
    )
  }

  if (!query.data || !settings.data) {
    return (
      <Frame>
        <section className="dash-panel" aria-label="Loading invoice">
          <ListSkeleton rows={8} />
        </section>
      </Frame>
    )
  }

  if (query.data.status === 'draft') {
    return (
      <InvoiceEditor
        key={query.data.id}
        invoice={query.data}
        settings={settings.data}
        mode={query.data.mode}
        showProblems={check}
      />
    )
  }

  return <IssuedInvoice key={query.data.id} invoice={query.data} />
}
