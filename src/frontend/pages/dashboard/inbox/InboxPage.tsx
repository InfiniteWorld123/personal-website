import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Loader2, PenSquare, Search, Settings2, Star, Trash2 } from 'lucide-react'
import { INBOX_LIMITS, type BulkConversationAction, type ConversationSummary } from '#/backend2/contracts/inbox.contract'
import { StatusChip } from '#/frontend/dashboard/primitives'
import { BlogDialog, DialogActions, DialogAlert, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import { createDraft } from '#/frontend/features/inbox-v2/api'
import { useBulkConversations, useConversations, useDrafts, useEmptyTrash, useInboxCounts, usePrefetchInbox, useRefreshInbox, useRememberDraft } from '#/frontend/features/inbox-v2/queries'
import { messageFromError, notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import type { InboxSearch } from '#/frontend/routes/dashboard.inbox'
import { CountBadge, EmptyState, LoadFailure, Pager } from '../blog/blog-parts'
import { InboxBulkBar } from './InboxBulkBar'
import { listTime } from './inbox-parts'

const loadReader = () => import('./ConversationPane')
const warmReader = () => { void loadReader().catch(() => {}) }
const Composer = lazy(() => import('./Composer').then((module) => ({ default: module.Composer })))
const ConversationPane = lazy(() => loadReader().then((module) => ({ default: module.ConversationPane })))
const InboxSettingsDialog = lazy(() => import('./InboxSettingsDialog').then((module) => ({ default: module.InboxSettingsDialog })))

/** The owner's approved Compact workspace; the URL owns navigation. */

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

function Row({ item, active, sent, onOpen, prefetch, selected, disabled, onSelect }: { item: ConversationSummary; active: boolean; sent: boolean; onOpen: () => void; selected: boolean; disabled: boolean; onSelect: () => void; prefetch: ReturnType<typeof usePrefetchInbox> }) {
  const unread = !item.isRead

  return (
    <li className={cn('flex border-b border-[var(--dash-line)]', (active || selected) && 'bg-[var(--dash-blue-tint)]')}>
      <label className="flex w-10 shrink-0 cursor-pointer items-start justify-center pt-3.5">
        <input type="checkbox" className="size-4 accent-[var(--dash-brand)]" checked={selected} disabled={disabled} onChange={onSelect} aria-label={`Select ${item.subject || '(no subject)'}`} />
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        onMouseEnter={() => prefetch.hoverConversation(item.id)}
        onMouseLeave={prefetch.cancel}
        onFocus={() => prefetch.conversation(item.id)}
        onBlur={prefetch.cancel}
        onTouchStart={() => prefetch.conversation(item.id)}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 pe-3 py-2.5 text-start hover:bg-[var(--dash-hover)]',
          active && 'bg-[var(--dash-blue-tint)] hover:bg-[var(--dash-blue-tint)]',
        )}
      >
        <span className={cn('min-w-0 truncate text-[13.5px]', unread && 'font-semibold')}>
          {unread ? <span className="me-1.5 inline-block size-[7px] rounded-full bg-[var(--dash-brand)] align-middle" aria-hidden="true" /> : null}
          {item.isStarred ? <Star className="me-1 inline size-3 fill-[#d99a00] text-[#d99a00]" aria-label="Starred" /> : null}
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
            {item.hasFailedSend ? <StatusChip tone="red" className="h-[18px] px-1.5 text-[10.5px]">Needs attention</StatusChip> : null}
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
  const rememberDraft = useRememberDraft()
  const prefetch = usePrefetchInbox(warmReader)
  const bulk = useBulkConversations()
  const refresh = useRefreshInbox()
  const [selection, setSelection] = useState<{ scope: string; ids: string[] }>({ scope: '', ids: [] })
  const [bulkFailure, setBulkFailure] = useState<{ scope: string; message: string } | null>(null)
  const selectAll = useRef<HTMLInputElement>(null)
  const currentSearch = useRef(search)
  currentSearch.current = search
  const ownQuery = useRef<string | undefined>(undefined)

  const go = (patch: Partial<InboxSearch>, replace = false) =>
    void navigate({ search: (previous: InboxSearch) => ({ ...previous, ...patch }), replace })

  // The search box writes to the address a moment after typing stops.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      if ((search.q ?? '') !== query.trim()) {
        ownQuery.current = query.trim()
        go({ q: query.trim() || undefined, page: undefined }, true)
      }
    }, 350)

    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    const value = search.q ?? ''
    if (ownQuery.current === value) ownQuery.current = undefined
    else setQuery(value)
  }, [search.q])

  const counts = useInboxCounts()
  const list = useConversations(
    { view: view === 'drafts' ? 'inbox' : view, unread: search.filter === 'unread', starred: search.filter === 'starred', q: search.q, page },
    view !== 'drafts',
  )
  const drafts = useDrafts(page, view === 'drafts')

  const scope = JSON.stringify([view, page, search.q ?? '', search.filter ?? 'all'])
  const freshList = view !== 'drafts' && list.isSuccess && !list.isPlaceholderData
  const pageIds = freshList ? list.data.items.map((item) => item.id) : []
  const selected = selection.scope === scope ? selection.ids.filter((id) => pageIds.includes(id)) : []
  const selectionDisabled = !freshList || bulk.isPending
  const allSelected = pageIds.length > 0 && selected.length === pageIds.length

  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = selected.length > 0 && !allSelected
  }, [selected.length, allSelected])

  // Remove disappearing rows after a refresh. A URL change clears selection
  // immediately, including when React Query temporarily shows the old page.
  useEffect(() => {
    setSelection((previous) => {
      if (previous.scope !== scope) return { scope, ids: [] }
      if (!freshList) return previous
      const ids = previous.ids.filter((id) => list.data.items.some((item) => item.id === id))
      return ids.length === previous.ids.length ? previous : { scope, ids }
    })
  }, [scope, freshList, list.data])

  useEffect(() => {
    const data = view === 'drafts' ? (drafts.isPlaceholderData ? undefined : drafts.data) : freshList ? list.data : undefined
    if (data && page > Math.max(1, data.pageCount)) go({ page: data.pageCount > 1 ? data.pageCount : undefined }, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, page, freshList, list.data, drafts.data, drafts.isPlaceholderData])

  const runBulk = async (action: BulkConversationAction) => {
    if (selectionDisabled || selected.length === 0) return
    const ids = [...selected]
    const startedScope = scope
    setBulkFailure(null)
    try {
      await bulk.mutateAsync({ action, conversationIds: ids })
      setSelection((previous) => previous.scope === startedScope ? { scope: startedScope, ids: [] } : previous)
      const labels: Record<BulkConversationAction, string> = {
        'mark-read': 'Marked read', 'mark-unread': 'Marked unread', star: 'Starred', unstar: 'Stars removed',
        archive: 'Archived', unarchive: 'Moved to Inbox', trash: 'Moved to Trash', restore: 'Restored',
      }
      notify.success(`${labels[action]} · ${ids.length} conversation${ids.length === 1 ? '' : 's'}`)
      const current = currentSearch.current
      if (ids.includes(current.c ?? '') && ['archive', 'unarchive', 'trash', 'restore', 'mark-unread'].includes(action)) {
        go({ c: undefined, draft: undefined })
      }
    } catch (error) {
      setBulkFailure({ scope: startedScope, message: `${messageFromError(error)} Refresh the list or try again to confirm the update.` })
    }
  }

  const reading = Boolean(search.c || search.draft)

  const startNew = async () => {
    if (creating) return
    void import('./Composer').catch(() => {})
    setCreating(true)

    try {
      const draft = await createDraft({})
      rememberDraft(draft)

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
    if (key === 'sent') return { n: data.sent || undefined, quiet: true, label: 'sent' }
    if (key === 'drafts') return { n: data.drafts || undefined, quiet: true, label: 'drafts' }
    if (key === 'archived') return { n: data.archived || undefined, quiet: true, label: 'archived' }
    if (key === 'trash') return { n: data.trash || undefined, quiet: true, label: 'in Trash' }

    return { quiet: true, label: '' }
  }

  const folderLabel = FOLDERS.find(([key]) => key === view)?.[1] ?? 'Inbox'

  const listPane = (
    <section aria-label={`${folderLabel} list`} className="dash-inbox-list">
      {view !== 'drafts' ? (
        <div className="flex flex-col gap-2 border-b border-[var(--dash-line)] px-3 py-2.5">
          <label className="relative block">
            <span className="sr-only">Search mail</span>
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--dash-quiet)]" aria-hidden="true" />
            <input className="dash-field h-9 w-full ps-8 pe-2 text-[13px]" placeholder="Search people, subjects, text" maxLength={INBOX_LIMITS.searchQuery} value={query} onChange={(event) => setQuery(event.target.value)} />
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

      {view !== 'drafts' ? (
        <div className="flex min-h-10 items-center gap-2 border-b border-[var(--dash-line)] px-3 text-[12px] text-[var(--dash-quiet)]">
          <input ref={selectAll} type="checkbox" className="size-4 accent-[var(--dash-brand)]" aria-label="Select all conversations on this page" checked={allSelected} disabled={selectionDisabled || !pageIds.length} onChange={(event) => setSelection({ scope, ids: event.target.checked ? pageIds : [] })} />
          <span>Select this page</span>
          {list.isFetching ? <Loader2 className="ms-auto size-3.5 animate-spin" aria-label="Updating list" /> : null}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={list.isPlaceholderData || drafts.isPlaceholderData}>
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
                    disabled={drafts.isPlaceholderData}
                    onMouseEnter={() => { void import('./Composer').catch(() => {}) }}
                    onFocus={() => { void import('./Composer').catch(() => {}) }}
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
          <ul aria-label={folderLabel} className={list.isPlaceholderData ? 'opacity-50' : undefined}>
            {list.data.items.map((item) => (
              <Row key={item.id} item={item} sent={view === 'sent'} active={search.c === item.id} onOpen={() => go({ c: item.id, draft: undefined })} prefetch={prefetch} selected={selected.includes(item.id)} disabled={selectionDisabled} onSelect={() => setSelection({ scope, ids: selected.includes(item.id) ? selected.filter((id) => id !== item.id) : [...selected, item.id] })} />
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
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-[13px] text-[var(--dash-quiet)]">
        <p className="text-sm font-semibold text-[var(--dash-ink)]">No conversation open</p>
        <p>Choose one from the list, or start a new message.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-4.5rem)] w-full max-w-[96rem] flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="dash-title text-[26px] leading-tight">Inbox</h1>
          <p className="mt-1 text-[12.5px] text-[var(--dash-quiet)]" dir="ltr">info@yamanwarda.de</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="dash-btn dash-btn-ghost" aria-label="Signatures & replies" onClick={() => go({ settings: true })}>
            <Settings2 className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">Signatures &amp; replies</span>
          </button>
          <button type="button" className="dash-btn dash-btn-primary" onClick={() => void startNew()} disabled={creating}>
            {creating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <PenSquare className="size-4" aria-hidden="true" />} New message
          </button>
        </div>
      </header>

      <div className="dash-panel dash-inbox-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <InboxBulkBar count={selected.length} view={view} disabled={selectionDisabled} busy={bulk.isPending} refreshing={view === 'drafts' ? drafts.isFetching : list.isFetching} failure={bulkFailure?.scope === scope ? bulkFailure.message : null} onAction={(action) => void runBulk(action)} onClear={() => { setSelection({ scope, ids: [] }); setBulkFailure(null) }} onRefresh={() => void refresh()} />
      <nav aria-label="Inbox folders" className="flex flex-wrap gap-0.5 border-b border-[var(--dash-line)] px-2">
        {FOLDERS.map(([key, label]) => {
          const count = countFor(key)

          return (
            <button
              key={key}
              type="button"
              aria-current={view === key ? 'page' : undefined}
              onClick={() => go({ view: key === 'inbox' ? undefined : key, page: undefined, c: undefined, draft: undefined, filter: undefined })}
              onMouseEnter={() => { if (key !== 'drafts') prefetch.hoverFolder(key) }}
              onMouseLeave={prefetch.cancel}
              onFocus={() => { if (key !== 'drafts') prefetch.folder(key) }}
              onBlur={prefetch.cancel}
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
        <div className="dash-inbox-body" data-reading={reading}>
          {listPane}
          <div className="dash-inbox-reader">
            <Suspense fallback={<div role="status" className="flex flex-1 flex-col items-start gap-3 p-5"><button type="button" className="dash-btn dash-btn-ghost" onClick={back}>Back to {folderLabel}</button>Opening mail…</div>}>
              {readingPane}
            </Suspense>
          </div>
        </div>
      </div>

      {search.settings ? <Suspense fallback={<div role="status">Opening settings…</div>}><InboxSettingsDialog onClose={() => go({ settings: undefined }, true)} /></Suspense> : null}
      {emptying ? <EmptyTrashDialog count={counts.data?.trash ?? 0} onClose={() => setEmptying(false)} /> : null}
    </div>
  )
}
