// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicBookingType, VisitorAppointment } from '#/backend2/contracts/booking.contract'
import { ApiRequestError } from '#/frontend/api/response'

/**
 * The public booking pages, where a visitor could lose what they typed, be
 * told nothing is free on the last day of a month, or get their first
 * appointment back after choosing a different time. Each case here failed
 * before its fix.
 */

const state = vi.hoisted(() => ({ language: 'en' as 'de' | 'en' | 'ar' }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, hash, params }: { children: ReactNode; to: string; hash?: string; params?: Record<string, string> }) => {
    const path = Object.entries(params ?? {}).reduce((acc, [key, value]) => acc.replace(`$${key}`, value), to)

    return <a href={`${path}${hash ? `#${hash}` : ''}`}>{children}</a>
  },
}))
vi.mock('#/frontend/i18n/language-provider', () => ({
  useLanguage: () => ({ language: state.language, isRtl: state.language === 'ar' }),
}))
vi.mock('#/frontend/motion', () => ({
  SplitWords: ({ text }: { text: string }) => <>{text}</>,
  useReveal: () => () => {},
  useTilt: () => () => {},
}))
vi.mock('#/frontend/features/security/TurnstileWidget', () => ({
  TurnstileWidget: ({ onTokenChange, resetKey }: { onTokenChange: (token: string | null) => void; resetKey: number }) => {
    useEffect(() => onTokenChange(`turnstile-${resetKey}`), [onTokenChange, resetKey])

    return null
  },
}))
vi.mock('#/frontend/features/booking/v2/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/frontend/features/booking/v2/api')>()),
  fetchTypes: vi.fn(),
  fetchSlots: vi.fn(),
  createBooking: vi.fn(),
  fetchAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
}))

const api = await import('#/frontend/features/booking/v2/api')
const { BookingFlowPageV2 } = await import('#/frontend/pages/public/booking/v2/BookingFlowPageV2')
const { BookingManagePageV2 } = await import('#/frontend/pages/public/booking/v2/BookingManagePageV2')
const { BookingTypesPageV2 } = await import('#/frontend/pages/public/booking/v2/BookingTypesPageV2')
const { getBookingV2Copy } = await import('#/frontend/features/booking/v2/booking-v2-copy')
const { detectTimezone, dayIn } = await import('#/frontend/features/booking/booking-time')
const { TURNSTILE_COPY } = await vi.importActual<typeof import('#/frontend/features/security/TurnstileWidget')>(
  '#/frontend/features/security/TurnstileWidget',
)

/* Monday 5 October 2026, unless a test is about the last day of a month. */
const NOW = new Date('2026-10-05T08:00:00.000Z')
const SLOT = '2026-10-07T08:00:00.000Z'
const SLOT_2 = '2026-10-08T12:00:00.000Z'

const TYPE: PublicBookingType = {
  slug: 'intro',
  name: 'Intro call',
  description: 'Get to know each other.',
  durationMinutes: 30,
  methods: ['video', 'in_person', 'phone'],
  defaultMethod: 'video',
}

let offered = [SLOT, SLOT_2]

