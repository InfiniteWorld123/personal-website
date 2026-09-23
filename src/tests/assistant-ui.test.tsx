// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  ASSISTANT_LANGUAGES,
  ASSISTANT_LIMITS,
  type AssistantSettings,
  type AssistantUsage,
  type OwnerConversation,
  type OwnerConversationPage,
} from '#/backend2/contracts/assistant.contract'

/**
 * The owner's screens for the public chat (`docs/v2/ai-assistant.md`,
 * approved Design Lab 24 Sep 2026), against a faked API. The backend suites
 * prove the rules; this proves the screens tell the truth about them: the
 * list's states and filters, Arabic read right to left, a delete that needs a
 * deliberate "I understand", and a retention form that validates on submit,
 * then on change, and cannot be sent twice.
 */

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, search: _search, ...rest }: { to: string; search?: unknown; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}))

const api = {
  listConversations: vi.fn(),
  readConversation: vi.fn(),
  deleteConversation: vi.fn(),
  readUsage: vi.fn(),
  readSettings: vi.fn(),
  patchSettings: vi.fn(),
  conversationsPath: vi.fn(),
}

vi.mock('#/frontend/features/assistant-v2/api', () => api)

const { ConversationsPage } = await import('#/frontend/pages/dashboard/assistant/ConversationsPage')
const { ConversationReader } = await import('#/frontend/pages/dashboard/assistant/ConversationReader')
const { AssistantSettingsPage, usageFigures } = await import('#/frontend/pages/dashboard/assistant/AssistantSettingsPage')
const { whenWords } = await import('#/frontend/pages/dashboard/assistant/assistant-parts')
const search = await import('#/frontend/features/assistant-v2/assistant-search')
const form = await import('#/frontend/features/assistant-v2/settings-form')
const { assistantV2Notice } = await import('#/frontend/features/assistant-v2/widget-copy')
const { ApiRequestError } = await import('#/frontend/api/response')
const realApi = await vi.importActual<typeof import('#/frontend/features/assistant-v2/api')>('#/frontend/features/assistant-v2/api')

const wrap = (node: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

beforeEach(() => {
  navigate.mockReset()
  for (const fn of Object.values(api)) fn.mockReset()
  api.readSettings.mockResolvedValue(settings())
})

afterEach(() => cleanup())

/** What the last `navigate({ search })` would make of an address. */
const nextSearch = (from: Record<string, unknown> = {}) => {
  const call = navigate.mock.calls.at(-1)?.[0] as { search: (previous: object) => object }

  return call.search(from)
}

const page = (items: OwnerConversationPage['items'], over: Partial<OwnerConversationPage> = {}): OwnerConversationPage => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
  pageCount: 1,
  hasMore: false,
  ...over,
})

const item = (over: Partial<OwnerConversationPage['items'][number]> = {}): OwnerConversationPage['items'][number] => ({
  id: '11111111-1111-4111-8111-111111111111',
  language: 'de',
  pageLocale: 'de',
  preview: 'Was kostet ein Online-Shop?',
  messageCount: 4,
  fallbackCount: 0,
  createdAt: '2026-09-24T07:14:00Z',
  lastMessageAt: '2026-09-24T07:16:00Z',
  ...over,
})

function settings(over: Partial<AssistantSettings> = {}): AssistantSettings {
  return { enabled: false, retentionMode: 'manual', retentionDays: null, updatedAt: null, ...over }
}

/* ------------------------------------------------------------- the address */

describe('the address', () => {
  it('knows every filter the contract has, and nothing else', () => {
    expect([...search.ASSISTANT_FILTERS]).toEqual(['fallback', ...ASSISTANT_LANGUAGES])
    expect(search.ASSISTANT_SEARCH_MAX).toBe(ASSISTANT_LIMITS.search)

    expect(search.parseAssistantSearch({ show: 'ar', q: '  preis ', page: '3', c: '11111111-1111-4111-8111-111111111111' })).toEqual({
      show: 'ar',
      q: 'preis',
      page: 3,
      c: '11111111-1111-4111-8111-111111111111',
    })
    expect(search.parseAssistantSearch({ show: 'fr', q: '   ', page: '1', c: 'not-an-id' })).toEqual({})
    expect(search.parseAssistantSearch({ q: 'x'.repeat(500) }).q).toHaveLength(ASSISTANT_LIMITS.search)
  })

  it('turns the one filter into the server’s outcome or language', () => {
    expect(realApi.conversationsPath({ show: 'fallback', search: 'app', page: 2, pageSize: 20 })).toBe(
      '/api/v2/owner/assistant/conversations?page=2&pageSize=20&search=app&outcome=fallback',
    )
    expect(realApi.conversationsPath({ show: 'ar' })).toBe('/api/v2/owner/assistant/conversations?language=ar')
    expect(realApi.conversationsPath({})).toBe('/api/v2/owner/assistant/conversations')
  })
})

