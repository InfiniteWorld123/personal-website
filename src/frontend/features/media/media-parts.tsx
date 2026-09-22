import { useState } from 'react'
import {
  FileArchive,
  FileSpreadsheet,
  FileText,
  FileType2,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Play,
  Presentation,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MediaAsset, MediaFolderNode } from '#/backend2/contracts/media.contract'
import { labelForType } from '#/backend2/contracts/media.contract'
import { cn } from '#/frontend/lib/utils'
import { fileContentUrl } from './api'

/**
 * The pieces the library and the picker are both built from.
 *
 * They live here rather than in either screen because the picker *is* the
 * library with the verbs removed — same rail, same tiles, same filters. One
 * component means the two can never drift into looking like two products.
 */

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`

  const megabytes = bytes / (1024 * 1024)

  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`
}

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** What a file is, in the owner's words rather than a media type. */
export const describeAsset = (asset: MediaAsset): string =>
  asset.kind === 'image' && asset.width && asset.height
    ? `${asset.width} × ${asset.height}`
    : labelForType(asset.contentType)

const ICON_BY_TYPE: Array<[RegExp, LucideIcon]> = [
  [/spreadsheet|excel|ms-excel|csv/u, FileSpreadsheet],
  [/presentation|powerpoint/u, Presentation],
  [/zip/u, FileArchive],
  [/pdf|word|document|rtf|text/u, FileText],
]

const iconFor = (asset: MediaAsset): LucideIcon => {
  if (asset.kind === 'image') return ImageIcon
  if (asset.kind === 'video') return Play

  for (const [pattern, icon] of ICON_BY_TYPE) {
    if (pattern.test(asset.contentType)) return icon
  }

  return FileType2
}

/**
 * The three states this library turns on.
 *
 * In a vault, "where is this used?" is not a detail: it decides whether a file
 * can be deleted and whether a visitor can reach it. So it sits on every tile
 * rather than in a panel — and each state carries its own word, because a
 * status that rests on colour alone is a status some people cannot read.
 */
