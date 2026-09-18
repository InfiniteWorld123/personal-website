import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Columns3, Search, Users } from 'lucide-react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelNote } from '#/frontend/components/admin/Panel'
import { StatCard, StatCardSkeleton } from '#/frontend/components/admin/StatCard'
import { Input } from '#/frontend/components/ui/input'
import { Button } from '#/frontend/components/ui/button'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import { avatarHue, initialsOf, timeAgo } from '#/frontend/features/inbox/inbox-format'
import { inboxQuery } from '#/frontend/features/inbox/inbox-queries'
import {
  DUE_CLASS,
  STAGE_CLASS,
  dueLabel,
  dueTone,
  money,
} from '#/frontend/features/leads/lead-format'
import { boardQuery, leadFileQuery, leadsQuery } from '#/frontend/features/leads/lead-queries'
import { usePrefetch } from '#/frontend/lib/prefetch'
import { cn } from '#/frontend/lib/utils'
import type { LeadRow, LeadSummary } from '#/shared/types/lead.types'
import {
  DEAL_STAGES,
  LOST_REASON_LABEL,
  STAGE_LABEL,
  isOpenStage,
  type DealStage,
} from '#/shared/validation/lead.validation'

/**
 * Leads: a list of people, and what each of them is worth doing next.
 *
 * He chose the list over a board as the screen this section opens on, and the
 * reason shows on a phone: a row reads at 375px, a five-column board does not,
 * and he works from his phone. The board is a tab beside it, not instead of it.
 *
 * The list is **grouped by what is due**, not sorted by it, because "overdue"
 * and "later" are different kinds of thing rather than different values of the
 * same thing — and the fourth group, people who wrote but have no deal, is the
 * consequence of his own answer that everyone who writes or books belongs here.
 *
 * Each group is now one panel with flush rows rather than a stack of separate
 * little cards: the heading names the group on the canvas, and the single
 * surface beneath it *is* the group. Twenty floating cards said nothing about
 * which of them belonged together.
 */

type StageFilter = DealStage | 'ALL' | 'NONE'

/**
 * Is anything still open with this person?
 *
 * The row speaks for its most urgent open deal when there is one, so an open
 * headline means the conversation is alive and a closed one means every deal
 * they have is finished.
 */
const isStillMoving = (row: LeadRow): boolean =>
  row.headline !== null && isOpenStage(row.headline.stage)

const STAGE_FILTERS: Array<{ value: StageFilter; label: string }> = [
  { value: 'ALL', label: 'Everyone' },
  ...DEAL_STAGES.map((stage) => ({ value: stage as StageFilter, label: STAGE_LABEL[stage] })),
  { value: 'NONE', label: 'No deal yet' },
]

