import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import type { OwnerConversationListItem } from '#/backend2/contracts/assistant.contract'
import { DashboardPage } from '#/frontend/dashboard/primitives'
import type { AssistantFilter, AssistantSearch } from '#/frontend/features/assistant-v2/assistant-search'
import { ASSISTANT_SEARCH_MAX } from '#/frontend/features/assistant-v2/assistant-search'
import {
  useAssistantConversations,
  useAssistantSettings,
  usePrefetchConversation,
  usePrefetchNextConversations,
} from '#/frontend/features/assistant-v2/queries'
import { messageFromError } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { EmptyState, LoadFailure, Pager } from '../blog/blog-parts'
import { AssistantHead, ConversationChip, LANGUAGE_WORDS, failureText, fullWhen, whenWords } from './assistant-parts'
import { ConversationReader } from './ConversationReader'

/**
 * `/dashboard/assistant`: what visitors asked the chat on the public website
 * (approved Design Lab, 24 Sep 2026). A transcript viewer for the owner — not
 * an assistant inside the Dashboard.
 *
 * The list and the open conversation sit side by side on a wide screen; on a
 * phone the conversation takes the whole screen with a way back. The filter,
 * the search, the page and the open conversation all live in the address.
 * Filters and search run on the server, one page at a time.
 */

export const PAGE_SIZE = 20

const FILTERS: [AssistantFilter | 'all', string][] = [
  ['all', 'All'],
  ['fallback', 'Not on the website'],
  ['de', 'German'],
  ['en', 'English'],
  ['ar', 'Arabic'],
]

function Row({ item, active, compact, onOpen, onIntent }: { item: OwnerConversationListItem; active: boolean; compact: boolean; onOpen: () => void; onIntent: () => void }) {
  return (
    <li className="border-t border-[var(--dash-soft)] first:border-t-0">
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={onIntent}
        onFocus={onIntent}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'grid w-full items-center gap-x-3.5 gap-y-1 px-4 py-3 text-start sm:px-[18px]',
          compact ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_90px_130px_150px]',
          active ? 'bg-[var(--dash-blue-tint)]' : 'hover:bg-[var(--dash-hover)]',
        )}
      >
        <span className="min-w-0">
          <strong dir="auto" lang={item.language} className="block truncate text-left text-[13.5px] font-semibold">
            {item.preview || 'A conversation without a question'}
          </strong>
          <span className="block truncate text-[12px] text-[var(--dash-quiet)]">
            <span className="dash-num">{item.messageCount}</span> messages
            <span className={cn(!compact && 'md:hidden')}>
              {' · '}
              <time dateTime={item.lastMessageAt}>{whenWords(item.lastMessageAt)}</time>
            </span>
          </span>
        </span>
        <span className={cn('text-[12.5px] text-[var(--dash-quiet)]', compact ? 'text-end' : 'text-end md:text-start')}>
          {LANGUAGE_WORDS[item.language]}
          {compact ? null : (
            <span className="mt-1 flex justify-end md:hidden">
              <ConversationChip fallbackCount={item.fallbackCount} className="h-[20px] px-2 text-[10.5px]" />
            </span>
          )}
          {compact && item.fallbackCount > 0 ? (
            <span className="mt-1 flex justify-end">
              <ConversationChip fallbackCount={item.fallbackCount} className="h-[20px] px-2 text-[10.5px]" />
            </span>
          ) : null}
        </span>
        {compact ? null : (
          <>
            <time
              className="hidden text-[12.5px] text-[var(--dash-quiet)] md:block"
              dateTime={item.lastMessageAt}
              title={fullWhen(item.lastMessageAt)}
            >
              {whenWords(item.lastMessageAt)}
            </time>
            <span className="hidden justify-end md:flex">
              <ConversationChip fallbackCount={item.fallbackCount} />
            </span>
          </>
        )}
      </button>
    </li>
  )
}

function ListSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Loading conversations">
      {Array.from({ length: 6 }, (_, index) => (
        <li key={index} className="flex items-center gap-4 border-t border-[var(--dash-soft)] px-[18px] py-3.5 first:border-t-0">
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="dash-skeleton h-3.5 w-3/5 rounded" />
            <span className="dash-skeleton h-2.5 w-24 rounded" />
          </span>
          <span className="dash-skeleton h-5 w-20 rounded" />
        </li>
      ))}
    </ul>
  )
}

