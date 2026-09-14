import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/frontend/components/ui/table'
import { leadSettingsQuery, pipelineQuery } from '#/frontend/features/pipeline/pipeline-queries'
import { cn } from '#/frontend/lib/utils'
import { DEFAULT_LEAD_PREFERENCES, PIPELINE_SORTS, type PipelineSort } from '#/shared/validation/pipeline.validation'
import { LeadDrawer } from './LeadDrawer'
import { PipelineNumbers } from './PipelineNumbers'
import {
  CHANNEL_LABEL,
  describeCall,
  formatDue,
  formatMoney,
  SOURCE_LABEL,
  STAGE_COLOR,
  STAGE_LABEL,
} from './pipeline-format'

const SORT_LABEL: Record<PipelineSort, string> = {
  recent: 'Recent',
  value: 'Worth',
  oldest: 'Oldest',
  due: 'Follow-up',
}

/**
 * Everyone who ever reached him, dense and sortable.
 *
 * The board is for seeing the shape of the pipeline; this is for finding one
 * person among two hundred.
 */
export function AllLeadsPage({ search }: { search: { lead?: string; sort?: string } }) {
  const navigate = useNavigate({ from: '/admin/leads/all' })
  const settings = useQuery(leadSettingsQuery())
  const preferences = settings.data?.preferences ?? DEFAULT_LEAD_PREFERENCES

  const sort = (PIPELINE_SORTS as readonly string[]).includes(search.sort ?? '')
    ? (search.sort as PipelineSort)
    : 'recent'

  const board = useQuery(pipelineQuery({ service: 'all', search: '', sort, withClosed: true }))
  const cards = (board.data?.columns ?? []).flatMap((column) => column.cards)
  const openCard = cards.find((card) => card.id === search.lead) ?? null

  const setSearch = (next: { lead?: string; sort?: string }) =>
    void navigate({ search: (previous) => ({ ...previous, ...next }) })

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">All leads</h1>
        <p className="text-muted-foreground mt-1 text-sm">Everyone who ever reached you, in one list.</p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground text-[0.7rem] font-medium tracking-wider uppercase">Sort</span>
        {PIPELINE_SORTS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={sort === candidate}
            onClick={() => setSearch({ sort: candidate })}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs transition-colors',
              sort === candidate
                ? 'bg-accent text-accent-foreground border-transparent font-medium'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {SORT_LABEL[candidate]}
          </button>
        ))}
      </div>

      {board.data ? <PipelineNumbers stats={board.data.stats} preferences={preferences} /> : null}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Stage</TableHead>
              {preferences.wires.serviceSpine ? <TableHead>Service</TableHead> : null}
              <TableHead className="text-end">Worth</TableHead>
              <TableHead>Source</TableHead>
              {preferences.wires.callsLens ? <TableHead>Call</TableHead> : null}
              <TableHead>Follow-up</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.map((card) => (
              <TableRow
                key={card.id}
                onClick={() => setSearch({ lead: card.id })}
                className="cursor-pointer"
              >
                <TableCell>
                  <span className="font-medium">{card.name}</span>
                  {card.company ? (
                    <span className="text-muted-foreground block text-xs">{card.company}</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <span
                    className="rounded-full border px-1.5 py-px text-[0.68rem]"
                    style={{ borderColor: STAGE_COLOR[card.status], color: STAGE_COLOR[card.status] }}
                  >
                    {STAGE_LABEL[card.status]}
                  </span>
                </TableCell>
                {preferences.wires.serviceSpine ? (
                  <TableCell>
                    {card.service ? (
                      <span
                        className="rounded-full px-1.5 py-px text-[0.68rem] font-medium"
                        style={{ backgroundColor: `${card.service.accent}20`, color: card.service.accent }}
                      >
                        {card.service.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                ) : null}
                <TableCell className="text-end tabular-nums">
                  {formatMoney(card.valueCents, card.currency)}
                </TableCell>
                <TableCell className="text-xs">
                  {card.source === 'MANUAL' && card.channel
                    ? CHANNEL_LABEL[card.channel]
                    : SOURCE_LABEL[card.source]}
                </TableCell>
                {preferences.wires.callsLens ? (
                  <TableCell className="text-xs">
                    {card.call ? describeCall(card.call) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                ) : null}
                <TableCell
                  className={cn(
                    'text-xs',
                    card.followUpInDays !== null && card.followUpInDays < 0 && 'text-destructive font-semibold',
                  )}
                >
                  {card.followUpInDays === null ? '—' : formatDue(card.followUpInDays)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <LeadDrawer
        card={openCard}
        preferences={preferences}
        services={board.data?.services ?? []}
        onClose={() => setSearch({ lead: undefined })}
      />
    </div>
  )
}
