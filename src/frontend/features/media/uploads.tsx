import { useCallback, useRef, useState } from 'react'
import { AlertTriangle, Check, Upload as UploadIcon, X } from 'lucide-react'
import type { MediaAsset } from '#/backend2/contracts/media.contract'
import { FILE_INPUT_ACCEPT, MAX_BYTES } from '#/backend2/contracts/media.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { cn } from '#/frontend/lib/utils'
import { uploadFile } from './api'
import { formatBytes } from './media-parts'

/**
 * Taking files in, and saying what happened to each one.
 *
 * `docs/v2/media.md` asks for "an upload flow that shows progress and handles
 * interrupted/failed uploads without creating phantom library items". The
 * server holds up its half — a failed upload writes no row. This is the other
 * half: every file gets its own line, its own progress, and its own sentence
 * when it is refused, rather than one toast that says "some files failed".
 */

export type UploadItem = {
  id: string
  name: string
  size: number
  percent: number
  status: 'uploading' | 'done' | 'failed'
  /** What to tell the owner. A refusal explains itself; a success names the folder. */
  message?: string
  /** The stable server code, so a refusal can be styled and tested by meaning. */
  code?: string | null
  asset?: MediaAsset
  /** Another library entry with the same bytes. Not an error — worth mentioning. */
  duplicateOf?: string[]
  abort?: () => void
}

let counter = 0

export const useUploads = (options: {
  folderId: string | null
  folderName: string
  onUploaded?: (asset: MediaAsset) => void
}) => {
  const [items, setItems] = useState<UploadItem[]>([])
  // Read through a ref so a queued upload uses the folder that was open when
  // it started, not whichever one the owner clicked while it was in flight.
  const settings = useRef(options)

  settings.current = options

  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...next } : item)))
  }, [])

  const add = useCallback(
    (files: File[]) => {
      const { folderId, folderName, onUploaded } = settings.current

      for (const file of files) {
        const id = `upload-${(counter += 1)}`

        /*
         * Refused in the browser before a byte is sent, purely to save the
         * owner the wait. The server checks the real bytes again and is the
         * only thing that decides — this is a courtesy, never a boundary.
         */
        const ceiling = Math.max(...Object.values(MAX_BYTES))

        if (file.size > ceiling) {
          setItems((current) => [
            ...current,
            {
              id,
              name: file.name,
              size: file.size,
              percent: 0,
              status: 'failed',
              code: 'FILE_TOO_LARGE',
              message: `That file is larger than ${Math.round(ceiling / (1024 * 1024))} MB`,
            },
          ])

          continue
        }

        const { promise, abort } = uploadFile({
          file,
          folderId,
          onProgress: (percent) => patch(id, { percent }),
        })

        setItems((current) => [
          ...current,
          { id, name: file.name, size: file.size, percent: 0, status: 'uploading', abort },
        ])

        promise
          .then((result) => {
            patch(id, {
              percent: 100,
              status: 'done',
              asset: result.asset,
              duplicateOf: result.duplicateOf,
              message:
                result.duplicateOf.length > 0
                  ? 'Added — the same file is already in the library'
                  : `Added to ${folderName}`,
            })
            onUploaded?.(result.asset)
          })
          .catch((caught: unknown) => {
            const failure =
              caught instanceof ApiRequestError
                ? caught
                : new ApiRequestError({ message: 'That upload did not finish', code: null, status: 0 })

            // A cancelled upload is not a failure to report; the owner did it.
            if (failure.code === 'ABORTED') {
              setItems((current) => current.filter((item) => item.id !== id))

              return
            }

            patch(id, { status: 'failed', code: failure.code, message: failure.message })
          })
      }
    },
    [patch],
  )

  const remove = useCallback((id: string) => {
    setItems((current) => {
      current.find((item) => item.id === id)?.abort?.()

      return current.filter((item) => item.id !== id)
    })
  }, [])

  const clearFinished = useCallback(() => {
    setItems((current) => current.filter((item) => item.status === 'uploading'))
  }, [])

  return { items, add, remove, clearFinished, busy: items.some((i) => i.status === 'uploading') }
}

/** The hidden input plus whatever the caller wants to use as the button. */
export function UploadButton({
  onFiles,
  className,
  children,
}: {
  onFiles: (files: File[]) => void
  className?: string
  children: React.ReactNode
}) {
  const input = useRef<HTMLInputElement>(null)

  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={FILE_INPUT_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]

          // Reset so choosing the same file twice in a row still fires.
          event.target.value = ''
          if (files.length > 0) onFiles(files)
        }}
      />
    </>
  )
}

export function UploadList({
  items,
  onRemove,
  onClear,
}: {
  items: UploadItem[]
  onRemove: (id: string) => void
  onClear: () => void
}) {
  if (items.length === 0) return null

  const finished = items.filter((item) => item.status !== 'uploading').length

  return (
    <section
      aria-label="Uploads"
      className="flex flex-col gap-2 border-b border-[var(--dash-line)] px-4 py-3"
    >
      {items.map((item) => {
        const failed = item.status === 'failed'
        const done = item.status === 'done'

        return (
          <div key={item.id} className="dash-panel flex items-start gap-3 p-3">
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-lg',
                failed && 'dash-tone-red',
                done && 'bg-[var(--dash-live)]/15 text-[var(--dash-live)]',
                !failed && !done && 'dash-tone-blue',
              )}
            >
              {failed ? (
                <AlertTriangle className="size-4" aria-hidden />
              ) : done ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <UploadIcon className="size-4" aria-hidden />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2 text-[13px] font-semibold">
                <span className="truncate">{item.name}</span>
                <span className="dash-num shrink-0 text-[11px] font-normal text-[var(--dash-quiet)]">
                  {formatBytes(item.size)}
                </span>
              </p>

              {item.status === 'uploading' ? (
                <>
                  <p className="mt-0.5 text-[12px] text-[var(--dash-quiet)]" aria-live="polite">
                    Uploading… {item.percent}%
                  </p>
                  <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--dash-chip)]"
                    role="progressbar"
                    aria-valuenow={item.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Uploading ${item.name}`}
                  >
                    <span
                      className="block h-full rounded-full bg-[var(--dash-blue)] transition-[width]"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </>
              ) : (
                <p
                  // A refusal is announced assertively; a success politely.
                  aria-live={failed ? 'assertive' : 'polite'}
                  className={cn(
                    'mt-0.5 text-[12px]',
                    failed ? 'text-[var(--dash-red-ink)]' : 'text-[var(--dash-quiet)]',
                  )}
                >
                  {item.message}
                </p>
              )}
            </div>

            <button
              type="button"
              className="dash-btn dash-btn-ghost h-7 px-2 text-xs"
              onClick={() => onRemove(item.id)}
            >
              {item.status === 'uploading' ? 'Cancel' : <X className="size-3.5" aria-hidden />}
              <span className={item.status === 'uploading' ? 'hidden' : 'sr-only'}>
                Dismiss {item.name}
              </span>
            </button>
          </div>
        )
      })}

      {finished > 1 ? (
        <button
          type="button"
          className="dash-btn dash-btn-ghost h-7 self-start px-2 text-xs"
          onClick={onClear}
        >
          Clear finished
        </button>
      ) : null}
    </section>
  )
}
