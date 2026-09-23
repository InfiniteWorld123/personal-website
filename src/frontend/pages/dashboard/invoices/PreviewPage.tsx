import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Download, ExternalLink, FileText, Loader2 } from 'lucide-react'
import { berlinToday } from '#/backend2/contracts/invoice-dates.contract'
import type { DocumentLanguage, OwnerInvoice } from '#/backend2/contracts/invoice.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage, PageHead } from '#/frontend/dashboard/primitives'
import { BlogDialog, DialogActions, DialogAlert, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import { issueInvoice, previewPdf, saveBlob } from '#/frontend/features/invoices-v2/api'
import { formatAmount } from '#/frontend/features/invoices-v2/money'
import { invoiceKeys, useInvoice, useInvoiceMutation } from '#/frontend/features/invoices-v2/queries'
import { notify } from '#/frontend/lib/notify'
import { LoadFailure } from '../clients/client-parts'
import { NotFoundPanel } from './InvoicePage'
import { Banner, ListSkeleton, Segmented, TestBar } from './invoice-parts'

/**
 * "Check it before it counts" — the real PDF, exactly as the server renders
 * it, marked DRAFT and without a number. Approved in the Invoices Design Lab
 * (24 Sep 2026). German and English are the same invoice; the Arabic copy is
 * shown as unavailable with its reason rather than hidden.
 *
 * Issuing sends the revision that was previewed: if the draft changed in
 * between, the server refuses and nothing is numbered.
 */

function PdfFrame({ invoice, language }: { invoice: OwnerInvoice; language: DocumentLanguage }) {
  const pdf = useQuery({
    queryKey: [...invoiceKeys.all, 'preview', invoice.id, invoice.revision, language],
    queryFn: () => previewPdf(invoice.id, language),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
  })
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!pdf.data) return undefined

    const next = URL.createObjectURL(new Blob([pdf.data.blob], { type: 'application/pdf' }))

    setUrl(next)

    return () => URL.revokeObjectURL(next)
  }, [pdf.data])

  if (pdf.isError) {
    return (
      <LoadFailure
        title="The preview could not be made"
        message={pdf.error instanceof ApiRequestError ? pdf.error.message : 'The server did not answer. Nothing has been changed.'}
        onRetry={() => void pdf.refetch()}
      />
    )
  }

  if (!url) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-[13px] text-[var(--dash-quiet)]" aria-busy="true">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Rendering the PDF…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <a href={url} target="_blank" rel="noopener" className="dash-btn dash-btn-quiet h-8 text-[12.5px]">
          <ExternalLink className="size-3.5" aria-hidden="true" />
          Open the PDF
        </a>
        <button
          type="button"
          className="dash-btn dash-btn-ghost h-8 text-[12.5px]"
          onClick={() => pdf.data && saveBlob(pdf.data.blob, pdf.data.fileName)}
        >
          <Download className="size-3.5" aria-hidden="true" />
          Download preview
        </button>
      </div>
      <div className="rounded-[12px] bg-[var(--dash-furniture)] p-2 sm:p-4">
        <object
          data={url}
          type="application/pdf"
          aria-label={`Preview of the invoice, ${language === 'de' ? 'German' : 'English'}`}
          className="hidden h-[78vh] min-h-[560px] w-full rounded-lg bg-white md:block"
        >
          <p className="p-6 text-[13px]">
            This browser does not show PDFs inside the page.{' '}
            <a href={url} target="_blank" rel="noopener" className="font-semibold underline">
              Open the PDF
            </a>
            .
          </p>
        </object>
        <div className="flex flex-col items-start gap-2 p-4 text-[13px] md:hidden">
          <FileText className="size-6 text-[var(--dash-quiet)]" aria-hidden="true" />
          <p>Phones show PDFs full screen. Open it to check every line, then come back to issue.</p>
          <a href={url} target="_blank" rel="noopener" className="dash-btn dash-btn-primary h-9 text-[13px]">
            Open the preview
          </a>
        </div>
      </div>
    </div>
  )
}

function IssueDialog({ invoice, onClose }: { invoice: OwnerInvoice; onClose: () => void }) {
  const navigate = useNavigate()
  const [failure, setFailure] = useState<{ message: string; stale: boolean } | null>(null)
  const issue = useInvoiceMutation((input: { id: string; revision: number }) => issueInvoice(input.id, input.revision), (result) => result)
  const year = berlinToday().slice(0, 4)

  return (
    <BlogDialog labelledBy="issue-title" describedBy="issue-text" role="alertdialog" size="sm" onClose={onClose}>
      <DialogTitle id="issue-title">Issue this invoice?</DialogTitle>
      <p id="issue-text" className="text-[13px] leading-relaxed text-[var(--dash-quiet)]">
        It gets the next {invoice.mode === 'test' ? <b>TEST</b> : null} number, its PDF is saved in Media › Invoices ›{' '}
        {year}, and it can no longer be edited — only cancelled or corrected. Nothing is sent yet.
      </p>
      <p className="text-[13px]">
        Total <b className="dash-num">{formatAmount(invoice.money.totalMinor, invoice.currency)}</b> to{' '}
        <b>{invoice.recipient.company || invoice.recipient.name || invoice.client.displayName}</b>
      </p>
      {failure ? (
        <DialogAlert>
          {failure.message}
          {failure.stale ? (
            <>
              {' '}
              <Link to="/dashboard/invoices/$invoiceId" params={{ invoiceId: invoice.id }} className="font-semibold underline">
                Review the draft again
              </Link>
            </>
          ) : null}
        </DialogAlert>
      ) : null}
      <DialogActions>
        <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose} data-autofocus>
          Not yet
        </button>
        <button
          type="button"
          className="dash-btn dash-btn-primary"
          disabled={issue.isPending}
          onClick={async () => {
            setFailure(null)

            try {
              const issued = await issue.mutateAsync({ id: invoice.id, revision: invoice.revision })

              notify.success(`Issued as ${issued.number} — the PDF is saved in Media`)
              void navigate({ to: '/dashboard/invoices/$invoiceId', params: { invoiceId: issued.id }, replace: true })
            } catch (caught) {
              const stale = caught instanceof ApiRequestError && caught.code === 'CONFLICT'

              setFailure({
                stale,
                message: stale
                  ? 'The draft changed after this preview, so it was not issued. Nothing was numbered.'
                  : `The invoice was not issued: ${caught instanceof Error ? caught.message : 'the server did not answer'}. No number was used and the draft is unchanged — try again; it cannot be issued twice.`,
              })
            }
          }}
        >
          {issue.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {issue.isPending ? 'Issuing…' : 'Issue'}
        </button>
      </DialogActions>
    </BlogDialog>
  )
}

