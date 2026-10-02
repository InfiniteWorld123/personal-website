import { Archive, ArchiveRestore, Loader2, MailCheck, RefreshCw, Trash2, X } from 'lucide-react'
import type { BulkConversationAction } from '#/backend2/contracts/inbox.contract'

export function InboxBulkBar({ count, view, disabled, busy, refreshing, failure, onAction, onClear, onRefresh }: {
  count: number
  view: string
  disabled: boolean
  busy: boolean
  refreshing: boolean
  failure: string | null
  onAction: (action: BulkConversationAction) => void
  onClear: () => void
  onRefresh: () => void
}) {
  return (
    <div className="border-b border-[var(--dash-line)] bg-[var(--dash-furniture)] px-3 py-2">
      <div className="flex min-h-8 flex-wrap items-center gap-1.5" role="group" aria-label="Mailbox actions" aria-busy={busy}>
        <span className="me-2 text-[12.5px] text-[var(--dash-quiet)]" role="status">
          {busy ? <Loader2 className="me-1.5 inline size-3.5 animate-spin" aria-hidden="true" /> : null}
          {count ? `${count} selected on this page` : view === 'drafts' ? 'Your saved drafts' : 'Select mail to manage it'}
        </span>
        {count > 0 ? (
          <>
            <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12px]" disabled={disabled} onClick={() => onAction(view === 'trash' ? 'restore' : view === 'archived' ? 'unarchive' : 'archive')}>
              {view === 'trash' ? <ArchiveRestore className="size-3.5" aria-hidden="true" /> : <Archive className="size-3.5" aria-hidden="true" />}
              {view === 'trash' ? 'Restore' : view === 'archived' ? 'Move to Inbox' : 'Archive'}
            </button>
            <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12px]" disabled={disabled} onClick={() => onAction('mark-read')}>
              <MailCheck className="size-3.5" aria-hidden="true" /> Mark read
            </button>
            {view !== 'trash' ? (
              <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12px]" disabled={disabled} onClick={() => onAction('trash')}>
                <Trash2 className="size-3.5" aria-hidden="true" /> Trash
              </button>
            ) : null}
            <select aria-label="More selected mail actions" className="dash-field h-8 max-w-full px-2 text-[12px]" value="" disabled={disabled} onChange={(event) => {
              if (event.target.value) onAction(event.target.value as BulkConversationAction)
            }}>
              <option value="" disabled>More actions</option>
              <option value="mark-unread">Mark unread</option>
              <option value="star">Star</option>
              <option value="unstar">Remove star</option>
              {view !== 'trash' && view !== 'archived' ? <option value="unarchive">Move to Inbox</option> : null}
            </select>
            <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12px]" disabled={busy} onClick={onClear}>
              <X className="size-3.5" aria-hidden="true" /> Clear selection
            </button>
          </>
        ) : null}
        <button type="button" className="dash-btn dash-btn-ghost ms-auto h-8 text-[12px]" disabled={busy || refreshing} onClick={onRefresh}>
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
        </button>
      </div>
      {failure ? <p role="alert" className="mt-2 text-[12px] text-[var(--dash-red-ink)]">{failure}</p> : null}
    </div>
  )
}