export function LeadsPage() {
  const prefetch = usePrefetch()
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<StageFilter>('ALL')

  const list = useQuery(leadsQuery(stage, search))
  const rows = list.data?.rows ?? []

  const groups = [
    { key: 'late', title: 'Overdue', tone: 'late' as const, rows: rows.filter((row) => row.dealCount > 0 && dueTone(row.followUpOn) === 'late') },
    { key: 'today', title: 'Today', tone: 'today' as const, rows: rows.filter((row) => row.dealCount > 0 && dueTone(row.followUpOn) === 'today') },
    {
      key: 'later',
      title: 'Later, or no date set',
      tone: 'later' as const,
      rows: rows.filter(
        (row) =>
          row.dealCount > 0 &&
          isStillMoving(row) &&
          !['late', 'today'].includes(dueTone(row.followUpOn)),
      ),
    },
    // Won and lost are not "later": a finished deal is not waiting for
    // anything, and reading it under a heading about dates made the group say
    // something untrue about it.
    {
      key: 'closed',
      title: 'Closed',
      tone: 'none' as const,
      rows: rows.filter((row) => row.dealCount > 0 && !isStillMoving(row)),
    },
    { key: 'none', title: 'Wrote to you · no deal', tone: 'none' as const, rows: rows.filter((row) => row.dealCount === 0) },
  ].filter((group) => group.rows.length > 0)

  return (
    <AdminPage>
      <PageHeader
        title="Leads"
        description="Everyone who has written or booked, grouped by what you owe them next."
        actions={
          <Button asChild className="rounded-full" size="sm" variant="outline">
            {/* The board reads the same deals through its own query, so the
                hover pays for the columns before the click asks for them. */}
            <Link to="/admin/leads/board" {...prefetch(boardQuery())}>
              <Columns3 aria-hidden="true" />
              Board
            </Link>
          </Button>
        }
      />

      {list.isPending ? <NumbersSkeleton /> : list.data ? <Numbers summary={list.data.summary} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Name, company, a deal"
            className="bg-panel ps-9"
            aria-label="Search people and deals"
          />
        </div>

        <select
          value={stage}
          onChange={(event) => setStage(event.currentTarget.value as StageFilter)}
          aria-label="Filter by stage"
          className="border-border bg-panel focus-visible:ring-ring h-9 rounded-full border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          {STAGE_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>
      </div>

      {list.isPending ? (
        <GroupsSkeleton />
      ) : list.isError ? (
        /*
          Said, rather than shown as an empty list.
          A failed request used to fall straight through to the empty panel, so
          a section that was merely down told him nobody had ever written to
          him — which is the one lie a list of people must never tell.
        */
        <Panel>
          <PanelNote tone="error">
            <div>
              <p className="font-medium">The people could not be loaded.</p>
              <p className="text-muted-foreground mt-1">
                {list.error instanceof Error ? list.error.message : 'Something went wrong.'}
              </p>
            </div>
            <Button onClick={() => void list.refetch()} size="sm" variant="outline">
              Try again
            </Button>
          </PanelNote>
        </Panel>
      ) : groups.length === 0 ? (
        <Empty search={search} stage={stage} />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-2">
              <h2
                className={cn(
                  'flex items-center gap-2 px-1 text-[11px] font-semibold tracking-widest uppercase',
                  group.tone === 'late' ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground',
                )}
              >
                {group.title}
                <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">
                  {group.rows.length}
                </span>
              </h2>

              <Panel className="overflow-hidden">
                <ul>
                  {/* The rule lives on the `li`, not on the link inside it: a
                      link that is the only child of its item is always
                      `:last-child`, so `last:border-b-0` on the link would
                      quietly erase every separator in the group rather than
                      the final one. */}
                  {group.rows.map((row) => (
                    <li className="border-border/60 border-b last:border-b-0" key={row.id}>
                      <Row row={row} />
                    </li>
                  ))}
                </ul>
              </Panel>
            </section>
          ))}
        </div>
      )}
    </AdminPage>
  )
}

/**
 * The four figures he asked for.
 *
 * Every one is counted from the deals in the same request as the rows below,
 * and the two money figures never meet: a build price is paid once and ends, a
 * subscription does not. Their captions say which is which in words, because
 * the whole reason the last system was deleted is that a number on a screen
 * meant something other than what he read into it.
 *
 * One card carries the brand fill, and it is the monthly one: the instalment
 * ends, the subscription does not, and that is the figure this whole section
 * exists to grow. The other three qualify it.
 */

/**
 * Two columns on a phone means half of 375px per card, and `1.490 €` set in
 * the serif at 2.6rem does not fit in it — so the figure steps down until
 * there is room for it. `tabular` is already on the card; this only touches
 * the size, and only below `sm`.
 */
const FIGURE = 'text-[1.6rem] sm:text-[2.6rem]'

/** The card's own padding is generous for a desk and too wide for a phone. */
const TILE = 'p-4 sm:p-6'

function Numbers({ summary }: { summary: LeadSummary }) {
  return (
    // Two columns even on a phone: four stacked tiles filled his whole screen
    // and pushed the list — the thing he came for — below the fold.
    <section aria-label="Figures" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatCard
        className={TILE}
        label="Open deals"
        value={<span className={FIGURE}>{summary.openDeals}</span>}
        foot={`across ${summary.openPeople} ${summary.openPeople === 1 ? 'person' : 'people'}`}
      />
      <StatCard
        className={TILE}
        label="Build value, open"
        value={<span className={FIGURE}>{money(summary.openBuildCents)}</span>}
        foot="possible — not money you have"
      />
      <StatCard
        className={TILE}
        label="Monthly, confirmed"
        value={<span className={FIGURE}>{money(summary.confirmedMonthlyCents)}</span>}
        foot="from won deals only"
        tone="brand"
      />
      <StatCard
        className={TILE}
        label="Won / lost"
        value={
          <span className={FIGURE}>
            {summary.won} / {summary.lost}
          </span>
        }
        foot={
          summary.topLostReason
            ? `most often: ${LOST_REASON_LABEL[summary.topLostReason].toLowerCase()}`
            : 'nothing lost yet'
        }
      />
    </section>
  )
}

/** Four boxes at the size the four figures will be. Nothing moves on arrival. */
function NumbersSkeleton() {
  return (
    <SkeletonScreen className="grid grid-cols-2 gap-4 xl:grid-cols-4" label="Loading the figures">
      <StatCardSkeleton className={TILE} />
      <StatCardSkeleton className={TILE} />
      <StatCardSkeleton className={TILE} />
      <StatCardSkeleton className={TILE} />
    </SkeletonScreen>
  )
}

