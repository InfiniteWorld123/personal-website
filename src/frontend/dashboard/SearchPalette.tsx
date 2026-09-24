import { useNavigate } from '@tanstack/react-router'
import {
  CalendarRange,
  FolderKanban,
  Handshake,
  Images,
  Inbox,
  Loader2,
  Newspaper,
  ReceiptEuro,
  Repeat,
  Search,
  Tags,
  Users,
} from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ComponentProps, KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { SearchHit, SearchResult, SearchSection, SearchSectionResult } from '#/backend2/contracts/search.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { highlightPieces } from '#/frontend/features/search-v2/highlight'
import { useSearch, isSearchable, searchTerm } from '#/frontend/features/search-v2/queries'
import { readRecent, rememberSearch } from '#/frontend/features/search-v2/recent'
import { cn } from '#/frontend/lib/utils'
import { useDashboardPreferences } from './preferences'

/**
 * The global search palette (`docs/v2/search.md`, Design Lab approved 24 Sep
 * 2026). Loaded lazily by `SearchPaletteOpener.tsx`.
 *
 * It is the ARIA combobox pattern inside a modal dialog: focus stays in the
 * field, the listbox's options are pointed at with `aria-activedescendant`,
 * ↑/↓ move through every option across sections and wrap, Enter opens the
 * one that is lit. Radix gives the focus trap and Escape; focus goes back to
 * whatever opened the palette.
 *
 * Read-only: every option is a link into the record's own module.
 */

/** How long typing has to pause before a question is sent. */
export const SEARCH_DEBOUNCE_MS = 200

const SECTION_ICONS: Record<SearchSection, LucideIcon> = {
  clients: Users,
  leads: Handshake,
  invoices: ReceiptEuro,
  subscriptions: Repeat,
  inbox: Inbox,
  calendar: CalendarRange,
  blog: Newspaper,
  projects: FolderKanban,
  services: Tags,
  media: Images,
}

/** Amber is not one of the Dashboard's chip tones; a test invoice is the one place it marks. */
const AMBER = 'bg-[#fff4dc] text-[#8a5a00] dark:bg-[#2e2616] dark:text-[#ffc766]'

const badgeClass = (badge: string) =>
  badge === 'TEST' ? AMBER : badge === 'Unread' ? 'dash-tone-blue' : 'dash-tone-grey'

type Option =
  | { kind: 'hit'; id: string; href: string; section: SearchSectionResult; hit: SearchHit }
  | { kind: 'more'; id: string; href: string; section: SearchSectionResult }

function useDebouncedValue<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay)

    return () => window.clearTimeout(timer)
  }, [value, delay])

  return settled
}

/** The sections that have something to say: results, or that they could not answer. */
export const visibleSections = (result: SearchResult) =>
  result.sections.filter((section) => section.items.length > 0 || section.state === 'error')

