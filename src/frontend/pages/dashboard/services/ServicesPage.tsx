import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, Loader2, Plus, Search, SlidersHorizontal, Star } from 'lucide-react'
import {
  type OwnerServiceListItem,
  SERVICE_PAGE_SIZE,
} from '#/backend2/contracts/service.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage, PageHead } from '#/frontend/dashboard/primitives'
import {
  useCreateService,
  useMoveService,
  usePatchService,
  useServices,
} from '#/frontend/features/services/queries'
import { priceSummary } from '#/frontend/features/services/service-form'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { LanguageTicks, LoadFailure, RowSkeleton, StateBadge } from './service-parts'

/**
 * Every service the owner offers, in the one order visitors see.
 *
 * The Projects list, on purpose (approved answer 2a): arrows for a nudge and a
 * box for an absolute position, because the order is global and the list is
 * paged. The star on each row is approved choice 5A: one click, and on a live
 * service it waits for **Publish update** like every other change.
 */

const STATE_FILTERS = [
  { value: 'all', label: 'Every state' },
  { value: 'draft', label: 'Private' },
  { value: 'published', label: 'Live' },
  { value: 'pending', label: 'Live · edited' },
  { value: 'unpublished', label: 'Taken down' },
] as const

function MoveControls({
  item,
  first,
  last,
  busy,
  onMove,
}: {
  item: OwnerServiceListItem
  first: boolean
  last: boolean
  busy: boolean
  onMove: (position: number) => void
}) {
  const [typed, setTyped] = useState('')

  const commit = () => {
    const next = Number(typed)

    if (typed.trim() !== '' && Number.isFinite(next)) onMove(next)
    setTyped('')
  }

  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        className="dash-btn dash-btn-quiet size-8 p-0"
        disabled={first || busy}
        aria-label={`Move ${item.displayName} up`}
        onClick={() => onMove(item.position - 1)}
      >
        <ArrowUp className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="dash-btn dash-btn-quiet size-8 p-0"
        disabled={last || busy}
        aria-label={`Move ${item.displayName} down`}
        onClick={() => onMove(item.position + 1)}
      >
        <ArrowDown className="size-3.5" aria-hidden="true" />
      </button>
      <input
        className="dash-field h-8 w-[4.5rem] px-2 text-[12px]"
        placeholder="Pos…"
        inputMode="numeric"
        value={typed}
        disabled={busy}
        aria-label={`Move ${item.displayName} to a position`}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          commit()
        }}
      />
    </span>
  )
}

function Row({
  item,
  total,
  busy,
  onMove,
  onStar,
  onOpen,
}: {
  item: OwnerServiceListItem
  total: number
  busy: boolean
  onMove: (position: number) => void
  onStar: () => void
  onOpen: () => void
}) {
  // A live service whose saved star differs from the one visitors see.
  const starPending = item.featuredLive !== null && item.featuredLive !== item.featured

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--dash-line)] px-4 py-3 last:border-0 sm:flex-nowrap">
      <span className="dash-num w-6 shrink-0 text-[12px] text-[var(--dash-quiet)]">{item.position}</span>

      <button
        type="button"
        className={cn(
          'relative grid size-8 shrink-0 place-items-center rounded-[9px] hover:bg-[var(--dash-hover)]',
          item.featured ? 'text-[var(--dash-blue)]' : 'text-[var(--dash-quiet)]',
        )}
        aria-pressed={item.featured}
        aria-label={item.featured ? `Take ${item.displayName} off the homepage` : `Show ${item.displayName} on the homepage`}
        title={
          starPending
            ? 'The homepage changes when you publish the update'
            : item.featured
              ? 'On the homepage'
              : 'Not on the homepage'
        }
        disabled={busy}
        onClick={onStar}
      >
        <Star className={cn('size-4', item.featured && 'fill-current')} aria-hidden="true" />
        {starPending ? (
          <span
            className="absolute end-1 top-1 size-[7px] rounded-full border-[1.5px] border-[var(--dash-surface)] bg-[var(--dash-slab)]"
            aria-hidden="true"
          />
        ) : null}
      </button>

      <span className="flex min-w-0 flex-1 basis-[calc(100%-5rem)] flex-col gap-0.5 sm:basis-auto">
        <button
          type="button"
          onClick={onOpen}
          className="truncate text-start text-[13.5px] font-semibold hover:text-[var(--dash-brand)] hover:underline"
        >
          {item.displayName}
        </button>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--dash-quiet)]">
          <span className="dash-num">/{item.slug || '—'}</span>
          <span aria-hidden="true">·</span>
          <span className="dash-num">{priceSummary(item.price)}</span>
          {starPending ? (
            <>
              <span aria-hidden="true">·</span>
              <span>homepage change not published</span>
            </>
          ) : null}
          <StateBadge state={item.state} className="lg:hidden" />
        </span>
      </span>

      <LanguageTicks complete={item.languagesComplete} className="hidden shrink-0 md:flex" />

      <span className="hidden w-[7.5rem] shrink-0 lg:block">
        <StateBadge state={item.state} />
      </span>

      <span className="ms-auto shrink-0">
        <MoveControls
          item={item}
          first={item.position === 1}
          last={item.position === total}
          busy={busy}
          onMove={onMove}
        />
      </span>
    </li>
  )
}

