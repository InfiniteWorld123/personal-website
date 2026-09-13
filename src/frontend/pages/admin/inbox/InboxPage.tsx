import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Archive, Paperclip, Search, Settings2, ShieldAlert } from 'lucide-react'
import { Badge } from '#/frontend/components/ui/badge'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import {
  hasActiveInboxFilters,
  toLeadFilterInput,
  type InboxSearch,
} from '#/frontend/features/inbox/inbox-filters'
import {
  inboxSettingsQuery,
  leadQuery,
  leadsQuery,
  useLeadBulkAction,
  useSetLeadRead,
} from '#/frontend/features/inbox/inbox-queries'
import { cn } from '#/frontend/lib/utils'
import type { AdminLeadListItem } from '#/shared/types/lead.types'
import {
  DEFAULT_INBOX_PREFERENCES,
  LEAD_TABS,
  type LeadTab,
} from '#/shared/validation/lead.validation'
import { LeadReadingPane } from './LeadReadingPane'
import { formatBerlin, formatRelative, initialsOf, STATUS_LABEL, STATUS_TONE } from './inbox-format'

const TAB_LABEL: Record<LeadTab, string> = {
  open: 'Open',
  unread: 'Unread',
  new: 'New',
  closed: 'Closed',
  archived: 'Archived',
  junk: 'Junk',
  all: 'All',
}

/** Junk earns its tab only when the owner keeps that button. */
const tabsFor = (showJunk: boolean): LeadTab[] =>
  LEAD_TABS.filter((tab) => tab !== 'junk' || showJunk)

