// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppointmentDetail, AppointmentSummary, BookingType } from '#/backend2/contracts/booking.contract'

/**
 * The Calendar's forms and week, against a faked API. An empty day or time
 * must be asked for — never saved as midnight, never a stuck Save button —
 * the first wrong field takes the focus, the week never hides a live
 * appointment under a cancelled one, and a toast never claims an email that
 * was not sent.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}))

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
vi.mock('@cloudflare/realtimekit', async () => (await import('./helpers/fake-realtimekit')).fakeRealtimeKitModule())

const { AppointmentDetailPanel } = await import('#/frontend/pages/dashboard/calendar/AppointmentDetailPanel')
const { ManualAppointmentDrawer } = await import('#/frontend/pages/dashboard/calendar/ManualAppointmentDrawer')
const { HoursTab } = await import('#/frontend/pages/dashboard/calendar/HoursTab')
const { CalendarPage } = await import('#/frontend/pages/dashboard/calendar/CalendarPage')
const berlin = await import('#/frontend/features/booking-v2/berlin')
const { dismissNotice, getNotices } = await import('#/frontend/lib/notify')

const wrap = (node: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

const lastNotice = () => getNotices().at(-1)?.message

const TYPE: BookingType = {
  id: 't1',
  slug: 'intro',
  position: 1,
  enabled: true,
  durationMinutes: 30,
  bufferMinutes: 0,
  slotStepMinutes: 30,
  methods: ['video', 'phone'],
  texts: { de: { name: 'Erstgespräch', description: '' }, en: { name: 'Intro call', description: '' }, ar: { name: 'مكالمة', description: '' } },
  enableBlockers: [],
  upcomingCount: 0,
  updatedAt: '2026-09-23T10:00:00Z',
}

const SETTINGS = { minNoticeMinutes: 1440, windowDays: 60, changeLimitHours: 12, reminderMinutes: 1440, timeZone: 'Europe/Berlin' as const }

const page = <T,>(items: T[]) => ({ items, page: 1, pageSize: 100, total: items.length, pageCount: 1, hasMore: false })

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
  subject: null,
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

beforeEach(() => {
  for (const fn of Object.values(bookingApi)) fn.mockReset()
  for (const notice of getNotices()) dismissNotice(notice.id)
  bookingApi.listTypes.mockResolvedValue(page([TYPE]))
  bookingApi.readAvailability.mockResolvedValue({ weekly: [{ weekday: 1, startMinute: 540, endMinute: 1020 }], exceptions: [] })
  bookingApi.readSettings.mockResolvedValue(SETTINGS)
})

afterEach(() => cleanup())

const invalid = (element: HTMLElement) => element.getAttribute('aria-invalid') === 'true'

/* ---------------------------------------------------------------- helpers */

describe('Berlin time from what was typed', () => {
  it('reads nothing from an empty or half-typed day or time, and never throws', () => {
    expect(berlin.berlinInstant('', '10:00')).toBeNull()
    expect(berlin.berlinInstant('2026-10-07', '')).toBeNull()
    expect(berlin.berlinInstant('2026-10-07', '9:30')).toBeNull()
    expect(berlin.berlinInstant('2026-10-07', '24:00')).toBeNull()
    expect(berlin.berlinInstant('2026-10-07', '10:00')).toBe('2026-10-07T08:00:00.000Z')

    expect(berlin.textMinute('')).toBeNull()
    expect(berlin.textMinute('12:60')).toBeNull()
    expect(berlin.textMinute('24:00')).toBeNull()
    expect(berlin.textMinute('00:00')).toBe(0)
    expect(berlin.textMinute('09:30')).toBe(570)
    expect(berlin.textMinute('23:59')).toBe(1439)
  })
})

/* ------------------------------------------------------- new appointment */

