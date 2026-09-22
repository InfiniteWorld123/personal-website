import { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, List, Search } from 'lucide-react'
import type { MediaAsset, MediaFolderNode, MediaKind } from '#/backend2/contracts/media.contract'
import { labelForType, MEDIA_KINDS } from '#/backend2/contracts/media.contract'
import { cn } from '#/frontend/lib/utils'
import type { LibraryQuery } from './api'
import { useFolders, useLibrary } from './queries'
import {
  describeAsset,
  EmptyLibrary,
  FileTile,
  FolderRail,
  formatBytes,
  formatDate,
  gridArrowKeys,
  Pager,
  Thumbnail,
  UseChip,
  type FolderChoice,
} from './media-parts'

/**
 * The library, as a component.
 *
 * `/dashboard/media` and the shared picker both render this: the same folder
 * rail, the same tiles, the same search and filters. The picker adds a
 * confirm button and takes the verbs away; it does not get its own browser,
 * because two browsers would mean two things to learn and two places for a
 * bug to live.
 */

export type BrowserState = {
  folder: FolderChoice
  kind: MediaKind | ''
  usage: '' | 'used' | 'unused' | 'published'
  q: string
  sort: 'newest' | 'oldest' | 'name' | 'size'
  view: 'grid' | 'list'
  page: number
}

const INITIAL: BrowserState = {
  folder: 'all',
  kind: '',
  usage: '',
  q: '',
  sort: 'newest',
  view: 'grid',
  page: 1,
}

const VIEW_STORAGE_KEY = 'v2-media-view'

export const useBrowserState = (overrides: Partial<BrowserState> = {}) => {
  const [state, setState] = useState<BrowserState>({ ...INITIAL, ...overrides })

  /*
   * Grid or list is a per-browser convenience, not something the server should
   * remember. Wrapped because storage throws in a private window, and a
   * preference that cannot be read must not stop the library rendering.
   */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_STORAGE_KEY)

      if (saved === 'grid' || saved === 'list') setState((current) => ({ ...current, view: saved }))
    } catch {
      /* no stored preference is a fine state to be in */
    }
  }, [])

  const update = (patch: Partial<BrowserState>) =>
    setState((current) => ({
      ...current,
      ...patch,
      // Any change to what is being looked at starts again at page one;
      // otherwise a narrower filter lands the owner on an empty page 4.
      page: patch.page ?? (Object.keys(patch).some((key) => key !== 'view') ? 1 : current.page),
    }))

  const setView = (view: BrowserState['view']) => {
    update({ view })

    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view)
    } catch {
      /* not being able to remember it is not worth an error */
    }
  }

  const reset = () => setState((current) => ({ ...INITIAL, view: current.view, ...overrides }))

  return { state, update, setView, reset }
}

/** The tree flattened into indented options, for the phone-width folder control. */
const folderOptions = (nodes: MediaFolderNode[]): React.ReactNode[] =>
  nodes.flatMap((node) => [
    <option key={node.id} value={node.id}>
      {'— '.repeat(node.depth)}
      {node.name}
    </option>,
    ...folderOptions(node.children),
  ])

/** The browser state as the server's query, which knows nothing about `view`. */
export const toQuery = (state: BrowserState, pageSize: number): LibraryQuery => ({
  page: state.page,
  pageSize,
  folderId: state.folder === 'all' ? undefined : state.folder === 'root' ? 'root' : state.folder,
  kind: state.kind === '' ? undefined : state.kind,
  usage: state.usage === '' ? undefined : state.usage,
  q: state.q.trim() === '' ? undefined : state.q.trim(),
  sort: state.sort,
})

