import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Archive,
  Inbox as InboxIcon,
  Mail,
  Paperclip,
  Search,
  ShieldAlert,
  Sliders,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
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
import type { AdminLeadListItem, InboxSettings } from '#/shared/types/lead.types'
import {
  DEFAULT_INBOX_PREFERENCES,
  type LeadTab,
} from '#/shared/validation/lead.validation'
import { LeadReadingPane } from './LeadReadingPane'
import { formatBerlin, formatRelative, initialsOf, STATUS_LABEL, STATUS_TONE } from './inbox-format'

/**
 * The lenses on the rail, in the order the day is worked: what is open, what
 * has not been read, what is new, then the two places things go to rest.
 */
const LENSES: Array<{ tab: LeadTab; label: string; icon: typeof InboxIcon }> = [
  { tab: 'open', label: 'Open', icon: InboxIcon },
  { tab: 'unread', label: 'Unread', icon: Mail },
  { tab: 'new', label: 'New', icon: Sparkles },
  { tab: 'closed', label: 'Closed', icon: Star },
  { tab: 'archived', label: 'Archived', icon: Archive },
  { tab: 'junk', label: 'Junk', icon: ShieldAlert },
]

const EMPTY_LABEL: Record<LeadTab, string> = {
  open: 'No messages yet.',
  unread: 'Nothing unread — you are through them all.',
  new: 'Nothing new right now.',
  closed: 'Nothing closed yet.',
  archived: 'Nothing archived.',
  junk: 'No junk. Good.',
  all: 'No messages yet.',
}

/**
 * Wide enough for the list and the message side by side. Below it the phone
 * shows one at a time with a way back — scrolling past the whole list to reach
 * the message you tapped is not a reading pane.
 */
const useIsWide = () => {
  const [wide, setWide] = useState(true)

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const update = () => setWide(query.matches)

    update()
    query.addEventListener('change', update)

    return () => query.removeEventListener('change', update)
  }, [])

  return wide
}

