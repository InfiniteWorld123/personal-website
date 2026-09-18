import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Columns3, Search, Users } from 'lucide-react'
import { Input } from '#/frontend/components/ui/input'
import { Button } from '#/frontend/components/ui/button'
import { avatarHue, initialsOf, timeAgo } from '#/frontend/features/inbox/inbox-format'
import {
  DUE_CLASS,
  STAGE_CLASS,
  dueLabel,
  dueTone,
  money,
} from '#/frontend/features/leads/lead-format'
import { leadsQuery } from '#/frontend/features/leads/lead-queries'
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
    <div className="flex w-full flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>

        <div className="relative ms-auto w-full max-w-xs">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Name, company, a deal"
            className="ps-9"
            aria-label="Search people and deals"
          />
        </div>

        <select
          value={stage}
          onChange={(event) => setStage(event.currentTarget.value as StageFilter)}
          aria-label="Filter by stage"
          className="border-border bg-background h-9 rounded-md border px-2 text-sm"
        >
          {STAGE_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>

        <Button asChild size="sm" variant="outline">
          <Link to="/admin/leads/board">
            <Columns3 aria-hidden="true" />
            Board
          </Link>
        </Button>
      </header>

      {list.data ? <Numbers summary={list.data.summary} /> : null}

      {list.isPending ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : groups.length === 0 ? (
        <Empty search={search} stage={stage} />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-2">
              <h2
                className={cn(
                  'flex items-center gap-2 text-[11px] font-semibold tracking-widest uppercase',
                  group.tone === 'late' ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground',
                )}
              >
                {group.title}
                <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">
                  {group.rows.length}
                </span>
              </h2>

              <ul className="flex flex-col gap-2">
                {group.rows.map((row) => (
                  <li key={row.id}>
                    <Row row={row} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
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
 */
function Numbers({ summary }: { summary: LeadSummary }) {
  return (
    // Two columns even on a phone: four stacked tiles filled his whole screen
    // and pushed the list — the thing he came for — below the fold.
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Tile
        label="Open deals"
        value={String(summary.openDeals)}
        note={`across ${summary.openPeople} ${summary.openPeople === 1 ? 'person' : 'people'}`}
      />
      <Tile
        label="Build value, open"
        value={money(summary.openBuildCents)}
        note="possible — not money you have"
      />
      <Tile
        label="Monthly, confirmed"
        value={money(summary.confirmedMonthlyCents)}
        note="from won deals only"
        strong
      />
      <Tile
        label="Won / lost"
        value={`${summary.won} / ${summary.lost}`}
        note={
          summary.topLostReason
            ? `most often: ${LOST_REASON_LABEL[summary.topLostReason].toLowerCase()}`
            : 'nothing lost yet'
        }
      />
    </div>
  )
}

function Tile({
  label,
  value,
  note,
  strong,
}: {
  label: string
  value: string
  note: string
  strong?: boolean
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-3">
      <p className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-xl font-semibold tabular-nums',
          strong && 'text-emerald-600 dark:text-emerald-400',
        )}
      >
        {value}
      </p>
      <p className="text-muted-foreground mt-0.5 text-[11px]">{note}</p>
    </div>
  )
}

function Row({ row }: { row: LeadRow }) {
  const tone = dueTone(row.followUpOn)

  return (
    <Link
      to="/admin/leads/$personId"
      params={{ personId: row.id }}
      className="border-border bg-card hover:border-foreground/20 flex items-center gap-3 rounded-xl border p-3 transition-colors"
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

      <span className="flex shrink-0 flex-col items-end gap-1 text-right">
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
  if (search !== '') {
    return (
      <div className="border-border text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
        <Search aria-hidden="true" className="size-7 opacity-40" />
        <p className="text-sm">Nothing matches “{search}”.</p>
      </div>
    )
  }

  return (
    <div className="border-border text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
      <Users aria-hidden="true" className="size-7 opacity-40" />
      <p className="text-sm">
        {stage === 'ALL'
          ? 'Nobody has written or booked yet.'
          : stage === 'NONE'
            ? 'Everyone here has a deal.'
            : `No deal is at ${STAGE_LABEL[stage as DealStage].toLowerCase()}.`}
      </p>
      {stage === 'ALL' ? (
        <Link to="/admin/inbox" className="text-primary text-sm font-medium hover:underline">
          Open the inbox
        </Link>
      ) : null}
    </div>
  )
}
