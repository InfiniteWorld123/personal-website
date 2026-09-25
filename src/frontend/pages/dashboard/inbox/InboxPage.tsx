import { useEffect, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Loader2, PenSquare, Search, Settings2, Star, Trash2 } from 'lucide-react'
import type { ConversationSummary } from '#/backend2/contracts/inbox.contract'
import { PageHead, StatusChip } from '#/frontend/dashboard/primitives'
import { BlogDialog, DialogActions, DialogAlert, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import { createDraft } from '#/frontend/features/inbox-v2/api'
import { useConversations, useDrafts, useEmptyTrash, useInboxCounts } from '#/frontend/features/inbox-v2/queries'
import { messageFromError, notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import type { InboxSearch } from '#/frontend/routes/dashboard.inbox'
import { CountBadge, EmptyState, LoadFailure, Pager } from '../blog/blog-parts'
import { Composer } from './Composer'
import { ConversationPane } from './ConversationPane'
import { InboxSettingsDialog } from './InboxSettingsDialog'
import { listTime } from './inbox-parts'

/**
 * The owner's mailbox at `/dashboard/inbox` (`docs/v2/inbox.md`, approved
 * Design Lab 1A–7A): the list and the conversation side by side on a wide
 * screen, one after the other on a phone. Folders are tabs above the list —
 * Archived and Trash are always visible. Everything the screen shows lives in
 * the address, so Back, reload and a shared link all land in the same place.
 */

const FOLDERS = [
  ['inbox', 'Inbox'],
  ['sent', 'Sent'],
  ['drafts', 'Drafts'],
  ['archived', 'Archived'],
  ['trash', 'Trash'],
] as const

const EMPTY: Record<string, [string, string]> = {
  inbox: ['Nothing here yet', 'New email to info@yamanwarda.de appears here.'],
  sent: ['Nothing sent yet', 'Emails you send appear here, with their delivery state.'],
  archived: ['No archived conversations', 'Archive keeps a conversation out of the Inbox without deleting it. A new reply brings it back.'],
  trash: ['Trash is empty', 'Conversations stay in Trash until you delete them. Nothing is removed automatically.'],
}

function Row({ item, active, sent, onOpen }: { item: ConversationSummary; active: boolean; sent: boolean; onOpen: () => void }) {
  const unread = !item.isRead

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'grid w-full grid-cols-[16px_minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 border-b border-[var(--dash-line)] px-3.5 py-2.5 text-start hover:bg-[var(--dash-hover)]',
          active && 'bg-[var(--dash-blue-tint)] hover:bg-[var(--dash-blue-tint)]',
        )}
      >
        <span className="row-span-3 pt-1">
          {item.isStarred ? <Star className="size-3 fill-[#d99a00] text-[#d99a00]" aria-label="Starred" /> : null}
        </span>
        <span className={cn('min-w-0 truncate text-[13.5px]', unread && 'font-semibold')}>
          {unread ? <span className="me-1.5 inline-block size-[7px] rounded-full bg-[var(--dash-brand)] align-middle" aria-hidden="true" /> : null}
          {sent ? 'To: ' : ''}
          {item.counterpartName || item.counterpartEmail}
          {unread ? <span className="sr-only">, unread</span> : null}
        </span>
        <time className="dash-num text-[11.5px] text-[var(--dash-quiet)]" dateTime={item.lastMessageAt}>{listTime(item.lastMessageAt)}</time>
        <span className={cn('col-span-2 truncate text-[13px]', unread && 'font-semibold')} dir="auto">{item.subject || '(no subject)'}</span>
        <span className="col-span-2 truncate text-[12.5px] text-[var(--dash-quiet)]" dir="auto">
          {item.lastDirection === 'outgoing' ? 'You: ' : ''}
          {item.lastPreview}
        </span>
        {item.hasFailedSend || item.hasDraft || item.origin === 'booking' || item.messageCount > 1 ? (
          <span className="col-span-2 mt-1 flex flex-wrap gap-1">
            {item.hasFailedSend ? <StatusChip tone="red" className="h-[18px] px-1.5 text-[10.5px]">Not sent</StatusChip> : null}
            {item.hasDraft ? <StatusChip tone="outline" className="h-[18px] px-1.5 text-[10.5px]">Draft</StatusChip> : null}
            {item.origin === 'booking' ? <StatusChip tone="blue" className="h-[18px] px-1.5 text-[10.5px]">Booking</StatusChip> : null}
            {item.messageCount > 1 ? <StatusChip tone="grey" className="h-[18px] px-1.5 text-[10.5px]">{item.messageCount} messages</StatusChip> : null}
          </span>
        ) : null}
      </button>
    </li>
  )
}

function ListSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Loading">
      {Array.from({ length: 7 }, (_, index) => (
        <li key={index} className="flex flex-col gap-1.5 border-b border-[var(--dash-line)] px-3.5 py-3">
          <span className="dash-skeleton h-3 w-1/3 rounded" />
          <span className="dash-skeleton h-3 w-5/6 rounded" />
          <span className="dash-skeleton h-2.5 w-2/3 rounded" />
        </li>
      ))}
    </ul>
  )
}

function EmptyTrashDialog({ count, onClose }: { count: number; onClose: () => void }) {
  const empty = useEmptyTrash()
  const [typed, setTyped] = useState('')
  const [failure, setFailure] = useState<string | null>(null)

  return (
    <BlogDialog labelledBy="empty-title" describedBy="empty-text" role="alertdialog" size="sm" onClose={onClose}>
      <DialogTitle id="empty-title">Empty Trash?</DialogTitle>
      <p id="empty-text" className="text-[13px] text-[var(--dash-quiet)]">
        This deletes {count} conversation{count === 1 ? '' : 's'} for good — every message and every file that arrived with them. This cannot be undone. Files you saved to Media stay in Media.
      </p>
      <label className="flex flex-col gap-1 text-[12.5px]">
        <span>Type <b>EMPTY TRASH</b> to confirm</span>
        <input className="dash-field h-9 px-2.5" value={typed} autoComplete="off" data-autofocus onChange={(event) => setTyped(event.target.value)} />
      </label>
      {failure ? <DialogAlert>{failure}</DialogAlert> : null}
      <DialogActions>
        <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="dash-btn dash-tone-red"
          disabled={typed.trim() !== 'EMPTY TRASH' || empty.isPending}
          onClick={async () => {
            setFailure(null)

            try {
              const result = await empty.mutateAsync(undefined)

              notify.success(`Deleted ${result.deleted} conversation${result.deleted === 1 ? '' : 's'} for good`)
              onClose()
            } catch (error) {
              setFailure(messageFromError(error))
            }
          }}
        >
          {empty.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Delete {count} for good
        </button>
      </DialogActions>
    </BlogDialog>
  )
}

export function InboxPage() {
  const search = useSearch({ from: '/dashboard/inbox' }) as InboxSearch
  const navigate = useNavigate({ from: '/dashboard/inbox' })
  const view = search.view ?? 'inbox'
  const page = search.page ?? 1
  const [query, setQuery] = useState(search.q ?? '')
  const [emptying, setEmptying] = useState(false)
  const [creating, setCreating] = useState(false)

  const go = (patch: Partial<InboxSearch>, replace = false) =>
    void navigate({ search: (previous: InboxSearch) => ({ ...previous, ...patch }), replace })

  // The search box writes to the address a moment after typing stops.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      if ((search.q ?? '') !== query.trim()) go({ q: query.trim() || undefined, page: undefined }, true)
    }, 350)

    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const counts = useInboxCounts()
  const list = useConversations(
    { view: view === 'drafts' ? 'inbox' : view, unread: search.filter === 'unread', starred: search.filter === 'starred', q: search.q, page },
    view !== 'drafts',
  )
  const drafts = useDrafts(page, view === 'drafts')

  const reading = Boolean(search.c || search.draft)

  const startNew = async () => {
    setCreating(true)

    try {
      const draft = await createDraft({})

      go({ draft: draft.id, c: undefined })
    } catch (error) {
      notify.error(messageFromError(error))
    } finally {
      setCreating(false)
    }
  }

  const countFor = (key: string): { n?: number; quiet: boolean; label: string } => {
    const data = counts.data

    if (!data) return { quiet: true, label: '' }
    if (key === 'inbox') return { n: data.inboxUnread || undefined, quiet: false, label: 'unread' }
    if (key === 'drafts') return { n: data.drafts || undefined, quiet: true, label: 'drafts' }
    if (key === 'archived') return { n: data.archived || undefined, quiet: true, label: 'archived' }
    if (key === 'trash') return { n: data.trash || undefined, quiet: true, label: 'in Trash' }

    return { quiet: true, label: '' }
  }

  const folderLabel = FOLDERS.find(([key]) => key === view)?.[1] ?? 'Inbox'

  const listPane = (
    <section aria-label={`${folderLabel} list`} className={cn('flex min-h-0 min-w-0 flex-1 flex-col border-[var(--dash-line)] xl:w-[380px] xl:flex-none xl:shrink-0 xl:border-e', reading && 'hidden xl:flex')}>
      <nav aria-label="Inbox folders" className="flex gap-0.5 overflow-x-auto border-b border-[var(--dash-line)] px-2 [scrollbar-width:none]">
        {FOLDERS.map(([key, label]) => {
          const count = countFor(key)

          return (
            <button
              key={key}
              type="button"
              aria-current={view === key ? 'page' : undefined}
              onClick={() => go({ view: key === 'inbox' ? undefined : key, page: undefined, c: undefined, draft: undefined, filter: undefined })}
              className={cn(
                '-mb-px inline-flex items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-[13px] font-semibold whitespace-nowrap',
                view === key ? 'border-[var(--dash-brand)] text-[var(--dash-brand)]' : 'border-transparent text-[var(--dash-quiet)] hover:text-[var(--dash-ink)]',
              )}
            >
              {label}
              {count.n ? <CountBadge count={count.n} quiet={count.quiet} label={count.label} /> : null}
            </button>
          )
        })}
      </nav>

      {view !== 'drafts' ? (
        <div className="flex flex-col gap-2 border-b border-[var(--dash-line)] px-3 py-2.5">
          <label className="relative block">
            <span className="sr-only">Search mail</span>
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--dash-quiet)]" aria-hidden="true" />
            <input className="dash-field h-9 w-full ps-8 pe-2 text-[13px]" placeholder="Search people, subjects, text" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter">
            {view !== 'trash'
              ? ([['all', 'All'], ['unread', 'Unread'], ['starred', 'Starred']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={(search.filter ?? 'all') === key}
                    onClick={() => go({ filter: key === 'all' ? undefined : key, page: undefined })}
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-[12px]',
                      (search.filter ?? 'all') === key ? 'border-transparent bg-[var(--dash-blue-tint)] font-semibold text-[var(--dash-blue-ink)]' : 'border-[var(--dash-line)] text-[var(--dash-quiet)]',
                    )}
                  >
                    {label}
                  </button>
                ))
              : (
                  <>
                    <span className="text-[12px] text-[var(--dash-quiet)]">Kept until you delete them.</span>
                    {counts.data?.trash ? (
                      <button type="button" className="dash-btn dash-btn-ghost ms-auto h-7 text-[12px] text-[var(--dash-red-ink)]" onClick={() => setEmptying(true)}>
                        <Trash2 className="size-3.5" aria-hidden="true" /> Empty Trash…
                      </button>
                    ) : null}
                  </>
                )}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === 'drafts' ? (
          drafts.isPending ? (
            <ListSkeleton />
          ) : drafts.isError ? (
            <LoadFailure title="Drafts could not load" message={messageFromError(drafts.error)} onRetry={() => void drafts.refetch()} />
          ) : drafts.data.items.length === 0 ? (
            <EmptyState title="No drafts">Anything you start writing is kept here until you send or discard it.</EmptyState>
          ) : (
            <ul>
              {drafts.data.items.map((draft) => (
                <li key={draft.id}>
                  <button
                    type="button"
                    onClick={() => go({ draft: draft.id, c: draft.conversationId ?? undefined })}
                    aria-current={search.draft === draft.id ? 'true' : undefined}
                    className={cn(
                      'grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 border-b border-[var(--dash-line)] px-3.5 py-2.5 text-start hover:bg-[var(--dash-hover)]',
                      search.draft === draft.id && 'bg-[var(--dash-blue-tint)]',
                    )}
                  >
                    <span className="truncate text-[13.5px]" dir="ltr">To: {draft.toEmail || '(no address yet)'}</span>
                    <time className="dash-num text-[11.5px] text-[var(--dash-quiet)]">{listTime(draft.updatedAt)}</time>
                    <span className="col-span-2 truncate text-[13px]" dir="auto">{draft.subject || draft.conversationSubject || '(no subject)'}</span>
                    <span className="col-span-2 mt-0.5 flex gap-1">
                      <StatusChip tone="outline" className="h-[18px] px-1.5 text-[10.5px]">{draft.conversationId ? 'Reply' : 'New message'}</StatusChip>
                      <StatusChip tone="grey" className="h-[18px] px-1.5 text-[10.5px]">{draft.language.toUpperCase()}</StatusChip>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : list.isPending ? (
          <ListSkeleton />
        ) : list.isError ? (
          <LoadFailure title="The Inbox could not load" message={`${messageFromError(list.error)} Your mail is safe; nothing was changed.`} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState title={search.q || search.filter ? 'No matches' : EMPTY[view]![0]}>
            {search.q || search.filter ? 'Try another filter or search.' : EMPTY[view]![1]}
          </EmptyState>
        ) : (
          <ul aria-label={folderLabel}>
            {list.data.items.map((item) => (
              <Row key={item.id} item={item} sent={view === 'sent'} active={search.c === item.id} onOpen={() => go({ c: item.id, draft: undefined })} />
            ))}
          </ul>
        )}
      </div>

      {(view === 'drafts' ? drafts.data : list.data) ? (
        <div className="flex flex-col gap-1 border-t border-[var(--dash-line)] px-3 py-2">
          <span className="dash-num text-[11.5px] text-[var(--dash-quiet)]">
            {(() => {
              const data = (view === 'drafts' ? drafts.data : list.data)!

              if (data.total === 0) return '0'

              return `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total}`
            })()}
          </span>
          <Pager
            page={(view === 'drafts' ? drafts.data : list.data)!.page}
            pageCount={(view === 'drafts' ? drafts.data : list.data)!.pageCount}
            onPage={(next) => go({ page: next === 1 ? undefined : next })}
          />
        </div>
      ) : null}
    </section>
  )

  const back = () => go({ c: undefined, draft: undefined })

  let readingPane
  if (search.draft && !search.c) {
    readingPane = (
      <section aria-label="New message" className="flex min-h-0 flex-1 flex-col">
        <Composer draftId={search.draft} mode="new" full onClose={back} onSent={(conversationId) => go({ view: 'sent', c: conversationId, draft: undefined, page: undefined })} />
      </section>
    )
  } else if (search.c) {
    readingPane = (
      <ConversationPane
        key={search.c}
        id={search.c}
        onBack={back}
        backLabel={folderLabel}
        onGone={back}
        onOpenConversation={(id) => go({ c: id, draft: undefined })}
      />
    )
  } else {
    readingPane = (
      <div className="hidden flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-[13px] text-[var(--dash-quiet)] xl:flex">
        <p className="text-sm font-semibold text-[var(--dash-ink)]">No conversation open</p>
        <p>Choose one from the list, or start a new message.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-4.5rem)] w-full max-w-[96rem] flex-col gap-4 p-4 sm:p-6">
      <PageHead
        eyebrow="INBOX"
        title="Inbox"
        description="info@yamanwarda.de — every email to it, one conversation per first email."
        actions={
          <>
            <button type="button" className="dash-btn dash-btn-ghost" onClick={() => go({ settings: true })}>
              <Settings2 className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">Signatures &amp; replies</span>
            </button>
            <button type="button" className="dash-btn dash-btn-primary" onClick={() => void startNew()} disabled={creating}>
              {creating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <PenSquare className="size-4" aria-hidden="true" />}
              New message
            </button>
          </>
        }
      />

      <div className="dash-panel flex min-h-0 flex-1 overflow-hidden">
        {listPane}
        <div className={cn('min-h-0 min-w-0 flex-1 flex-col', reading ? 'flex' : 'hidden xl:flex')}>{readingPane}</div>
      </div>

      {search.settings ? <InboxSettingsDialog onClose={() => go({ settings: undefined }, true)} /> : null}
      {emptying ? <EmptyTrashDialog count={counts.data?.trash ?? 0} onClose={() => setEmptying(false)} /> : null}
    </div>
  )
}
