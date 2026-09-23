import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Bell, CreditCard, Landmark, Plus } from 'lucide-react'
import type { OwnerSubscription } from '#/backend2/contracts/invoice.contract'
import { DashboardPage, PageHead, StatusChip } from '#/frontend/dashboard/primitives'
import type { SubscriptionView, SubscriptionsSearch } from '#/frontend/features/invoices-v2/invoice-search'
import { useInvoiceMode } from '#/frontend/features/invoices-v2/mode'
import { formatAmount, formatDate } from '#/frontend/features/invoices-v2/money'
import { useNotices, useSubscriptions } from '#/frontend/features/invoices-v2/queries'
import { cn } from '#/frontend/lib/utils'
import { EmptyState, LoadFailure, Pager } from '../clients/client-parts'
import { ListSkeleton, SectionNav, Segmented, TestBar, TestChip } from './invoice-parts'
import { SubscriptionFile } from './SubscriptionFile'
import { SubscriptionChip, subscriptionState } from './subscription-parts'

/**
 * Subscriptions, approved in the Invoices Design Lab (24 Sep 2026): one line
 * per agreement; opening one shows how it is collected, the agreed terms and
 * every period — beside the list on a computer, on its own screen on a phone.
 * The open one lives in the address (`?sub=`).
 *
 * Above the list, what needs the owner: reminders and notices the billing job
 * prepared, as the server lists them.
 */

const VIEWS: Array<[SubscriptionView, string]> = [
  ['all', 'All'],
  ['active', 'Active'],
  ['paused', 'Paused'],
  ['ended', 'Ended'],
]

const intervalWord = (interval: OwnerSubscription['interval']) => (interval === 'monthly' ? 'Monthly' : 'Yearly')

function Notices() {
  const [status, setStatus] = useState<'pending' | 'prepared'>('pending')
  const [page, setPage] = useState(1)
  const notices = useNotices(status, page)

  if (notices.isPending) return null
  if (notices.isError) {
    return (
      <p role="alert" className="text-[12.5px] text-[var(--dash-red-ink)]">
        Reminders and notices could not be loaded.{' '}
        <button type="button" className="font-semibold underline" onClick={() => void notices.refetch()}>
          Try again
        </button>
      </p>
    )
  }

  if (notices.data.total === 0 && status === 'pending' && page === 1) {
    return null
  }

  return (
    <section className="dash-panel px-5 py-4" aria-labelledby="notices-title">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="notices-title" className="flex items-center gap-2 text-sm font-semibold">
          <Bell className="size-4" aria-hidden="true" />
          Reminders and notices
          <StatusChip tone="grey" className="h-[19px] px-1.5">
            {notices.data.total}
          </StatusChip>
        </h2>
        <Segmented
          label="Which notices"
          value={status}
          onChange={(next) => {
            setStatus(next)
            setPage(1)
          }}
          options={[
            ['pending', 'Waiting'],
            ['prepared', 'Prepared in Inbox'],
          ]}
        />
      </div>
      {notices.data.items.length === 0 ? (
        <p className="text-[12.5px] text-[var(--dash-quiet)]">Nothing here.</p>
      ) : (
        <ul className="inv-timeline">
          {notices.data.items.map((notice) => (
            <li key={notice.id}>
              <span className="inv-dot" data-tone={notice.kind.includes('failed') || notice.kind === 'card_missing' ? 'bad' : 'blue'} />
              <span className="min-w-0">
                {notice.message}
                <small className="block text-[12px] text-[var(--dash-quiet)]">
                  {notice.audience === 'customer' ? 'For the client' : 'For you'} · {formatDate(notice.dueOn)}
                </small>
                <span className="mt-1 flex flex-wrap gap-3 text-[12px] font-semibold text-[var(--dash-blue-ink)]">
                  {notice.inboxDraftId ? (
                    <Link to="/dashboard/inbox" search={{ view: 'drafts', draft: notice.inboxDraftId }} className="hover:underline">
                      Open the Inbox draft
                    </Link>
                  ) : null}
                  {notice.invoiceId ? (
                    <Link to="/dashboard/invoices/$invoiceId" params={{ invoiceId: notice.invoiceId }} className="hover:underline">
                      Open the invoice
                    </Link>
                  ) : null}
                  {notice.subscriptionId ? (
                    <Link to="/dashboard/invoices/subscriptions" search={{ sub: notice.subscriptionId }} className="hover:underline">
                      Open the subscription
                    </Link>
                  ) : null}
                </span>
              </span>
              <span />
            </li>
          ))}
        </ul>
      )}
      <Pager
        page={notices.data.page}
        pageCount={notices.data.pageCount}
        total={notices.data.total}
        noun={['notice', 'notices']}
        onPage={setPage}
      />
    </section>
  )
}

/** Wide enough for the file to sit beside the list — Tailwind's `lg`. */
const useWide = (): boolean => {
  const [wide, setWide] = useState(true)

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const update = () => setWide(query.matches)

    update()
    query.addEventListener('change', update)

    return () => query.removeEventListener('change', update)
  }, [])

  return wide
}