export default function SearchPalette({
  open,
  onOpenChange,
  returnFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocus: RefObject<HTMLElement | null>
}) {
  const { surface } = useDashboardPreferences()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const baseId = useId()
  const listboxId = `${baseId}-results`

  const [typed, setTyped] = useState('')
  const [recent, setRecent] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  // Every opening starts from an empty field and the latest recent searches.
  useEffect(() => {
    if (!open) return

    setTyped('')
    setActiveId(null)
    setRecent(readRecent())
  }, [open])

  const typedTerm = searchTerm(typed)
  const term = searchTerm(useDebouncedValue(typed, SEARCH_DEBOUNCE_MS))
  const query = useSearch(term)
  const settling = typedTerm !== term

  const result = isSearchable(typedTerm) && isSearchable(term) ? query.data : undefined
  const sections = useMemo(() => (result ? visibleSections(result) : []), [result])

  const options = useMemo(() => {
    const list: Option[] = []

    for (const section of sections) {
      if (section.state !== 'ready') continue

      if (section.hasMore) list.push({ kind: 'more', id: `${baseId}-more-${section.key}`, href: section.moreHref, section })

      for (const hit of section.items) {
        list.push({ kind: 'hit', id: `${baseId}-${section.key}-${hit.id}`, href: hit.href, section, hit })
      }
    }

    return list
  }, [sections, baseId])

  // What is lit: the owner's choice while it is still on screen, otherwise the first result.
  const active =
    options.find((option) => option.id === activeId) ?? options.find((option) => option.kind === 'hit') ?? options[0]

  useEffect(() => {
    if (!active) return

    const element = document.getElementById(active.id)

    if (element && typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'nearest' })
  }, [active?.id])

  const go = (option: Option) => {
    const remembered = result?.q ?? term

    setRecent(rememberSearch(remembered))
    onOpenChange(false)
    void navigate({ href: option.href })
  }

  const move = (step: 1 | -1) => {
    if (options.length === 0) return

    const at = active ? options.indexOf(active) : -1
    const next = (at + step + options.length) % options.length

    setActiveId(options[next]!.id)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'Enter') {
      event.preventDefault()

      if (active && result) go(active)
    }
  }

  const onOptionClick = (event: MouseEvent<HTMLAnchorElement>, option: Option) => {
    // A new tab or window is the browser's business; a plain click opens here.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return

    event.preventDefault()
    go(option)
  }

  const optionProps: OptionProps = (option) => ({
    id: option.id,
    href: option.href,
    role: 'option' as const,
    tabIndex: -1,
    'aria-selected': active?.id === option.id,
    onMouseDown: (event: MouseEvent) => event.preventDefault(),
    onMouseMove: () => {
      if (active?.id !== option.id) setActiveId(option.id)
    },
    onClick: (event: MouseEvent<HTMLAnchorElement>) => onOptionClick(event, option),
  })

  /* ------------------------------------------------------------ the body */

  let body: ReactNode
  let announcement = ''

  if (!isSearchable(typedTerm)) {
    body = (
      <BeforeTyping
        recent={recent}
        tooShort={typedTerm.length > 0}
        onPick={(value) => {
          setTyped(value)
          inputRef.current?.focus()
        }}
      />
    )
  } else if (!result) {
    if (query.isError && !settling && !query.isFetching) {
      body = <SearchFailed error={query.error} onRetry={() => void query.refetch()} />
      announcement = 'Search failed'
    } else {
      body = <Searching />
      announcement = 'Searching'
    }
  } else if (sections.length === 0) {
    body = <NothingFound q={result.q} />
    announcement = `Nothing matches ${result.q}`
  } else {
    const hits = options.filter((option) => option.kind === 'hit').length

    announcement = `${hits} ${hits === 1 ? 'result' : 'results'}`
    body = (
      <div role="listbox" id={listboxId} aria-label="Results" className="flex flex-col gap-1">
        {sections.map((section) => (
          <ResultSection
            key={section.key}
            section={section}
            q={result.q}
            baseId={baseId}
            optionProps={optionProps}
            active={active?.id ?? null}
          />
        ))}
      </div>
    )
  }

  const busy = isSearchable(typedTerm) && (settling || query.isFetching)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(8,12,26,0.38)] duration-150 data-open:animate-in data-open:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          data-dashboard
          data-surface={surface}
          data-search-palette
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            inputRef.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()

            const target = returnFocus.current

            if (target?.isConnected) target.focus()
          }}
          className={cn(
            'fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--dash-surface)] text-[var(--dash-ink)] outline-none',
            'sm:inset-x-4 sm:top-16 sm:bottom-auto sm:mx-auto sm:max-h-[min(640px,calc(100dvh-6rem))] sm:max-w-[620px]',
            'sm:rounded-[14px] sm:border sm:border-[var(--dash-line)] sm:shadow-[var(--dash-shadow)]',
            'duration-150 data-open:animate-in data-open:fade-in-0 sm:data-open:zoom-in-[0.98] motion-reduce:animate-none',
          )}
        >
          <DialogPrimitive.Title className="sr-only">Search the dashboard</DialogPrimitive.Title>

          <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--dash-line)] px-3.5 py-3">
            {busy ? (
              <Loader2 aria-hidden="true" className="size-4 shrink-0 text-[var(--dash-quiet)] motion-safe:animate-spin" />
            ) : (
              <Search aria-hidden="true" className="size-4 shrink-0 text-[var(--dash-quiet)]" />
            )}
            <input
              ref={inputRef}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-label="Search the dashboard"
              aria-autocomplete="list"
              aria-expanded={options.length > 0}
              aria-controls={result && sections.length > 0 ? listboxId : undefined}
              aria-activedescendant={result && active ? active.id : undefined}
              aria-busy={busy || undefined}
              placeholder="Search clients, invoices, messages…"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              maxLength={100}
              // The field is the palette's only resting focus, and its caret is the
              // cue; the site-wide unlayered focus ring would box it (Design Lab).
              style={{ outline: 'none' }}
              className="h-8 min-w-0 flex-1 border-0 bg-transparent text-base text-[var(--dash-ink)] outline-none placeholder:text-[var(--dash-quiet)]"
            />
            <kbd className="hidden rounded-md border border-b-2 border-[var(--dash-line)] px-1.5 font-sans text-[11px] font-semibold text-[var(--dash-quiet)] sm:inline">
              Esc
            </kbd>
            <DialogPrimitive.Close className="dash-btn dash-btn-ghost h-9 px-2.5 text-[13px] sm:hidden">Cancel</DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pt-1.5 pb-2.5" aria-busy={busy || undefined}>
            {body}
          </div>

          <p role="status" className="sr-only">
            {announcement}
          </p>

          <div className="hidden shrink-0 flex-wrap gap-3.5 border-t border-[var(--dash-line)] px-3.5 py-2.5 text-[11.5px] text-[var(--dash-quiet)] sm:flex">
            <span>
              <Key>↑</Key> <Key>↓</Key> move
            </span>
            <span>
              <Key>↵</Key> open
            </span>
            <span>
              <Key>Esc</Key> close
            </span>
            <span className="ms-auto">Test invoices are marked TEST</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-b-2 border-[var(--dash-line)] px-1.5 font-sans text-[11px] font-semibold">
      {children}
    </kbd>
  )
}

