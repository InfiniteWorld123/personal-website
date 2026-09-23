import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '#/frontend/lib/utils'

/**
 * One modal for every Blog dialog.
 *
 * The Dashboard has no shared dialog yet — the Media picker and the previews
 * each draw their own — so the Blog's dozen dialogs share this one rather
 * than a dozen copies of the same scrim. It does what a modal owes a keyboard:
 * focus moves in, Tab stays in, Escape leaves, and focus goes back to the
 * button that opened it. The page behind does not scroll.
 *
 * It is drawn at the Dashboard's root, not where it is opened: a dialog opened
 * from inside the article editor would otherwise be a form inside a form, and
 * one opened from the Arabic tab would inherit its direction. The root is also
 * where the Dashboard's colours are defined, so the dialog keeps them.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function BlogDialog({
  labelledBy,
  describedBy,
  onClose,
  role = 'dialog',
  size = 'md',
  className,
  children,
}: {
  labelledBy: string
  describedBy?: string
  onClose: () => void
  role?: 'dialog' | 'alertdialog'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  children: React.ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const opener = document.activeElement
    const box = panel.current

    // An `autoFocus` field inside has already taken focus; otherwise the first
    // field, and failing that the dialog itself.
    if (box && !box.contains(document.activeElement)) {
      const first =
        box.querySelector<HTMLElement>('[data-autofocus]') ??
        box.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])')

      ;(first ?? box).focus()
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()

        return
      }

      if (event.key !== 'Tab' || !panel.current) return

      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      )

      if (items.length === 0) return

      const first = items[0]!
      const last = items[items.length - 1]!

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)

    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  const host = document.querySelector('.dash-root[data-dashboard]') ?? document.body

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(8,12,24,.55)] p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeRef.current()
      }}
    >
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cn(
          'dash-panel my-auto flex w-full flex-col gap-3 p-5 shadow-[var(--dash-shadow)] outline-none',
          size === 'sm' ? 'max-w-[26rem]' : size === 'md' ? 'max-w-[34rem]' : 'max-w-[42rem]',
          className,
        )}
      >
        {children}
      </div>
    </div>,
    host,
  )
}

export function DialogTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-[16px] font-semibold">
      {children}
    </h2>
  )
}

export function DialogActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mt-1 flex flex-wrap items-center justify-end gap-2', className)}>{children}</div>
}

/** A server's refusal, said inside the dialog that caused it. */
export function DialogAlert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="dash-tone-red rounded-lg px-3 py-2 text-[12.5px]">
      {children}
    </p>
  )
}

/**
 * "Are you sure?", once. The button stays busy while the request runs, so a
 * double click cannot send it twice, and a failure is shown here rather than
 * closing the dialog as if it had worked.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busyLabel,
  danger = false,
  disabled = false,
  onConfirm,
  onClose,
}: {
  title: string
  children: React.ReactNode
  confirmLabel: string
  busyLabel?: string
  danger?: boolean
  disabled?: boolean
  /** Throws to keep the dialog open with the message. */
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  return (
    <BlogDialog labelledBy="confirm-title" describedBy="confirm-text" role="alertdialog" size="sm" onClose={onClose}>
      <DialogTitle id="confirm-title">{title}</DialogTitle>
      <div id="confirm-text" className="flex flex-col gap-2.5 text-[13px] text-[var(--dash-quiet)]">
        {children}
      </div>
      {failure ? <DialogAlert>{failure}</DialogAlert> : null}
      <DialogActions>
        <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose} data-autofocus>
          Cancel
        </button>
        <button
          type="button"
          className={cn('dash-btn', danger ? 'dash-tone-red' : 'dash-btn-primary')}
          disabled={busy || disabled}
          onClick={async () => {
            setBusy(true)
            setFailure(null)

            try {
              await onConfirm()
            } catch (caught) {
              setFailure(caught instanceof Error && caught.message ? caught.message : 'That did not work. Nothing was changed.')
              setBusy(false)
            }
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {busy && busyLabel ? busyLabel : confirmLabel}
        </button>
      </DialogActions>
    </BlogDialog>
  )
}