/**
 * The grouped list, not yet arrived.
 *
 * Two headed panels rather than one long one, because that is the shape the
 * list nearly always has: something is due, and something is not.
 */
function GroupsSkeleton() {
  return (
    <SkeletonScreen className="flex flex-col gap-6" label="Loading the people">
      {[3, 3].map((count, group) => (
        <div className="flex flex-col gap-2" key={group}>
          <Skeleton className="ms-1 h-3 w-28" />

          <Panel className="overflow-hidden">
            {Array.from({ length: count }, (_, index) => (
              <div
                className="border-border/60 flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0"
                key={index}
              >
                <Skeleton className="size-9 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="mt-2 h-3 w-52" />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Skeleton className="h-4 w-20 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </Panel>
        </div>
      ))}
    </SkeletonScreen>
  )
}

function Row({ row }: { row: LeadRow }) {
  const prefetch = usePrefetch()
  const tone = dueTone(row.followUpOn)

  return (
    <Link
      to="/admin/leads/$personId"
      params={{ personId: row.id }}
      // The file this row opens, fetched while the pointer is still on it.
      {...prefetch(leadFileQuery(row.id))}
      className="hover:bg-accent/50 focus-visible:ring-ring flex items-center gap-3 px-5 py-3.5 motion-safe:transition-colors focus-visible:ring-2 focus-visible:-outline-offset-2 focus-visible:outline-none"
    >
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-lg text-[11px] font-semibold text-white"
        style={{ backgroundColor: `hsl(${avatarHue(row.email)} 58% 45%)` }}
      >
        {initialsOf(row.name)}
      </span>

      {/* `block truncate` on every row that can outgrow its track, and
          `dir="auto"` on every field that can hold German or Arabic: an
          ellipsis on an inline element does nothing, and a German company name
          in an Arabic row truncates at the wrong end. */}
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate text-sm font-medium">
          {row.name}
        </span>
        <span dir="auto" className="text-muted-foreground block truncate text-xs">
          {row.company ?? row.email}
        </span>
        {row.headline && row.headline.nextStep !== '' ? (
          <span dir="auto" className="text-foreground/70 mt-0.5 block truncate text-xs">
            → {row.headline.nextStep}
          </span>
        ) : null}
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1 text-end">
        {row.headline ? (
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-medium',
              STAGE_CLASS[row.headline.stage],
            )}
          >
            {STAGE_LABEL[row.headline.stage]}
            {row.dealCount > 1 ? ` · ${row.dealCount}` : ''}
          </span>
        ) : (
          <span className="border-border text-muted-foreground rounded-full border border-dashed px-2 py-0.5 text-[10px]">
            no deal
          </span>
        )}

        {row.headline ? (
          // A finished deal still shows its price, quietly: it is what the
          // deal was worth, not money on its way to him.
          <span
            className={cn('text-xs tabular-nums', !isStillMoving(row) && 'text-muted-foreground')}
          >
            {money(row.openBuildCents > 0 ? row.openBuildCents : row.headline.buildCents)}
            {row.wonMonthlyCents > 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                {' · '}
                {money(row.wonMonthlyCents)}/mo
              </span>
            ) : null}
          </span>
        ) : null}

        <span className={cn('text-[11px]', DUE_CLASS[tone])}>
          {row.followUpOn ? dueLabel(row.followUpOn) : timeAgo(row.lastMessageAt)}
        </span>
      </span>
    </Link>
  )
}

/** An empty list says which kind of empty it is — the three call for different moves. */
function Empty({ search, stage }: { search: string; stage: StageFilter }) {
  const prefetch = usePrefetch()

  if (search !== '') {
    return (
      <Panel>
        <PanelNote>
          <Search aria-hidden="true" className="size-7 opacity-40" />
          <p className="text-sm">Nothing matches “{search}”.</p>
        </PanelNote>
      </Panel>
    )
  }

  return (
    <Panel>
      <PanelNote>
        <Users aria-hidden="true" className="size-7 opacity-40" />
        <p className="text-sm">
          {stage === 'ALL'
            ? 'Nobody has written or booked yet.'
            : stage === 'NONE'
              ? 'Everyone here has a deal.'
              : `No deal is at ${STAGE_LABEL[stage as DealStage].toLowerCase()}.`}
        </p>
        {stage === 'ALL' ? (
          <Link
            to="/admin/inbox"
            // The inbox opens on its own default lens with no search.
            {...prefetch(inboxQuery('inbox', ''))}
            className="text-primary text-sm font-medium hover:underline"
          >
            Open the inbox
          </Link>
        ) : null}
      </PanelNote>
    </Panel>
  )
}
