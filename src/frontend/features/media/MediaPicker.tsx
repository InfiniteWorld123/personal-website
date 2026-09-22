import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import type { MediaAsset, MediaKind } from '#/backend2/contracts/media.contract'
import { MediaBrowser, useBrowserState } from './MediaBrowser'
import { describeAsset, formatBytes } from './media-parts'
import { useRefreshMedia } from './queries'
import { UploadButton, UploadList, useUploads } from './uploads'

/**
 * The one picker every module uses.
 *
 * `docs/v2/media.md`: "Every module uses one shared Media picker… Modules must
 * not maintain independent upload paths or duplicate the file as a separate
 * module-owned asset." So Projects, Blog and anything later mount *this*, and
 * the **Upload from computer** button inside it adds to the shared library
 * first and selects second. That ordering is the whole promise, which is why
 * the button says where the file is going.
 *
 * Cover, gallery or inline role, ordering, alt text and captions are not here
 * on purpose: they belong to each *use* of a file, in the module's own editor,
 * because the same photograph needs different alt text in a German article and
 * an Arabic project.
 */
export function MediaPicker({
  open,
  onClose,
  onChoose,
  kind,
  title = 'Choose from Media',
  description,
}: {
  open: boolean
  onClose: () => void
  onChoose: (asset: MediaAsset) => void
  /** Narrows the library to one family, e.g. images for a cover. */
  kind?: MediaKind
  title?: string
  description?: string
}) {
  const browser = useBrowserState(kind ? { kind } : {})
  const [chosen, setChosen] = useState<MediaAsset | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)

  const currentFolder = browser.state.folder
  const folderId = currentFolder === 'all' || currentFolder === 'root' ? null : currentFolder

  const refreshMedia = useRefreshMedia()

  const uploads = useUploads({
    folderId,
    folderName: folderId ? 'this folder' : 'the library',
    onUploaded: (asset) => {
      // A file the owner just uploaded is almost certainly the one they
      // wanted, so it is selected — and the grid is told to re-read, because
      // an upload goes straight to the API rather than through a mutation.
      setChosen(asset)
      refreshMedia()
    },
  })

  // Escape closes, and focus goes back to whatever opened the picker rather
  // than to the top of the page.
  useEffect(() => {
    if (!open) return

    opener.current = document.activeElement
    dialog.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener.current instanceof HTMLElement) opener.current.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(8,12,24,.5)] p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-picker-title"
        tabIndex={-1}
        className="dash-panel flex h-[min(620px,100%)] w-[min(920px,100%)] flex-col overflow-hidden p-0 shadow-[var(--dash-shadow)] outline-none"
      >
        <header className="flex items-start gap-3 border-b border-[var(--dash-line)] px-5 py-4">
          <div className="min-w-0">
            <h2 id="media-picker-title" className="dash-title text-[18px]">
              {title}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--dash-quiet)]">
              {description ??
                'The same library every module uses. Nothing here belongs to one module.'}
            </p>
          </div>
          <UploadButton
            onFiles={uploads.add}
            className="dash-btn dash-btn-quiet ms-auto h-8 shrink-0 px-2.5 text-xs"
          >
            <Upload className="size-3.5" aria-hidden />
            Upload from computer
          </UploadButton>
        </header>

        <UploadList items={uploads.items} onRemove={uploads.remove} onClear={uploads.clearFinished} />

        <MediaBrowser
          {...browser}
          compact
          pageSize={18}
          selectedId={chosen?.id ?? null}
          onSelect={setChosen}
          onOpen={(asset) => {
            onChoose(asset)
            onClose()
          }}
          onRequestUpload={() => {
            // The empty state's button and the header's button are the same
            // action, so it is one input element rather than two.
            dialog.current?.querySelector<HTMLElement>('input[type="file"]')?.click()
          }}
        />

        <footer className="flex flex-wrap items-center gap-2.5 border-t border-[var(--dash-line)] px-5 py-3">
          <p className="min-w-0 text-[12.5px] text-[var(--dash-quiet)]">
            {chosen ? (
              <>
                Selected <strong className="text-[var(--dash-ink)]">{chosen.displayName}</strong>{' '}
                <span className="dash-num">
                  · {formatBytes(chosen.byteSize)} · {describeAsset(chosen)}
                </span>
              </>
            ) : (
              'Nothing selected yet'
            )}
          </p>
          <span className="flex-1" />
          <button type="button" className="dash-btn dash-btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="dash-btn dash-btn-primary"
            disabled={!chosen}
            onClick={() => {
              if (!chosen) return

              onChoose(chosen)
              onClose()
            }}
          >
            Use this file
          </button>
        </footer>
      </div>
    </div>
  )
}
