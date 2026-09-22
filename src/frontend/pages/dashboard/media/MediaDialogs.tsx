import { useEffect, useRef, useState } from 'react'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import * as v from 'valibot'
import { AlertTriangle, Trash2 } from 'lucide-react'
import type { MediaAsset, MediaFolderNode, MediaReference } from '#/backend2/contracts/media.contract'
import { FileNameSchema, FolderNameSchema } from '#/backend2/contracts/media.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { cn } from '#/frontend/lib/utils'

/**
 * The three things the library asks before it changes something.
 *
 * All of them follow the repository-wide form behaviour from `AGENTS.md`:
 * nothing is marked invalid until the first submit, everything revalidates on
 * change afterwards, the first invalid field takes focus, and the button
 * cannot be pressed twice. The rules come from the shared contract, so what
 * the browser refuses and what the server refuses are the same rules.
 */

function Dialog({
  title,
  onClose,
  children,
  labelledBy,
}: {
  title: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  labelledBy: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)

  useEffect(() => {
    opener.current = document.activeElement
    panel.current?.querySelector<HTMLElement>('input, select, button')?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener.current instanceof HTMLElement) opener.current.focus()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(8,12,24,.5)] p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="dash-panel w-[min(440px,100%)] max-h-full overflow-y-auto p-5 shadow-[var(--dash-shadow)]"
      >
        <h2 id={labelledBy} className="dash-title text-[18px]">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null

  return (
    <p id={id} className="text-[12px] text-[var(--dash-red-ink)]">
      {message}
    </p>
  )
}

/** One text field, for a new folder's name or a file's new name. */
export function NameDialog({
  title,
  label,
  hint,
  initial,
  submitLabel,
  schema,
  onSubmit,
  onClose,
}: {
  title: string
  label: string
  hint?: string
  initial: string
  submitLabel: string
  schema: typeof FolderNameSchema | typeof FileNameSchema
  onSubmit: (name: string) => Promise<unknown>
  onClose: () => void
}) {
  const [failure, setFailure] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { name: initial },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const parsed = v.safeParse(schema, value.name)

        return parsed.success
          ? undefined
          : { fields: { name: parsed.issues[0]?.message ?? 'That name cannot be used' } }
      },
    },
    onSubmitInvalid: () => {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[role="dialog"] [aria-invalid="true"]')?.focus()
      })
    },
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        await onSubmit(v.parse(schema, value.name))
        onClose()
      } catch (caught) {
        setFailure(
          caught instanceof ApiRequestError ? caught.message : 'That could not be saved. Try again.',
        )
      }
    },
  })

  return (
    <Dialog title={title} onClose={onClose} labelledBy="media-name-dialog">
      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="name">
          {(field) => {
            const message = field.state.meta.errors[0] as string | undefined

            return (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="media-name" className="text-[12px] font-semibold">
                  {label}
                </label>
                <input
                  id="media-name"
                  className="dash-field h-9 px-3 text-sm"
                  value={field.state.value}
                  aria-invalid={message ? 'true' : undefined}
                  aria-describedby={message ? 'media-name-error' : hint ? 'media-name-hint' : undefined}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
                {hint && !message ? (
                  <p id="media-name-hint" className="text-[12px] text-[var(--dash-quiet)]">
                    {hint}
                  </p>
                ) : null}
                <FieldError id="media-name-error" message={message} />
              </div>
            )
          }}
        </form.Field>

        {failure ? (
          <p role="alert" className="dash-tone-red rounded-lg px-3 py-2 text-[12.5px]">
            {failure}
          </p>
        ) : null}

        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(submitting) => (
            <div className="flex justify-end gap-2">
              <button type="button" className="dash-btn dash-btn-quiet" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting}>
                {submitting ? 'Saving…' : submitLabel}
              </button>
            </div>
          )}
        </form.Subscribe>
      </form>
    </Dialog>
  )
}