export function ConversationsPage({ search }: { search: AssistantSearch }) {
  const navigate = useNavigate({ from: '/dashboard/assistant/' })
  const [query, setQuery] = useState(search.q ?? '')
  const show = search.show
  const page = search.page ?? 1
  const open = search.c

  const go = (patch: Partial<AssistantSearch>, replace = false) =>
    void navigate({ search: (previous: AssistantSearch) => ({ ...previous, ...patch }), replace })

  // The search box writes to the address a moment after typing stops.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      if ((search.q ?? '') !== query.trim()) go({ q: query.trim() || undefined, page: undefined }, true)
    }, 350)

    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // Back and Forward change the address under the box; the box follows.
  useEffect(() => {
    setQuery((current) => (current.trim() === (search.q ?? '') ? current : (search.q ?? '')))
  }, [search.q])

  const listQuery = useMemo(() => ({ page, pageSize: PAGE_SIZE, search: search.q, show }), [page, search.q, show])
  const list = useAssistantConversations(listQuery)
  usePrefetchNextConversations(listQuery, list.data && !list.isPlaceholderData ? list.data.hasMore : false)
  const prefetchConversation = usePrefetchConversation()
  const settings = useAssistantSettings()
  const filtered = Boolean(search.q || show)

  // A page past the end (after a delete, or an old link) follows the server's last page.
  useEffect(() => {
    if (list.data && list.data.items.length === 0 && list.data.total > 0 && page > 1) {
      go({ page: list.data.pageCount > 1 ? list.data.pageCount : undefined }, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, page])

  let body
  if (list.isPending) {
    body = <ListSkeleton />
  } else if (list.isError) {
    body = (
      <LoadFailure
        title="Conversations could not be loaded"
        message={failureText(messageFromError(list.error))}
        onRetry={() => void list.refetch()}
      />
    )
  } else if (list.data.items.length === 0) {
    body = filtered ? (
      <EmptyState
        title="No conversations match"
        action={
          <button
            type="button"
            className="dash-btn dash-btn-quiet"
            onClick={() => {
              setQuery('')
              go({ q: undefined, show: undefined, page: undefined })
            }}
          >
            Show all conversations
          </button>
        }
      >
        {search.q ? `Nothing anyone asked contains “${search.q}”` : 'Nothing here for this filter'}
        {search.q && show ? ' with this filter' : ''}. Try another filter or search.
      </EmptyState>
    ) : (
      <EmptyState
        title="No conversations yet"
        action={
          <Link to="/dashboard/assistant/settings" className="dash-btn dash-btn-quiet">
            Open settings
          </Link>
        }
      >
        When visitors use the chat on your website, their questions appear here.
        {settings.data && !settings.data.enabled ? ' The chat is off at the moment — switch it on in Settings & usage.' : ''}
      </EmptyState>
    )
  } else {
    body = (
      <ul aria-label="Conversations" className={cn(list.isPlaceholderData && 'opacity-60')}>
        {list.data.items.map((item) => (
          <Row key={item.id} item={item} active={open === item.id} compact={Boolean(open)} onOpen={() => go({ c: item.id })} onIntent={() => prefetchConversation(item.id)} />
        ))}
      </ul>
    )
  }

  return (
    <DashboardPage className="gap-4">
      {/* On a phone an open conversation has the screen to itself (approved lab); its back button returns here. */}
      <div className={cn('flex flex-col gap-4', open && 'hidden xl:flex')}>
        <AssistantHead tab="conversations" />

        <div className="flex flex-wrap items-center gap-2" role="search">
          <label className="relative block min-w-0 flex-[1_1_220px] sm:max-w-[320px]">
            <span className="sr-only">Search conversations</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--dash-quiet)]" aria-hidden="true" />
            <input
              type="search"
              className="dash-field h-9 w-full ps-8 pe-2.5 text-[13px]"
              placeholder="Search what was asked"
              maxLength={ASSISTANT_SEARCH_MAX}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div
            role="group"
            aria-label="Filter"
            className="-mx-5 flex w-[calc(100%+2.5rem)] gap-1 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0"
          >
            {FILTERS.map(([key, label]) => {
              const on = (show ?? 'all') === key

              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => go({ show: key === 'all' ? undefined : key, page: undefined })}
                  className={cn(
                    'h-8 shrink-0 rounded-lg px-3 text-[12.5px] whitespace-nowrap',
                    on
                      ? 'bg-[var(--dash-chip)] font-semibold text-[var(--dash-ink)]'
                      : 'font-medium text-[var(--dash-quiet)] hover:bg-[var(--dash-hover)] hover:text-[var(--dash-ink)]',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {list.data && list.data.total > 0 ? (
            <span className="dash-num ms-auto hidden text-[11.5px] text-[var(--dash-quiet)] sm:inline">
              {list.data.total} conversation{list.data.total === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      </div>

      <div className={cn('grid items-start gap-4', open ? 'grid-cols-1 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]' : 'grid-cols-1')}>
        <div className={cn('flex min-w-0 flex-col gap-3', open && 'hidden xl:flex')}>
          <section aria-label="Conversation list" className="dash-panel overflow-hidden">
            {!open && list.data && list.data.items.length > 0 ? (
              <div
                aria-hidden="true"
                className="hidden grid-cols-[minmax(0,1fr)_90px_130px_150px] gap-x-3.5 border-b border-[var(--dash-line)] px-[18px] py-2.5 text-[10.5px] font-bold tracking-[0.12em] text-[var(--dash-quiet)] md:grid"
              >
                <span>ASKED</span>
                <span>LANGUAGE</span>
                <span>LAST MESSAGE</span>
                <span className="text-end">ON THE WEBSITE?</span>
              </div>
            ) : null}
            {body}
          </section>
          {list.data && list.data.total > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Pager page={list.data.page} pageCount={list.data.pageCount} onPage={(next) => go({ page: next === 1 ? undefined : next })} />
              {list.data.pageCount <= 1 ? (
                <span className="dash-num text-[11.5px] text-[var(--dash-quiet)] sm:hidden">
                  {list.data.total} conversation{list.data.total === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {open ? <ConversationReader key={open} id={open} onClose={() => go({ c: undefined })} onDeleted={() => go({ c: undefined }, true)} /> : null}
      </div>
    </DashboardPage>
  )
}
