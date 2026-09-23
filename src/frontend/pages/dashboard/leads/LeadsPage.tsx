import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Plus, Search, Upload } from 'lucide-react'
import { COUNTRIES } from '#/backend2/contracts/country.contract'
import { LEAD_LIMITS, LEAD_PAGE_SIZE, type OwnerLeadListItem } from '#/backend2/contracts/lead.contract'
import { DashboardPage } from '#/frontend/dashboard/primitives'
import { useNiches } from '#/frontend/features/clients/queries'
import { useChoices, useLeads, useStages } from '#/frontend/features/leads-v2/queries'
import { cn } from '#/frontend/lib/utils'
import { LeadFile } from './LeadFile'
import { LeadsBoard } from './LeadsBoard'
import {
  DueBanner,
  EmptyState,
  FollowUpPill,
  LeadsHead,
  LeadsTabs,
  LoadFailure,
  Pager,
  RowSkeleton,
  StageChip,
} from './lead-parts'

/**
 * The Leads directory. `docs/v2/leads.md` owns what it does.
 *
 * Approved in the Leads Design Lab (23 Sep 2026): Active leads by default,
 * newest first, in pages of 25; Won, Lost, Follow-ups and Trash one click
 * away — the same leads, never copied — and a List/Board switch. A lead's
 * file opens **beside** the list on a computer, so the owner keeps their
 * place, and takes the whole screen on a phone. The view, the layout and the
 * open lead live in the address, so a link can open any of them; an address
 * that names no layout opens the one this browser last chose.
 */

export type LeadsSearch = { view?: 'won' | 'lost'; layout?: 'board'; lead?: string }

type View = 'active' | 'won' | 'lost'

/** Wide enough for the file to sit beside the list — Tailwind's `lg`, as on Clients. */
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

/**
 * Focus a region that is not itself a control, and only while it holds
 * focus: a lasting `tabIndex` would also let every click on its empty space
 * take focus away from the rows and cards inside it.
 */
const focusRegion = (element: HTMLElement | null) => {
  if (!element) return

  element.tabIndex = -1
  element.addEventListener('blur', () => element.removeAttribute('tabindex'), { once: true })
  element.focus()
}

/**
 * The Board holds every stage at once, so there is no Won or Lost Board.
 * Both in the address means the owner pressed one while on the other: from
 * the Board, a Won or Lost tab opens that list (as in the lab); from one of
 * those lists, the Board switch opens the Board. A link that arrives with
 * both opens the list. True for the one render before the address settles.
 */
const useOneLayout = (search: LeadsSearch): boolean => {
  const navigate = useNavigate({ from: '/dashboard/leads/' })
  const clash = search.layout === 'board' && search.view !== undefined
  const last = useRef<'list' | 'board'>(search.layout === 'board' ? 'board' : 'list')

  useEffect(() => {
    if (!clash) {
      last.current = search.layout === 'board' ? 'board' : 'list'
      return
    }

    const toBoard = last.current === 'list'

    void navigate({
      to: '/dashboard/leads',
      search: (previous) => (toBoard ? { ...previous, view: undefined } : { ...previous, layout: undefined }),
      replace: true,
    })
  }, [clash, search.layout, navigate])

  return clash
}

const LAYOUT_STORAGE_KEY = 'v2-leads-layout'

/*
 * The last layout is a per-browser convenience, not something the server
 * should keep. Wrapped because storage throws in a private window, and a
 * choice that cannot be read or kept must only mean the List next time.
 */
const recallLayout = (): 'list' | 'board' => {
  try {
    return window.localStorage.getItem(LAYOUT_STORAGE_KEY) === 'board' ? 'board' : 'list'
  } catch {
    return 'list'
  }
}

const rememberLayout = (layout: 'list' | 'board') => {
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, layout)
  } catch {
    /* not being able to remember it is not worth an error */
  }
}

/**
 * The lab: "open Leads on the List, and remember if you switch to the Board."
 * An address that names the Board still opens the Board, but the sidebar, the
 * Active tab from Won or Lost, and every "Leads" link back from another screen
 * name no layout — so an Active address without one opens the layout this
 * browser last chose, keeping the view and any open lead. Only pressing List
 * while on the Board chooses the List; a Won or Lost list is not a layout
 * choice. True while the choice is looked up, so the List neither flashes nor
 * loads for nothing before the Board replaces it.
 */
