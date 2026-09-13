// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { LeadReadingPane } from '#/frontend/pages/admin/inbox/LeadReadingPane'
import type { AdminLeadDetail } from '#/shared/types/lead.types'
import {
  DEFAULT_INBOX_PREFERENCES,
  type InboxPreferences,
} from '#/shared/validation/lead.validation'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const lead = (overrides: Partial<AdminLeadDetail> = {}): AdminLeadDetail => ({
  id: '2f1c3b4e-0000-4000-8000-000000000000',
  source: 'CONTACT_FORM',
  name: 'Lena Brandt',
  email: 'l.brandt@brandt-soehne.de',
  company: 'Brandt & Söhne',
  subject: 'Website + Buchung',
  preview: 'Wir nehmen Termine noch telefonisch an.',
  status: 'NEW',
  language: 'de',
  budget: '5–10k €',
  timeline: 'In 4 Wochen',
  projectType: 'Website + Buchung',
  isUnread: true,
  isJunk: false,
  isArchived: false,
  hasAttachment: true,
  bookingLabel: null,
  replyCount: 1,
  createdAt: '2026-09-13T07:12:00.000Z',
  phone: '+49 151 2233 4455',
  message: 'Wir nehmen Termine noch telefonisch an.',
  attachmentName: 'briefing.pdf',
  attachmentBytes: 1_258_291,
  notifiedAt: '2026-09-13T07:12:04.000Z',
  readAt: null,
  messages: [
    { id: 'm1', direction: 'OUT', subject: 'Website', body: 'Passt Dienstag 10:00?', sentAt: '2026-09-13T09:00:00.000Z' },
    { id: 'm2', direction: 'IN', subject: 'Re', body: 'Dienstag passt.', sentAt: '2026-09-13T10:00:00.000Z' },
  ],
  notes: [{ id: 'n1', body: 'Weiß genau, was sie wollen.', createdAt: '2026-09-13T09:30:00.000Z' }],
  events: [{ id: 'e1', kind: 'ARRIVED', detail: 'Contact form', createdAt: '2026-09-13T07:12:00.000Z' }],
  bookings: [],
  ...overrides,
})

const show = (preferences: Partial<InboxPreferences> = {}, detail = lead(), canSendMail = true) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LeadReadingPane
        lead={detail}
        preferences={{ ...DEFAULT_INBOX_PREFERENCES, ...preferences }}
        canSendMail={canSendMail}
        canReceiveMail
      />
    </QueryClientProvider>,
  )

describe('the reading pane with everything on', () => {
  it('shows the facts, the attachment, the thread, the notes, and the history', () => {
    show()

    expect(screen.getByText('Brandt & Söhne')).toBeTruthy()
    expect(screen.getByText(/briefing\.pdf/)).toBeTruthy()
    expect(screen.getByText('Passt Dienstag 10:00?')).toBeTruthy()
    expect(screen.getByText('Dienstag passt.')).toBeTruthy()
    expect(screen.getByText('Weiß genau, was sie wollen.')).toBeTruthy()
    expect(screen.getByText(/Arrived/)).toBeTruthy()
    expect(screen.getByPlaceholderText('Antwort schreiben…')).toBeTruthy()
  })

  it('offers all five stages, with the current one pressed', () => {
    show()

    expect(screen.getByRole('button', { name: 'New' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Won' }).getAttribute('aria-pressed')).toBe('false')
  })
})

/**
 * The point of the settings page: each switch has to actually take its piece
 * away. One test per switch, because a switch that is read but never used is
 * the kind of thing that ships unnoticed.
 */
describe('every switch removes what it names', () => {
  it('facts', () => {
    show({ facts: false })
    expect(screen.queryByText('Brandt & Söhne')).toBeNull()
  })

  it('attachment', () => {
    show({ attachment: false })
    expect(screen.queryByText(/briefing\.pdf/)).toBeNull()
  })

  it('thread', () => {
    show({ thread: false })
    expect(screen.queryByText('Passt Dienstag 10:00?')).toBeNull()
  })

  it('inbound keeps what was sent and hides what came back', () => {
    show({ inbound: false })
    expect(screen.getByText('Passt Dienstag 10:00?')).toBeTruthy()
    expect(screen.queryByText('Dienstag passt.')).toBeNull()
  })

  it('notes', () => {
    show({ notes: false })
    expect(screen.queryByText('Weiß genau, was sie wollen.')).toBeNull()
  })

  it('history', () => {
    show({ history: false })
    expect(screen.queryByText(/Arrived/)).toBeNull()
  })

  it('signature', () => {
    show({ signature: false })
    expect(screen.queryByText(/Digitale Systeme/)).toBeNull()
  })

  it('snippets', () => {
    show({ snippets: false })
    expect(screen.queryByRole('button', { name: 'Propose a call' })).toBeNull()
  })

  it('the language hint', () => {
    show({ languageHint: false })
    expect(screen.queryByText(/they wrote in it/)).toBeNull()
  })

  it('the junk button', () => {
    show({ junk: false })
    expect(screen.queryByRole('button', { name: /Junk/ })).toBeNull()
  })
})

describe('what the pane refuses to pretend', () => {
  it('says replies cannot be sent when mail is not configured', () => {
    show({}, lead(), false)

    const box = screen.getByPlaceholderText(/Email is not configured/) as HTMLTextAreaElement
    expect(box.disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Send reply/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('prompts, prefills and signs in the language the visitor wrote in', () => {
    show({}, lead({ language: 'ar' }))

    expect(screen.getByPlaceholderText('اكتب ردّك…')).toBeTruthy()
    // English on the button, Arabic in what it inserts.
    expect(screen.getByRole('button', { name: 'Ask about budget' })).toBeTruthy()
    expect(screen.getByText(/تحياتي/)).toBeTruthy()
  })

  it('lets what a person wrote choose its own direction', () => {
    // Not `rtl` from the lead's language: an Arabic budget on a German lead
    // was rendering its words in reverse. `auto` reads the value itself.
    show({}, lead({ language: 'ar', message: 'السلام عليكم، نريد نظام طلبات.' }))

    expect(screen.getByText('السلام عليكم، نريد نظام طلبات.').getAttribute('dir')).toBe('auto')
  })

  it('names the call this person booked', () => {
    show({}, lead({ bookings: [{ id: 'b1', label: 'Erstgespräch', startsAt: '2026-09-17T08:00:00.000Z', status: 'CONFIRMED' }] }))

    expect(screen.getByText(/Erstgespräch/)).toBeTruthy()
  })
})
