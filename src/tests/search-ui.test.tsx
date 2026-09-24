// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { SEARCH_LIMITS, type SearchResult, type SearchSectionResult } from '#/backend2/contracts/search.contract'

/**
 * The Dashboard's global search palette (`docs/v2/search.md`, Design Lab
 * approved 24 Sep 2026) against a faked API. The backend suite proves what
 * is found; this proves the palette: how it opens, that it waits for typing
 * to pause, that the keyboard walks every section, that Enter lands on the
 * record, that focus comes back, and that every state says something true.
 */

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

const searchEverything = vi.fn()

vi.mock('#/frontend/features/search-v2/api', async (importActual) => ({
  ...(await importActual<typeof import('#/frontend/features/search-v2/api')>()),
  searchEverything: (...args: unknown[]) => searchEverything(...args),
}))

const { SearchPaletteProvider, SearchField, shouldOpenOnShortcut } = await import('#/frontend/dashboard/SearchPaletteOpener')
const { DashboardPreferencesProvider } = await import('#/frontend/dashboard/preferences')
const { highlightPieces } = await import('#/frontend/features/search-v2/highlight')
const { RECENT_KEY, readRecent, rememberSearch } = await import('#/frontend/features/search-v2/recent')
const { SEARCH_MAX, SEARCH_MIN } = await import('#/frontend/features/search-v2/api')
const { ApiRequestError } = await import('#/frontend/api/response')

/* ------------------------------------------------------------------ fixtures */

const section = (over: Partial<SearchSectionResult> & Pick<SearchSectionResult, 'key' | 'label'>): SearchSectionResult => ({
  state: 'ready',
  items: [],
  hasMore: false,
  moreHref: `/dashboard/${over.key}`,
  ...over,
})

const hit = (id: string, title: string, over: Partial<SearchSectionResult['items'][number]> = {}) => ({
  id,
  title,
  subtitle: '',
  badge: null,
  href: `/dashboard/x/${id}`,
  ...over,
})

const results = (q = 'probe', over: Partial<Record<SearchSectionResult['key'], Partial<SearchSectionResult>>> = {}): SearchResult => ({
  q,
  sections: [
    section({
      key: 'clients',
      label: 'Clients',
      items: [
        hit('c1', 'Probe & Co', { subtitle: 'Lina Probe · lina.probe@example.de', href: '/dashboard/clients?client=c1' }),
        hit('c2', 'Probe Werkstatt', { badge: 'Inactive', href: '/dashboard/clients?client=c2' }),
      ],
    }),
    section({ key: 'leads', label: 'Leads' }),
    section({
      key: 'invoices',
      label: 'Invoices',
      hasMore: true,
      moreHref: `/dashboard/invoices?q=${q}`,
      items: [hit('i1', 'TEST-2026-0007 — Probe & Co', { badge: 'TEST', href: '/dashboard/invoices/i1' })],
    }),
    section({ key: 'subscriptions', label: 'Subscriptions' }),
    section({
      key: 'inbox',
      label: 'Inbox',
      items: [hit('m1', 'Angebot für den Shop', { badge: 'Unread', href: '/dashboard/inbox?c=m1' })],
    }),
    section({ key: 'calendar', label: 'Calendar' }),
    section({ key: 'blog', label: 'Blog' }),
    section({ key: 'projects', label: 'Projects' }),
    section({ key: 'services', label: 'Services' }),
    section({ key: 'media', label: 'Media' }),
  ].map((entry) => ({ ...entry, ...over[entry.key] })),
})

const nothing = (q: string) => results(q, {
  clients: { items: [] },
  invoices: { items: [], hasMore: false },
  inbox: { items: [] },
})

/* -------------------------------------------------------------------- setup */

const mount = (extra: ReactNode = null) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <DashboardPreferencesProvider>
        <SearchPaletteProvider>
          <SearchField />
          <input aria-label="A field on the page" />
          {extra}
        </SearchPaletteProvider>
      </DashboardPreferencesProvider>
    </QueryClientProvider>,
  )
}

const field = () => screen.getByRole('button', { name: /search the dashboard/i })

const openByField = async () => {
  fireEvent.click(field())

  return screen.findByRole('combobox', { name: 'Search the dashboard' })
}