/** Where a file should sit. The library root is a real choice, not "none". */
export function MoveDialog({
  asset,
  tree,
  onSubmit,
  onClose,
}: {
  asset: MediaAsset
  tree: MediaFolderNode[]
  onSubmit: (folderId: string | null) => Promise<unknown>
  onClose: () => void
}) {
  const [folderId, setFolderId] = useState<string>(asset.folderId ?? 'root')
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const options = (nodes: MediaFolderNode[]): React.ReactNode[] =>
    nodes.flatMap((node) => [
      <option key={node.id} value={node.id}>
        {'— '.repeat(node.depth)}
        {node.name}
      </option>,
      ...options(node.children),
    ])

  return (
    <Dialog title={`Move ${asset.displayName}`} onClose={onClose} labelledBy="media-move-dialog">
      <p className="mt-2 text-[13px] text-[var(--dash-quiet)]">
        Moving a file changes nothing about it. Everything already using it keeps working.
      </p>

      <div className="mt-3 flex flex-col gap-1.5">
        <label htmlFor="media-move" className="text-[12px] font-semibold">
          Folder
        </label>
        <select
          id="media-move"
          className="dash-field h-9 px-2.5 text-sm"
          value={folderId}
          onChange={(event) => setFolderId(event.target.value)}
        >
          <option value="root">Library root (no folder)</option>
          {options(tree)}
        </select>
      </div>

      {failure ? (
        <p role="alert" className="dash-tone-red mt-3 rounded-lg px-3 py-2 text-[12.5px]">
          {failure}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="dash-btn dash-btn-quiet" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="dash-btn dash-btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setFailure(null)

            try {
              await onSubmit(folderId === 'root' ? null : folderId)
              onClose()
            } catch (caught) {
              setFailure(
                caught instanceof ApiRequestError
                  ? caught.message
                  : 'That move did not go through. Try again.',
              )
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Moving…' : 'Move file'}
        </button>
      </div>
    </Dialog>
  )
}

/**
 * Deleting a folder, which never deletes a file.
 *
 * "deleting a folder requires it to be empty … Deleting an empty folder never
 * deletes files implicitly." The refusal carries the counts, because "move
 * these three files first" is something the owner can act on and "that did not
 * work" is not.
 */
export function DeleteFolderDialog({
  name,
  onConfirm,
  onClose,
}: {
  name: string
  onConfirm: () => Promise<unknown>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  return (
    <Dialog title={`Delete the folder ${name}?`} onClose={onClose} labelledBy="media-folder-delete">
      <p className="mt-2 text-[13px] text-[var(--dash-quiet)]">
        A folder is only a label. Deleting one never deletes a file — it has to be empty first, and
        anything inside it must be moved or deleted on its own.
      </p>

      {failure ? (
        <p role="alert" className="dash-tone-red mt-3 rounded-lg px-3 py-2 text-[12.5px]">
          {failure}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="dash-btn dash-btn-quiet" onClick={onClose}>
          Keep it
        </button>
        <button
          type="button"
          className="dash-btn text-white"
          style={{ background: 'var(--dash-red)' }}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setFailure(null)

            try {
              await onConfirm()
              onClose()
            } catch (caught) {
              setFailure(
                caught instanceof ApiRequestError
                  ? caught.message
                  : 'That folder could not be deleted.',
              )
            } finally {
              setBusy(false)
            }
          }}
        >
          <Trash2 className="size-3.5" aria-hidden />
          {busy ? 'Deleting…' : 'Delete folder'}
        </button>
      </div>
    </Dialog>
  )
}

/**
 * Deleting, and the refusal that is far more likely than the deletion.
 *
 * The refusal is not a toast. It is the moment the vault's one rule becomes
 * visible, so it gets the room to name every place the file is used — a
 * refusal the owner cannot act on is barely better than a failure.
 */
export function DeleteDialog({
  asset,
  onConfirm,
  onClose,
}: {
  asset: MediaAsset
  onConfirm: () => Promise<{ storageRemoved: boolean }>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState<{ count: number; references: MediaReference[] } | null>(
    null,
  )
  const [failure, setFailure] = useState<string | null>(null)

  if (blocked) {
    return (
      <Dialog
        title={`Still in use in ${blocked.count} ${blocked.count === 1 ? 'place' : 'places'}`}
        onClose={onClose}
        labelledBy="media-delete-dialog"
      >
        <span className="dash-tone-red mt-1 mb-3 grid size-8 place-items-center rounded-lg">
          <AlertTriangle className="size-4" aria-hidden />
        </span>
        <p className="text-[13px] text-[var(--dash-quiet)]">
          <strong className="text-[var(--dash-ink)]">{asset.displayName}</strong> cannot be deleted
          while something points at it. Remove it in each place below, then delete it here.
        </p>
        <ul className="mt-3 flex list-none flex-col gap-1.5 p-0">
          {blocked.references.map((reference) => (
            <li key={reference.id} className="dash-panel p-2.5 text-[12px]">
              <span className="font-semibold">
                {reference.module}
                {reference.label ? ` · ${reference.label}` : ''}
              </span>
              <span className="mt-0.5 block text-[11px] text-[var(--dash-quiet)]">
                {reference.scope === 'published' ? 'Live on the site' : 'Private'} · {reference.usage}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <button type="button" className="dash-btn dash-btn-quiet" onClick={onClose}>
            Close
          </button>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      title={`Delete ${asset.displayName}?`}
      onClose={onClose}
      labelledBy="media-delete-dialog"
    >
      <p className="mt-2 text-[13px] text-[var(--dash-quiet)]">
        Nothing uses this file. Deleting removes it from the library and deletes the stored copy.
        This cannot be undone.
      </p>

      {failure ? (
        <p role="alert" className="dash-tone-red mt-3 rounded-lg px-3 py-2 text-[12.5px]">
          {failure}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="dash-btn dash-btn-quiet" onClick={onClose}>
          Keep it
        </button>
        <button
          type="button"
          className={cn('dash-btn text-white')}
          style={{ background: 'var(--dash-red)' }}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setFailure(null)

            try {
              await onConfirm()
              onClose()
            } catch (caught) {
              /*
               * The race this catches is real: a module could have written a
               * reference between the list being drawn and this click. The
               * server refuses, and the dialog turns into the refusal rather
               * than reporting a generic failure.
               */
              if (
                caught instanceof ApiRequestError &&
                caught.code === 'DELETE_BLOCKED_BY_REFERENCES'
              ) {
                const details = caught.details as
                  | { referenceCount?: number; references?: MediaReference[] }
                  | undefined

                setBlocked({
                  count: details?.referenceCount ?? 1,
                  references: details?.references ?? [],
                })
              } else {
                setFailure(
                  caught instanceof ApiRequestError
                    ? caught.message
                    : 'That could not be deleted. Try again.',
                )
              }
            } finally {
              setBusy(false)
            }
          }}
        >
          <Trash2 className="size-3.5" aria-hidden />
          {busy ? 'Deleting…' : 'Delete permanently'}
        </button>
      </div>
    </Dialog>
  )
}