/* ------------------------------------------------------------------ the list */

describe('the conversation list', () => {
  it('shows a loading state, then the rows, one page at a time from the server', async () => {
    let resolve: (value: OwnerConversationPage) => void = () => {}
    api.listConversations.mockReturnValue(new Promise((done) => (resolve = done)))

    wrap(<ConversationsPage search={{}} />)

    expect(screen.getByLabelText('Loading conversations').getAttribute('aria-busy')).toBe('true')
    expect(api.listConversations).toHaveBeenCalledWith({ page: 1, pageSize: 20, search: undefined, show: undefined })

    await act(async () =>
      resolve(
        page([item(), item({ id: '22222222-2222-4222-8222-222222222222', language: 'ar', preview: 'هل يمكنك نقل موقعي القديم؟', fallbackCount: 1 })], {
          total: 41,
          pageCount: 3,
        }),
      ),
    )

    const rows = within(await screen.findByRole('list', { name: 'Conversations' })).getAllByRole('button')

    expect(rows).toHaveLength(2)
    expect(screen.getByText('هل يمكنك نقل موقعي القديم؟').getAttribute('dir')).toBe('auto')
    expect(rows[1]!.textContent).toContain('Not on the website')
    expect(rows[0]!.textContent).toContain('Answered')
    expect(screen.getByRole('navigation', { name: 'Pages' }).textContent).toContain('Page 1 of 3')

    fireEvent.click(screen.getByRole('button', { name: /Next/u }))
    expect(nextSearch()).toMatchObject({ page: 2 })

    fireEvent.click(rows[1]!)
    expect(nextSearch()).toMatchObject({ c: '22222222-2222-4222-8222-222222222222' })
  })

  it('puts the filter in the address and asks the server for it', async () => {
    api.listConversations.mockResolvedValue(page([item()]))

    wrap(<ConversationsPage search={{ show: 'fallback', page: 2 }} />)

    await screen.findByRole('list', { name: 'Conversations' })
    expect(api.listConversations).toHaveBeenCalledWith({ page: 2, pageSize: 20, search: undefined, show: 'fallback' })
    expect(screen.getByRole('button', { name: 'Not on the website' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Arabic' }))
    expect(nextSearch({ show: 'fallback', page: 2 })).toEqual({ show: 'ar', page: undefined })

    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(nextSearch({ show: 'ar' })).toEqual({ show: undefined, page: undefined })
  })

  it('writes the search to the address once typing stops', async () => {
    vi.useFakeTimers()

    try {
      api.listConversations.mockResolvedValue(page([]))
      wrap(<ConversationsPage search={{}} />)

      fireEvent.change(screen.getByRole('searchbox', { name: 'Search conversations' }), { target: { value: ' preis ' } })
      expect(navigate).not.toHaveBeenCalled()

      act(() => vi.advanceTimersByTime(400))
      expect(nextSearch({ page: 3 })).toEqual({ q: 'preis', page: undefined })
    } finally {
      vi.useRealTimers()
    }
  })

  it('says why it is empty, and where the chat is switched on', async () => {
    api.listConversations.mockResolvedValue(page([]))

    wrap(<ConversationsPage search={{}} />)

    expect(await screen.findByText('No conversations yet')).toBeTruthy()
    await waitFor(() => expect(screen.getByText(/The chat is off at the moment/u)).toBeTruthy())
    expect(screen.getByRole('link', { name: 'Open settings' }).getAttribute('href')).toBe('/dashboard/assistant/settings')
  })

  it('says when a filter matches nothing, and clears it', async () => {
    api.listConversations.mockResolvedValue(page([]))

    wrap(<ConversationsPage search={{ q: 'iphone', show: 'en' }} />)

    expect(await screen.findByText('No conversations match')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show all conversations' }))
    expect(nextSearch({ q: 'iphone', show: 'en' })).toEqual({ q: undefined, show: undefined, page: undefined })
  })

  it('reports a failure and retries', async () => {
    // A 4xx: the screen does not retry on its own, so the owner's button is what retries.
    api.listConversations.mockRejectedValueOnce(new ApiRequestError({ message: 'The database is not reachable', status: 409 }))
    api.listConversations.mockResolvedValue(page([item()]))

    wrap(<ConversationsPage search={{}} />)

    expect(await screen.findByText('Conversations could not be loaded')).toBeTruthy()
    expect(screen.getByText(/The database is not reachable. Nothing was changed./u)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('list', { name: 'Conversations' })).toBeTruthy()
  })
})

/* ---------------------------------------------------------------- the reader */

const conversation = (over: Partial<OwnerConversation> = {}): OwnerConversation => ({
  id: '22222222-2222-4222-8222-222222222222',
  language: 'ar',
  pageLocale: 'de',
  messageCount: 4,
  fallbackCount: 1,
  createdAt: '2026-09-23T19:40:00Z',
  lastMessageAt: '2026-09-23T19:42:00Z',
  messages: [
    { id: 'm1', position: 1, role: 'visitor', language: 'ar', body: 'كم يستغرق بناء موقع؟', outcome: null, provider: null, sources: [], offeredContact: false, createdAt: '2026-09-23T19:40:00Z' },
    {
      id: 'm2',
      position: 2,
      role: 'assistant',
      language: 'ar',
      body: 'عادةً من أسبوعين إلى ستة أسابيع.',
      outcome: 'answered',
      provider: 'none',
      sources: [{ kind: 'faq', title: 'كم يستغرق؟', url: '/ar/faq' }],
      offeredContact: false,
      createdAt: '2026-09-23T19:40:01Z',
    },
    { id: 'm3', position: 3, role: 'visitor', language: 'ar', body: 'هل تبني تطبيقات آيفون؟', outcome: null, provider: null, sources: [], offeredContact: false, createdAt: '2026-09-23T19:41:00Z' },
    { id: 'm4', position: 4, role: 'assistant', language: 'ar', body: 'لا أجد ذلك في الموقع.', outcome: 'fallback', provider: 'none', sources: [], offeredContact: true, createdAt: '2026-09-23T19:41:01Z' },
  ],
  ...over,
})

describe('one conversation', () => {
  it('reads Arabic right to left, links its sources, and suggests a page for the unanswered question', async () => {
    api.readConversation.mockResolvedValue(conversation())

    wrap(<ConversationReader id="22222222-2222-4222-8222-222222222222" onClose={() => {}} onDeleted={() => {}} />)

    const messages = await screen.findByRole('list', { name: 'Messages' })
    const bubbles = within(messages).getAllByText(/./u, { selector: '[dir="rtl"]' })

    expect(bubbles.length).toBe(4)
    expect(screen.getByRole('heading', { level: 2, name: 'كم يستغرق بناء موقع؟' })).toBeTruthy()
    expect(screen.getByText(/Arabic on the German page/u)).toBeTruthy()

    const source = screen.getByRole('link', { name: /كم يستغرق؟/u })
    expect(source.getAttribute('href')).toBe('/ar/faq')
    expect(source.getAttribute('target')).toBe('_blank')

    expect(within(messages).getByText('Not on the website')).toBeTruthy()
    expect(screen.getByText('Worth a page?')).toBeTruthy()
    expect(screen.getByText('Offered the Contact and Booking links.')).toBeTruthy()
  })

  it('says plainly when the conversation no longer exists', async () => {
    api.readConversation.mockRejectedValue(new ApiRequestError({ message: 'That conversation does not exist', code: 'NOT_FOUND', status: 404 }))
    const onClose = vi.fn()

    wrap(<ConversationReader id="22222222-2222-4222-8222-222222222222" onClose={onClose} onDeleted={() => {}} />)

    expect(await screen.findByText('This conversation no longer exists')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to the list' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('deletes only after "I understand", and only once', async () => {
    api.readConversation.mockResolvedValue(conversation({ fallbackCount: 0 }))
    let finish: () => void = () => {}
    api.deleteConversation.mockReturnValue(new Promise((done) => (finish = () => done({ id: 'x', deleted: true }))))
    const onDeleted = vi.fn()

    wrap(<ConversationReader id="22222222-2222-4222-8222-222222222222" onClose={() => {}} onDeleted={onDeleted} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    const dialog = screen.getByRole('alertdialog', { name: 'Delete this conversation for good?' })
    const confirm = within(dialog).getByRole('button', { name: /Delete permanently/u }) as HTMLButtonElement

    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    expect(api.deleteConversation).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I understand this cannot be undone.' }))
    expect(confirm.disabled).toBe(false)

    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /Deleting/u }).hasAttribute('disabled')).toBe(true))
    expect(api.deleteConversation).toHaveBeenCalledTimes(1)
    expect(api.deleteConversation.mock.calls[0]?.[0]).toBe('22222222-2222-4222-8222-222222222222')

    await act(async () => finish())
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('keeps the dialog open with the reason when the delete fails', async () => {
    api.readConversation.mockResolvedValue(conversation())
    api.deleteConversation.mockRejectedValue(new ApiRequestError({ message: 'The database is not reachable', status: 503 }))
    const onDeleted = vi.fn()

    wrap(<ConversationReader id="22222222-2222-4222-8222-222222222222" onClose={() => {}} onDeleted={onDeleted} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('checkbox'))
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete permanently/u }))

    expect((await within(dialog).findByRole('alert')).textContent).toBe('The database is not reachable')
    expect(onDeleted).not.toHaveBeenCalled()
  })
})

/* -------------------------------------------------------------- the settings */

const usage = (over: Partial<AssistantUsage> = {}): AssistantUsage => ({
  days: [
    { day: '2026-09-23', conversations: 3, questions: 5, answered: 3, fallbacks: 2, handoffs: 0, contactOffers: 2, providerCalls: 0, providerFallbacks: 0, rateLimited: 0, capped: 0 },
    { day: '2026-09-24', conversations: 2, questions: 2, answered: 2, fallbacks: 0, handoffs: 0, contactOffers: 0, providerCalls: 0, providerFallbacks: 0, rateLimited: 0, capped: 0 },
  ],
  provider: { configured: 'none', dailyCap: 0, usedToday: 0, active: false },
  dailyQuestionLimit: 500,
  estimatedCostCents: 0,
  ...over,
})

describe('the retention rules', () => {
  it('keeps "until I delete them" as the default and asks for a period only when deleting automatically', () => {
    expect(form.retentionFormFrom(settings())).toEqual({ retentionMode: 'manual', retentionDays: '' })
    expect(form.retentionFormErrors({ retentionMode: 'manual', retentionDays: '' })).toEqual({})
    expect(form.retentionFormErrors({ retentionMode: 'days', retentionDays: '' }).retentionDays).toBe(
      'Choose after how many days conversations are deleted',
    )
    expect(form.retentionFormErrors({ retentionMode: 'days', retentionDays: '0' }).retentionDays).toBe('At least one day')
    expect(form.retentionFormErrors({ retentionMode: 'days', retentionDays: '4000' }).retentionDays).toBe('At most 3650 days')
    expect(form.retentionPatch({ retentionMode: 'days', retentionDays: '90' })).toEqual({ retentionMode: 'days', retentionDays: 90 })
    expect(form.retentionPatch({ retentionMode: 'manual', retentionDays: '90' })).toEqual({ retentionMode: 'manual', retentionDays: null })
  })

  it('offers 30, 90 and 180 days, and keeps a period saved some other way', () => {
    expect(form.retentionOptions('')).toEqual([30, 90, 180])
    expect(form.retentionOptions('45')).toEqual([30, 45, 90, 180])
  })
})

describe('Settings & usage', () => {
  it('validates on the first save, then as the owner changes it, and sends once', async () => {
    api.readUsage.mockResolvedValue(usage())
    let finish: (value: AssistantSettings) => void = () => {}
    api.patchSettings.mockReturnValue(new Promise((done) => (finish = done)))

    wrap(<AssistantSettingsPage />)

    const auto = await screen.findByRole('radio', { name: /Delete automatically/u })
    const period = screen.getByLabelText('Delete after') as HTMLSelectElement

    expect((screen.getByRole('radio', { name: /Until I delete them/u }) as HTMLInputElement).checked).toBe(true)
    expect(period.getAttribute('aria-invalid')).toBe('false')

    fireEvent.click(auto)
    // Not before the first save.
    expect(screen.queryByText('Choose after how many days conversations are deleted')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Choose after how many days conversations are deleted')).toBeTruthy()
    expect(period.getAttribute('aria-invalid')).toBe('true')
    expect(period.getAttribute('aria-describedby')).toContain('assistant-days-error')
    await waitFor(() => expect(document.activeElement).toBe(period))
    expect(api.patchSettings).not.toHaveBeenCalled()

    fireEvent.change(period, { target: { value: '90' } })
    await waitFor(() => expect(screen.queryByText('Choose after how many days conversations are deleted')).toBeNull())

    const save = screen.getByRole('button', { name: 'Save' })
    fireEvent.click(save)
    fireEvent.click(save)

    await waitFor(() => expect(screen.getByRole('button', { name: /Saving/u }).hasAttribute('disabled')).toBe(true))
    expect(api.patchSettings).toHaveBeenCalledTimes(1)
    expect(api.patchSettings).toHaveBeenCalledWith({ retentionMode: 'days', retentionDays: 90 })

    await act(async () => finish(settings({ retentionMode: 'days', retentionDays: 90, updatedAt: '2026-09-24T10:00:00Z' })))
    expect(await screen.findByText('Saved.')).toBeTruthy()
  })

  it('shows the server’s refusal beside the form', async () => {
    api.readSettings.mockResolvedValue(settings({ retentionMode: 'days', retentionDays: 30 }))
    api.readUsage.mockResolvedValue(usage())
    api.patchSettings.mockRejectedValue(new ApiRequestError({ message: 'The database is not reachable', status: 503 }))

    wrap(<AssistantSettingsPage />)

    fireEvent.click(await screen.findByRole('radio', { name: /Until I delete them/u }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((await screen.findByRole('alert')).textContent).toBe('The database is not reachable')
  })

  it('switches the chat on and off, and warns about real visitors', async () => {
    api.readUsage.mockResolvedValue(usage())
    api.patchSettings.mockResolvedValue(settings({ enabled: true }))

    wrap(<AssistantSettingsPage />)

    const toggle = await screen.findByRole('switch', { name: 'Chat on the website' })

    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('Before switching it on for real visitors')).toBeTruthy()

    fireEvent.click(toggle)
    await waitFor(() => expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true'))
    expect(api.patchSettings).toHaveBeenCalledWith({ enabled: true })
  })

  it('shows the last 30 days, the model calls against the cap, and a cost of nothing', async () => {
    api.readUsage.mockResolvedValue(usage())

    wrap(<AssistantSettingsPage />)

    await screen.findByText('conversations')
    expect(api.readUsage).toHaveBeenCalledWith(30)
    expect(usageFigures(usage())).toMatchObject({ conversations: 5, questions: 7, unanswered: 2, calls: '0 / 0', cost: '€0.00' })
    expect(screen.getByText('AI model calls today · none allowed')).toBeTruthy()
    expect(screen.getByText('€0.00')).toBeTruthy()
  })

  it('says when settings cannot be read', async () => {
    api.readSettings.mockRejectedValue(new ApiRequestError({ message: 'Not found', status: 404 }))
    api.readUsage.mockRejectedValue(new ApiRequestError({ message: 'Not found', status: 404 }))

    wrap(<AssistantSettingsPage />)

    expect(await screen.findByText('Settings could not be loaded')).toBeTruthy()
    expect(await screen.findByText('Usage could not be loaded')).toBeTruthy()
  })
})

/* ------------------------------------------------------------------- words */

describe('words', () => {
  it('writes times as the owner reads them', () => {
    const now = new Date(2026, 8, 24, 12, 0)

    expect(whenWords(new Date(2026, 8, 24, 9, 14).toISOString(), now)).toBe('Today, 09:14')
    expect(whenWords(new Date(2026, 8, 23, 21, 40).toISOString(), now)).toBe('Yesterday, 21:40')
    expect(whenWords(new Date(2026, 8, 21, 8, 0).toISOString(), now)).toBe('21 Sept')
    expect(whenWords(new Date(2025, 8, 21, 8, 0).toISOString(), now)).toBe('21 Sept 2025')
  })

  it('has the approved V2 widget notice in all three languages, without "nobody reads along"', () => {
    for (const language of ASSISTANT_LANGUAGES) {
      const copy = assistantV2Notice[language]

      expect(copy.notice.length).toBeGreaterThan(20)
      expect(copy.privacyPath).toBe(`/${language}/datenschutz`)
    }

    expect(assistantV2Notice.de.notice).not.toMatch(/niemand/u)
    expect(assistantV2Notice.en.notice).not.toMatch(/nobody|no human/iu)
    expect(assistantV2Notice.en.notice).toContain('saved')
  })
})