const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } })

const selectedOption = () => {
  const input = screen.getByRole('combobox')
  const id = input.getAttribute('aria-activedescendant')

  return id ? document.getElementById(id) : null
}

beforeEach(() => {
  navigate.mockReset()
  searchEverything.mockReset()
  searchEverything.mockImplementation(async (q: string) => results(q))
  window.localStorage.clear()
})

afterEach(() => cleanup())

/* ----------------------------------------------------------------- opening */

describe('opening the palette', () => {
  it('opens from the top-bar field with focus in the search box', async () => {
    mount()

    const input = await openByField()

    expect(screen.getByRole('dialog', { name: 'Search the dashboard' })).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(input))
    expect(screen.getByText(/Search your clients, leads, invoices and subscriptions/)).toBeTruthy()
  })

  it('opens with ⌘K and Ctrl K, also from an ordinary field on the page', async () => {
    mount()

    const pageField = screen.getByRole('textbox', { name: 'A field on the page' })

    pageField.focus()
    fireEvent.keyDown(pageField, { key: 'k', metaKey: true })

    expect(await screen.findByRole('combobox', { name: 'Search the dashboard' })).toBeTruthy()

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.keyDown(document.body, { key: 'K', ctrlKey: true })
    expect(await screen.findByRole('combobox', { name: 'Search the dashboard' })).toBeTruthy()
  })

  it('leaves ⌘K alone in rich text, inside another dialog, and with other modifiers', () => {
    const event = (target: EventTarget, init: KeyboardEventInit) => {
      const e = new KeyboardEvent('keydown', { key: 'k', bubbles: true, ...init })

      Object.defineProperty(e, 'target', { value: target })

      return e
    }

    const plain = document.createElement('input')
    const editor = document.createElement('div')
    Object.defineProperty(editor, 'isContentEditable', { value: true })
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const inDialog = document.createElement('input')
    dialog.append(inDialog)
    const ours = document.createElement('div')
    ours.setAttribute('role', 'dialog')
    ours.setAttribute('data-search-palette', '')
    const inOurs = document.createElement('input')
    ours.append(inOurs)

    expect(shouldOpenOnShortcut(event(plain, { metaKey: true }))).toBe(true)
    expect(shouldOpenOnShortcut(event(plain, { ctrlKey: true }))).toBe(true)
    expect(shouldOpenOnShortcut(event(plain, {}))).toBe(false)
    expect(shouldOpenOnShortcut(event(plain, { metaKey: true, shiftKey: true }))).toBe(false)
    expect(shouldOpenOnShortcut(event(plain, { metaKey: true, key: 'j' }))).toBe(false)
    expect(shouldOpenOnShortcut(event(editor, { metaKey: true }))).toBe(false)
    expect(shouldOpenOnShortcut(event(inDialog, { metaKey: true }))).toBe(false)
    expect(shouldOpenOnShortcut(event(inOurs, { metaKey: true }))).toBe(true)
  })

  it('closes with Escape and gives focus back to what opened it', async () => {
    mount()

    field().focus()
    const input = await openByField()

    fireEvent.keyDown(input, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(field()))
  })
})

/* ---------------------------------------------------------------- the query */

