import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, Plus, Search, SlidersHorizontal } from 'lucide-react'
import {
  type Language,
  type OwnerListItem,
  PROJECT_PAGE_SIZE,
  type ProjectType,
  TYPE_WORDS,
  WORK_WORDS,
} from '#/backend2/contracts/project.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage, PageHead } from '#/frontend/dashboard/primitives'
import {
  useCreateProject,
  useMoveProject,
  useProjects,
} from '#/frontend/features/projects/queries'
import { cn } from '#/frontend/lib/utils'
import { Cover, LanguageTicks, LoadFailure, RowSkeleton, StateBadge } from './project-parts'

/**
 * Every project the owner has, in the one order visitors see.
 *
 * The order is global and the list is paged, which is the whole reason the
 * reordering controls look the way they do: arrows for the common nudge, and
 * a box that takes an absolute position for the move the arrows cannot
 * express. Approved in the Design Lab over drag-and-drop, which cannot reach
 * another page and cannot be done from a keyboard.
 */

const STATE_FILTERS = [
  { value: 'all', label: 'All except archived' },
  { value: 'draft', label: 'Private' },
  { value: 'published', label: 'Live' },
  { value: 'pending', label: 'Live · edited' },
  { value: 'unpublished', label: 'Taken down' },
  { value: 'archived', label: 'Archived' },
] as const

/**
 * Moving one project.
 *
 * The position box commits on Enter or on blur, and is cleared afterwards —
 * it is an instruction, not a field holding a value, and leaving the old
 * number in it would suggest otherwise.
 */
function MoveControls({
  item,
  first,
  last,
  busy,
  onMove,
}: {
  item: OwnerListItem
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
  first,
  last,
  busy,
  onMove,
  onOpen,
}: {
  item: OwnerListItem
  first: boolean
  last: boolean
  busy: boolean
  onMove: (position: number) => void
  onOpen: () => void
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 border-b border-[var(--dash-line)] px-4 py-3 last:border-0',
        item.state === 'archived' && 'opacity-65',
      )}
    >
      <span className="dash-num w-6 shrink-0 text-[12px] text-[var(--dash-quiet)]">
        {item.position}
      </span>

      <Cover url={item.coverUrl} className="h-12 w-[76px]" />

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
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
          <span>{TYPE_WORDS[item.type]}</span>
          <span aria-hidden="true">·</span>
          <span>{WORK_WORDS[item.workStatus]}</span>
          <span aria-hidden="true">·</span>
          <span>
            {item.imageCount} {item.imageCount === 1 ? 'image' : 'images'}
          </span>
        </span>
      </span>

      <LanguageTicks complete={item.languagesComplete} className="hidden shrink-0 md:flex" />

      <span className="hidden w-[7.5rem] shrink-0 lg:block">
        <StateBadge state={item.state} />
      </span>

      <span className="shrink-0">
        <MoveControls item={item} first={first} last={last} busy={busy} onMove={onMove} />
      </span>
    </li>
  )
}

