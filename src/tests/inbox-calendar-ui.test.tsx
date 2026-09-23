// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { ConversationDetail } from '#/backend2/contracts/inbox.contract'
import type { AppointmentDetail } from '#/backend2/contracts/booking.contract'

/**
 * The Inbox conversation and the Calendar appointment screens, against a
 * faked API. The backend suites prove the rules; this proves the screens say
 * the truth about them — a blocked file is shown as blocked, a failed send
 * offers Retry, opening a conversation marks it read, and a cancellation is
 * not sent without the reason the visitor will read.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) => select({ location: { pathname: '/dashboard/inbox' } }),
}))

const inboxApi = {
  readConversation: vi.fn(),
  patchConversation: vi.fn(),
  trashConversation: vi.fn(),
  restoreConversation: vi.fn(),
  deleteConversation: vi.fn(),
  emptyTrash: vi.fn(),
  retryMessage: vi.fn(),
  saveAttachmentToMedia: vi.fn(),
  readMessageHtml: vi.fn(),
  createDraft: vi.fn(),
  listConversations: vi.fn(),
  readCounts: vi.fn(),
  listDrafts: vi.fn(),
  readSettings: vi.fn(),
  listSnippets: vi.fn(),
  discardDraft: vi.fn(),
  saveSettings: vi.fn(),
  createSnippet: vi.fn(),
  updateSnippet: vi.fn(),
  deleteSnippet: vi.fn(),
  readDraft: vi.fn(),
  saveDraft: vi.fn(),
  sendDraft: vi.fn(),
  attachmentUrl: (id: string) => `/api/v2/owner/inbox/attachments/${id}`,
}

vi.mock('#/frontend/features/inbox-v2/api', () => inboxApi)

const bookingApi = {
  readAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
  patchAppointment: vi.fn(),
  sendInvitation: vi.fn(),
  setOutcome: vi.fn(),
  joinVideo: vi.fn(),
  endVideo: vi.fn(),
  listAppointments: vi.fn(),
  listTypes: vi.fn(),
  createAppointment: vi.fn(),
  createType: vi.fn(),
  patchType: vi.fn(),
  deleteType: vi.fn(),
  readSettings: vi.fn(),
  saveSettings: vi.fn(),
  readAvailability: vi.fn(),
  saveAvailability: vi.fn(),
}

vi.mock('#/frontend/features/booking-v2/api', () => bookingApi)

const { ConversationPane } = await import('#/frontend/pages/dashboard/inbox/ConversationPane')
const { AppointmentDetailPanel } = await import('#/frontend/pages/dashboard/calendar/AppointmentDetailPanel')
const { textToParagraphs } = await import('#/frontend/features/inbox-v2/EmailEditor')
const berlin = await import('#/frontend/features/booking-v2/berlin')
const { dashboardNavigation } = await import('#/frontend/dashboard/dashboard-navigation')
const { ApiRequestError } = await import('#/frontend/api/response')

const wrap = (node: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

beforeEach(() => {
  for (const fn of [...Object.values(inboxApi), ...Object.values(bookingApi)]) if (typeof fn === 'function' && 'mockReset' in fn) (fn as ReturnType<typeof vi.fn>).mockReset()
})

afterEach(() => cleanup())

/* -------------------------------------------------------------- the inbox */

