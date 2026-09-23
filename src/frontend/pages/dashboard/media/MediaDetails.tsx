import { useState } from 'react'
import { Download, FolderInput, Pencil, Trash2 } from 'lucide-react'
import type { MediaAsset, MediaReference } from '#/backend2/contracts/media.contract'
import { labelForType } from '#/backend2/contracts/media.contract'
import { fileContentUrl } from '#/frontend/features/media/api'
import {
  formatBytes,
  formatDate,
  Thumbnail,
  UseChip,
} from '#/frontend/features/media/media-parts'
import { useReferences } from '#/frontend/features/media/queries'
import { cn } from '#/frontend/lib/utils'

/**
 * Everything about one file, and one fact above all the others: what uses it.
 *
 * The panel exists mostly to answer that. A file with a use cannot be deleted
 * and, at published scope, can be loaded by anyone — so the list is not
 * metadata here, it is the reason the delete button is or is not available.
 */

const SCOPE_WORDS: Record<MediaReference['scope'], string> = {
  published: 'Live on the site',
  draft: 'Private draft',
  scheduled: 'Scheduled to publish',
  record: 'Private record',
}

const MODULE_WORDS: Record<MediaReference['module'], string> = {
  projects: 'Projects',
  blog: 'Blog',
  services: 'Services',
  invoices: 'Invoices',
  content: 'Content',
  inbox: 'Inbox',
}

const USAGE_WORDS: Record<MediaReference['usage'], string> = {
  cover: 'Cover image',
  gallery: 'In the gallery',
  inline: 'Inside the body',
  attachment: 'Attachment',
  other: 'Used',
}

function ReferenceRow({ reference }: { reference: MediaReference }) {
  return (
    <li className="dash-panel flex flex-col gap-1 p-2.5 text-[12px]">
      <span className="font-semibold">
        {MODULE_WORDS[reference.module]}
        {reference.label ? ` · ${reference.label}` : ''}
      </span>
      <span className="flex items-center gap-1.5 text-[11px] text-[var(--dash-quiet)]">
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            reference.scope === 'published'
              ? 'bg-[var(--dash-live)]'
              : reference.scope === 'record'
                ? 'bg-[var(--dash-quiet)]'
                : 'bg-[var(--dash-blue)]',
          )}
          aria-hidden
        />
        {SCOPE_WORDS[reference.scope]} · {USAGE_WORDS[reference.usage]}
      </span>
    </li>
  )
}

export function MediaDetails({
  asset,
  onRename,
  onMove,
  onDelete,
}: {
  asset: MediaAsset | null
  onRename: () => void
  onMove: () => void
  onDelete: () => void
}) {
  const [page, setPage] = useState(1)
  const references = useReferences(asset?.id ?? null, page, asset !== null && asset.referenceCount > 0)

  if (!asset) {
    return (
      <div className="p-4">
        <p className="text-[12.5px] text-[var(--dash-quiet)]">
          Choose a file to see where it is used.
        </p>
      </div>
    )
  }

  const blocked = asset.referenceCount > 0

  return (
    <div className="flex flex-col gap-3 p-4">
      <Thumbnail
        asset={asset}
        className="aspect-4/3 w-full rounded-xl border border-[var(--dash-panel-border)]"
      />

      <div>
        <h2 className="dash-title text-[15px] break-words">{asset.displayName}</h2>
        <div className="mt-1.5">
          <UseChip asset={asset} />
        </div>
      </div>

      <dl className="text-[12px]">
        {(
          [
            ['Type', labelForType(asset.contentType)],
            /*
             * Only when there is one. A PDF has no dimensions, and a row
             * reading "Size on disk: PDF" — which is what a generic
             * description produced here — is worse than no row at all.
             */
            ...(asset.width && asset.height
              ? ([['Dimensions', `${asset.width} × ${asset.height}`]] as const)
              : []),
            ['Size', formatBytes(asset.byteSize)],
            ['Added', formatDate(asset.createdAt)],
            ['Original name', asset.originalName],
          ] as ReadonlyArray<readonly [string, string]>
        ).map(([label, value]) => (
          <div key={label} className="flex gap-2 border-t border-[var(--dash-line)] py-1.5">
            <dt className="w-[86px] shrink-0 text-[var(--dash-quiet)]">{label}</dt>
            <dd className="dash-num m-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>

      <div>
        <p className="mb-1.5 text-[10px] font-bold tracking-[0.13em] text-[var(--dash-quiet)] uppercase">
          Used in {asset.referenceCount} {asset.referenceCount === 1 ? 'place' : 'places'}
        </p>

        {!blocked ? (
          <p className="rounded-lg border border-dashed border-[var(--dash-line)] p-3 text-center text-[12px] text-[var(--dash-quiet)]">
            Nothing uses this file. It stays in the library until you delete it.
          </p>
        ) : references.isPending ? (
          <p className="text-[12px] text-[var(--dash-quiet)]">Loading uses…</p>
        ) : references.isError ? (
          <p className="text-[12px] text-[var(--dash-red-ink)]">The uses could not be loaded.</p>
        ) : (
          <>
            <ul className="flex list-none flex-col gap-1.5 p-0">
              {references.data?.items.map((reference) => (
                <ReferenceRow key={reference.id} reference={reference} />
              ))}
            </ul>
            {(references.data?.pageCount ?? 1) > 1 ? (
              <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--dash-quiet)]">
                <button
                  type="button"
                  className="dash-btn dash-btn-quiet h-6 px-2 text-[11px]"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <span className="dash-num">
                  {page} / {references.data?.pageCount}
                </span>
                <button
                  type="button"
                  className="dash-btn dash-btn-quiet h-6 px-2 text-[11px]"
                  disabled={page >= (references.data?.pageCount ?? 1)}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <button
            type="button"
            className="dash-btn dash-btn-quiet h-8 flex-1 px-2 text-xs"
            onClick={onRename}
          >
            <Pencil className="size-3.5" aria-hidden />
            Rename
          </button>
          <button
            type="button"
            className="dash-btn dash-btn-quiet h-8 flex-1 px-2 text-xs"
            onClick={onMove}
          >
            <FolderInput className="size-3.5" aria-hidden />
            Move
          </button>
        </div>

        <a
          href={fileContentUrl(asset.id)}
          download={asset.displayName}
          className="dash-btn dash-btn-quiet h-8 w-full px-2 text-xs"
        >
          <Download className="size-3.5" aria-hidden />
          Download
        </a>

        <button
          type="button"
          className="dash-btn h-8 w-full px-2 text-xs"
          style={
            blocked
              ? { background: 'var(--dash-chip)', color: 'var(--dash-quiet)', cursor: 'not-allowed' }
              : { border: '1px solid var(--dash-line)', color: 'var(--dash-red-ink)' }
          }
          disabled={blocked}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" aria-hidden />
          {blocked ? 'In use — cannot delete' : 'Delete permanently'}
        </button>
      </div>
    </div>
  )
}