const HEADING = 'mx-2.5 mt-1.5 mb-1 flex items-center justify-between text-[10.5px] font-bold tracking-[0.14em] text-[var(--dash-quiet)]'

type OptionProps = (option: Option) => ComponentProps<'a'>

function ResultSection({
  section,
  q,
  baseId,
  optionProps,
  active,
}: {
  section: SearchSectionResult
  q: string
  baseId: string
  optionProps: OptionProps
  active: string | null
}) {
  const headingId = `${baseId}-heading-${section.key}`
  const Icon = SECTION_ICONS[section.key]
  const more: Option = { kind: 'more', id: `${baseId}-more-${section.key}`, href: section.moreHref, section }

  return (
    <div role="group" aria-labelledby={headingId} className="pt-1.5 pb-0.5">
      <div className={HEADING}>
        <span id={headingId}>{section.label.toUpperCase()}</span>
        {section.state === 'ready' && section.hasMore ? (
          <a
            {...optionProps(more)}
            className={cn(
              'rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold tracking-normal text-[var(--dash-blue-ink)] hover:underline',
              active === more.id && 'bg-[var(--dash-blue-tint)]',
            )}
          >
            See all in {section.label}
          </a>
        ) : null}
      </div>

      {section.state === 'error' ? (
        <p className="mx-2.5 mt-0.5 mb-1.5 rounded-lg bg-[var(--dash-red-tint)] px-2.5 py-1.5 text-xs text-[var(--dash-red-ink)]">
          {section.label} could not be searched just now. The other sections are complete.
        </p>
      ) : (
        section.items.map((hit) => {
          const option: Option = { kind: 'hit', id: `${baseId}-${section.key}-${hit.id}`, href: hit.href, section, hit }
          const lit = active === option.id

          return (
            <a
              key={hit.id}
              {...optionProps(option)}
              className={cn(
                'group grid w-full grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-start text-[var(--dash-ink)] no-underline',
                lit && 'bg-[var(--dash-blue-tint)]',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-[30px] place-items-center rounded-lg',
                  lit ? 'bg-[var(--dash-surface)] text-[var(--dash-blue-ink)]' : 'bg-[var(--dash-chip)] text-[var(--dash-quiet)]',
                )}
              >
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-[13.5px] font-semibold">
                  <Highlighted text={hit.title} q={q} />
                </strong>
                {hit.subtitle ? (
                  <small className="block truncate text-xs text-[var(--dash-quiet)]">
                    <Highlighted text={hit.subtitle} q={q} />
                  </small>
                ) : null}
              </span>
              <span className="flex items-center gap-1.5">
                {hit.badge ? (
                  <span
                    className={cn(
                      'inline-flex h-[22px] shrink-0 items-center rounded-md px-2 text-[11px] font-semibold',
                      badgeClass(hit.badge),
                    )}
                  >
                    {hit.badge}
                  </span>
                ) : null}
                <span aria-hidden="true" className={cn('w-3 text-[11px] text-[var(--dash-blue-ink)]', !lit && 'opacity-0')}>
                  ↵
                </span>
              </span>
            </a>
          )
        })
      )}
    </div>
  )
}

