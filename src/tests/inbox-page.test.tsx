// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { AdminLeadList, AdminLeadListItem, InboxSettings } from '#/shared/types/lead.types'
import { DEFAULT_INBOX_PREFERENCES } from '#/shared/validation/lead.validation'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
  useRouterState: () => '/admin/inbox',
}))

const settings: InboxSettings = {
  preferences: DEFAULT_INBOX_PREFERENCES,
  signatures: { de: '', en: '', ar: '' },
  canSendMail: true,
  canReceiveMail: false,
}

const item = (overrides: Partial<AdminLeadListItem> = {}): AdminLeadListItem => ({
  id: 'lead-1',
  source: 'CONTACT_FORM',
  name: 'Lena Brandt',
  email: 'l.brandt@brandt-soehne.de',
  company: 'Brandt & Söhne',
  subject: 'Website und Terminbuchung',
  preview: 'Wir nehmen Termine noch telefonisch an.',
  status: 'NEW',
  language: 'de',
  budget: '3.000 bis 6.000 €',
  timeline: 'In den nächsten Wochen',
  projectType: 'Website',
  isUnread: true,
  isJunk: false,
  isArchived: false,
  hasAttachment: true,
  bookingLabel: null,
  replyCount: 0,
  createdAt: '2026-09-14T07:12:00.000Z',
  ...overrides,
})

const list = (items: AdminLeadListItem[]): AdminLeadList => ({
  items,
  total: items.length,
  page: 1,
  pageCount: 1,
  unread: items.filter((entry) => entry.isUnread).length,
})

const bulkAction = vi.fn().mockResolvedValue({ changed: 1 })

vi.mock('#/frontend/api/lead.api', () => ({
  fetchLeads: vi.fn(async () => list([item(), item({ id: 'lead-2', name: 'أحمد الحسن', language: 'ar', budget: 'حتى ١٥٠٠ €', isUnread: false })])),
  fetchLead: vi.fn(async () => null),
  fetchInboxSettings: vi.fn(async () => settings),
  fetchUnreadLeadCount: vi.fn(async () => ({ unread: 1 })),
  setLeadRead: vi.fn(async () => null),
  applyLeadBulkAction: (...args: unknown[]) => bulkAction(...args),
}))

import { InboxPage } from '#/frontend/pages/admin/inbox/InboxPage'

beforeEach(() => {
  navigate.mockClear()
  bulkAction.mockClear()
  // jsdom has no matchMedia, and the page asks it whether both columns fit.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const show = (search = {}) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <InboxPage search={search} />
    </QueryClientProvider>,
  )

describe('the inbox list', () => {
  it('shows every message with what the row is meant to carry', async () => {
    show()

    await waitFor(() => expect(screen.getByText('Lena Brandt')).toBeTruthy())
    expect(screen.getAllByText(/Website und Terminbuchung/).length).toBeGreaterThan(0)
    expect(screen.getByText('3.000 bis 6.000 €')).toBeTruthy()
    // An Arabic value decides its own direction, in an otherwise English row.
    expect(screen.getByText('حتى ١٥٠٠ €').getAttribute('dir')).toBe('auto')
  })

  it('offers the lenses as a rail, junk among them', async () => {
    show()

    // The rail and the narrow strip both render; CSS decides which is seen.
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Open' }).length).toBeGreaterThan(0))
    for (const lens of ['Open', 'Unread', 'New', 'Closed', 'Archived', 'Junk']) {
      expect(screen.getAllByRole('button', { name: lens }).length).toBeGreaterThan(0)
    }
  })

  it('drops the junk lens when that button is off', async () => {
    settings.preferences = { ...DEFAULT_INBOX_PREFERENCES, junk: false }
    show()

    // Waits for the settings to arrive: until they do the page shows the
    // defaults, where junk is on.
    await waitFor(() => expect(screen.queryAllByRole('button', { name: 'Junk' })).toHaveLength(0))
    settings.preferences = DEFAULT_INBOX_PREFERENCES
  })

  it('moves to a lens by putting it in the address', async () => {
    show()

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Archived' }).length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByRole('button', { name: 'Archived' })[0])

    expect(navigate).toHaveBeenCalled()
    const argument = navigate.mock.calls.at(-1)?.[0] as { search: (previous: object) => object }
    expect(argument.search({})).toMatchObject({ tab: 'archived' })
  })

  it('files a message from the row, without opening it', async () => {
    show()

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Archive' }).length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByRole('button', { name: 'Archive' })[0])

    await waitFor(() => expect(bulkAction).toHaveBeenCalledWith({ ids: ['lead-1'], action: 'archive' }))
  })
})
