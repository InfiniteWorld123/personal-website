import { useQueryClient } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { Clock, LayoutGrid, List as ListIcon, Plus, SlidersHorizontal, Upload } from 'lucide-react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { FollowUp, StageKind } from '#/backend2/contracts/lead.contract'
import { PageHead, StatusChip } from '#/frontend/dashboard/primitives'
import { formatFollowUp } from '#/frontend/features/leads-v2/lead-form'
import { leadKeys, useDueFollowUpCount } from '#/frontend/features/leads-v2/queries'
import { cn } from '#/frontend/lib/utils'

/**
 * The pieces every Leads screen shares, as approved in the Leads Design Lab
 * (23 Sep 2026). The generic list pieces are the Clients ones, re-exported so
 * both directories look and behave the same.
 */

export { EmptyState, LoadFailure, Pager, RowSkeleton } from '../clients/client-parts'

/** A stage as a chip: Won in blue, Lost as an outline, the rest grey — never colour alone. */
export function StageChip({ kind, name }: { kind: StageKind; name: string }) {
  return <StatusChip tone={kind === 'won' ? 'blue' : kind === 'lost' ? 'outline' : 'grey'}>{name}</StatusChip>
}

/**
 * The current minute, shared by every due indicator on screen. The server's
 * `isDue` is only true as of the moment it answered, and a list, a Board card
 * or a lead's file can stay open well past a follow-up's time; this lets
 * "Due" appear at the chosen time instead of at the next write or window
 * focus. One timer serves every subscriber and stops with the last one.
 * Follow-ups are set to the minute, so nothing finer is needed.
 */
const MINUTE = 60_000
const minuteListeners = new Set<() => void>()
let minuteTimer: ReturnType<typeof setTimeout> | undefined

const currentMinute = () => Math.floor(Date.now() / MINUTE)

/** Waits for the next minute boundary rather than a fixed 60s, so a 10:00 follow-up is due at 10:00, not by 10:01. */
const scheduleMinute = () => {
  minuteTimer = setTimeout(
    () => {
      for (const listener of minuteListeners) listener()
      scheduleMinute()
    },
    MINUTE - (Date.now() % MINUTE),
  )
}

const subscribeToMinute = (listener: () => void) => {
  minuteListeners.add(listener)
  if (minuteTimer === undefined) scheduleMinute()

  return () => {
    minuteListeners.delete(listener)
    if (minuteListeners.size === 0) {
      clearTimeout(minuteTimer)
      minuteTimer = undefined
    }
  }
}

/** No clock during server rendering or hydration: the server's own `isDue` stands alone until the browser takes over. */
const noMinute = () => null

/**
 * Whether an open follow-up is due now: the server's word, or its time has
 * passed since the server answered. Exported so every place that shows
 * due-ness can read the same clock.
 */
export function useFollowUpDue(followUp: FollowUp | null): boolean {
  const minute = useSyncExternalStore(subscribeToMinute, currentMinute, noMinute)

  if (!followUp || followUp.status !== 'open') return false

  return followUp.isDue || (minute !== null && Date.parse(followUp.dueAt) <= minute * MINUTE)
}

/** "Due" in red, or the day it is due. Nothing when there is no open follow-up. */
export function FollowUpPill({ followUp }: { followUp: FollowUp | null }) {
  const due = useFollowUpDue(followUp)

  if (!followUp || followUp.status !== 'open') return null

  return due ? (
    <StatusChip tone="red">
      <Clock className="size-3.5" aria-hidden="true" />
      Due
    </StatusChip>
  ) : (
    <StatusChip tone="grey">
      <Clock className="size-3.5" aria-hidden="true" />
      <span className="sr-only">Follow-up </span>
      {formatFollowUp(followUp)}
    </StatusChip>
  )
}

/**
 * How every Leads screen opens: title, and the three ways to add or shape leads.
 *
 * On a phone the two quiet buttons keep only their icons, with their names
 * still read out by screen readers. PageHead holds its actions box at full
 * width (`shrink-0`), so wrapping inside it never happens: three labelled
 * buttons measure about 387px and pushed a 375px screen sideways. Icons alone
 * bring the row to about 220px, which fits down to 320px.
 */
export function LeadsHead({ title = 'Leads', description }: { title?: string; description?: string }) {
  return (
    <PageHead
      eyebrow="PIPELINE"
      title={title}
      description={description ?? 'People who may become clients. Only you add them — nothing arrives here on its own.'}
      actions={
        <>
          <Link to="/dashboard/leads/lists" className="dash-btn dash-btn-quiet">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            <span className="max-sm:sr-only">Stages &amp; lists</span>
          </Link>
          <Link to="/dashboard/leads/import" className="dash-btn dash-btn-quiet">
            <Upload className="size-4" aria-hidden="true" />
            <span className="max-sm:sr-only">Import CSV</span>
          </Link>
          <Link to="/dashboard/leads/new" className="dash-btn dash-btn-primary">
            <Plus className="size-4" aria-hidden="true" />
            New lead
          </Link>
        </>
      }
    />
  )
}

/** The Leads reads that carry a follow-up's `isDue`: lists, Board columns, a lead's file and Follow-ups. */
const DUE_BEARING_READS = new Set(['list', 'board', 'one', 'follow-ups'])