export function InboxPage({ search }: { search: InboxSearch }) {
  const navigate = useNavigate({ from: '/admin/inbox/' })
  const settings = useQuery(inboxSettingsQuery())
  const preferences = settings.data?.preferences ?? DEFAULT_INBOX_PREFERENCES

  const filter = toLeadFilterInput(search, preferences.bookings)
  const leads = useQuery(leadsQuery(filter))
  const items = useMemo(() => leads.data?.items ?? [], [leads.data])

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [draftSearch, setDraftSearch] = useState(search.search ?? '')
  const replyRef = useRef<HTMLTextAreaElement>(null)

  const openId = search.lead
  const lead = useQuery(leadQuery(openId))
  const setRead = useSetLeadRead()
  const bulk = useLeadBulkAction()

  const setSearch = (next: Partial<InboxSearch>) =>
    void navigate({ search: (previous) => ({ ...previous, ...next }) })

  const open = (id: string) => setSearch({ lead: id })

  // The URL may name a message that is not on this page — the notification
  // mail links straight to one — so the list follows the selection, not the
  // other way round.
  useEffect(() => {
    if (!openId && items.length > 0) setSearch({ lead: items[0].id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, items])

  // Opening a message is what marks it read. Done here rather than in the pane
  // so it happens once per selection, not once per render of the pane.
  useEffect(() => {
    if (lead.data?.isUnread) setRead.mutate({ id: lead.data.id, value: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.data?.id, lead.data?.isUnread])

  useEffect(() => {
    setDraftSearch(search.search ?? '')
  }, [search.search])

  useEffect(() => {
    setSelectedIds([])
  }, [search.tab, search.search, search.page])

  /**
   * j and k walk the list, r puts the cursor in the reply, e files the message
   * away. Ignored while typing, or the letter would land in the draft.
   */
  useEffect(() => {
    if (!preferences.keyboard) return

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const index = items.findIndex((item) => item.id === openId)

      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault()
        const next = items[Math.min(items.length - 1, Math.max(0, index + (event.key === 'j' ? 1 : -1)))]
        if (next) open(next.id)
      }

      if (event.key === 'r') {
        event.preventDefault()
        replyRef.current?.focus()
      }

      if (event.key === 'e' && openId) {
        event.preventDefault()
        bulk.mutate({ ids: [openId], action: 'archive' })
        const next = items[index + 1] ?? items[index - 1]
        if (next) open(next.id)
      }
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.keyboard, items, openId])

  const toggleSelected = (id: string) =>
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Every message sent through the contact form
            {preferences.bookings ? ' and every call booked on the site' : ''}. Times are{' '}
            <span className="font-medium">Europe/Berlin</span>.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/inbox/settings">
            <Settings2 aria-hidden="true" />
            Settings
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {preferences.filters ? (
          <div className="bg-muted flex gap-1 rounded-lg p-1">
            {tabsFor(preferences.junk).map((tab) => (
              <button
                key={tab}
                type="button"
                aria-pressed={(search.tab ?? 'open') === tab}
                onClick={() => setSearch({ tab: tab === 'open' ? undefined : tab, page: undefined })}
                className={cn(
                  'rounded-md px-3 py-1 text-xs transition-colors',
                  (search.tab ?? 'open') === tab
                    ? 'bg-card text-foreground font-medium shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {TAB_LABEL[tab]}
                {tab === 'unread' && leads.data?.unread ? ` (${leads.data.unread})` : ''}
              </button>
            ))}
          </div>
        ) : null}

        {preferences.search ? (
          <form
            className="flex min-w-[12rem] flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setSearch({ search: draftSearch.trim() || undefined, page: undefined })
            }}
          >
            <div className="border-border flex flex-1 items-center gap-2 rounded-lg border px-3">
              <Search aria-hidden="true" className="text-muted-foreground size-4" />
              <Input
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.currentTarget.value)}
                placeholder="Search name, email, message…"
                className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
              />
            </div>
            {hasActiveInboxFilters(search) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSearch({ search: undefined, tab: undefined, page: undefined })}
              >
                Clear
              </Button>
            ) : null}
          </form>
        ) : null}

        {preferences.keyboard ? (
          <p className="text-muted-foreground hidden items-center gap-1 text-xs lg:flex">
            <kbd className="border-border rounded border px-1">j</kbd>
            <kbd className="border-border rounded border px-1">k</kbd> move
            <kbd className="border-border ms-2 rounded border px-1">r</kbd> reply
            <kbd className="border-border ms-2 rounded border px-1">e</kbd> archive
          </p>
        ) : null}
      </div>

      {preferences.bulk && selectedIds.length > 0 ? (
        <div className="border-border bg-muted/50 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          <span className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulk.mutate({ ids: selectedIds, action: 'read' }, { onSuccess: () => setSelectedIds([]) })}
          >
            Mark read
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulk.mutate({ ids: selectedIds, action: 'archive' }, { onSuccess: () => setSelectedIds([]) })}
          >
            <Archive aria-hidden="true" />
            Archive
          </Button>
          {preferences.junk ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulk.mutate({ ids: selectedIds, action: 'junk' }, { onSuccess: () => setSelectedIds([]) })}
            >
              <ShieldAlert aria-hidden="true" />
              Junk
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="border-border grid min-h-[32rem] overflow-hidden rounded-xl border lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="border-border max-h-[44rem] overflow-y-auto lg:border-e">
          {leads.isPending ? (
            <p className="text-muted-foreground p-6 text-center text-sm">Loading messages…</p>
          ) : leads.isError ? (
            <p className="text-destructive p-6 text-center text-sm">{(leads.error as Error).message}</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              {hasActiveInboxFilters(search) ? 'Nothing matches that.' : 'No messages yet.'}
            </p>
          ) : (
            items.map((item) => (
              <LeadRow
                key={item.id}
                item={item}
                isOpen={item.id === openId}
                isSelected={selectedIds.includes(item.id)}
                showCheckbox={preferences.bulk}
                showUnread={preferences.unreadMarks}
                showInitials={preferences.initials}
                showSnippet={preferences.snippet}
                showBadges={preferences.badges}
                relative={preferences.relativeTime}
                showSource={preferences.bookings}
                onOpen={() => open(item.id)}
                onToggle={() => toggleSelected(item.id)}
              />
            ))
          )}
        </div>

        <div className="max-h-[44rem] min-w-0 overflow-y-auto">
          {lead.isPending && openId ? (
            <p className="text-muted-foreground p-6 text-sm">Loading message…</p>
          ) : lead.data ? (
            <LeadReadingPane
              lead={lead.data}
              preferences={preferences}
              canSendMail={settings.data?.canSendMail ?? false}
              canReceiveMail={settings.data?.canReceiveMail ?? false}
              replyRef={replyRef}
            />
          ) : (
            <p className="text-muted-foreground grid h-full place-items-center p-6 text-sm">
              Pick a message from the list.
            </p>
          )}
        </div>
      </div>

      {leads.data && leads.data.pageCount > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={leads.data.page <= 1}
            onClick={() => setSearch({ page: leads.data.page - 1 })}
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {leads.data.page} of {leads.data.pageCount} · {leads.data.total} messages
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={leads.data.page >= leads.data.pageCount}
            onClick={() => setSearch({ page: leads.data.page + 1 })}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function LeadRow({
  item,
  isOpen,
  isSelected,
  showCheckbox,
  showUnread,
  showInitials,
  showSnippet,
  showBadges,
  relative,
  showSource,
  onOpen,
  onToggle,
}: {
  item: AdminLeadListItem
  isOpen: boolean
  isSelected: boolean
  showCheckbox: boolean
  showUnread: boolean
  showInitials: boolean
  showSnippet: boolean
  showBadges: boolean
  relative: boolean
  showSource: boolean
  onOpen: () => void
  onToggle: () => void
}) {
  const unread = showUnread && item.isUnread

  return (
    <div
      className={cn(
        'border-border hover:bg-muted/60 flex cursor-pointer items-start gap-2 border-b px-3 py-3',
        isOpen && 'bg-accent hover:bg-accent',
      )}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      {showCheckbox ? (
        <input
          type="checkbox"
          checked={isSelected}
          aria-label={`Select the message from ${item.name}`}
          onClick={(event) => event.stopPropagation()}
          onChange={onToggle}
          className="accent-primary mt-1 size-4"
        />
      ) : null}

      {showInitials ? (
        <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-full text-[0.7rem] font-semibold">
          {initialsOf(item.name)}
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {unread ? <span className="bg-primary size-2 shrink-0 rounded-full" /> : null}
          <span className={cn('truncate text-sm', unread ? 'font-bold' : 'font-medium')}>
            {item.name}
          </span>
          <span className="text-muted-foreground ms-auto shrink-0 text-xs">
            {relative ? formatRelative(item.createdAt) : formatBerlin(item.createdAt)}
          </span>
        </div>

        <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs" dir={item.language === 'ar' ? 'rtl' : undefined}>
          {item.subject}
          {showSnippet && item.preview ? ` — ${item.preview}` : ''}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {showSource ? (
            <Badge variant="outline" className={cn('text-[0.65rem]', item.source === 'BOOKING' && 'border-primary/40 text-primary')}>
              {item.source === 'BOOKING' ? 'Booking' : 'Form'}
            </Badge>
          ) : null}
          {showSource && item.source !== 'BOOKING' && item.bookingLabel ? (
            <Badge variant="outline" className="border-primary/40 text-primary text-[0.65rem]">
              + call booked
            </Badge>
          ) : null}
          {showBadges && item.budget ? (
            <Badge variant="outline" className="text-[0.65rem]">{item.budget}</Badge>
          ) : null}
          {showBadges && item.timeline ? (
            <Badge variant="outline" className="text-[0.65rem]">{item.timeline}</Badge>
          ) : null}
          <Badge variant="outline" className={cn('text-[0.65rem]', STATUS_TONE[item.status])}>
            {STATUS_LABEL[item.status]}
          </Badge>
          {item.hasAttachment ? (
            <Paperclip aria-hidden="true" className="text-muted-foreground size-3" />
          ) : null}
        </div>
      </div>
    </div>
  )
}