describe('asking the server', () => {
  it('waits for typing to pause, and sends only the last question', async () => {
    mount()

    const input = await openByField()

    type(input, 'pr')
    type(input, 'pro')
    type(input, 'prob')
    type(input, 'probe')

    expect(searchEverything).not.toHaveBeenCalled()

    await screen.findByRole('listbox', { name: 'Results' })
    expect(searchEverything).toHaveBeenCalledTimes(1)
    expect(searchEverything.mock.calls[0]![0]).toBe('probe')
    expect(searchEverything.mock.calls[0]![1]).toBeInstanceOf(AbortSignal)
  })

  it('does not ask for fewer than two characters, and says so', async () => {
    mount()

    const input = await openByField()

    type(input, ' p ')

    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(searchEverything).not.toHaveBeenCalled()
    expect(screen.getByText(/a search needs at least 2 characters/)).toBeTruthy()
  })

  it('shows the skeleton only while nothing has answered yet', async () => {
    let finish: (value: SearchResult) => void = () => {}
    searchEverything.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    mount()

    const input = await openByField()

    type(input, 'probe')
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Searching')
    await waitFor(() => expect(searchEverything).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status').textContent).toBe('Searching')

    await act(async () => finish(results('probe')))
    await screen.findByRole('listbox')
  })

  it('never lets an older answer replace a newer one, and cancels the older request', async () => {
    const pending: Record<string, { resolve: (value: SearchResult) => void; signal: AbortSignal }> = {}
    searchEverything.mockImplementation(
      (q: string, signal: AbortSignal) => new Promise<SearchResult>((resolve) => (pending[q] = { resolve, signal })),
    )
    mount()

    const input = await openByField()

    type(input, 'probe')
    await waitFor(() => expect(pending.probe).toBeDefined())

    type(input, 'shop')
    await waitFor(() => expect(pending.shop).toBeDefined())

    await act(async () =>
      pending.shop!.resolve(results('shop', { clients: { items: [hit('c9', 'Shop GmbH')] }, invoices: { items: [], hasMore: false }, inbox: { items: [] } })),
    )
    await act(async () => pending.probe!.resolve(results('probe')))

    const list = await screen.findByRole('listbox')

    expect(within(list).getAllByRole('option').map((option) => option.textContent)).toEqual(['Shop GmbH↵'])
    expect(within(list).queryByText(/Werkstatt/)).toBeNull()
    expect(pending.probe!.signal.aborted).toBe(true)
  })
})

/* --------------------------------------------------------------- the results */

describe('the results', () => {
  it('groups by section in the server’s order, and hides sections with nothing', async () => {
    mount()

    type(await openByField(), 'probe')

    const list = await screen.findByRole('listbox', { name: 'Results' })
    const groups = within(list).getAllByRole('group')

    expect(groups.map((group) => group.getAttribute('aria-labelledby') && document.getElementById(group.getAttribute('aria-labelledby')!)!.textContent)).toEqual([
      'CLIENTS',
      'INVOICES',
      'INBOX',
    ])
    expect(within(list).getByRole('option', { name: 'See all in Invoices' }).getAttribute('href')).toBe('/dashboard/invoices?q=probe')
  })

  it('marks a test invoice amber, unread mail blue, anything else grey', async () => {
    mount()

    type(await openByField(), 'probe')
    await screen.findByRole('listbox')

    expect(screen.getByText('TEST').className).toContain('#fff4dc')
    expect(screen.getByText('Unread').className).toContain('dash-tone-blue')
    expect(screen.getByText('Inactive').className).toContain('dash-tone-grey')
  })

  it('highlights the matched words as text, never as HTML', async () => {
    searchEverything.mockImplementation(async (q: string) =>
      results(q, { clients: { items: [hit('c1', '<img src=x onerror=alert(1)> Probe')] }, invoices: { items: [], hasMore: false }, inbox: { items: [] } }),
    )
    mount()

    type(await openByField(), 'probe')

    const option = await screen.findByRole('option', { name: /Probe/ })

    expect(option.querySelector('img')).toBeNull()
    expect(option.textContent).toContain('<img src=x onerror=alert(1)> Probe')
    expect(option.querySelector('mark')?.textContent).toBe('Probe')
  })

  it('says which section failed and keeps the others', async () => {
    searchEverything.mockImplementation(async (q: string) => results(q, { calendar: { state: 'error' } }))
    mount()

    type(await openByField(), 'probe')
    await screen.findByRole('listbox')

    expect(screen.getByText('Calendar could not be searched just now. The other sections are complete.')).toBeTruthy()
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0)
  })

  it('says nothing matches, with the question and how to ask differently', async () => {
    searchEverything.mockImplementation(async (q: string) => nothing(q))
    mount()

    type(await openByField(), 'zebra')

    expect(await screen.findByText('Nothing matches “zebra”')).toBeTruthy()
    expect(screen.getByText(/Items in Trash are not searched/)).toBeTruthy()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('says a signed-out session plainly', async () => {
    searchEverything.mockRejectedValue(new ApiRequestError({ message: 'Sign in', code: 'UNAUTHORIZED', status: 401 }))
    mount()

    type(await openByField(), 'probe')

    expect(await screen.findByText('Your session has ended')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeTruthy()
  })

  it('says the server could not be reached, and tries again on request', async () => {
    // A network failure is retried once before the palette says so.
    searchEverything.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    mount()

    type(await openByField(), 'probe')

    expect(await screen.findByText('Search could not reach the server', undefined, { timeout: 4000 })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('listbox')).toBeTruthy()
  })
})

/* ----------------------------------------------------------------- keyboard */

describe('the keyboard', () => {
  it('lights the first result, walks every section with ↑/↓, and wraps', async () => {
    mount()

    const input = await openByField()

    type(input, 'probe')
    await screen.findByRole('listbox')

    expect(selectedOption()?.textContent).toContain('Probe & Co')
    expect(selectedOption()?.getAttribute('aria-selected')).toBe('true')

    const walk = [] as string[]

    for (let step = 0; step < 5; step += 1) {
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      walk.push(selectedOption()!.textContent!)
    }

    expect(walk[0]).toContain('Probe Werkstatt')
    expect(walk[1]).toBe('See all in Invoices')
    expect(walk[2]).toContain('TEST-2026-0007')
    expect(walk[3]).toContain('Angebot für den Shop')
    expect(walk[4]).toContain('Probe & Co')

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(selectedOption()?.textContent).toContain('Angebot für den Shop')
  })

  it('opens the lit result with Enter, remembers the search, and closes', async () => {
    mount()

    const input = await openByField()

    type(input, 'probe')
    await screen.findByRole('listbox')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(navigate).toHaveBeenCalledWith({ href: '/dashboard/invoices/i1' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(readRecent()).toEqual(['probe'])
  })

  it('opens "See all" and a clicked result through the router', async () => {
    mount()

    type(await openByField(), 'probe')
    await screen.findByRole('listbox')

    fireEvent.click(screen.getByRole('option', { name: 'See all in Invoices' }))
    expect(navigate).toHaveBeenLastCalledWith({ href: '/dashboard/invoices?q=probe' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    type(await openByField(), 'probe')
    fireEvent.click(await screen.findByRole('option', { name: /Angebot/ }))
    expect(navigate).toHaveBeenLastCalledWith({ href: '/dashboard/inbox?c=m1' })
  })
})

/* ---------------------------------------------------------- recent searches */

describe('recent searches', () => {
  it('shows the last searches before typing, and runs one when chosen', async () => {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(['shop', 'probe']))
    mount()

    await openByField()

    const heading = screen.getByRole('heading', { name: 'RECENT SEARCHES' })

    expect(heading).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'probe' }))

    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('probe')
    await screen.findByRole('listbox')
    expect(searchEverything).toHaveBeenCalledWith('probe', expect.any(AbortSignal))
  })

  it('keeps five, newest first, without repeats', () => {
    for (const term of ['a1', 'b2', 'c3', 'd4', 'e5', 'B2', 'f6']) rememberSearch(term)

    expect(readRecent()).toEqual(['f6', 'B2', 'e5', 'd4', 'c3'])
  })

  it('survives storage that refuses or holds nonsense', () => {
    window.localStorage.setItem(RECENT_KEY, '{nope')
    expect(readRecent()).toEqual([])

    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })

    expect(() => rememberSearch('probe')).not.toThrow()
    spy.mockRestore()
  })
})

/* ------------------------------------------------------------------ helpers */

describe('highlighting and limits', () => {
  it('marks every case-insensitive occurrence, with no pattern syntax', () => {
    expect(highlightPieces('Probe & probe', 'PROBE')).toEqual([
      { text: 'Probe', match: true },
      { text: ' & ', match: false },
      { text: 'probe', match: true },
    ])
    expect(highlightPieces('a.b (c)', '(c')).toEqual([
      { text: 'a.b ', match: false },
      { text: '(c', match: true },
      { text: ')', match: false },
    ])
    expect(highlightPieces('nothing here', 'zebra')).toEqual([{ text: 'nothing here', match: false }])
    expect(highlightPieces('', 'x')).toEqual([])
  })

  it('agrees with the contract on how long a question may be', () => {
    expect(SEARCH_MIN).toBe(SEARCH_LIMITS.minQuery)
    expect(SEARCH_MAX).toBe(SEARCH_LIMITS.maxQuery)
  })
})