export function MediaBrowser({
  state,
  update,
  setView,
  reset,
  pageSize = 24,
  selectedId,
  onSelect,
  onOpen,
  toolbarExtra,
  folderActions,
  onRequestUpload,
  compact,
}: {
  state: BrowserState
  update: (patch: Partial<BrowserState>) => void
  setView: (view: BrowserState['view']) => void
  reset: () => void
  pageSize?: number
  selectedId: string | null
  onSelect: (asset: MediaAsset) => void
  onOpen?: (asset: MediaAsset) => void
  toolbarExtra?: React.ReactNode
  /** Rename and delete for whichever folder is open. Absent in the picker. */
  folderActions?: React.ReactNode
  onRequestUpload: () => void
  /** The picker is narrower and has no list view worth the space. */
  compact?: boolean
}) {
  const folders = useFolders()
  const query = useMemo(() => toQuery(state, pageSize), [state, pageSize])
  const library = useLibrary(query)

  const page = library.data
  const filtered = state.kind !== '' || state.usage !== '' || state.q.trim() !== '' || state.folder !== 'all'

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-[186px] shrink-0 overflow-y-auto border-e border-[var(--dash-line)] p-2 md:block">
        {folders.isPending ? (
          <p className="px-2 py-3 text-[12px] text-[var(--dash-quiet)]">Loading folders…</p>
        ) : folders.isError ? (
          <p className="px-2 py-3 text-[12px] text-[var(--dash-red-ink)]">
            The folder list could not be loaded.
          </p>
        ) : (
          <>
            <FolderRail
              tree={folders.data?.tree ?? []}
              current={state.folder}
              onChoose={(folder) => update({ folder })}
              total={folders.data?.files.total ?? 0}
              rootTotal={folders.data?.files.atRoot ?? 0}
              action={toolbarExtra}
            />
            {folders.data?.truncated ? (
              <p className="mt-2 px-2 text-[11px] text-[var(--dash-quiet)]">
                Showing the first {folders.data.total} folders.
              </p>
            ) : null}
          </>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--dash-line)] px-4 py-2.5">
          <label className="relative min-w-[140px] flex-1 sm:max-w-[260px]">
            <span className="sr-only">Search file names</span>
            <Search
              className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--dash-quiet)]"
              aria-hidden
            />
            <input
              type="search"
              value={state.q}
              onChange={(event) => update({ q: event.target.value })}
              placeholder="Search file names"
              className="dash-field h-8 w-full ps-8 pe-2.5 text-[13px]"
            />
          </label>

          {/* On a phone the folder rail is gone, so it becomes a control. */}
          <select
            aria-label="Folder"
            className="dash-field h-8 px-2 text-[13px] md:hidden"
            value={state.folder}
            onChange={(event) => update({ folder: event.target.value as FolderChoice })}
          >
            <option value="all">All files</option>
            <option value="root">Not in a folder</option>
            {folderOptions(folders.data?.tree ?? [])}
          </select>

          <select
            aria-label="File type"
            className="dash-field h-8 px-2 text-[13px]"
            value={state.kind}
            onChange={(event) => update({ kind: event.target.value as MediaKind | '' })}
          >
            <option value="">All types</option>
            {MEDIA_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind === 'image' ? 'Images' : kind === 'video' ? 'Video' : 'Documents'}
              </option>
            ))}
          </select>

          <select
            aria-label="Use"
            className="dash-field h-8 px-2 text-[13px]"
            value={state.usage}
            onChange={(event) => update({ usage: event.target.value as BrowserState['usage'] })}
          >
            <option value="">Any use</option>
            <option value="published">Live on the site</option>
            <option value="used">Used privately</option>
            <option value="unused">Unused</option>
          </select>

          <select
            aria-label="Sort"
            className="dash-field hidden h-8 px-2 text-[13px] lg:block"
            value={state.sort}
            onChange={(event) => update({ sort: event.target.value as BrowserState['sort'] })}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">By name</option>
            <option value="size">Largest first</option>
          </select>

          {folderActions ? <span className="flex items-center gap-1.5">{folderActions}</span> : null}

          {compact ? null : (
            <div className="dash-seg ms-auto flex gap-0.5 rounded-lg bg-[var(--dash-chip)] p-0.5">
              {(['grid', 'list'] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={state.view === view}
                  data-on={state.view === view}
                  onClick={() => setView(view)}
                  className="dash-seg inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px]"
                >
                  {view === 'grid' ? (
                    <LayoutGrid className="size-3.5" aria-hidden />
                  ) : (
                    <List className="size-3.5" aria-hidden />
                  )}
                  {view === 'grid' ? 'Grid' : 'List'}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {library.isPending ? (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))' }}
            >
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="dash-panel h-[190px] animate-pulse bg-[var(--dash-furniture)]"
                  aria-hidden
                />
              ))}
              <span className="sr-only">Loading the library…</span>
            </div>
          ) : library.isError ? (
            <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
              <p className="dash-title text-[17px]">The library could not be loaded</p>
              <p className="max-w-[44ch] text-[13px] text-[var(--dash-quiet)]">
                {(library.error as Error).message}
              </p>
              <button
                type="button"
                className="dash-btn dash-btn-quiet"
                onClick={() => library.refetch()}
              >
                Try again
              </button>
            </div>
          ) : (page?.items.length ?? 0) === 0 ? (
            <EmptyLibrary filtered={filtered} onClear={reset} onUpload={onRequestUpload} />
          ) : state.view === 'grid' || compact ? (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))' }}
              onKeyDown={gridArrowKeys}
            >
              {page!.items.map((asset) => (
                <FileTile
                  key={asset.id}
                  asset={asset}
                  selected={selectedId === asset.id}
                  onSelect={() => onSelect(asset)}
                  onOpen={onOpen ? () => onOpen(asset) : undefined}
                />
              ))}
            </div>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {['File', 'Type', 'Size', 'Added', 'Use'].map((heading) => (
                    <th
                      key={heading}
                      className="px-2.5 pb-2 text-start text-[10px] font-bold tracking-[0.12em] whitespace-nowrap text-[var(--dash-quiet)] uppercase"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page!.items.map((asset) => (
                  <tr
                    key={asset.id}
                    aria-selected={selectedId === asset.id}
                    onClick={() => onSelect(asset)}
                    onDoubleClick={() => onOpen?.(asset)}
                    className={cn(
                      'cursor-pointer',
                      selectedId === asset.id
                        ? 'dash-tone-blue'
                        : 'hover:bg-[var(--dash-hover)]',
                    )}
                  >
                    <td className="border-t border-[var(--dash-line)] px-2.5 py-2">
                      <span className="flex items-center gap-2.5 font-semibold">
                        <Thumbnail
                          asset={asset}
                          className="size-8 shrink-0 rounded-md"
                        />
                        <span className="truncate">{asset.displayName}</span>
                      </span>
                    </td>
                    <td className="dash-num border-t border-[var(--dash-line)] px-2.5 py-2 text-[var(--dash-quiet)]">
                      {labelForType(asset.contentType)}
                    </td>
                    <td className="dash-num border-t border-[var(--dash-line)] px-2.5 py-2 text-[var(--dash-quiet)]">
                      {formatBytes(asset.byteSize)}
                    </td>
                    <td className="dash-num border-t border-[var(--dash-line)] px-2.5 py-2 text-[var(--dash-quiet)]">
                      {formatDate(asset.createdAt)}
                    </td>
                    <td className="border-t border-[var(--dash-line)] px-2.5 py-2">
                      <UseChip asset={asset} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {page && page.total > 0 ? (
          <Pager
            page={page.page}
            pageCount={page.pageCount}
            total={page.total}
            shown={page.items.length}
            busy={library.isFetching}
            onPage={(next) => update({ page: next })}
          />
        ) : null}
      </div>
    </div>
  )
}

export { describeAsset }
