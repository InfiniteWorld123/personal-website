import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus, Search } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import {
  leadSettingsQuery,
  pipelineQuery,
  todayQuery,
  useSetLeadStage,
} from '#/frontend/features/pipeline/pipeline-queries'
import { cn } from '#/frontend/lib/utils'
import { DEFAULT_LEAD_PREFERENCES, type PipelineFilterInput } from '#/shared/validation/pipeline.validation'
import type { LeadStatus } from '#/shared/validation/lead.validation'
import { LeadCard } from './LeadCard'
import { LeadDrawer } from './LeadDrawer'
import { NewLeadDialog } from './NewLeadDialog'
import { PipelineNumbers } from './PipelineNumbers'
import { TodayStrip } from './TodayStrip'
import { formatMoney, STAGE_COLOR, STAGE_LABEL } from './pipeline-format'

export type PipelineSearch = {
  service?: string
  search?: string
  lead?: string
}

/**
 * The board.
 *
 * Every card is the same row the inbox shows; moving one writes a stage, a
 * date and a line of history, and the inbox sees all three a second later.
 */
export function PipelinePage({ search }: { search: PipelineSearch }) {
  const navigate = useNavigate({ from: '/admin/leads/pipeline' })
  const settings = useQuery(leadSettingsQuery())
  const preferences = settings.data?.preferences ?? DEFAULT_LEAD_PREFERENCES

  const filter: PipelineFilterInput = {
    service: preferences.wires.serviceFilter ? (search.service ?? 'all') : 'all',
    search: search.search ?? '',
    sort: 'recent',
    withClosed: true,
  }

  const board = useQuery(pipelineQuery(filter))
  const today = useQuery({ ...todayQuery(), enabled: preferences.followUp.todayStrip })
  const setStage = useSetLeadStage()

  const [draft, setDraft] = useState(search.search ?? '')
  const [adding, setAdding] = useState(false)
  const [dragOver, setDragOver] = useState<LeadStatus | null>(null)

  const setSearch = (next: Partial<PipelineSearch>) =>
    void navigate({ search: (previous) => ({ ...previous, ...next }) })

  const openCard = useMemo(() => {
    if (!search.lead) return null

    for (const column of board.data?.columns ?? []) {
      const found = column.cards.find((card) => card.id === search.lead)
      if (found) return found
    }

    return null
  }, [board.data, search.lead])

  const drop = (status: LeadStatus, event: React.DragEvent) => {
    event.preventDefault()
    setDragOver(null)

    const id = event.dataTransfer.getData('text/lead-id')
    if (!id) return

    // LOST needs a reason, and the board has nowhere to ask for one, so the
    // drawer opens and asks instead of the drop failing at the constraint.
    if (status === 'LOST' && preferences.closing.lostReasonRequired) {
      setSearch({ lead: id })

      return
    }

    setStage.mutate({ id, status })
  }

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Where every open enquiry stands, and what it is worth.
          </p>
        </div>
        {preferences.manual.addButton ? (
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" className="size-4" />
            New lead
          </Button>
        ) : null}
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {preferences.wires.serviceFilter ? (
          <>
            <span className="text-muted-foreground text-[0.7rem] font-medium tracking-wider uppercase">
              Service
            </span>
            <ServiceChip
              active={filter.service === 'all'}
              onClick={() => setSearch({ service: undefined })}
              label="All"
            />
            {(board.data?.services ?? []).map((service) => (
              <ServiceChip
                key={service.id}
                active={filter.service === service.id}
                accent={service.accent}
                onClick={() => setSearch({ service: service.id })}
                label={service.name}
              />
            ))}
          </>
        ) : null}

        <form
          className="ms-auto flex min-w-48 flex-1 items-center gap-2 rounded-md border px-2.5 py-1.5 sm:max-w-64"
          onSubmit={(event) => {
            event.preventDefault()
            setSearch({ search: draft || undefined })
          }}
        >
          <Search aria-hidden="true" className="text-muted-foreground size-3.5" />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search a name…"
            aria-label="Search leads"
            className="placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
          />
        </form>
      </div>

      {board.data ? <PipelineNumbers stats={board.data.stats} preferences={preferences} /> : null}

      {preferences.followUp.todayStrip && today.data ? (
        <TodayStrip
          today={today.data}
          preferences={preferences}
          full={false}
          onOpen={(id) => setSearch({ lead: id })}
        />
      ) : null}

      {board.isLoading ? (
        <p className="text-muted-foreground py-12 text-center text-sm">Reading the board…</p>
      ) : (
        <div className="grid auto-cols-[minmax(13rem,1fr)] grid-flow-col gap-2 overflow-x-auto pb-2">
          {(board.data?.columns ?? []).map((column) => (
            <section
              key={column.status}
              onDragOver={(event) => {
                event.preventDefault()
                setDragOver(column.status)
              }}
              onDragLeave={() => setDragOver((current) => (current === column.status ? null : current))}
              onDrop={(event) => drop(column.status, event)}
              className={cn(
                'bg-muted min-h-44 rounded-lg p-2 transition-[outline]',
                dragOver === column.status && 'outline-primary -outline-offset-2 outline-2 outline-dashed',
              )}
            >
              <h2 className="text-muted-foreground mx-1 mb-2 flex items-center gap-1.5 text-[0.7rem] font-medium tracking-wider uppercase">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: STAGE_COLOR[column.status] }}
                />
                {STAGE_LABEL[column.status]}
                <span className="ms-auto font-normal">{column.cards.length}</span>
              </h2>
              {preferences.card.value && column.cards.length > 0 ? (
                <p className="text-muted-foreground mx-1 mb-2 text-[0.68rem]">
                  {formatMoney(column.totalCents)}
                </p>
              ) : null}

              <div className="space-y-2">
                {column.cards.map((card) => (
                  <LeadCard
                    key={card.id}
                    card={card}
                    preferences={preferences}
                    onOpen={(id) => setSearch({ lead: id })}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <LeadDrawer
        card={openCard}
        preferences={preferences}
        services={board.data?.services ?? []}
        onClose={() => setSearch({ lead: undefined })}
      />

      <NewLeadDialog
        open={adding}
        services={board.data?.services ?? []}
        preferences={preferences}
        onOpenChange={setAdding}
        onCreated={(id) => setSearch({ lead: id })}
      />
    </div>
  )
}

function ServiceChip({
  active,
  label,
  accent,
  onClick,
}: {
  active: boolean
  label: string
  accent?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
        active ? 'bg-accent text-accent-foreground border-transparent font-medium' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {accent ? (
        <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: accent }} />
      ) : null}
      {label}
    </button>
  )
}