describe('a new appointment', () => {
  const open = async () => {
    wrap(<ManualAppointmentDrawer onClose={() => {}} onCreated={() => {}} />)
    await screen.findByRole('option', { name: /Intro call/u })
    fireEvent.change(screen.getByLabelText(/^Name/u), { target: { value: 'Lena' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'lena@example.com' } })
  }

  const save = () => act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save only' })))

  it('asks for an empty day and time next to them, focuses the day, and keeps both buttons usable', async () => {
    await open()
    fireEvent.change(screen.getByLabelText(/^Day/u), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText(/^Time \(Berlin\)/u), { target: { value: '' } })
    await save()

    expect(await screen.findByText('Choose a day')).toBeTruthy()
    expect(screen.getByText('Choose a time')).toBeTruthy()

    const day = screen.getByLabelText(/^Day/u)

    expect(invalid(day)).toBe(true)
    expect(day.getAttribute('aria-describedby')).toBe('m-date-err')
    expect(document.getElementById('m-date-err')?.textContent).toBe('Choose a day')
    await waitFor(() => expect(document.activeElement).toBe(day))
    expect(bookingApi.createAppointment).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Save only' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: /Save & send invitation/u }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('never saves an empty time as midnight', async () => {
    await open()
    fireEvent.change(screen.getByLabelText(/^Time \(Berlin\)/u), { target: { value: '' } })
    await save()

    expect(await screen.findByText('Choose a time')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^Time \(Berlin\)/u)))
    expect(bookingApi.createAppointment).not.toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------ move/cancel */

describe('moving and cancelling', () => {
  const openMove = async (over: Partial<AppointmentDetail> = {}) => {
    bookingApi.readAppointment.mockResolvedValue(appointment(over))
    bookingApi.patchAppointment.mockResolvedValue(appointment(over))
    wrap(<AppointmentDetailPanel id="a1" onBack={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Move…' }))

    return screen.getByRole('dialog', { name: 'Move to another time' })
  }

  const move = () => act(async () => fireEvent.click(screen.getByRole('button', { name: 'Move' })))

  it('asks for an empty day or time instead of moving to midnight or getting stuck', async () => {
    const dialog = await openMove()
    const day = within(dialog).getByLabelText(/^Day/u)
    const time = within(dialog).getByLabelText(/^Time \(Berlin\)/u)

    fireEvent.change(time, { target: { value: '' } })
    await move()

    expect(await within(dialog).findByText('Choose a time')).toBeTruthy()
    expect(invalid(time)).toBe(true)
    await waitFor(() => expect(document.activeElement).toBe(time))

    fireEvent.change(day, { target: { value: '' } })
    await move()

    expect(await within(dialog).findByText('Choose a day')).toBeTruthy()
    expect(invalid(day)).toBe(true)
    expect(day.getAttribute('aria-describedby')).toBe('move-date-err')
    await waitFor(() => expect(document.activeElement).toBe(day))
    expect(bookingApi.patchAppointment).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Move' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('says nothing changed for the same time, and saves and emails nothing', async () => {
    await openMove()
    await move()

    await waitFor(() => expect(lastNotice()).toBe('Nothing changed.'))
    expect(bookingApi.patchAppointment).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Move to another time' })).toBeNull()
  })

  it('says the visitor was emailed only when they were told about the appointment', async () => {
    const dialog = await openMove()

    fireEvent.change(within(dialog).getByLabelText(/^Day/u), { target: { value: '2099-10-07' } })
    await move()

    await waitFor(() => expect(lastNotice()).toBe('Moved. Daniel has been emailed the new time.'))
    expect(bookingApi.patchAppointment).toHaveBeenCalledWith('a1', { revision: 1, startsAt: '2099-10-07T08:00:00.000Z', notify: true })
  })

  it('offers no email and says none went out for a manual appointment never invited', async () => {
    const dialog = await openMove({ source: 'manual', invitationSentAt: null })

    expect(within(dialog).queryByRole('checkbox')).toBeNull()
    fireEvent.change(within(dialog).getByLabelText(/^Day/u), { target: { value: '2099-10-07' } })
    await move()

    await waitFor(() => expect(lastNotice()).toBe('Moved. No email was sent — they were never invited.'))
    expect(bookingApi.patchAppointment).toHaveBeenCalledWith('a1', { revision: 1, startsAt: '2099-10-07T08:00:00.000Z', notify: false })
  })

  it('cancels a manual appointment never invited without claiming an email', async () => {
    bookingApi.readAppointment.mockResolvedValue(appointment({ source: 'manual', invitationSentAt: null }))
    bookingApi.cancelAppointment.mockResolvedValue(appointment({ status: 'cancelled' }))
    wrap(<AppointmentDetailPanel id="a1" onBack={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel…' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel this appointment?' })

    expect(within(dialog).queryByRole('checkbox')).toBeNull()
    fireEvent.change(document.getElementById('cancel-reason')!, { target: { value: 'Plans changed' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel appointment' })))

    await waitFor(() => expect(lastNotice()).toBe('Cancelled. No email was sent — they were never invited.'))
    expect(bookingApi.cancelAppointment).toHaveBeenCalledWith('a1', { id: 'a1', reason: 'Plans changed', notify: false })
  })

  it('still offers the email and says it went out for an invited manual appointment', async () => {
    bookingApi.readAppointment.mockResolvedValue(appointment({ source: 'manual', invitationSentAt: '2026-09-23T10:00:00Z' }))
    bookingApi.cancelAppointment.mockResolvedValue(appointment({ status: 'cancelled' }))
    wrap(<AppointmentDetailPanel id="a1" onBack={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel…' }))
    expect(screen.getByRole('checkbox', { name: /Email Daniel the cancellation/u })).toBeTruthy()
    fireEvent.change(document.getElementById('cancel-reason')!, { target: { value: 'Plans changed' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel appointment' })))

    await waitFor(() => expect(lastNotice()).toBe('Cancelled. Daniel has been emailed.'))
  })
})

/* ------------------------------------------------------ hours and limits */

describe('hours and limits', () => {
  it('asks for an empty opening time instead of opening from midnight, and focuses it', async () => {
    wrap(<HoursTab />)

    const start = await screen.findByLabelText('Monday, range 1 start')
    const end = screen.getByLabelText('Monday, range 1 end')

    fireEvent.change(start, { target: { value: '' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save hours' })))

    expect(await screen.findByText('Enter a start and an end time')).toBeTruthy()
    expect(invalid(start)).toBe(true)
    expect(invalid(end)).toBe(false)
    expect(start.getAttribute('aria-describedby')).toBe('weekly-0-err')
    await waitFor(() => expect(document.activeElement).toBe(start))
    expect(bookingApi.saveAvailability).not.toHaveBeenCalled()
  })

  it('marks both times of a range that ends before it starts', async () => {
    wrap(<HoursTab />)

    const start = await screen.findByLabelText('Monday, range 1 start')

    fireEvent.change(start, { target: { value: '18:00' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save hours' })))

    expect(await screen.findByText('Each range must end after it starts')).toBeTruthy()
    expect(invalid(start)).toBe(true)
    expect(invalid(screen.getByLabelText('Monday, range 1 end'))).toBe(true)
    await waitFor(() => expect(document.activeElement).toBe(start))
  })

  it('says an exception needs a date next to it', async () => {
    wrap(<HoursTab />)

    fireEvent.click(await screen.findByRole('button', { name: /Add exception/u }))
    const date = screen.getByLabelText('Date')

    fireEvent.change(date, { target: { value: '' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save hours' })))

    expect(await screen.findByText('Choose a date')).toBeTruthy()
    expect(invalid(date)).toBe(true)
    await waitFor(() => expect(document.activeElement).toBe(date))
    expect(bookingApi.saveAvailability).not.toHaveBeenCalled()
  })

  it('marks and focuses a limit outside the allowed range', async () => {
    bookingApi.readSettings.mockResolvedValue({ ...SETTINGS, windowDays: 999 })
    wrap(<HoursTab />)

    const window = await screen.findByLabelText(/^Booking window/u)

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save limits' })))

    expect(await screen.findByText('That value is outside the allowed range')).toBeTruthy()
    expect(invalid(window)).toBe(true)
    expect(window.getAttribute('aria-describedby')).toBe('windowDays-err')
    await waitFor(() => expect(document.activeElement).toBe(window))
    expect(bookingApi.saveSettings).not.toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------ week */

describe('the week', () => {
  it('leaves a cancelled appointment out of the grid, so it cannot cover the live one at its time', async () => {
    const date = berlin.addDays(berlin.mondayOf(berlin.berlinToday()), 2)
    const startsAt = berlin.berlinInstant(date, '10:00')!
    const endsAt = berlin.berlinInstant(date, '10:30')!
    const summary = (over: Partial<AppointmentSummary>): AppointmentSummary => ({
      id: 'x',
      reference: 'YW-X',
      typeId: 't1',
      typeName: 'Intro call',
      method: 'video',
      startsAt,
      endsAt,
      status: 'confirmed',
      source: 'public',
      outsideHours: false,
      visitorName: '',
      visitorEmail: 'x@example.com',
      language: 'en',
      reminderState: 'pending',
      inboxConversationId: null,
      invitationSentAt: null,
      ...over,
    })

    bookingApi.listAppointments.mockResolvedValue(
      page([summary({ id: 'gone', visitorName: 'Omar', status: 'cancelled' }), summary({ id: 'live', visitorName: 'Lena' })]),
    )
    wrap(<CalendarPage />)

    const week = await screen.findByRole('grid', { name: 'Week' })

    await within(week).findByText('Lena')
    expect(within(week).queryByText('Omar')).toBeNull()
    expect(within(week).getByRole('gridcell', { name: `${berlin.dayHeading(date)}, 1 appointment` })).toBeTruthy()
    // The list under the week still has it.
    expect(screen.getByText('Omar')).toBeTruthy()
  })
})