const useRememberedLayout = (search: LeadsSearch, clash: boolean): boolean => {
  const navigate = useNavigate({ from: '/dashboard/leads/' })
  const active = search.view === undefined
  const board = search.layout === 'board'
  // What the page last settled on; undefined until the first settled address.
  const shown = useRef<'list' | 'board' | 'other' | undefined>(undefined)
  const [listStands, setListStands] = useState(false)

  useEffect(() => {
    if (clash) return

    const now = !active ? 'other' : board ? 'board' : 'list'
    const before = shown.current
    shown.current = now

    if (now !== 'list') {
      if (now === 'board') rememberLayout('board')
      setListStands(false)
      return
    }

    // Unchanged: a repeated run (a new `navigate`, or Strict Mode) decides nothing again.
    if (before === 'list') return

    // From the Board to the Active list without leaving the page: the owner pressed List.
    if (before === 'board') {
      rememberLayout('list')
      setListStands(true)
      return
    }

    if (recallLayout() === 'board') {
      void navigate({ to: '/dashboard/leads', search: (previous) => ({ ...previous, layout: 'board' }), replace: true })
      return
    }

    setListStands(true)
  }, [clash, active, board, navigate])

  return !clash && active && !board && !listStands
}

export function LeadsPage({ search }: { search: LeadsSearch }) {
  const navigate = useNavigate({ from: '/dashboard/leads/' })
  const view: View = search.view ?? 'active'
  const leadId = search.lead
  const clash = useOneLayout(search)
  const recalling = useRememberedLayout(search, clash)
  // Until the address settles and the remembered layout is known, the leads themselves wait.
  const settling = clash || recalling
  const board = search.layout === 'board' && !clash
  const wide = useWide()

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [stage, setStage] = useState('')
  const [source, setSource] = useState('')
  const [niche, setNiche] = useState('')
  const [country, setCountry] = useState('')
  const [page, setPage] = useState(1)

  // A new tab starts on its first page; the stage filter only means something on Active.
  const [shownView, setShownView] = useState(view)
  if (shownView !== view) {
    setShownView(view)
    setPage(1)
    setStage('')
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(query.trim())
      setPage(1)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [query])

  const leads = useLeads(
    {
      page,
      pageSize: LEAD_PAGE_SIZE.default,
      view,
      search: debounced,
      stage: view === 'active' && stage ? stage : undefined,
      source: source || undefined,
      niche: niche || undefined,
      country: country || undefined,
    },
    { enabled: !board && !settling },
  )
  // Three one-row reads: only their totals are used, for the tab counts.
  const counts = {
    active: useLeads({ view: 'active', pageSize: 1 }).data?.total,
    won: useLeads({ view: 'won', pageSize: 1 }).data?.total,
    lost: useLeads({ view: 'lost', pageSize: 1 }).data?.total,
  }
  const stages = useStages()
  const sources = useChoices('sources', { pageSize: 100 })
  const niches = useNiches({ pageSize: 100 })

  // The server clamps a page past the end; follow it.
  useEffect(() => {
    if (leads.data && !leads.isPlaceholderData && leads.data.page !== page) setPage(leads.data.page)
  }, [leads.data, leads.isPlaceholderData, page])

  const open = (id: string | undefined) =>
    void navigate({ to: '/dashboard/leads', search: (previous) => ({ ...previous, lead: id }) })

  // On a phone the file replaces the list, so start it at its top.
  const fileRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (leadId && !wide) fileRef.current?.scrollIntoView({ block: 'start' })
  }, [leadId, wide])

  /*
   * Closing the file hides the button that had focus; give it back to the
   * lead. In the List that is its row. On the Board it is the card's "Move to"
   * menu, which the Board itself focuses after a move; the card's name button
   * carries no row mark. When the lead is no longer shown (Trashed, or on
   * another page), focus goes to the leads themselves, never to the page's body.
   */
  const leadsRef = useRef<HTMLDivElement>(null)
  const lastOpen = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (leadId) {
      lastOpen.current = leadId
      return
    }

    const id = lastOpen.current
    lastOpen.current = undefined

    if (!id || (document.activeElement && document.activeElement !== document.body)) return

    const targets = [
      document.querySelector<HTMLElement>(`[data-lead-row="${id}"]`),
      document.getElementById(`move-${id}`),
    ]

    for (const target of targets) {
      target?.focus()
      // A disabled menu (a move still saving) refuses focus; try the next.
      if (target && document.activeElement === target) return
    }

    focusRegion(leadsRef.current)
  }, [leadId])

  // Any filter change starts the list again on its first page.
  const pick = (set: (value: string) => void) => (value: string) => {
    set(value)
    setPage(1)
  }

  const clear = () => {
    setQuery('')
    setDebounced('')
    setStage('')
    setSource('')
    setNiche('')
    setCountry('')
    setPage(1)
  }

  const filtering =
    debounced !== '' || (view === 'active' && stage !== '') || source !== '' || niche !== '' || country !== ''
  const items = leads.data?.items ?? []
  const activeStages = (stages.data ?? []).filter((item) => item.kind !== 'won' && item.kind !== 'lost')
  const noLeadsAtAll = view === 'active' && (counts.won ?? 0) + (counts.lost ?? 0) === 0

  return (
    <DashboardPage className="gap-5">
      <div className={cn('contents', leadId && 'max-lg:hidden')}>
        <LeadsHead />
        {view === 'active' && !board && !recalling ? <DueBanner /> : null}
        <LeadsTabs tab={view} layout={board ? 'board' : 'list'} counts={counts} />
      </div>

      {settling ? null : (
        <>
          {board ? null : (
            <div className={cn('flex flex-wrap items-center gap-2', leadId && 'max-lg:hidden')}>
              <label className="relative min-w-0 flex-[1_1_14rem] sm:max-w-xs">
                <span className="sr-only">Search leads</span>
                <Search
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--dash-quiet)]"
                  aria-hidden="true"
                />
                <input
                  className="dash-field h-9 w-full ps-9 pe-3 text-[13px]"
                  placeholder="Name, company, email or phone"
                  maxLength={LEAD_LIMITS.search}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              {view === 'active' && activeStages.length > 0 ? (
                <Filter label="Stage" value={stage} onChange={pick(setStage)}>
                  <option value="">Every stage</option>
                  {activeStages.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Filter>
              ) : null}
              {sources.data && sources.data.items.length > 0 ? (
                <Filter label="Source" value={source} onChange={pick(setSource)}>
                  <option value="">Every source</option>
                  {sources.data.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.hidden ? ' (hidden)' : ''}
                    </option>
                  ))}
                </Filter>
              ) : null}
              {niches.data && niches.data.items.length > 0 ? (
                <Filter label="Niche" value={niche} onChange={pick(setNiche)}>
                  <option value="">Every niche</option>
                  {niches.data.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.hidden ? ' (hidden)' : ''}
                    </option>
                  ))}
                </Filter>
              ) : null}
              <Filter label="Country" value={country} onChange={pick(setCountry)}>
                <option value="">Every country</option>
                {COUNTRIES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </Filter>
            </div>
          )}

          <div
            className={cn(
              'grid items-start gap-4',
              leadId &&
                (board
                  ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]'
                  : 'lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'),
            )}
          >
            <div ref={leadsRef} className={cn('flex min-w-0 flex-col gap-4 outline-none', leadId && 'max-lg:hidden')}>
              {board ? (
                <LeadsBoard onOpen={(id: string) => open(id)} />
              ) : (
                <>
                  <section
                    className="dash-panel @container overflow-hidden"
                    aria-label={view === 'active' ? 'Active leads' : view === 'won' ? 'Won leads' : 'Lost leads'}
                  >
                    {leads.isError ? (
                      <LoadFailure
                        title="Leads could not be loaded"
                        message="The server did not answer. Nothing has been changed. Check your connection, then try again."
                        onRetry={() => void leads.refetch()}
                      />
                    ) : leads.isPending ? (
                      <ul aria-busy="true">
                        {Array.from({ length: 6 }, (_, index) => (
                          <RowSkeleton key={index} />
                        ))}
                      </ul>
                    ) : items.length === 0 ? (
                      filtering ? (
                        <EmptyState
                          title="No lead matches that"
                          action={
                            <button type="button" className="dash-btn dash-btn-quiet" onClick={clear}>
                              Clear filters
                            </button>
                          }
                        >
                          Clear the search or the filters to see the rest.
                        </EmptyState>
                      ) : view === 'won' ? (
                        <EmptyState title="No won leads yet">
                          Move a lead to Won and it shows here — and becomes a client on its own.
                        </EmptyState>
                      ) : view === 'lost' ? (
                        <EmptyState title="No lost leads">
                          A lead you mark as Lost waits here with its reason. You can reopen it at any time.
                        </EmptyState>
                      ) : (
                        <EmptyState
                          title={noLeadsAtAll ? 'No leads yet' : 'No active leads'}
                          action={
                            <span className="flex flex-wrap gap-2">
                              <Link to="/dashboard/leads/new" className="dash-btn dash-btn-primary">
                                <Plus className="size-4" aria-hidden="true" />
                                New lead
                              </Link>
                              <Link to="/dashboard/leads/import" className="dash-btn dash-btn-quiet">
                                <Upload className="size-4" aria-hidden="true" />
                                Import CSV
                              </Link>
                            </span>
                          }
                        >
                          {noLeadsAtAll
                            ? 'Add one by hand, or import a CSV file. A lead is never created on its own from an email or a booking.'
                            : 'Every lead you have is Won or Lost. Add a new one by hand, or import a CSV file.'}
                        </EmptyState>
                      )
                    ) : (
                      <ul
                        aria-busy={leads.isFetching}
                        className={cn('transition-opacity', leads.isPlaceholderData && 'opacity-60')}
                      >
                        {items.map((item) => (
                          <LeadRow
                            key={item.id}
                            lead={item}
                            current={leadId === item.id}
                            showReason={view === 'lost'}
                            onOpen={() => open(item.id)}
                          />
                        ))}
                      </ul>
                    )}
                  </section>

                  {leads.data ? (
                    <Pager
                      page={leads.data.page}
                      pageCount={leads.data.pageCount}
                      total={leads.data.total}
                      noun={['lead', 'leads']}
                      onPage={setPage}
                    />
                  ) : null}
                </>
              )}
            </div>

            {leadId ? (
              <div ref={fileRef} className="min-w-0 scroll-mt-5 lg:sticky lg:top-0">
                {/* The panel on a computer; the whole screen, with a way back, on a phone. */}
                <LeadFile key={leadId} leadId={leadId} mode={wide ? 'panel' : 'page'} onClose={() => open(undefined)} />
              </div>
            ) : null}
          </div>
        </>
      )}
    </DashboardPage>
  )
}

