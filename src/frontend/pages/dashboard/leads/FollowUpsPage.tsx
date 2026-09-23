import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Check, Loader2 } from 'lucide-react'
import { type FollowUpListItem, LEAD_PAGE_SIZE } from '#/backend2/contracts/lead.contract'
import { DashboardPage } from '#/frontend/dashboard/primitives'
import { formatFollowUp } from '#/frontend/features/leads-v2/lead-form'
import { useCompleteFollowUp, useFollowUps } from '#/frontend/features/leads-v2/queries'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import {
  EmptyState,
  FollowUpPill,
  LeadsHead,
  LeadsTabs,
  LoadFailure,
  Pager,
  RowSkeleton,
  useFollowUpDue,
} from './lead-parts'

/** The red Due pill only — the date is already on the line — and it turns on at its minute. */
function DuePill({ followUp }: { followUp: Parameters<typeof useFollowUpDue>[0] }) {
  return useFollowUpDue(followUp) ? <FollowUpPill followUp={followUp} /> : null
}

/**
 * Every open follow-up, soonest first — the owner's whole reminder system, as
 * approved in the Leads Design Lab (23 Sep 2026). There is no email or SMS:
 * the red count beside Leads in the sidebar and this list are the reminder.
 * The filter lives in the address (`?when=due`), so the due banner on Leads
 * can open it already narrowed.
 */

type When = 'all' | 'due' | 'upcoming'

const FILTERS: Array<{ value: When; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'due', label: 'Due now' },
  { value: 'upcoming', label: 'Later' },
]

const EMPTY: Record<When, { title: string; text: string }> = {
  all: { title: 'Nothing to follow up', text: 'Set a follow-up on a lead and it shows here, soonest first.' },
  due: {
    title: 'Nothing due right now',
    text: 'No follow-up has reached its time yet. The ones set for later are under Later.',
  },
  upcoming: {
    title: 'Nothing set for later',
    text: 'Every open follow-up is already due, or none is set. Due ones are under Due now.',
  },
}

/** "Thu 25 Sept · 10:00 (Berlin)" — the server stores the instant, the owner reads Berlin time. */
function DueAt({ item }: { item: FollowUpListItem }) {
  return (
    <span className="dash-num">
      <time dateTime={item.followUp.dueAt}>{formatFollowUp(item.followUp)}</time> (Berlin)
    </span>
  )
}