export function SubscriptionsPage({ search }: { search: SubscriptionsSearch }) {
  const navigate = useNavigate()
  const { mode, settings } = useInvoiceMode()
  const view: SubscriptionView = search.view ?? 'all'
  const page = search.page ?? 1
  const openId = search.sub
  const wide = useWide()
  const list = useSubscriptions({ mode, status: view, page, pageSize: 25 })

  const go = (next: Partial<SubscriptionsSearch>) =>
    void navigate({
      to: '/dashboard/invoices/subscriptions',
      search: { ...search, ...next },
    })

  useEffect(() => {
    if (list.data && !list.isPlaceholderData && list.data.page !== page && list.data.page > 0) {
      go({ page: list.data.page > 1 ? list.data.page : undefined })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, list.isPlaceholderData, page])

  const items = list.data?.items ?? []

  return (
    <DashboardPage className="inv gap-4">
      <div className={cn('flex flex-col gap-4', openId && 'hidden lg:flex')}>
        <PageHead
          eyebrow="MONEY"
          title="Subscriptions"
          description="Monthly or yearly agreements. You set them up after agreeing with the client — there is no public sign-up."
          actions={
            <Link to="/dashboard/invoices/subscriptions/new" className="dash-btn dash-btn-primary">
              <Plus className="size-4" aria-hidden="true" />
              New subscription
            </Link>
          }
        />
        <TestBar mode={mode} />
        <SectionNav current="subscriptions" subscriptions={list.data && view === 'all' ? list.data.total : undefined} />
        <Notices />
      </div>

      <div className={cn('grid items-start gap-4', openId ? 'lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]' : '')}>
        <div className={cn('flex min-w-0 flex-col gap-3', openId && 'hidden lg:flex')}>
          <div className="inv-views" role="group" aria-label="Status">
            {VIEWS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="inv-view"
                aria-pressed={view === key}
                onClick={() => go({ view: key === 'all' ? undefined : key, page: undefined })}
              >
                {label}
              </button>
            ))}
          </div>
          <section className="dash-panel overflow-hidden" aria-label="Subscriptions">
            {list.isError ? (
              <LoadFailure
                title="Subscriptions could not be loaded"
                message="The server did not answer. Nothing has been changed."
                onRetry={() => void list.refetch()}
              />
            ) : list.isPending || !settings.data ? (
              <ListSkeleton rows={4} />
            ) : items.length === 0 ? (
              <EmptyState
                title={view === 'all' ? 'No subscriptions yet' : 'Nothing here'}
                action={
                  view === 'all' ? (
                    <Link to="/dashboard/invoices/subscriptions/new" className="dash-btn dash-btn-primary">
                      <Plus className="size-4" aria-hidden="true" />
                      New subscription
                    </Link>
                  ) : undefined
                }
              >
                {view === 'all'
                  ? 'Start one after agreeing a monthly or yearly price with a client. It prepares or charges each period for you.'
                  : 'Subscriptions with this status will appear here.'}
              </EmptyState>
            ) : (
              <ul aria-busy={list.isFetching}>
                {items.map((sub) => {
                  const state = subscriptionState(sub)
                  const failed = sub.collection === 'automatic_card' && sub.card.status === 'invalid'

                  return (
                    <li key={sub.id} className="border-t border-[var(--dash-soft)] first:border-0">
                      <button
                        type="button"
                        aria-current={openId === sub.id ? 'true' : undefined}
                        className={cn(
                          'dash-row grid w-full items-center gap-3.5 px-4 py-3 text-start sm:px-5',
                          openId
                            ? 'grid-cols-[minmax(0,1fr)_auto]'
                            : 'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_150px_120px_auto]',
                          openId === sub.id && 'bg-[var(--dash-blue-tint)]',
                        )}
                        onClick={() => go({ sub: sub.id })}
                      >
                        <span className="min-w-0">
                          <strong className="block truncate text-[13.5px]">{sub.client.displayName}</strong>
                          <span className="block truncate text-[12px] text-[var(--dash-quiet)]">{sub.description}</span>
                        </span>
                        <span className={cn('hidden min-w-0 items-center gap-1.5 text-[12px] text-[var(--dash-quiet)] md:flex', openId && 'md:hidden')}>
                          {sub.collection === 'automatic_card' ? (
                            <>
                              <CreditCard className="size-3.5 shrink-0" aria-hidden="true" /> Card, automatic
                            </>
                          ) : (
                            <>
                              <Landmark className="size-3.5 shrink-0" aria-hidden="true" /> You review each draft
                            </>
                          )}
                        </span>
                        <span className={cn('hidden text-[12px] text-[var(--dash-quiet)] md:block', openId && 'md:hidden')}>
                          {intervalWord(sub.interval)}
                          {sub.nextPeriodStart && sub.status !== 'ended' ? ` · next ${formatDate(sub.nextPeriodStart, false)}` : ''}
                        </span>
                        <span className={cn('dash-num hidden text-end text-[13.5px] font-semibold md:block', openId && 'md:hidden')}>
                          {formatAmount(sub.currentAmountMinor, sub.currency)}
                        </span>
                        <span className="flex flex-col items-end gap-1 sm:flex-row sm:items-center">
                          <TestChip mode={sub.mode} />
                          <SubscriptionChip state={failed ? { label: state.label, tone: 'red' } : state} />
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
          {list.data ? (
            <Pager
              page={list.data.page}
              pageCount={list.data.pageCount}
              total={list.data.total}
              noun={['subscription', 'subscriptions']}
              onPage={(next) => go({ page: next > 1 ? next : undefined })}
            />
          ) : null}
        </div>

        {openId ? (
          <div className="min-w-0 lg:sticky lg:top-0">
            <SubscriptionFile
              key={openId}
              subscriptionId={openId}
              mode={wide ? 'panel' : 'page'}
              onClose={() => go({ sub: undefined })}
            />
          </div>
        ) : null}
      </div>
    </DashboardPage>
  )
}