export function UseChip({ asset, className }: { asset: MediaAsset; className?: string }) {
  const state = asset.isPublished ? 'live' : asset.referenceCount > 0 ? 'used' : 'free'
  const label = state === 'live' ? 'Live' : state === 'used' ? 'In use' : 'Unused'

  return (
    <span
      className={cn(
        'inline-flex h-[18px] w-fit shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-bold tracking-[0.04em]',
        state === 'live' && 'bg-[var(--dash-live)]/15 text-[var(--dash-live)]',
        state === 'used' && 'dash-tone-blue',
        state === 'free' && 'dash-tone-grey',
        className,
      )}
      title={
        state === 'live'
          ? 'A published page uses this file, so visitors can load it'
          : state === 'used'
            ? 'Something private uses this file, so it cannot be deleted'
            : 'Nothing uses this file. It stays until you delete it.'
      }
    >
      {state === 'live' ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {label}
    </span>
  )
}

/**
 * The picture, or an honest stand-in for one.
 *
 * Images load their real bytes through the owner-only content route, which is
 * `no-store` — a private library must not leave copies in a shared cache. A
 * video or a document gets its type's icon rather than a generated poster:
 * there is no thumbnailing on the server, and inventing one would be a
 * picture of something that does not exist.
 */
export function Thumbnail({ asset, className }: { asset: MediaAsset; className?: string }) {
  const [failed, setFailed] = useState(false)
  const Icon = iconFor(asset)

  if (asset.kind === 'image' && !failed) {
    return (
      <span className={cn('relative block overflow-hidden bg-[var(--dash-furniture)]', className)}>
        <img
          src={fileContentUrl(asset.id)}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    )
  }

  return (
    <span
      className={cn(
        'grid place-items-center bg-[var(--dash-furniture)] text-[var(--dash-quiet)]',
        className,
      )}
    >
      <Icon className="size-6" strokeWidth={1.6} aria-hidden />
    </span>
  )
}

export function FileTile({
  asset,
  selected,
  onSelect,
  onOpen,
}: {
  asset: MediaAsset
  selected: boolean
  onSelect: () => void
  onOpen?: () => void
}) {
  return (
    <button
      type="button"
      data-media-tile
      aria-pressed={selected}
      onClick={onSelect}
      onDoubleClick={onOpen}
      className={cn(
        'dash-panel group flex flex-col overflow-hidden p-0 text-left transition-colors',
        selected
          ? 'border-[var(--dash-blue)] ring-2 ring-[var(--dash-blue-tint)]'
          : 'hover:border-[var(--dash-blue)]',
      )}
    >
      <span className="relative block aspect-4/3 w-full">
        <Thumbnail asset={asset} className="absolute inset-0 size-full" />
        <span className="absolute top-1.5 left-1.5 inline-flex items-center rounded-full bg-[rgba(16,23,47,.72)] px-1.5 py-0.5 text-[9px] font-bold tracking-[0.06em] text-white uppercase backdrop-blur-sm">
          {labelForType(asset.contentType)}
        </span>
      </span>
      <span className="flex flex-col gap-1.5 p-2.5">
        <span className="truncate text-[12.5px] font-semibold" title={asset.displayName}>
          {asset.displayName}
        </span>
        <span className="dash-num text-[11px] text-[var(--dash-quiet)]">
          {formatBytes(asset.byteSize)} · {describeAsset(asset)}
        </span>
        <UseChip asset={asset} />
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ folders */

export type FolderChoice = 'all' | 'root' | string

/**
 * The folder rail, flattened for rendering but nested in meaning.
 *
 * "All files" and "Not in a folder" are both real places and not the same one:
 * the first is the whole vault, the second is only the files that were never
 * filed. Without both, "show me everything" and "show me what I still need to
 * tidy" would be the same request.
 *
 * Both counts come from the server's own count of the library, never from the
 * page of files on screen — that page is filtered, so standing inside one
 * folder would otherwise have "All files" reporting the size of that folder.
 */
export function FolderRail({
  tree,
  current,
  onChoose,
  total,
  rootTotal,
  action,
}: {
  tree: MediaFolderNode[]
  current: FolderChoice
  onChoose: (choice: FolderChoice) => void
  /** Every file in the library, whatever folder it is in. */
  total: number
  /** Only the files in no folder at all. */
  rootTotal: number
  action?: React.ReactNode
}) {
  const row = (choice: FolderChoice, name: string, depth: number, count: number, key: string) => {
    const active = current === choice

    return (
      <button
        key={key}
        type="button"
        aria-current={active ? 'true' : undefined}
        onClick={() => onChoose(choice)}
        style={{ paddingInlineStart: `${8 + depth * 13}px` }}
        className={cn(
          'flex w-full items-center gap-2 rounded-md py-1.5 pe-2 text-start text-[12.5px]',
          active
            ? 'dash-tone-blue font-semibold'
            : 'text-[var(--dash-ink)] hover:bg-[var(--dash-hover)]',
        )}
      >
        {active ? (
          <FolderOpen className="size-3.5 shrink-0 opacity-80" aria-hidden />
        ) : (
          <Folder className="size-3.5 shrink-0 opacity-80" aria-hidden />
        )}
        <span className="truncate">{name}</span>
        <span className="dash-num ms-auto text-[11px] opacity-70">{count}</span>
      </button>
    )
  }

  const walk = (nodes: MediaFolderNode[]): React.ReactNode[] =>
    nodes.flatMap((node) => [
      row(node.id, node.name, node.depth + 1, node.fileCount, node.id),
      ...walk(node.children),
    ])

  return (
    <nav aria-label="Folders" className="flex flex-col gap-0.5">
      <p className="flex items-center px-2 pb-2 text-[10px] font-bold tracking-[0.14em] text-[var(--dash-quiet)] uppercase">
        Folders
        {action ? <span className="ms-auto">{action}</span> : null}
      </p>
      {row('all', 'All files', 0, total, 'all')}
      {row('root', 'Not in a folder', 0, rootTotal, 'root')}
      {walk(tree)}
    </nav>
  )
}

/* ---------------------------------------------------------------- paging */

export function Pager({
  page,
  pageCount,
  total,
  shown,
  onPage,
  busy,
}: {
  page: number
  pageCount: number
  total: number
  shown: number
  onPage: (page: number) => void
  busy?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--dash-line)] px-4 py-2.5 text-[12px] text-[var(--dash-quiet)]">
      <span>
        Showing <strong className="dash-num text-[var(--dash-ink)]">{shown}</strong> of{' '}
        <strong className="dash-num text-[var(--dash-ink)]">{total}</strong>
      </span>
      <span className="flex-1" />
      <button
        type="button"
        className="dash-btn dash-btn-quiet h-7 px-2.5 text-xs"
        disabled={page <= 1 || busy}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <span>
        Page <strong className="dash-num text-[var(--dash-ink)]">{page}</strong> of{' '}
        <strong className="dash-num text-[var(--dash-ink)]">{pageCount}</strong>
      </span>
      <button
        type="button"
        className="dash-btn dash-btn-quiet h-7 px-2.5 text-xs"
        disabled={page >= pageCount || busy}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </div>
  )
}

/**
 * Arrow keys inside a grid of tiles.
 *
 * Without this the grid is one tab stop per file, which on a full page is
 * forty presses to reach the toolbar below it. The column count is measured
 * from the rendered layout rather than assumed, so it stays right at every
 * width.
 */
export const gridArrowKeys = (event: React.KeyboardEvent<HTMLElement>): void => {
  if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) return

  const focused = document.activeElement

  if (!(focused instanceof HTMLElement) || !focused.matches('[data-media-tile]')) return

  const container = focused.parentElement

  if (!container) return

  const tiles = [...container.querySelectorAll<HTMLElement>('[data-media-tile]')]
  const index = tiles.indexOf(focused)
  const columns = Math.max(1, Math.round(container.offsetWidth / focused.offsetWidth))
  const step =
    event.key === 'ArrowRight'
      ? 1
      : event.key === 'ArrowLeft'
        ? -1
        : event.key === 'ArrowDown'
          ? columns
          : -columns

  const next = tiles[index + step]

  if (!next) return

  event.preventDefault()
  next.focus()
}

/* ------------------------------------------------------------ empty states */

export function EmptyLibrary({
  filtered,
  onClear,
  onUpload,
}: {
  filtered: boolean
  onClear: () => void
  onUpload: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
      <p className="dash-title text-[17px]">
        {filtered ? 'Nothing matches those filters' : 'The library is empty'}
      </p>
      <p className="max-w-[44ch] text-[13px] text-[var(--dash-quiet)]">
        {filtered
          ? 'Clear the filters, or add something from this computer.'
          : 'Upload an image, a video or a document. Every module picks from here, so a file only ever needs uploading once.'}
      </p>
      <div className="flex gap-2">
        {filtered ? (
          <button type="button" className="dash-btn dash-btn-quiet" onClick={onClear}>
            Clear filters
          </button>
        ) : null}
        <button type="button" className="dash-btn dash-btn-primary" onClick={onUpload}>
          Upload from computer
        </button>
      </div>
    </div>
  )
}