export function ServicesPage() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [state, setState] = useState<string>('all')
  const [featured, setFeatured] = useState<'all' | 'featured' | 'not_featured'>('all')
  const [page, setPage] = useState(1)
  const [failure, setFailure] = useState<string | null>(null)
  const liveRegion = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [search])

  const query = { page, pageSize: SERVICE_PAGE_SIZE.default, search: debounced, state, featured, language: 'en' as const }
  const services = useServices(query)
  const move = useMoveService()
  const patch = usePatchService()
  const create = useCreateService()

  const items = services.data?.items ?? []
  const filtering = debounced !== '' || state !== 'all' || featured !== 'all'

  // The server clamps a page past the end; follow it.
  useEffect(() => {
    if (services.data && services.data.page !== page) setPage(services.data.page)
  }, [services.data, page])

  const say = (text: string) => {
    if (liveRegion.current) liveRegion.current.textContent = text
  }

  const failureText = (caught: unknown, fallback: string) =>
    caught instanceof ApiRequestError ? caught.message : fallback

  const handleMove = async (item: OwnerServiceListItem, position: number) => {
    setFailure(null)

    try {
      const result = await move.mutateAsync({ id: item.id, position })

      say(`${item.displayName} moved to position ${result.position}`)

      // Follow the row to the page it landed on, so it does not just vanish.
      if (!filtering) setPage(Math.ceil(result.position / SERVICE_PAGE_SIZE.default))
    } catch (caught) {
      setFailure(failureText(caught, 'That service could not be moved.'))
    }
  }

  const handleStar = async (item: OwnerServiceListItem) => {
    setFailure(null)

    try {
      const saved = await patch.mutateAsync({ id: item.id, draftRevision: item.draftRevision, featured: !item.featured })
      const on = saved.draft.featured
      const waiting = saved.published !== null && saved.published.featured !== on

      notify.success(
        on
          ? waiting
            ? 'Starred — publish the update to show it on the homepage'
            : 'Starred for the homepage'
          : waiting
            ? 'Unstarred — publish the update to take it off the homepage'
            : 'Taken off the homepage',
      )
    } catch (caught) {
      setFailure(failureText(caught, 'That star could not be saved.'))
    }
  }

  const handleCreate = async () => {
    setFailure(null)

    try {
      const service = await create.mutateAsync({ language: 'en' })

      await navigate({ to: '/dashboard/services/$serviceId', params: { serviceId: service.id } })
    } catch (caught) {
      setFailure(failureText(caught, 'That service could not be created.'))
    }
  }

  const total = services.data?.total ?? 0
  const busy = move.isPending || patch.isPending

  return (
    <DashboardPage className="gap-5">
      <PageHead
        eyebrow="CATALOGUE"
        title="Services"
        description="What you offer. Publish a service to put it on the website; keep it private while you are still writing it."
        actions={
          <button type="button" className="dash-btn dash-btn-primary" onClick={handleCreate} disabled={create.isPending}>
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            {create.isPending ? 'Creating…' : 'New service'}
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="sr-only">Search services</span>
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--dash-quiet)]"
            aria-hidden="true"
          />
          <input
            className="dash-field h-9 w-full ps-9 pe-3 text-[13px]"
            placeholder="Search services"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <label>
          <span className="sr-only">Filter by state</span>
          <select
            className="dash-field h-9 px-2.5 text-[13px]"
            value={state}
            onChange={(event) => {
              setState(event.target.value)
              setPage(1)
            }}
          >
            {STATE_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">Filter by homepage</span>
          <select
            className="dash-field h-9 px-2.5 text-[13px]"
            value={featured}
            onChange={(event) => {
              setFeatured(event.target.value as typeof featured)
              setPage(1)
            }}
          >
            <option value="all">Homepage or not</option>
            <option value="featured">On the homepage</option>
            <option value="not_featured">Not on the homepage</option>
          </select>
        </label>

        {services.data ? (
          <span className="ms-auto hidden items-center gap-1.5 text-[11px] text-[var(--dash-quiet)] sm:flex">
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            <span className="dash-num">{services.data.total}</span>
            {services.data.total === 1 ? 'service' : 'services'}
          </span>
        ) : null}
      </div>

      {failure ? (
        <p role="alert" className="dash-tone-red rounded-lg px-3 py-2 text-[12.5px]">
          {failure}
        </p>
      ) : null}

      <section className="dash-panel overflow-hidden">
        {services.isError ? (
          <LoadFailure
            title="Services could not be loaded"
            message="The server did not answer. Nothing has been changed."
            onRetry={() => void services.refetch()}
          />
        ) : services.isPending ? (
          <ul aria-busy="true">
            {Array.from({ length: 4 }, (_, index) => (
              <RowSkeleton key={index} />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-start gap-3 p-8">
            <h2 className="text-sm font-semibold">{filtering ? 'Nothing matches that' : 'No services yet'}</h2>
            <p className="max-w-[52ch] text-[13px] text-[var(--dash-quiet)]">
              {filtering
                ? 'Clear the search or the filters to see the rest.'
                : 'Add the first one. It stays private until you publish it, so there is no rush to finish it today.'}
            </p>
            {filtering ? (
              <button
                type="button"
                className="dash-btn dash-btn-quiet"
                onClick={() => {
                  setSearch('')
                  setState('all')
                  setFeatured('all')
                }}
              >
                Clear filters
              </button>
            ) : (
              <button type="button" className="dash-btn dash-btn-primary" onClick={handleCreate} disabled={create.isPending}>
                <Plus className="size-4" aria-hidden="true" />
                New service
              </button>
            )}
          </div>
        ) : (
          <ul aria-busy={services.isFetching}>
            {items.map((item) => (
              <Row
                key={item.id}
                item={item}
                total={filtering ? Number.POSITIVE_INFINITY : total}
                busy={busy}
                onMove={(position) => void handleMove(item, position)}
                onStar={() => void handleStar(item)}
                onOpen={() => void navigate({ to: '/dashboard/services/$serviceId', params: { serviceId: item.id } })}
              />
            ))}
          </ul>
        )}
      </section>

      <p ref={liveRegion} role="status" aria-live="polite" className="sr-only" />

      {services.data && services.data.pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3 text-[12px]">
          <span className="text-[var(--dash-quiet)]">
            Page <span className="dash-num font-semibold">{services.data.page}</span> of{' '}
            <span className="dash-num font-semibold">{services.data.pageCount}</span>
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              className="dash-btn dash-btn-quiet h-8"
              disabled={services.data.page === 1}
              onClick={() => setPage(services.data.page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="dash-btn dash-btn-quiet h-8"
              disabled={!services.data.hasMore}
              onClick={() => setPage(services.data.page + 1)}
            >
              Next
            </button>
          </span>
        </div>
      ) : null}
    </DashboardPage>
  )
}