export function ProjectsPage() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [state, setState] = useState<string>('all')
  const [type, setType] = useState<'all' | ProjectType>('all')
  const [language] = useState<Language>('en')
  const [page, setPage] = useState(1)
  const [failure, setFailure] = useState<string | null>(null)

  // Typing should not be one request per keystroke; a short pause is enough.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [search])

  const query = {
    page,
    pageSize: PROJECT_PAGE_SIZE.default,
    search: debounced,
    state,
    type,
    language,
  }

  const projects = useProjects(query)
  const move = useMoveProject()
  const create = useCreateProject()

  const items = projects.data?.items ?? []
  const liveRegion = useRef<HTMLParagraphElement>(null)

  /*
   * The server clamps a page past the end rather than answering empty, so the
   * page it used may differ from the one asked for. Following it keeps the
   * control and the list agreeing after a filter narrows the results.
   */
  useEffect(() => {
    if (projects.data && projects.data.page !== page) setPage(projects.data.page)
  }, [projects.data, page])

  const handleMove = async (item: OwnerListItem, position: number) => {
    setFailure(null)

    try {
      const result = await move.mutateAsync({ id: item.id, position })

      // Reordering is invisible to a screen reader otherwise: the rows move
      // and nothing is announced.
      if (liveRegion.current) {
        liveRegion.current.textContent = `${item.displayName} moved to position ${result.position}`
      }
    } catch (caught) {
      setFailure(
        caught instanceof ApiRequestError ? caught.message : 'That project could not be moved.',
      )
    }
  }

  const handleCreate = async () => {
    setFailure(null)

    try {
      const project = await create.mutateAsync({ type: 'client' })

      await navigate({ to: '/dashboard/projects/$projectId', params: { projectId: project.id } })
    } catch (caught) {
      setFailure(
        caught instanceof ApiRequestError ? caught.message : 'That project could not be created.',
      )
    }
  }

  const filtering = debounced !== '' || type !== 'all' || state !== 'all'

  return (
    <DashboardPage className="gap-5">
      <PageHead
        eyebrow="PORTFOLIO"
        title="Projects"
        description="Everything you have built. Publish a project to put it on the website; keep it private while it is still becoming something."
        actions={
          <button
            type="button"
            className="dash-btn dash-btn-primary"
            onClick={handleCreate}
            disabled={create.isPending}
          >
            <Plus className="size-4" aria-hidden="true" />
            {create.isPending ? 'Creating…' : 'New project'}
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="sr-only">Search projects</span>
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--dash-quiet)]"
            aria-hidden="true"
          />
          <input
            className="dash-field h-9 w-full ps-9 pe-3 text-[13px]"
            placeholder="Search projects"
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
          <span className="sr-only">Filter by type</span>
          <select
            className="dash-field h-9 px-2.5 text-[13px]"
            value={type}
            onChange={(event) => {
              setType(event.target.value as typeof type)
              setPage(1)
            }}
          >
            <option value="all">Any type</option>
            <option value="client">Client</option>
            <option value="personal">Personal</option>
            <option value="demo">Demo</option>
          </select>
        </label>

        {projects.data ? (
          <span className="ms-auto hidden items-center gap-1.5 text-[11px] text-[var(--dash-quiet)] sm:flex">
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            <span className="dash-num">{projects.data.total}</span>
            {projects.data.total === 1 ? 'project' : 'projects'}
          </span>
        ) : null}
      </div>

      {failure ? (
        <p role="alert" className="dash-tone-red rounded-lg px-3 py-2 text-[12.5px]">
          {failure}
        </p>
      ) : null}

      <section className="dash-panel overflow-hidden">
        {projects.isError ? (
          <LoadFailure
            title="Projects could not be loaded"
            message="The server did not answer. Nothing has been changed."
            onRetry={() => void projects.refetch()}
          />
        ) : projects.isPending ? (
          <ul>
            {Array.from({ length: 4 }, (_, index) => (
              <RowSkeleton key={index} />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-start gap-3 p-8">
            <h2 className="text-sm font-semibold">
              {filtering ? 'Nothing matches that' : 'No projects yet'}
            </h2>
            <p className="max-w-[52ch] text-[13px] text-[var(--dash-quiet)]">
              {filtering
                ? 'Clear the search or the filter to see the rest.'
                : 'Add the first one. It stays private until you publish it, so there is no rush to finish it today.'}
            </p>
            {filtering ? (
              <button
                type="button"
                className="dash-btn dash-btn-quiet"
                onClick={() => {
                  setSearch('')
                  setType('all')
                  setState('all')
                }}
              >
                Clear filters
              </button>
            ) : (
              <button
                type="button"
                className="dash-btn dash-btn-primary"
                onClick={handleCreate}
                disabled={create.isPending}
              >
                <Plus className="size-4" aria-hidden="true" />
                New project
              </button>
            )}
          </div>
        ) : (
          <ul aria-busy={projects.isFetching}>
            {items.map((item) => (
              <Row
                key={item.id}
                item={item}
                first={item.position === 1}
                last={item.position === projects.data.total}
                busy={move.isPending}
                onMove={(position) => void handleMove(item, position)}
                onOpen={() =>
                  void navigate({
                    to: '/dashboard/projects/$projectId',
                    params: { projectId: item.id },
                  })
                }
              />
            ))}
          </ul>
        )}
      </section>

      <p ref={liveRegion} role="status" aria-live="polite" className="sr-only" />

      {projects.data && projects.data.pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3 text-[12px]">
          <span className="text-[var(--dash-quiet)]">
            Page <span className="dash-num font-semibold">{projects.data.page}</span> of{' '}
            <span className="dash-num font-semibold">{projects.data.pageCount}</span>
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              className="dash-btn dash-btn-quiet h-8"
              disabled={projects.data.page === 1}
              onClick={() => setPage(projects.data.page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="dash-btn dash-btn-quiet h-8"
              disabled={!projects.data.hasMore}
              onClick={() => setPage(projects.data.page + 1)}
            >
              Next
            </button>
          </span>
        </div>
      ) : null}
    </DashboardPage>
  )
}