export function PreviewPage({ invoiceId }: { invoiceId: string }) {
  const query = useInvoice(invoiceId)
  const [language, setLanguage] = useState<DocumentLanguage | 'ar' | null>(null)
  const [issuing, setIssuing] = useState(false)
  const invoice = query.data
  const shown: DocumentLanguage | 'ar' = language ?? invoice?.language ?? 'de'
  const ready = invoice ? invoice.issueProblems.length === 0 : false

  return (
    <DashboardPage className="inv gap-4">
      <PageHead
        eyebrow="MONEY · PREVIEW"
        title="Check it before it counts"
        description="Nothing is numbered or stored yet. Issuing gives it the next number, saves the PDF in Media › Invoices, and locks it."
        actions={
          <>
            <Link to="/dashboard/invoices/$invoiceId" params={{ invoiceId }} className="dash-btn dash-btn-ghost">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to edit
            </Link>
            {invoice?.status === 'draft' ? (
              <button type="button" className="dash-btn dash-btn-primary" disabled={!ready} onClick={() => setIssuing(true)}>
                Issue invoice
              </button>
            ) : null}
          </>
        }
      />
      {invoice ? <TestBar mode={invoice.mode} /> : null}

      {query.isError ? (
        query.error instanceof ApiRequestError && (query.error.status === 404 || query.error.status === 422) ? (
          <NotFoundPanel />
        ) : (
          <section className="dash-panel">
            <LoadFailure
              title="This invoice could not be loaded"
              message="The server did not answer. Nothing has been changed."
              onRetry={() => void query.refetch()}
            />
          </section>
        )
      ) : !invoice ? (
        <section className="dash-panel">
          <ListSkeleton rows={8} />
        </section>
      ) : invoice.status !== 'draft' ? (
        <section className="dash-panel flex flex-col items-start gap-3 p-8">
          <h2 className="text-sm font-semibold">This invoice is already issued</h2>
          <p className="text-[13px] text-[var(--dash-quiet)]">{invoice.number} is locked. Open it to send or download it.</p>
          <Link to="/dashboard/invoices/$invoiceId" params={{ invoiceId }} className="dash-btn dash-btn-quiet">
            Open {invoice.number}
          </Link>
        </section>
      ) : (
        <>
          {!ready ? (
            <Banner tone="bad" role="alert" icon={<AlertTriangle className="size-4 shrink-0" aria-hidden="true" />} title="Not ready to issue yet">
              <ul className="mt-1 list-disc ps-4">
                {invoice.issueProblems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
              <Link to="/dashboard/invoices/$invoiceId" params={{ invoiceId }} search={{ check: true }} className="mt-1.5 inline-block font-semibold underline">
                Fix it in the draft
              </Link>
            </Banner>
          ) : null}
          <div className="flex flex-wrap items-center gap-2.5">
            <Segmented
              label="Copy"
              value={shown}
              onChange={(next) => setLanguage(next)}
              options={[
                ['de', invoice.language === 'de' ? 'German' : 'German copy'],
                ['en', invoice.language === 'en' ? 'English' : 'English copy'],
                ['ar', 'Arabic copy'],
              ]}
            />
            <span className="text-[12px] text-[var(--dash-quiet)]">
              {shown === 'ar'
                ? ''
                : 'Every copy is the same invoice with the same number — a translation, never a second bill.'}
            </span>
          </div>
          <section className="dash-panel p-3 sm:p-4" aria-label="Preview">
            {shown === 'ar' ? (
              <div className="flex flex-col items-start gap-2 p-6 text-[13px]">
                <h2 className="text-sm font-semibold">The Arabic copy is not available yet</h2>
                <p className="max-w-[60ch] text-[var(--dash-quiet)]">
                  Arabic PDFs are refused until a working Arabic font and a checked right-to-left layout are added — a
                  wrong-looking legal document is worse than none. It would be the same invoice with the same number,
                  never a second bill.
                </p>
              </div>
            ) : (
              <PdfFrame invoice={invoice} language={shown} />
            )}
          </section>
        </>
      )}

      {issuing && invoice ? <IssueDialog invoice={invoice} onClose={() => setIssuing(false)} /> : null}
    </DashboardPage>
  )
}