/** One filter select, named for a screen reader. */
function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <label className="min-w-0">
      <span className="sr-only">{label}</span>
      <select
        className="dash-field h-9 max-w-[12rem] px-2.5 text-[13px]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  )
}

/**
 * A lead as the lab laid it out: who, how to reach them, where they came
 * from, the follow-up and the stage. The middle columns need room, so they
 * appear only when the list itself is wide — never beside an open file or on
 * a phone, where the follow-up moves under the stage instead.
 */
function LeadRow({
  lead,
  current,
  showReason,
  onOpen,
}: {
  lead: OwnerLeadListItem
  current: boolean
  showReason: boolean
  onOpen: () => void
}) {
  return (
    <li className="border-t border-[var(--dash-soft)] first:border-0">
      <button
        type="button"
        data-lead-row={lead.id}
        aria-current={current ? 'true' : undefined}
        className={cn(
          'dash-row grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 px-4 py-3 text-start sm:px-5',
          '@3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_6.5rem_10rem_8.5rem]',
          current && 'bg-[var(--dash-blue-tint)]',
        )}
        onClick={onOpen}
      >
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold">{lead.name}</span>
          <span className="block truncate text-[12px] text-[var(--dash-quiet)]">
            {lead.company || lead.country.name}
            {lead.niche ? ` · ${lead.niche.name}` : ''}
          </span>
        </span>
        <span className="hidden min-w-0 text-[12.5px] text-[var(--dash-quiet)] @3xl:block">
          <span className="block truncate">{lead.email}</span>
          <span className="dash-num block truncate">{lead.phone}</span>
        </span>
        <span className="hidden truncate text-[12.5px] text-[var(--dash-quiet)] @3xl:block">
          <span className="sr-only">Source: </span>
          {lead.source.name}
        </span>
        <span className="hidden min-w-0 @3xl:flex">
          <FollowUpPill followUp={lead.followUp} />
        </span>
        <span className="flex min-w-0 flex-col items-end gap-1">
          <StageChip kind={lead.stage.kind} name={lead.stage.name} />
          <span className="empty:hidden @3xl:hidden">
            <FollowUpPill followUp={lead.followUp} />
          </span>
          {showReason && lead.lostReason ? (
            <span className="max-w-[8.5rem] truncate text-[11.5px] text-[var(--dash-quiet)]" title={lead.lostReason}>
              <span className="sr-only">Reason: </span>
              {lead.lostReason}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  )
}
