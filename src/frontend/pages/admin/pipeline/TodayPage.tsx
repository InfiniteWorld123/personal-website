import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { leadSettingsQuery, pipelineQuery, todayQuery } from '#/frontend/features/pipeline/pipeline-queries'
import { DEFAULT_LEAD_PREFERENCES } from '#/shared/validation/pipeline.validation'
import { LeadDrawer } from './LeadDrawer'
import { TodayStrip } from './TodayStrip'

/**
 * The first question of the working day, answered on its own page.
 *
 * It reads the same list the board carries at the top, so there is one answer
 * to "what now" rather than two that can disagree.
 */
export function TodayPage({ search }: { search: { lead?: string } }) {
  const navigate = useNavigate({ from: '/admin/leads/today' })
  const settings = useQuery(leadSettingsQuery())
  const preferences = settings.data?.preferences ?? DEFAULT_LEAD_PREFERENCES
  const today = useQuery(todayQuery())
  const board = useQuery(pipelineQuery({ service: 'all', search: '', sort: 'due', withClosed: false }))

  const openCard =
    (board.data?.columns ?? []).flatMap((column) => column.cards).find((card) => card.id === search.lead) ?? null

  const setLead = (lead: string | undefined) =>
    void navigate({ search: (previous) => ({ ...previous, lead }) })

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Everything that wants you today, wherever it came from.
        </p>
      </header>

      {today.isLoading ? (
        <p className="text-muted-foreground py-12 text-center text-sm">Looking…</p>
      ) : today.data ? (
        <>
          <TodayStrip today={today.data} preferences={preferences} full onOpen={setLead} />

          {today.data.applied.callsMarkedHeld > 0 || today.data.applied.leadsAutoClosed > 0 ? (
            <p className="text-muted-foreground text-xs">
              On this read: {today.data.applied.callsMarkedHeld} call
              {today.data.applied.callsMarkedHeld === 1 ? '' : 's'} written into their histories,{' '}
              {today.data.applied.leadsAutoClosed} lead
              {today.data.applied.leadsAutoClosed === 1 ? '' : 's'} closed by a rule.
            </p>
          ) : null}
        </>
      ) : null}

      <LeadDrawer
        card={openCard}
        preferences={preferences}
        services={board.data?.services ?? []}
        onClose={() => setLead(undefined)}
      />
    </div>
  )
}