export function InboxPage({ search }: { search: InboxSearch }) {
  const navigate = useNavigate({ from: '/admin/inbox/' })
  const settingsQuery = useQuery(inboxSettingsQuery())
  const settings: InboxSettings = settingsQuery.data ?? {
    preferences: DEFAULT_INBOX_PREFERENCES,
    signatures: { de: '', en: '', ar: '' },
    canSendMail: false,
    canReceiveMail: false,
  }
  const { preferences } = settings

  const filter = toLeadFilterInput(search, preferences.bookings)
  const leads = useQuery(leadsQuery(filter))
  const items = useMemo(() => leads.data?.items ?? [], [leads.data])

  const isWide = useIsWide()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [draftSearch, setDraftSearch] = useState(search.search ?? '')

  const openId = search.lead
  const lead = useQuery(leadQuery(openId))
  const setRead = useSetLeadRead()
  const bulk = useLeadBulkAction()

  const setSearch = (next: Partial<InboxSearch>) =>
    void navigate({ search: (previous) => ({ ...previous, ...next }) })

  const open = (id: string) => setSearch({ lead: id })
  const tab = search.tab ?? 'open'

  // The URL may name a message that is not on this page — the notification
  // mail links straight to one — so the list follows the selection.
  useEffect(() => {
    if (isWide && !openId && items.length > 0) setSearch({ lead: items[0].id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, items, isWide])

  // Opening a message is what marks it read. Once per selection, not once per
  // render of the pane.
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

  /** j and k walk the list, e files the open one away. Ignored while typing. */
  useEffect(() => {
    if (!preferences.keyboard) return

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const index = items.findIndex((item) => item.id === openId)

      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault()
        const next = items[Math.min(items.length - 1, Math.max(0, index + (event.key === 'j' ? 1 : -1)))]
        if (next) open(next.id)
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

  const showList = isWide || !openId
  const showPane = isWide || Boolean(openId)

  return (
    /*
     * The inbox is the one admin page that fills the screen: full bleed out of
     * the shell's padding, and exactly one viewport tall, so the list and the
     * message scroll inside their own columns and the page itself never does.
     * `h-14` is the admin top bar.
     */
    <div className="-m-4 flex h-[calc(100dvh-3.5rem)] flex-col sm:-m-6">
      <div className="border-border flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <h1 className="text-base font-semibold tracking-tight">Inbox</h1>

        {preferences.search ? (
          <form
            className="relative ms-2 min-w-[12rem] max-w-xl flex-1"
            onSubmit={(event) => {
              event.preventDefault()
              setSearch({ search: draftSearch.trim() || undefined, page: undefined })
            }}
          >
            <Search aria-hidden="true" className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.currentTarget.value)}
              placeholder="Search name, email, message…"
              aria-label="Search messages"
              className="bg-muted/50 h-9 rounded-full border-transparent ps-9 pe-9"
            />
            {draftSearch || hasActiveInboxFilters(search) ? (
              <button
                type="button"
                aria-label="Clear the search"
                onClick={() => {
                  setDraftSearch('')
                  setSearch({ search: undefined, tab: undefined, page: undefined })
                }}
                className="text-muted-foreground hover:text-foreground absolute end-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            ) : null}
          </form>
        ) : null}

        <Button asChild variant="ghost" size="icon" title="Inbox settings" aria-label="Inbox settings">
          <Link to="/admin/inbox/settings">
            <Sliders aria-hidden="true" />
          </Link>
        </Button>

        {preferences.keyboard ? (
          <p className="text-muted-foreground hidden items-center gap-1 text-xs xl:flex">
            <kbd className="border-border rounded border px-1">j</kbd>
            <kbd className="border-border rounded border px-1">k</kbd> move
            <kbd className="border-border ms-2 rounded border px-1">e</kbd> archive
          </p>
        ) : null}
      </div>

      {preferences.bulk && selectedIds.length > 0 ? (
        <div className="border-border bg-muted/50 flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          <span className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => bulk.mutate({ ids: selectedIds, action: 'read' }, { onSuccess: () => setSelectedIds([]) })}>
            Mark read
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulk.mutate({ ids: selectedIds, action: 'archive' }, { onSuccess: () => setSelectedIds([]) })}>
            <Archive aria-hidden="true" />
            Archive
          </Button>
          {preferences.junk ? (
            <Button size="sm" variant="outline" onClick={() => bulk.mutate({ ids: selectedIds, action: 'junk' }, { onSuccess: () => setSelectedIds([]) })}>
              <ShieldAlert aria-hidden="true" />
              Junk
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[3.25rem_22rem_minmax(0,1fr)]">
        {/* The rail: the lenses as icons, named on hover. */}
        {preferences.filters ? (
          <nav aria-label="Message filters" className="border-border hidden flex-col items-center gap-1 border-e py-2 lg:flex">
            {LENSES.filter((lens) => lens.tab !== 'junk' || preferences.junk).map((lens) => {
              const Icon = lens.icon
              const active = tab === lens.tab

              return (
                <button
                  key={lens.tab}
                  type="button"
                  title={lens.label}
                  aria-label={lens.label}
                  aria-pressed={active}
                  onClick={() => setSearch({ tab: lens.tab === 'open' ? undefined : lens.tab, page: undefined })}
                  className={cn(
                    'relative grid size-9 place-items-center rounded-lg transition-colors',
                    active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {lens.tab === 'unread' && leads.data?.unread ? (
                    <span className="bg-primary absolute end-1.5 top-1.5 size-1.5 rounded-full" />
                  ) : null}
                </button>
              )
            })}
          </nav>
        ) : null}

        <div className={cn('border-border min-h-0 overflow-y-auto lg:border-e', !showList && 'hidden')}>
          {/* The lenses again, as a strip, where there is no rail. */}
          {preferences.filters ? (
            <div className="border-border bg-background sticky top-0 z-10 flex gap-1 overflow-x-auto border-b px-2 py-1.5 lg:hidden">
              {LENSES.filter((lens) => lens.tab !== 'junk' || preferences.junk).map((lens) => (
                <button
                  key={lens.tab}
                  type="button"
                  aria-pressed={tab === lens.tab}
                  onClick={() => setSearch({ tab: lens.tab === 'open' ? undefined : lens.tab, page: undefined })}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs whitespace-nowrap transition-colors',
                    tab === lens.tab ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground',
                  )}
                >
                  {lens.label}
                </button>
              ))}
            </div>
          ) : null}

          {leads.isPending ? (
            <div aria-busy="true" aria-label="Loading messages">
              {[0, 1, 2, 3, 4].map((row) => (
                <div key={row} className="border-border flex gap-2 border-b px-3 py-2.5">
                  <div className="bg-muted size-7 shrink-0 animate-pulse rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="bg-muted h-3 w-1/2 animate-pulse rounded" />
                    <div className="bg-muted h-3 w-4/5 animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : leads.isError ? (
            <p className="text-destructive p-6 text-center text-sm">{(leads.error as Error).message}</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              {search.search ? `Nothing matches “${search.search}”.` : EMPTY_LABEL[tab]}
            </p>
          ) : (
            items.map((item) => (
              <LeadRow
                key={item.id}
                item={item}
                isOpen={item.id === openId}
                isSelected={selectedIds.includes(item.id)}
                preferences={preferences}
                onOpen={() => open(item.id)}
                onToggle={() => toggleSelected(item.id)}
                onArchive={() => bulk.mutate({ ids: [item.id], action: 'archive' })}
                onJunk={() => bulk.mutate({ ids: [item.id], action: 'junk' })}
              />
            ))
          )}

          {leads.data && leads.data.pageCount > 1 ? (
            <div className="flex items-center justify-between gap-2 p-3 text-xs">
              <Button variant="outline" size="sm" disabled={leads.data.page <= 1} onClick={() => setSearch({ page: leads.data.page - 1 })}>
                Previous
              </Button>
              <span className="text-muted-foreground">
                {leads.data.page} / {leads.data.pageCount}
              </span>
              <Button variant="outline" size="sm" disabled={leads.data.page >= leads.data.pageCount} onClick={() => setSearch({ page: leads.data.page + 1 })}>
                Next
              </Button>
            </div>
          ) : null}
        </div>

        <div className={cn('min-h-0 min-w-0', !showPane && 'hidden')}>
          {lead.isPending && openId ? (
            <p className="text-muted-foreground p-6 text-sm">Loading message…</p>
          ) : lead.data ? (
            <LeadReadingPane
              lead={lead.data}
              settings={settings}
              onBack={isWide ? undefined : () => setSearch({ lead: undefined })}
            />
          ) : (
            <p className="text-muted-foreground grid h-full place-items-center p-6 text-sm">
              Pick a message from the list.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function LeadRow({
  item,
  isOpen,
  isSelected,
  preferences,
  onOpen,
  onToggle,
  onArchive,
  onJunk,
}: {
  item: AdminLeadListItem
  isOpen: boolean
  isSelected: boolean
  preferences: InboxSettings['preferences']
  onOpen: () => void
  onToggle: () => void
  onArchive: () => void
  onJunk: () => void
}) {
  const unread = preferences.unreadMarks && item.isUnread

  return (
    <div
      className={cn(
        'group border-border hover:bg-muted/60 relative flex cursor-pointer items-start gap-2 border-b px-3 py-2',
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
      {/* A bar on the edge, not another dot in the row. */}
      {unread ? <span className="bg-primary absolute inset-y-0 start-0 w-[3px]" /> : null}

      {preferences.bulk ? (
        <input
          type="checkbox"
          checked={isSelected}
          aria-label={`Select the message from ${item.name}`}
          onClick={(event) => event.stopPropagation()}
          onChange={onToggle}
          className={cn(
            'accent-primary mt-1 size-3.5 shrink-0 transition-opacity',
            // Out of the way until wanted: shown on hover, or once anything is selected.
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
        />
      ) : null}

      {preferences.initials ? (
        <span className="bg-muted text-muted-foreground grid size-7 shrink-0 place-items-center rounded-full text-[0.65rem] font-semibold">
          {initialsOf(item.name)}
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn('truncate text-sm', unread ? 'font-bold' : 'font-medium')} dir="auto">
            {item.name}
          </span>
          <span className="text-muted-foreground ms-auto shrink-0 text-[0.68rem] whitespace-nowrap group-hover:invisible">
            {preferences.relativeTime ? formatRelative(item.createdAt) : formatBerlin(item.createdAt)}
          </span>
        </div>

        <p className="text-muted-foreground mt-0.5 truncate text-xs" dir="auto">
          {item.subject}
          {preferences.snippet && item.preview ? ` — ${item.preview}` : ''}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-1">
          {preferences.bookings ? (
            <Badge variant="outline" className={cn('text-[0.6rem]', item.source === 'BOOKING' && 'border-primary/40 text-primary')}>
              {item.source === 'BOOKING' ? 'Booking' : 'Form'}
            </Badge>
          ) : null}
          {preferences.bookings && item.source !== 'BOOKING' && item.bookingLabel ? (
            <Badge variant="outline" className="border-primary/40 text-primary text-[0.6rem]">
              + call
            </Badge>
          ) : null}
          {preferences.badges && item.budget ? (
            <Badge variant="outline" dir="auto" className="max-w-[9rem] truncate text-[0.6rem]">
              {item.budget}
            </Badge>
          ) : null}
          {preferences.badges && item.timeline ? (
            <Badge variant="outline" dir="auto" className="max-w-[9rem] truncate text-[0.6rem]">
              {item.timeline}
            </Badge>
          ) : null}
          <Badge variant="outline" className={cn('text-[0.6rem]', STATUS_TONE[item.status])}>
            {STATUS_LABEL[item.status]}
          </Badge>
          {item.hasAttachment ? <Paperclip aria-hidden="true" className="text-muted-foreground size-3" /> : null}
        </div>
      </div>

      {/* What Gmail gets right: filing a message without opening it. */}
      <div className="absolute end-2 top-1.5 hidden gap-0.5 group-hover:flex">
        <button
          type="button"
          aria-label="Archive"
          title="Archive"
          onClick={(event) => {
            event.stopPropagation()
            onArchive()
          }}
          className="border-border bg-card text-muted-foreground hover:text-foreground grid size-6 place-items-center rounded-md border"
        >
          <Archive aria-hidden="true" className="size-3" />
        </button>
        {preferences.junk ? (
          <button
            type="button"
            aria-label="Junk"
            title="Junk"
            onClick={(event) => {
              event.stopPropagation()
              onJunk()
            }}
            className="border-border bg-card text-muted-foreground hover:text-destructive grid size-6 place-items-center rounded-md border"
          >
            <ShieldAlert aria-hidden="true" className="size-3" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