/**
 * The due count is re-read every minute; nothing else in Leads is. When it
 * rises, a follow-up's time has passed, so the reads that show due-ness from
 * the server are re-read too: the lead's file and the Follow-ups "Due now"
 * filter, which the minute clock above cannot reach. Only a rise: a falling
 * count comes from a write, and writes already refresh all of Leads. A write
 * that raises it (a restored lead, a follow-up set earlier today) costs one
 * extra re-read, nothing more.
 */
function useRefreshWhenFollowUpsFallDue(due: number | undefined) {
  const client = useQueryClient()
  const previous = useRef(due)

  useEffect(() => {
    const before = previous.current
    previous.current = due
    if (due === undefined || before === undefined || due <= before) return

    void client.invalidateQueries({
      queryKey: leadKeys.all,
      predicate: (query) => DUE_BEARING_READS.has(String(query.queryKey[2])),
    })
  }, [client, due])
}

export type LeadsTab = 'active' | 'won' | 'lost' | 'follow-ups' | 'trash'

/**
 * Active, Won, Lost, Follow-ups and Trash — the same leads, never copied —
 * and the List/Board switch, which only applies to the first three.
 */
export function LeadsTabs({
  tab,
  layout,
  counts,
}: {
  tab: LeadsTab
  layout?: 'list' | 'board'
  counts?: Partial<Record<'active' | 'won' | 'lost', number>>
}) {
  const dueCount = useDueFollowUpCount().data?.due
  const due = dueCount ?? 0
  // Every screen with these tabs shows due-ness, so this is where they are kept current.
  useRefreshWhenFollowUpsFallDue(dueCount)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const onDirectory = pathname === '/dashboard/leads' || pathname === '/dashboard/leads/'

  const tabClass = (on: boolean) =>
    cn(
      'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px]',
      on
        ? 'bg-[var(--dash-chip)] font-semibold text-[var(--dash-ink)]'
        : 'text-[var(--dash-quiet)] hover:bg-[var(--dash-hover)]',
    )

  const count = (value: number | undefined) =>
    value === undefined ? null : (
      <span className="dash-num rounded-[5px] bg-[var(--dash-chip)] px-1.5 text-[10.5px] font-bold">{value}</span>
    )

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5">
      <nav aria-label="Which leads" className="flex flex-wrap gap-1">
        {(['active', 'won', 'lost'] as const).map((view) => (
          <Link
            key={view}
            to="/dashboard/leads"
            // Won and Lost are lists; the Board is only for active leads.
            search={{
              view: view === 'active' ? undefined : view,
              layout: view === 'active' && layout === 'board' ? 'board' : undefined,
            }}
            aria-current={onDirectory && tab === view ? 'page' : undefined}
            className={tabClass(tab === view)}
          >
            {view === 'active' ? 'Active' : view === 'won' ? 'Won' : 'Lost'}
            {count(counts?.[view])}
          </Link>
        ))}
        <Link
          to="/dashboard/leads/follow-ups"
          aria-current={tab === 'follow-ups' ? 'page' : undefined}
          className={tabClass(tab === 'follow-ups')}
        >
          Follow-ups
          {due > 0 ? (
            <span className="dash-num rounded-[5px] bg-[var(--dash-red)] px-1.5 text-[10.5px] font-bold text-white">
              {due} due
            </span>
          ) : null}
        </Link>
        <Link
          to="/dashboard/leads/trash"
          aria-current={tab === 'trash' ? 'page' : undefined}
          className={tabClass(tab === 'trash')}
        >
          Trash
        </Link>
      </nav>

      {layout ? (
        <div role="group" aria-label="Layout" className="inline-flex rounded-[10px] bg-[var(--dash-chip)] p-[3px]">
          {(['list', 'board'] as const).map((value) => (
            <Link
              key={value}
              to="/dashboard/leads"
              search={{
                layout: value === 'board' ? 'board' : undefined,
                view: value === 'list' && (tab === 'won' || tab === 'lost') ? tab : undefined,
              }}
              // A link, so it says which layout is current rather than claiming to be a toggle button.
              aria-current={layout === value ? 'true' : undefined}
              className={cn(
                'dash-seg inline-flex h-[30px] items-center gap-1.5 rounded-lg px-3 text-[12.5px]',
                layout === value && 'shadow-[0_1px_2px_rgba(16,23,47,.08)]',
              )}
              data-on={layout === value}
            >
              {value === 'list' ? (
                <ListIcon className="size-3.5" aria-hidden="true" />
              ) : (
                <LayoutGrid className="size-3.5" aria-hidden="true" />
              )}
              {value === 'list' ? 'List' : 'Board'}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** The notification the owner asked for: due follow-ups, said on Leads itself. */
export function DueBanner() {
  const due = useDueFollowUpCount().data?.due ?? 0

  if (due === 0) return null

  return (
    <div
      role="status"
      className="dash-tone-red flex flex-wrap items-center justify-between gap-2 rounded-[10px] px-3.5 py-2.5 text-[12.5px]"
    >
      <span className="flex items-center gap-2 text-[var(--dash-ink)]">
        <Clock className="size-4 text-[var(--dash-red-ink)]" aria-hidden="true" />
        <strong>
          {due} follow-up{due === 1 ? ' is' : 's are'} due
        </strong>
      </span>
      <Link
        to="/dashboard/leads/follow-ups"
        search={{ when: 'due' }}
        className="dash-btn dash-btn-quiet h-8 text-[12px]"
      >
        Open follow-ups
      </Link>
    </div>
  )
}