const conversation = (over: Partial<ConversationDetail['conversation']> = {}): ConversationDetail => ({
  conversation: {
    id: 'c1',
    subject: 'Relaunch',
    counterpartEmail: 'lena@example.com',
    counterpartName: 'Lena',
    origin: 'incoming',
    folder: 'inbox',
    isRead: false,
    isStarred: false,
    messageCount: 2,
    lastMessageAt: '2026-09-23T10:00:00Z',
    lastDirection: 'outgoing',
    lastPreview: '',
    hasFailedSend: true,
    hasDraft: false,
    trashedAt: null,
    facts: {},
    ...over,
  },
  messages: {
    items: [
      {
        id: 'm2',
        direction: 'outgoing',
        fromEmail: 'info@yamanwarda.de',
        fromName: 'Yaman Warda',
        toEmail: 'lena@example.com',
        toName: 'Lena',
        subject: 'Re: Relaunch',
        bodyText: 'Here is the offer',
        bodyDoc: null,
        hasHtml: false,
        occurredAt: '2026-09-23T10:00:00Z',
        delivery: { status: 'failed', provider: 'resend', failureReason: 'The email service did not answer in time.', attempts: 1, canRetry: true },
        incomingAttachments: [],
        outgoingAttachments: [],
        language: 'en',
      },
      {
        id: 'm1',
        direction: 'incoming',
        fromEmail: 'lena@example.com',
        fromName: 'Lena',
        toEmail: 'info@yamanwarda.de',
        toName: '',
        subject: 'Relaunch',
        bodyText: 'Hello Yaman',
        bodyDoc: null,
        hasHtml: false,
        occurredAt: '2026-09-23T09:00:00Z',
        delivery: null,
        incomingAttachments: [
          { id: 'f1', fileName: 'Briefing.pdf', contentType: 'application/pdf', byteSize: 2048, status: 'stored', failureReason: null, canSaveToMedia: true, saveToMediaUnavailableReason: null, savedMediaAssetId: null },
          { id: 'f2', fileName: 'viewer.exe', contentType: 'application/octet-stream', byteSize: 900, status: 'blocked', failureReason: 'Blocked for safety: this kind of file can run code. It was not kept.', canSaveToMedia: false, saveToMediaUnavailableReason: 'This file was not kept.', savedMediaAssetId: null },
        ],
        outgoingAttachments: [],
        language: null,
      },
    ],
    page: 1,
    pageSize: 20,
    total: 2,
    pageCount: 1,
    hasMore: false,
  },
  replyDraftId: null,
})

describe('a conversation', () => {
  it('reads oldest first, marks itself read, and shows a blocked file as blocked', async () => {
    inboxApi.readConversation.mockResolvedValue(conversation())
    inboxApi.patchConversation.mockResolvedValue({})

    wrap(<ConversationPane id="c1" backLabel="Inbox" onGone={() => {}} onOpenConversation={() => {}} />)

    const letters = await screen.findAllByRole('article')

    expect(letters[0].textContent).toContain('Hello Yaman')
    expect(letters[1].textContent).toContain('Here is the offer')
    await waitFor(() => expect(inboxApi.patchConversation).toHaveBeenCalledWith('c1', { isRead: true, isStarred: undefined, archived: undefined }))
    expect(screen.getByText(/Blocked for safety/u)).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /Download/u })).toHaveLength(1)
  })

  it('retries a failed send and saves a file to Media only when asked', async () => {
    inboxApi.readConversation.mockResolvedValue(conversation({ isRead: true }))
    inboxApi.retryMessage.mockResolvedValue({})
    inboxApi.saveAttachmentToMedia.mockResolvedValue({ asset: { displayName: 'Briefing.pdf' }, alreadySaved: false })

    wrap(<ConversationPane id="c1" backLabel="Inbox" onGone={() => {}} onOpenConversation={() => {}} />)

    expect(await screen.findByText(/Retrying is safe/u)).toBeTruthy()
    expect(inboxApi.saveAttachmentToMedia).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(inboxApi.retryMessage.mock.calls[0]?.[0]).toBe('m2'))

    fireEvent.click(screen.getByRole('button', { name: /Save to Media/u }))
    await waitFor(() => expect(inboxApi.saveAttachmentToMedia.mock.calls[0]?.[0]).toBe('f1'))
  })

  it('offers Restore and Delete forever in Trash, and no reply box', async () => {
    inboxApi.readConversation.mockResolvedValue(conversation({ folder: 'trash', isRead: true, trashedAt: '2026-09-23T11:00:00Z' }))

    wrap(<ConversationPane id="c1" backLabel="Trash" onGone={() => {}} onOpenConversation={() => {}} />)

    expect(await screen.findByRole('button', { name: /Restore/u })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Delete forever/u })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Reply to/u })).toBeNull()
  })

  it('says so when the conversation cannot load', async () => {
    inboxApi.readConversation.mockRejectedValue(new ApiRequestError({ message: 'That conversation does not exist', code: 'NOT_FOUND', status: 404 }))

    wrap(<ConversationPane id="c1" backLabel="Inbox" onGone={() => {}} onOpenConversation={() => {}} />)

    expect((await screen.findByRole('alert')).textContent).toContain('could not be opened')
  })
})

