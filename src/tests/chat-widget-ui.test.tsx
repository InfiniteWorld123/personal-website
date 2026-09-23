// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The public chat widget with its switch (`docs/v2/public-cutover.md`,
 * step 7): off, it keeps the legacy chat exactly; on, it asks Backend2, shows
 * the approved notice, sources, Contact/Booking, and answers in the
 * question's direction.
 */

const state = vi.hoisted(() => ({ v2: false, language: 'de' as 'de' | 'en' | 'ar' }))

vi.mock('@tanstack/react-router', () => ({ useRouterState: () => '/de' }))
vi.mock('#/frontend/i18n/language-provider', () => ({ useLanguage: () => ({ language: state.language }) }))
vi.mock('#/frontend/api/chat.api', () => ({
  fetchChatIntro: vi.fn(async () => ({
    disclosure: 'Automatische Antwort. Es liest niemand mit.',
    greeting: 'Legacy hello',
    suggestions: [],
    settings: { opening: 'greet', reveal: 'instant' },
  })),
  askAssistant: vi.fn(async () => ({ conversationId: 'legacy-1', reply: 'Legacy answer', canContinue: true })),
}))
vi.mock('#/frontend/features/chat/assistant-v2', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/frontend/features/chat/assistant-v2')>()),
  fetchAssistantSource: vi.fn(async () => ({ v2: state.v2 })),
}))

const { ChatWidget } = await import('#/frontend/features/chat/ChatWidget')
const legacy = await import('#/frontend/api/chat.api')

const LINKS = [
  { kind: 'contact', label: 'Nachricht schreiben', url: '/de/contact' },
  { kind: 'booking', label: 'Termin buchen', url: '/de/booking' },
  { kind: 'privacy', label: 'Datenschutz', url: '/de/datenschutz' },
]

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  state.v2 = false
  state.language = 'de'
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  window.sessionStorage.clear()
  // jsdom has no layout, so no element scrolling.
  Element.prototype.scrollTo = () => {}
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ChatWidget />
    </QueryClientProvider>,
  )

const openAndAsk = async (question: string) => {
  fireEvent.click(screen.getByRole('button', { name: /Frage stellen/ }))
  const input = await screen.findByLabelText('Deine Frage')
  fireEvent.change(input, { target: { value: question } })
  await act(async () => {
    fireEvent.submit(input.closest('form')!)
  })
}

describe('the chat widget', () => {
  it('keeps the legacy chat when the switch is off', async () => {
    mount()
    await openAndAsk('Wie läuft ein Projekt ab?')

    expect(await screen.findByText('Legacy answer')).toBeTruthy()
    expect(screen.getByText('Automatische Antwort. Es liest niemand mit.')).toBeTruthy()
    expect(legacy.askAssistant).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('asks Backend2 when the switch is on, with the notice, sources and links', async () => {
    state.v2 = true
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/status')
        ? json(200, {
            data: {
              enabled: true,
              mode: 'extractive',
              notice: { key: 'assistant.notice', text: 'Gespräche werden gespeichert und von Yaman gelesen.' },
              links: LINKS,
              limits: { messageMaxLength: 1000 },
            },
          })
        : json(200, {
            data: {
              conversationId: 'A'.repeat(43),
              answer: {
                text: 'Ein Online-Shop beginnt ab 3.400 €.',
                language: 'de',
                outcome: 'answered',
                provider: 'none',
                sources: [{ kind: 'service', title: 'Leistungen › Online-Shop', url: '/de/services/online-shop' }],
                links: LINKS.slice(0, 2),
              },
            },
          }),
    )

    mount()
    await openAndAsk('Was kostet ein Online-Shop?')

    expect(await screen.findByText('Ein Online-Shop beginnt ab 3.400 €.')).toBeTruthy()
    expect(screen.getByText('Gespräche werden gespeichert und von Yaman gelesen.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Leistungen › Online-Shop' }).getAttribute('href')).toBe('/de/services/online-shop')
    expect(screen.getByRole('link', { name: 'Termin buchen' })).toBeTruthy()
    expect(legacy.askAssistant).not.toHaveBeenCalled()

    const ask = fetchMock.mock.calls.find(([url]) => String(url).includes('/ask'))!
    expect(JSON.parse(ask[1].body)).toMatchObject({ message: 'Was kostet ein Online-Shop?', locale: 'de', conversationId: null })
    expect(window.sessionStorage.getItem('chat.conversation.v2')).toBe('A'.repeat(43))
  })

  it('writes an Arabic answer right to left on a German page', async () => {
    state.v2 = true
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/status')
        ? json(200, { data: { enabled: true, mode: 'extractive', notice: { key: 'k', text: 'n' }, links: LINKS, limits: { messageMaxLength: 1000 } } })
        : json(200, {
            data: {
              conversationId: 'B'.repeat(43),
              answer: { text: 'من أسبوعين إلى ستة أسابيع.', language: 'ar', outcome: 'answered', provider: 'none', sources: [], links: [] },
            },
          }),
    )

    mount()
    await openAndAsk('كم يستغرق بناء موقع؟')

    const answer = await screen.findByText('من أسبوعين إلى ستة أسابيع.')
    expect(answer.closest('[dir]')?.getAttribute('dir')).toBe('rtl')
  })

  it('says to slow down on 429, and rests with Contact/Booking when switched off', async () => {
    state.v2 = true
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/status')
        ? json(200, { data: { enabled: true, mode: 'extractive', notice: { key: 'k', text: 'n' }, links: LINKS, limits: { messageMaxLength: 1000 } } })
        : json(429, { success: false, code: 'RATE_LIMITED', message: 'Too many' }),
    )

    mount()
    await openAndAsk('?')
    expect(await screen.findByText(/Zu viele Fragen in kurzer Zeit/)).toBeTruthy()

    cleanup()
    fetchMock.mockImplementation(async () =>
      json(200, { data: { enabled: false, mode: 'extractive', notice: { key: 'k', text: 'n' }, links: LINKS, limits: { messageMaxLength: 1000 } } }),
    )
    mount()
    fireEvent.click(screen.getByRole('button', { name: /Frage stellen/ }))

    expect(await screen.findByText(/Der Assistent macht gerade Pause/)).toBeTruthy()
    await waitFor(() => expect((screen.getByLabelText('Deine Frage') as HTMLInputElement).disabled).toBe(true))
    expect(screen.getByRole('link', { name: 'Nachricht schreiben' })).toBeTruthy()
  })
})