export function FollowUpsPage({ when }: { when?: 'due' | 'upcoming' }) {
  const navigate = useNavigate()
  const filter: When = when ?? 'all'

  // The page belongs to the filter it was chosen under: switching filter
  // starts at page 1 without first asking the server for a page that may not exist.
  const [paging, setPaging] = useState({ filter, page: 1 })
  const page = paging.filter === filter ? paging.page : 1
  const setPage = (next: number) => setPaging({ filter, page: next })

  const followUps = useFollowUps({ when: filter, page, pageSize: LEAD_PAGE_SIZE.default })
  const complete = useCompleteFollowUp()
  const items = followUps.data?.items ?? []

  // The server clamps a page past the end (the last one on it was just done);
  // follow it. Placeholder data is the previous page's, so it is not the answer yet.
  useEffect(() => {
    if (followUps.data && !followUps.isPlaceholderData && followUps.data.page !== page) {
      setPaging({ filter, page: followUps.data.page })
    }
  }, [followUps.data, followUps.isPlaceholderData, page, filter])

  const choose = (value: When) =>
    void navigate({ to: '/dashboard/leads/follow-ups', search: value === 'all' ? {} : { when: value } })

  const done = (item: FollowUpListItem) =>
    complete.mutate(item.lead.id, {
      onSuccess: () => notify.success(`Follow-up with ${item.lead.name} done`),
      // Already closed elsewhere, or the lead was moved: re-read so the list tells the truth.
      onError: () => void followUps.refetch(),
    })

  return (
    <DashboardPage className="gap-5">
      <LeadsHead />
      <LeadsTabs tab="follow-ups" />

      <div
        role="group"
        aria-label="Show"
        className="inline-flex self-start rounded-[10px] bg-[var(--dash-chip)] p-[3px]"
      >
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            data-on={filter === value}
            className={cn(
              'dash-seg inline-flex h-[30px] items-center rounded-lg px-3 text-[12.5px]',
              filter === value && 'shadow-[0_1px_2px_rgba(16,23,47,.08)]',
            )}
            onClick={() => choose(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="dash-panel overflow-hidden" aria-label="Follow-ups">
        {followUps.isError ? (
          <LoadFailure
            title="Follow-ups could not be loaded"
            message="The server did not answer. Nothing has been changed. Check your connection, then try again."
            onRetry={() => void followUps.refetch()}
          />
        ) : followUps.isPending ? (
          <ul aria-busy="true">
            {Array.from({ length: 4 }, (_, index) => (
              <RowSkeleton key={index} />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <EmptyState
            title={EMPTY[filter].title}
            action={
              filter === 'all' ? undefined : (
                <button type="button" className="dash-btn dash-btn-quiet" onClick={() => choose('all')}>
                  Show all follow-ups
                </button>
              )
            }
          >
            {EMPTY[filter].text}
          </EmptyState>
        ) : (
          <ul aria-busy={followUps.isFetching}>
            {items.map((item) => {
              const saving = complete.isPending && complete.variables === item.lead.id

              return (
                <li
                  key={item.followUp.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 border-t border-[var(--dash-soft)] px-4 py-3 first:border-0 sm:px-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_120px_130px_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold">
                      {item.lead.name}
                      {item.lead.company ? (
                        <span className="font-normal text-[var(--dash-quiet)]"> · {item.lead.company}</span>
                      ) : null}
                    </p>
                    <p className="truncate text-[12px] text-[var(--dash-quiet)]">{item.followUp.note || 'No note'}</p>
                    {/* Narrow screens have no room for the columns: the same facts, one line under the note. */}
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--dash-quiet)] xl:hidden">
                      <DuePill followUp={item.followUp} />
                      <DueAt item={item} />
                      <span aria-hidden="true">·</span>
                      <span>
                        <span className="sr-only">Stage: </span>
                        {item.lead.stage}
                      </span>
                    </p>
                  </div>

                  <span className="hidden truncate text-[12.5px] text-[var(--dash-quiet)] xl:block">
                    <DueAt item={item} />
                  </span>
                  <span className="hidden truncate text-[12.5px] text-[var(--dash-quiet)] xl:block">
                    <span className="sr-only">Stage: </span>
                    {item.lead.stage}
                  </span>
                  <span className="hidden xl:block">
                    <FollowUpPill followUp={item.followUp} />
                  </span>

                  <span className="flex flex-wrap justify-end gap-1.5">
                    <button
                      type="button"
                      className="dash-btn dash-btn-quiet h-8 text-[12.5px]"
                      disabled={complete.isPending}
                      onClick={() => done(item)}
                    >
                      {saving ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="size-3.5" aria-hidden="true" />
                      )}
                      Done
                      <span className="sr-only"> — follow-up with {item.lead.name}</span>
                    </button>
                    {/* The Active list: Won and Lost close a follow-up, so a lead with one open is always there. */}
                    <Link
                      to="/dashboard/leads"
                      search={{ view: undefined, layout: undefined, lead: item.lead.id }}
                      className="dash-btn dash-btn-ghost h-8 text-[12.5px]"
                    >
                      Open
                      <span className="sr-only"> {item.lead.name}</span>
                    </Link>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {followUps.data ? (
        <Pager
          page={followUps.data.page}
          pageCount={followUps.data.pageCount}
          total={followUps.data.total}
          noun={['follow-up', 'follow-ups']}
          onPage={setPage}
        />
      ) : null}

      <p className="text-[12px] text-[var(--dash-quiet)]">
        Times are Berlin time. No email or SMS reminders — the red count beside Leads in the sidebar and this list are
        the reminder.
      </p>
    </DashboardPage>
  )
}