/** The matched words in blue, as text — never as HTML. */
export function Highlighted({ text, q }: { text: string; q: string }) {
  return (
    <>
      {highlightPieces(text, q).map((piece, index) =>
        piece.match ? (
          <mark key={index} className="bg-transparent font-bold text-[var(--dash-blue-ink)]">
            {piece.text}
          </mark>
        ) : (
          <span key={index}>{piece.text}</span>
        ),
      )}
    </>
  )
}

function BeforeTyping({
  recent,
  tooShort,
  onPick,
}: {
  recent: string[]
  tooShort: boolean
  onPick: (value: string) => void
}) {
  return (
    <div>
      {recent.length > 0 ? (
        <section aria-labelledby="search-recent-heading" className="pt-1.5">
          <h3 id="search-recent-heading" className={HEADING}>
            RECENT SEARCHES
          </h3>
          <div className="flex flex-wrap gap-1.5 px-2.5 pt-1 pb-2">
            {recent.map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => onPick(entry)}
                className="h-7 max-w-full truncate rounded-full border border-[var(--dash-line)] bg-[var(--dash-input)] px-2.5 text-[12.5px] text-[var(--dash-ink)] hover:bg-[var(--dash-hover)]"
              >
                {entry}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <p className="px-4 py-6 text-[13px] leading-relaxed text-[var(--dash-quiet)]">
        {tooShort ? (
          <b className="mb-1 block text-sm text-[var(--dash-ink)]">Keep typing — a search needs at least 2 characters.</b>
        ) : null}
        Search your clients, leads, invoices and subscriptions, messages, appointments, articles, projects, services and
        files. Kept only in this browser: your recent searches.
      </p>
    </div>
  )
}

function NothingFound({ q }: { q: string }) {
  return (
    <p className="px-4 py-6 text-[13px] leading-relaxed text-[var(--dash-quiet)]">
      <b className="mb-1 block text-sm text-[var(--dash-ink)]">Nothing matches “{q}”</b>
      Check the spelling, or search by an email, an invoice number or a booking reference. Items in Trash are not
      searched.
    </p>
  )
}

function Searching() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3.5 p-3.5">
      {[55, 42, 60, 38, 50].map((width) => (
        <div key={width} className="grid grid-cols-[30px_1fr] items-center gap-2.5">
          <div className="dash-skeleton h-[30px] rounded-lg" />
          <div>
            <div className="dash-skeleton h-2.5" style={{ width: `${width}%` }} />
            <div className="dash-skeleton mt-2 h-2.5" style={{ width: `${width - 20}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function SearchFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const signedOut = error instanceof ApiRequestError && (error.status === 401 || error.status === 403)

  return (
    <div role="alert" className="flex flex-col items-start gap-3 px-4 py-6 text-[13px] leading-relaxed text-[var(--dash-quiet)]">
      {signedOut ? (
        <p className="m-0">
          <b className="mb-1 block text-sm text-[var(--dash-ink)]">Your session has ended</b>
          Reload the page and sign in again to search.
        </p>
      ) : (
        <p className="m-0">
          <b className="mb-1 block text-sm text-[var(--dash-ink)]">Search could not reach the server</b>
          Check your connection and try again. Nothing was changed.
        </p>
      )}
      {signedOut ? (
        <button type="button" className="dash-btn dash-btn-quiet h-8 px-3 text-[12.5px]" onClick={() => window.location.reload()}>
          Reload the page
        </button>
      ) : (
        <button type="button" className="dash-btn dash-btn-quiet h-8 px-3 text-[12.5px]" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}
