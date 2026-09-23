import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { AlertTriangle, Plus, Repeat, Search } from 'lucide-react'
import type { Currency, InvoiceMode, InvoiceSummary, OwnerInvoiceListItem } from '#/backend2/contracts/invoice.contract'
import { INVOICE_PAGE_SIZE } from '#/backend2/contracts/invoice.contract'
import { DashboardPage, PageHead } from '#/frontend/dashboard/primitives'
import type { InvoiceView, InvoicesSearch } from '#/frontend/features/invoices-v2/invoice-search'
import { useInvoiceMode } from '#/frontend/features/invoices-v2/mode'
import { formatAmount, formatDate } from '#/frontend/features/invoices-v2/money'
import {
  useInvoiceSummary,
  useInvoices,
  usePrefetchInvoice,
  usePrefetchNextInvoices,
  useSubscriptions,
} from '#/frontend/features/invoices-v2/queries'
import { cn } from '#/frontend/lib/utils'
import { EmptyState, LoadFailure, Pager } from '../clients/client-parts'
import { Banner, InvoiceStateChip, ListSkeleton, SectionNav, TestBar, TestChip } from './invoice-parts'

/**
 * The invoice list (`docs/v2/invoices.md`), approved in the Invoices Design
 * Lab (24 Sep 2026): what is still owed per currency and what is late above
 * the list — euros and dollars never added together — then status tabs with
 * their counts, a search, and a list the server pages. The view, the search
 * and the page live in the address, so the back button keeps the owner's place.
 */

const VIEWS: Array<[InvoiceView, string]> = [
  ['all', 'All'],
  ['draft', 'Drafts'],
  ['open', 'Open'],
  ['overdue', 'Overdue'],
  ['paid', 'Paid'],
  ['cancelled', 'Cancelled'],
]

function Balances({ summary, mode }: { summary: InvoiceSummary; mode: InvoiceMode }) {
  const currencies: Currency[] = ['EUR', 'USD']
  const owed = currencies
    .map((currency) => summary.open.find((row) => row.currency === currency))
    .filter((row): row is InvoiceSummary['open'][number] => Boolean(row))
  const late = summary.overdue.reduce((sum, row) => sum + row.count, 0)

  return (
    <div className="inv-balances" aria-label={mode === 'test' ? 'Totals of test invoices' : 'Totals'}>
      {(owed.length > 0 ? owed : [{ currency: 'EUR' as const, count: 0, amountDueMinor: 0 }]).map((row) => (
        <div key={row.currency} className="dash-panel px-3.5 py-3">
          <span className="dash-eyebrow-quiet block text-[10.5px]">STILL OPEN · {row.currency}</span>
          <b className="dash-figure mt-1.5 block text-[21px] sm:text-[22px]">{formatAmount(row.amountDueMinor, row.currency)}</b>
          <small className="text-[12px] text-[var(--dash-quiet)]">
            {row.count} {row.count === 1 ? 'invoice' : 'invoices'}
            {owed.length > 1 && row.currency === 'USD' ? ' · kept apart from euros' : ''}
          </small>
        </div>
      ))}
      <div className="dash-panel px-3.5 py-3">
        <span className="dash-eyebrow-quiet block text-[10.5px]">OVERDUE</span>
        <b className={cn('dash-figure mt-1.5 block text-[21px] sm:text-[22px]', late > 0 && 'text-[var(--dash-red-ink)]')}>
          {late}
        </b>
        <small className="text-[12px] text-[var(--dash-quiet)]">
          {late === 0
            ? 'Nothing is late'
            : summary.overdue.map((row) => formatAmount(row.amountDueMinor, row.currency)).join(' · ')}
        </small>
      </div>
    </div>
  )
}

const sublineOf = (invoice: OwnerInvoiceListItem): string =>
  [
    invoice.recipientName && invoice.recipientName !== invoice.client.displayName ? invoice.recipientName : '',
    invoice.subscriptionId ? 'subscription' : '',
    invoice.kind === 'cancellation' ? 'reverses an earlier invoice' : '',
    invoice.status === 'draft' ? 'draft — numbered when issued' : '',
  ]
    .filter(Boolean)
    .join(' · ')

