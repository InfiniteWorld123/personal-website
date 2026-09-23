import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Plus, Search, Tags, Trash2 } from 'lucide-react'
import { CLIENT_PAGE_SIZE, clientDisplayName } from '#/backend2/contracts/client.contract'
import { DashboardPage, PageHead, StatusChip } from '#/frontend/dashboard/primitives'
import { clientSubline } from '#/frontend/features/clients/client-form'
import { useClients, useNiches } from '#/frontend/features/clients/queries'
import { cn } from '#/frontend/lib/utils'
import { ClientFile } from './ClientFile'
import { NicheManager } from './NicheManager'
import { ClientMark, EmptyState, KindChip, LoadFailure, Pager, RowSkeleton, StateChip } from './client-parts'

/**
 * The Client directory. `docs/v2/clients.md` owns what it does.
 *
 * Approved in the Clients Design Lab (23 Sep 2026): one paginated list, A–Z,
 * Active by default, and a Client's file opening **beside** the list on a
 * computer so the owner keeps their place. On a phone the file takes the
 * whole screen with a way back. The open file lives in the address
 * (`?client=`), so a link from elsewhere can open it.
 */

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

type Kind = 'all' | 'person' | 'company'
type Status = 'active' | 'inactive' | 'all'

export function ClientsPage({ openId }: { openId?: string }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const [status, setStatus] = useState<Status>('active')
  const [niche, setNiche] = useState('')
  const [page, setPage] = useState(1)
  const [managing, setManaging] = useState(false)
  const wide = useWide()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search.trim())
      setPage(1)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [search])

  const clients = useClients({
    page,
    pageSize: CLIENT_PAGE_SIZE.default,
    search: debounced,
    kind,
    status,
    niche: niche || undefined,
  })
  const counts = {
    trash: useClients({ view: 'trash', pageSize: 1 }).data?.total,
  }
  const niches = useNiches({ pageSize: 100 })

  // The server clamps a page past the end; follow it.
  useEffect(() => {
    if (clients.data && clients.data.page !== page) setPage(clients.data.page)
  }, [clients.data, page])

  const open = (id: string | undefined) =>
    void navigate({ to: '/dashboard/clients', search: id ? { client: id } : {}, replace: false })

  const filtering = debounced !== '' || kind !== 'all' || status !== 'active' || niche !== ''
  const items = clients.data?.items ?? []

  return (
    <DashboardPage className="gap-5">
      <div className={cn(openId && 'hidden lg:contents')}>
        <PageHead
          eyebrow="PEOPLE"
          title="Clients"
          description="Everyone you work with, and your private notes on them. A lead you win lands here on its own."
          actions={
            <>
              <button type="button" className="dash-btn dash-btn-quiet" onClick={() => setManaging(true)}>
                <Tags className="size-4" aria-hidden="true" />
                Niches
              </button>
              <Link to="/dashboard/clients/trash" className="dash-btn dash-btn-quiet">
                <Trash2 className="size-4" aria-hidden="true" />
                Trash
                {counts.trash ? (
                  <StatusChip className="h-[19px] px-1.5" tone="grey">
                    {counts.trash}
                  </StatusChip>
                ) : null}
              </Link>
              <Link to="/dashboard/clients/new" className="dash-btn dash-btn-primary">
                <Plus className="size-4" aria-hidden="true" />
                New client
              </Link>
            </>
          }
        />
      </div>

      <div className={cn('grid items-start gap-4', openId ? 'lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]' : '')}>
        <div className={cn('flex min-w-0 flex-col gap-4', openId && 'hidden lg:flex')}>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-[1_1_14rem] sm:max-w-xs">
              <span className="sr-only">Search clients</span>
              <Search
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--dash-quiet)]"
                aria-hidden="true"
              />
              <input
                className="dash-field h-9 w-full ps-9 pe-3 text-[13px]"
                placeholder="Name, company, email or phone"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              <span className="sr-only">Type</span>
              <select
                className="dash-field h-9 px-2.5 text-[13px]"
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as Kind)
                  setPage(1)
                }}
              >
                <option value="all">People and companies</option>
                <option value="person">People</option>
                <option value="company">Companies</option>
              </select>
            </label>
            <label>
              <span className="sr-only">State</span>
              <select
                className="dash-field h-9 px-2.5 text-[13px]"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as Status)
                  setPage(1)
                }}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">Active and inactive</option>
              </select>
            </label>
            {niches.data && niches.data.items.length > 0 ? (
              <label>
                <span className="sr-only">Niche</span>
                <select
                  className="dash-field h-9 max-w-[12rem] px-2.5 text-[13px]"
                  value={niche}
                  onChange={(event) => {
                    setNiche(event.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">Every niche</option>
                  {niches.data.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.hidden ? ' (hidden)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <section className="dash-panel overflow-hidden" aria-label="Clients">
            {clients.isError ? (
              <LoadFailure
                title="Clients could not be loaded"
                message="The server did not answer. Nothing has been changed. Check your connection, then try again."
                onRetry={() => void clients.refetch()}
              />
            ) : clients.isPending ? (
              <ul aria-busy="true">
                {Array.from({ length: 6 }, (_, index) => (
                  <RowSkeleton key={index} />
                ))}
              </ul>
            ) : items.length === 0 ? (
              <EmptyState
                title={filtering ? 'No client matches that' : 'No clients yet'}
                action={
                  filtering ? (
                    <button
                      type="button"
                      className="dash-btn dash-btn-quiet"
                      onClick={() => {
                        setSearch('')
                        setKind('all')
                        setStatus('active')
                        setNiche('')
                      }}
                    >
                      Clear filters
                    </button>
                  ) : (
                    <Link to="/dashboard/clients/new" className="dash-btn dash-btn-primary">
                      <Plus className="size-4" aria-hidden="true" />
                      New client
                    </Link>
                  )
                }
              >
                {filtering
                  ? 'Clear the search or the filters to see the rest. Inactive clients only show with the Inactive filter.'
                  : 'Add the first one, or move a lead to Won and it arrives here on its own.'}
              </EmptyState>
            ) : (
              <ul aria-busy={clients.isFetching}>
                {items.map((item) => (
                  <li key={item.id} className="border-t border-[var(--dash-soft)] first:border-0">
                    <button
                      type="button"
                      aria-current={openId === item.id ? 'true' : undefined}
                      className={cn(
                        'dash-row flex w-full items-center gap-3.5 px-4 py-3 text-start sm:px-5',
                        openId === item.id && 'bg-[var(--dash-blue-tint)]',
                      )}
                      onClick={() => open(item.id)}
                    >
                      <ClientMark kind={item.kind} name={clientDisplayName(item)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold">{item.displayName}</span>
                        <span className="block truncate text-[12px] text-[var(--dash-quiet)]">
                          {clientSubline(item)}
                          {item.niche ? ` · ${item.niche.name}` : ''}
                        </span>
                      </span>
                      <span className={cn('hidden min-w-0 flex-1 text-[12.5px] xl:block', openId && 'xl:hidden')}>
                        <span className="block truncate">{item.email}</span>
                        <span className="dash-num block truncate text-[12px] text-[var(--dash-quiet)]">
                          {item.phone || '—'}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'hidden w-28 shrink-0 truncate text-[12.5px] text-[var(--dash-quiet)] md:block',
                          openId && 'md:hidden',
                        )}
                      >
                        {item.country.name}
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-1.5">
                        <KindChip kind={item.kind} />
                        <StateChip status={item.status} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {clients.data ? (
            <Pager
              page={clients.data.page}
              pageCount={clients.data.pageCount}
              total={clients.data.total}
              noun={['client', 'clients']}
              onPage={setPage}
            />
          ) : null}
        </div>

        {openId ? (
          <div className="min-w-0 lg:sticky lg:top-0">
            {/* The panel on a computer; the whole screen, with a way back, on a phone. */}
            <ClientFile key={openId} clientId={openId} mode={wide ? 'panel' : 'page'} onClose={() => open(undefined)} />
          </div>
        ) : null}
      </div>

      {managing ? <NicheManager onClose={() => setManaging(false)} /> : null}
    </DashboardPage>
  )
}