/** The server's answer: the offered times in range, and — when there are none — the next day that has one. */
const slotsAnswer = async ({ from, days, timeZone }: { from: string; days: number; timeZone: string }) => {
  const dates = Array.from({ length: days }, (_, index) => new Date(Date.parse(`${from}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10))
  const inRange = offered.filter((slot) => dates.includes(dayIn(new Date(slot), timeZone)))
  const later = offered.map((slot) => dayIn(new Date(slot), timeZone)).filter((date) => date > dates.at(-1)!).sort()

  return {
    timeZone,
    days: dates.map((date) => ({
      date,
      slots: inRange
        .filter((slot) => dayIn(new Date(slot), timeZone) === date)
        .map((slot) => ({ startsAt: slot, endsAt: new Date(Date.parse(slot) + 30 * 60_000).toISOString(), localDate: date, localTime: '10:00' })),
    })),
    nextAvailableDate: inRange.length === 0 ? (later[0] ?? null) : null,
  }
}

const appointment = (overrides: Partial<VisitorAppointment> = {}): VisitorAppointment => ({
  reference: 'YW-7K3QM9PX',
  typeName: 'Intro call',
  typeSlug: 'intro',
  method: 'video',
  startsAt: SLOT,
  endsAt: '2026-10-07T08:30:00.000Z',
  status: 'confirmed',
  language: 'en',
  visitorName: 'Dana',
  canChange: true,
  changeDeadline: '2026-10-06T20:00:00.000Z',
  ...overrides,
})

const receipt = () => ({
  appointment: appointment(),
  manageUrl: 'https://yamanwarda.de/en/booking/manage/YW-7K3QM9PX#secret-credential',
  roomUrl: 'https://yamanwarda.de/en/booking/room/YW-7K3QM9PX#secret-credential',
  confirmationSent: true,
})

const refused = (code: string, status = 409) => new ApiRequestError({ message: code, code, status })

let client: QueryClient

const wrap = (node: ReactNode) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  state.language = 'en'
  offered = [SLOT, SLOT_2]
  vi.mocked(api.fetchTypes).mockResolvedValue([TYPE])
  vi.mocked(api.fetchSlots).mockImplementation(slotsAnswer)
  window.scrollTo = () => {}
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

const zone = () => detectTimezone()

/** Picks the day and the one time on it, then goes on to the details. */
const pick = async (slot: string) => {
  const day = await screen.findByRole('gridcell', { name: dayIn(new Date(slot), zone()) })

  await waitFor(() => expect((day as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(day)
  fireEvent.click(within(screen.getAllByRole('radiogroup').at(-1)!).getAllByRole('radio')[0]!)
  fireEvent.click(screen.getByRole('button', { name: 'Pick a time' }))
  await screen.findByLabelText('Name')
}

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } })

const value = (label: string) => (screen.getByLabelText(label, { exact: false }) as HTMLInputElement).value

const confirm = () => act(async () => fireEvent.click(screen.getByRole('button', { name: /confirm booking/i })))

const typeDetails = () => {
  fill('Name', 'Dana Example')
  fill('Email', 'dana@example.com')
  fill('What would you like to talk about', 'A new shop')
}

/* ------------------------------------------------ what the visitor typed */

describe('what the visitor typed', () => {
  it('is still there after the time was just taken and another is chosen', async () => {
    vi.mocked(api.createBooking).mockRejectedValue(refused('SLOT_UNAVAILABLE'))
    wrap(<BookingFlowPageV2 slug="intro" />)
    await pick(SLOT)
    typeDetails()
    await confirm()

    expect((await screen.findByRole('alert')).textContent).toMatch(/Someone took this time a moment ago/)
    await pick(SLOT_2)

    expect(value('Name')).toBe('Dana Example')
    expect(value('Email')).toBe('dana@example.com')
    expect(value('What would you like to talk about')).toBe('A new shop')
  })

  it('is still there after "Pick another time"', async () => {
    wrap(<BookingFlowPageV2 slug="intro" />)
    await pick(SLOT)
    typeDetails()

    fireEvent.click(screen.getByRole('button', { name: 'Pick another time' }))
    await pick(SLOT_2)

    expect(value('Name')).toBe('Dana Example')
    expect(value('What would you like to talk about')).toBe('A new shop')
  })

  it('stays on the form when a refresh no longer lists the time, and the booking answer says it was taken', async () => {
    vi.mocked(api.createBooking).mockRejectedValue(refused('SLOT_UNAVAILABLE'))
    wrap(<BookingFlowPageV2 slug="intro" />)
    await pick(SLOT)
    typeDetails()

    const asked = vi.mocked(api.fetchSlots).mock.calls.length

    offered = [SLOT_2]
    await act(() => client.invalidateQueries({ queryKey: ['booking-v2', 'slots'] }))
    await waitFor(() => expect(vi.mocked(api.fetchSlots).mock.calls.length).toBeGreaterThan(asked))

    // Still the form, still filled in — not silently back at the calendar.
    expect(value('Name')).toBe('Dana Example')
    await confirm()

    expect((await screen.findByRole('alert')).textContent).toMatch(/Someone took this time a moment ago/)
    expect(vi.mocked(api.createBooking).mock.calls[0]![0].startsAt).toBe(SLOT)
  })
})

/* ------------------------------------------------------ the submission id */

describe('the submission id', () => {
  it('is new for a different time, and the same when the visitor comes back to the first one', async () => {
    vi.mocked(api.createBooking)
      .mockRejectedValueOnce(refused('NETWORK', 0))
      .mockRejectedValueOnce(refused('NETWORK', 0))
      .mockResolvedValueOnce(receipt())
    wrap(<BookingFlowPageV2 slug="intro" />)

    await pick(SLOT)
    typeDetails()
    await confirm()
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be made/)

    fireEvent.click(screen.getByRole('button', { name: 'Pick another time' }))
    await pick(SLOT_2)
    await confirm()
    await waitFor(() => expect(api.createBooking).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: 'Pick another time' }))
    await pick(SLOT)
    await confirm()
    await screen.findByText('You are booked')

    const [first, second, third] = vi.mocked(api.createBooking).mock.calls.map(([input]) => input)

    expect(second!.startsAt).toBe(SLOT_2)
    expect(second!.submissionId).not.toBe(first!.submissionId)
    // The same time again may be the booking whose answer was lost: same id.
    expect(third!.submissionId).toBe(first!.submissionId)
  })

  it('is new for another way of meeting at the same time', async () => {
    vi.mocked(api.createBooking).mockRejectedValueOnce(refused('NETWORK', 0)).mockResolvedValueOnce(receipt())
    wrap(<BookingFlowPageV2 slug="intro" />)

    await pick(SLOT)
    typeDetails()
    await confirm()
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be made/)

    fireEvent.click(screen.getByRole('button', { name: 'Pick another time' }))
    fireEvent.click(screen.getByRole('radio', { name: /in person/i }))
    await pick(SLOT)
    await confirm()
    await screen.findByText(/We agree on the meeting place by email|You are booked/)

    const [first, second] = vi.mocked(api.createBooking).mock.calls.map(([input]) => input)

    expect(second!.method).toBe('in_person')
    expect(second!.submissionId).not.toBe(first!.submissionId)
  })
})

/* -------------------------------------------- the last day of a month */

describe('a month with nothing left', () => {
  it('opens the next month with times on the last day of a month', async () => {
    vi.setSystemTime(new Date('2026-09-30T08:00:00.000Z'))
    wrap(<BookingFlowPageV2 slug="intro" />)

    await screen.findByText('October 2026')
    await pick(SLOT)
    expect(screen.queryByText('Nothing is free this month.')).toBeNull()
  })

  it('stays where the visitor turns back to, and says it is empty', async () => {
    vi.setSystemTime(new Date('2026-09-30T08:00:00.000Z'))
    wrap(<BookingFlowPageV2 slug="intro" />)

    await screen.findByText('October 2026')
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))

    expect(await screen.findByText('Nothing is free this month.')).toBeTruthy()
    expect(screen.getByText('September 2026')).toBeTruthy()
  })

  it('opens this month, not the link’s old one, for an expired time link', async () => {
    wrap(<BookingFlowPageV2 slug="intro" slot="2026-09-20T08:00:00.000Z" />)

    await screen.findByText('October 2026')
    await pick(SLOT)
    expect(vi.mocked(api.fetchSlots).mock.calls.every(([input]) => input.from >= '2026-10-01')).toBe(true)
  })

  it('opens the next month with times when moving a booking on the last day of a month', async () => {
    vi.setSystemTime(new Date('2026-09-30T08:00:00.000Z'))
    vi.mocked(api.fetchAppointment).mockResolvedValue(appointment())
    wrap(<BookingManagePageV2 reference="YW-7K3QM9PX" token="secret" />)

    fireEvent.click(await screen.findByRole('button', { name: /move to another time/i }))
    await screen.findByText('October 2026')

    const day = await screen.findByRole('gridcell', { name: dayIn(new Date(SLOT_2), zone()) })

    await waitFor(() => expect((day as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByText('Nothing is free this month.')).toBeNull()
  })
})

/* ------------------------------------ the times offered for a move */

describe('the times offered for a move', () => {
  it('asks with the booking’s reference and credential, and still leaves its own time out', async () => {
    // Its own time now comes back in the list: SLOT is the booking itself.
    vi.mocked(api.fetchAppointment).mockResolvedValue(appointment())
    wrap(<BookingManagePageV2 reference="YW-7K3QM9PX" token="secret" />)

    fireEvent.click(await screen.findByRole('button', { name: /move to another time/i }))
    await waitFor(() => expect(api.fetchSlots).toHaveBeenCalled())

    for (const [input] of vi.mocked(api.fetchSlots).mock.calls) expect(input).toMatchObject({ reference: 'YW-7K3QM9PX', token: 'secret' })

    const own = await screen.findByRole('gridcell', { name: dayIn(new Date(SLOT), zone()) })
    const other = screen.getByRole('gridcell', { name: dayIn(new Date(SLOT_2), zone()) })

    await waitFor(() => expect((other as HTMLButtonElement).disabled).toBe(false))
    expect((own as HTMLButtonElement).disabled).toBe(true)
  })

  it('asks the booking page’s times without any reference or credential', async () => {
    wrap(<BookingFlowPageV2 slug="intro" />)
    await pick(SLOT)

    for (const [input] of vi.mocked(api.fetchSlots).mock.calls) {
      expect(input.reference).toBeUndefined()
      expect(input.token).toBeUndefined()
    }
  })

  it('sends the credential as a header, never in the address', async () => {
    const actual = await vi.importActual<typeof import('#/frontend/features/booking/v2/api')>('#/frontend/features/booking/v2/api')
    const fetchMock = vi.fn(async (..._: Parameters<typeof fetch>) =>
      new Response(JSON.stringify({ success: true, data: { timeZone: 'Europe/Berlin', days: [], nextAvailableDate: null } }), {
        headers: { 'content-type': 'application/json' },
      }),
    )

    vi.stubGlobal('fetch', fetchMock)

    try {
      const query = { slug: 'intro', method: 'video' as const, from: '2026-10-05', days: 14, timeZone: 'Europe/Berlin', language: 'en' as const }

      await actual.fetchSlots({ ...query, reference: 'YW-7K3QM9PX', token: 'secret-credential' })
      await actual.fetchSlots(query)

      const [moveUrl, moveInit] = fetchMock.mock.calls[0]!
      const [bookUrl, bookInit] = fetchMock.mock.calls[1]!

      expect(String(moveUrl)).toContain('reference=YW-7K3QM9PX')
      expect(String(moveUrl)).not.toContain('secret-credential')
      expect(new Headers(moveInit?.headers).get(actual.BOOKING_TOKEN_HEADER)).toBe('secret-credential')

      expect(String(bookUrl)).not.toContain('reference=')
      expect(new Headers(bookInit?.headers).has(actual.BOOKING_TOKEN_HEADER)).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

/* ---------------------------------------------------- the private page */

describe('moving a booking that changed meanwhile', () => {
  it('reads the booking again when the move is refused as a conflict', async () => {
    vi.mocked(api.fetchAppointment)
      .mockResolvedValueOnce(appointment())
      .mockResolvedValue(appointment({ status: 'cancelled', canChange: false }))
    vi.mocked(api.rescheduleAppointment).mockRejectedValue(refused('CONFLICT'))
    wrap(<BookingManagePageV2 reference="YW-7K3QM9PX" token="secret" />)

    fireEvent.click(await screen.findByRole('button', { name: /move to another time/i }))
    const day = await screen.findByRole('gridcell', { name: dayIn(new Date(SLOT_2), zone()) })

    await waitFor(() => expect((day as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(day)
    fireEvent.click(within(screen.getAllByRole('radiogroup').at(-1)!).getAllByRole('radio')[0]!)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /confirm new time/i })))

    expect(await screen.findByText('This booking was cancelled.')).toBeTruthy()
    expect(api.fetchAppointment).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('That did not work. Please try again.')).toBeNull()
  })
})

/* --------------------------------------------------------------- words */

describe('words', () => {
  it('says no appointments are offered, not that nothing is free this month, when there are no types', async () => {
    vi.mocked(api.fetchTypes).mockResolvedValue([])
    wrap(<BookingTypesPageV2 />)

    expect(await screen.findByText('No appointments can be booked online at the moment.')).toBeTruthy()
    expect(screen.queryByText('Nothing is free this month.')).toBeNull()

    for (const language of ['de', 'en', 'ar'] as const) expect(getBookingV2Copy(language).noTypes.length).toBeGreaterThan(10)
  })

  it('says "less than 1 hour", not "1 hours", in every language', async () => {
    const hours = (language: 'de' | 'en' | 'ar', count: number) => getBookingV2Copy(language).manage.deadlinePassed(count)

    expect(hours('en', 1)).toContain('less than 1 hour,')
    expect(hours('en', 12)).toContain('less than 12 hours,')
    expect(hours('de', 1)).toContain('weniger als einer Stunde ')
    expect(hours('de', 12)).toContain('weniger als 12 Stunden ')
    expect(hours('ar', 1)).toContain('أقل من ساعة،')
    expect(hours('ar', 2)).toContain('أقل من ساعتين،')
    expect(hours('ar', 6)).toContain('أقل من 6 ساعات،')
    expect(hours('ar', 12)).toContain('أقل من 12 ساعة،')

    vi.mocked(api.fetchAppointment).mockResolvedValue(
      appointment({ startsAt: '2026-10-05T08:45:00.000Z', endsAt: '2026-10-05T09:15:00.000Z', changeDeadline: '2026-10-05T07:45:00.000Z', canChange: false }),
    )
    wrap(<BookingManagePageV2 reference="YW-7K3QM9PX" token="secret" />)
    await screen.findByText(/starts in less than 1 hour, so/)
  })

  it('says "du" in the German security check', () => {
    for (const text of Object.values(TURNSTILE_COPY.de)) expect(text).not.toMatch(/\b(Sie|Ihnen|Ihre?)\b/u)
    expect(TURNSTILE_COPY.de.ready).toBe('Bitte schließ die Sicherheitsprüfung ab.')
  })
})