function InvoiceRow({ invoice, onIntent }: { invoice: OwnerInvoiceListItem; onIntent: (id: string) => void }) {
  const draft = invoice.status === 'draft'
  const partly = invoice.paymentState === 'partially_paid' || (invoice.paymentState === 'overdue' && invoice.amountDueMinor < invoice.totalMinor)

  return (
    <li className="border-t border-[var(--dash-soft)] first:border-0">
      <Link
        to="/dashboard/invoices/$invoiceId"
        params={{ invoiceId: invoice.id }}
        className="inv-irow dash-row"
        onMouseEnter={() => onIntent(invoice.id)}
        onFocus={() => onIntent(invoice.id)}
      >
        <span className="inv-mono text-[12px]">
          {invoice.number ?? <span className="text-[var(--dash-quiet)]">No number yet</span>}
        </span>
        <span className="min-w-0">
          <strong className="block truncate text-[13.5px]">{invoice.client.displayName || invoice.recipientName}</strong>
          <span className="block truncate text-[12px] text-[var(--dash-quiet)]">{sublineOf(invoice) || '\u00a0'}</span>
        </span>
        <span className="inv-c-issued text-[12.5px] text-[var(--dash-quiet)]">{formatDate(invoice.issueDate, false)}</span>
        <span className="inv-c-due text-[12.5px] text-[var(--dash-quiet)]">{formatDate(invoice.dueDate, false)}</span>
        <span className="inv-c-amount text-end">
          <span className="dash-num block text-[13.5px] font-semibold">
            {invoice.totalMinor || !draft ? formatAmount(invoice.totalMinor, invoice.currency) : '—'}
          </span>
          {partly ? (
            <span className="dash-num block text-[12px] text-[var(--dash-quiet)]">
              {formatAmount(invoice.amountDueMinor, invoice.currency)} left
            </span>
          ) : null}
        </span>
        <span className="inv-c-state flex flex-wrap gap-1">
          {draft ? null : <TestChip mode={invoice.mode} />}
          <InvoiceStateChip invoice={invoice} />
        </span>
      </Link>
    </li>
  )
}