/* ----------------------------------------------------------- the calendar */

const appointment = (over: Partial<AppointmentDetail> = {}): AppointmentDetail => ({
  id: 'a1',
  reference: 'YW-ABCDEFGH',
  typeId: 't1',
  typeName: 'Intro call',
  method: 'video',
  startsAt: '2099-10-06T08:00:00Z',
  endsAt: '2099-10-06T08:30:00Z',
  status: 'confirmed',
  source: 'public',
  outsideHours: false,
  visitorName: 'Daniel',
  visitorEmail: 'daniel@example.com',
  language: 'en',
  reminderState: 'pending',
  inboxConversationId: 'c9',
  invitationSentAt: null,
  visitorPhone: null,
  visitorTimeZone: 'Europe/Berlin',
  company: '',
  subject: 'software',
  budget: null,
  note: '',
  durationMinutes: 30,
  bufferMinutes: 0,
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
  reminderDueAt: '2099-10-05T08:00:00Z',
  reminderSentAt: null,
  videoEndedAt: null,
  revision: 1,
  history: [{ at: '2026-09-23T10:00:00Z', actor: 'visitor', kind: 'created', details: {} }],
  ...over,
})

describe('an appointment', () => {
  it('shows Berlin time, the Inbox link, and keeps Completed off before the start', async () => {
    bookingApi.readAppointment.mockResolvedValue(appointment())

    wrap(<AppointmentDetailPanel id="a1" onBack={() => {}} />)

    expect(await screen.findByText(/10:00 – 10:30 Berlin/u)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Open conversation in Inbox/u })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Completed' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Booked by the visitor')).toBeTruthy()
  })

  it('will not cancel without the reason the visitor reads', async () => {
    bookingApi.readAppointment.mockResolvedValue(appointment())
    bookingApi.cancelAppointment.mockResolvedValue(appointment({ status: 'cancelled' }))

    wrap(<AppointmentDetailPanel id="a1" onBack={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel appointment' }))

    expect(await screen.findByText(/Give a reason/u)).toBeTruthy()
    expect(bookingApi.cancelAppointment).not.toHaveBeenCalled()

    fireEvent.change(document.getElementById('cancel-reason')!, { target: { value: 'I am ill' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel appointment' }))

    await waitFor(() => expect(bookingApi.cancelAppointment).toHaveBeenCalledWith('a1', { id: 'a1', reason: 'I am ill', notify: true }))
  })
})

/* ------------------------------------------------------------------ helpers */

describe('helpers', () => {
  it('turns plain text into paragraphs with line breaks', () => {
    expect(textToParagraphs('Best\nYaman\n\nyamanwarda.de')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Best' }, { type: 'hardBreak' }, { type: 'text', text: 'Yaman' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'yamanwarda.de' }] },
    ])
  })

  it('converts Berlin wall-clock time both ways, and knows the Monday', () => {
    expect(berlin.berlinInstant('2026-07-01', '09:00')).toBe('2026-07-01T07:00:00.000Z')
    expect(berlin.berlinInstant('2026-03-29', '02:30')).toBeNull()
    expect(berlin.berlin('2026-01-15T08:00:00Z').time).toBe('09:00')
    expect(berlin.mondayOf('2026-09-27')).toBe('2026-09-21')
  })

  it('puts the unread count beside Inbox', () => {
    expect(dashboardNavigation.find((item) => item.label === 'Inbox')?.count).toBe('inboxUnread')
  })
})