export function InvoicesPage({ search }: { search: InvoicesSearch }) {
  const navigate = useNavigate()
  const { mode, settings } = useInvoiceMode()
  const view: InvoiceView = search.view ?? 'all'
  const page = search.page ?? 1
  const [text, setText] = useState(search.q ?? '')

  // Typing replaces the entry it is refining; a tab or a page is a step back can undo.
  const go = (next: Partial<InvoicesSearch>) =>
    void navigate({
      to: '/dashboard/invoices',
      search: { ...search, page: undefined, ...next },
      replace: 'q' in next,
    })

  // The search box follows the address, and the address follows typing after a pause.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const q = text.trim() || undefined

      if (q !== search.q) go({ q })
    }, 250)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  const listQuery = useMemo(
    () => ({ mode, status: view, search: search.q ?? '', page, pageSize: INVOICE_PAGE_SIZE.default }),
    [mode, view, search.q, page],
  )
  const list = useInvoices(listQuery, settings.isSuccess || settings.isError)
  usePrefetchNextInvoices(listQuery, list.data && !list.isPlaceholderData ? list.data.hasMore : false)
  const prefetchInvoice = usePrefetchInvoice()
  const summary = useInvoiceSummary(mode)
  const subscriptions = useSubscriptions({ mode, status: 'all', pageSize: 1 })

  // The server clamps a page past the end; follow it once this page's answer is in.
  useEffect(() => {
    if (list.data && !list.isPlaceholderData && list.data.page !== page) go({ page: list.data.page > 1 ? list.data.page : undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, list.isPlaceholderData, page])

  const items = list.data?.items ?? []
  const counts = summary.data?.counts
  const filtering = Boolean(search.q)

  return (
    <DashboardPage className="inv gap-4">
      <PageHead
        eyebrow="MONEY"
        title="Invoices"
        description="Draft, check the preview, issue — then send or download. Issued invoices never change; a mistake is corrected with a linked document."
        actions={
          <>
            <Link to="/dashboard/invoices/subscriptions/new" className="dash-btn dash-btn-quiet">
              <Repeat className="size-4" aria-hidden="true" />
              New subscription
            </Link>
            <Link to="/dashboard/invoices/new" className="dash-btn dash-btn-primary">
              <Plus className="size-4" aria-hidden="true" />
              New invoice
            </Link>
          </>
        }
      />
      <TestBar mode={mode} />
      <SectionNav current="invoices" subscriptions={subscriptions.data?.total} />

      {summary.isError ? (
        <Banner tone="bad" role="alert" icon={<AlertTriangle className="size-4 shrink-0" aria-hidden="true" />} title="The totals could not be loaded">
          The list below is unaffected.{' '}
          <button type="button" className="font-semibold underline" onClick={() => void summary.refetch()}>
            Try again
          </button>
        </Banner>
      ) : summary.data ? (
        <Balances summary={summary.data} mode={mode} />
      ) : (
        <div className="inv-balances" aria-busy="true" aria-label="Loading totals">
          {[0, 1].map((index) => (
            <div key={index} className="dash-panel flex flex-col gap-2 px-3.5 py-3.5">
              <span className="dash-skeleton h-2.5 w-24 rounded" />
              <span className="dash-skeleton h-5 w-32 rounded" />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="inv-views" role="group" aria-label="Status">
          {VIEWS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="inv-view"
              aria-pressed={view === key}
              onClick={() => go({ view: key === 'all' ? undefined : key })}
            >
              {label}
              {counts ? (
                <span className="inv-count" data-bad={key === 'overdue' && counts.overdue > 0 ? 'true' : undefined}>
                  {counts[key]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <label className="relative min-w-0 flex-[1_1_14rem] sm:max-w-[17rem]">
          <span className="sr-only">Search invoices</span>
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--dash-quiet)]"
            aria-hidden="true"
          />
          <input
            className="dash-field h-9 w-full ps-9 pe-3 text-[13px]"
            placeholder="Number or client"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
      </div>

      <section className="dash-panel overflow-hidden" aria-label="Invoices">
        {list.isError ? (
          <LoadFailure
            title="Invoices could not be loaded"
            message="The server did not answer. Nothing has been changed. Check your connection, then try again."
            onRetry={() => void list.refetch()}
          />
        ) : list.isPending ? (
          <ListSkeleton />
        ) : items.length === 0 ? (
          filtering || view !== 'all' ? (
            <EmptyState
              title={filtering ? 'No invoice matches that' : 'Nothing here'}
              action={
                filtering ? (
                  <button type="button" className="dash-btn dash-btn-quiet" onClick={() => setText('')}>
                    Clear search
                  </button>
                ) : undefined
              }
            >
              {filtering ? 'Try the number, or the client’s name.' : 'Invoices with this status will appear here.'}
            </EmptyState>
          ) : (
            <EmptyState
              title="No invoices yet"
              action={
                <Link to="/dashboard/invoices/new" className="dash-btn dash-btn-primary">
                  <Plus className="size-4" aria-hidden="true" />
                  New invoice
                </Link>
              }
            >
              Start with a draft — it can stay incomplete until you issue it. Nothing is numbered before that.
            </EmptyState>
          )
        ) : (
          <>
            <div className="inv-ihead" aria-hidden="true">
              <span>NUMBER</span>
              <span>CLIENT</span>
              <span>ISSUED</span>
              <span>DUE</span>
              <span className="text-end">AMOUNT</span>
              <span className="text-end">STATUS</span>
            </div>
            <ul aria-busy={list.isFetching}>
              {items.map((invoice) => (
                <InvoiceRow key={invoice.id} invoice={invoice} onIntent={prefetchInvoice} />
              ))}
            </ul>
          </>
        )}
      </section>

      {list.data ? (
        <Pager
          page={list.data.page}
          pageCount={list.data.pageCount}
          total={list.data.total}
          noun={['invoice', 'invoices']}
          onPage={(next) => go({ page: next > 1 ? next : undefined })}
        />
      ) : null}
    </DashboardPage>
  )
}
