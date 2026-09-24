// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOOKING_LIMITS,
  BUDGET_CHOICES,
  CANCEL_REASONS,
  MANAGE_TOKEN_HEADER,
  SUBJECT_CHOICES,
  type PublicBookingType,
  type VisitorAppointment,
} from '#/backend2/contracts/booking.contract'
import { ApiRequestError } from '#/frontend/api/response'

/**
 * Public cutover step 5: the booking pages behind the switch.
 *
 * With the switch on they talk to Backend2 and follow the approved lab: how
 * to meet before the time with video chosen, the phone only for a phone call,
 * a time just taken, a success page per way of meeting and for a failed
 * email, the private page with its deadline and five reasons, and a video
 * room that waits honestly instead of faking a call. The home band quotes
 * times from whichever backend the switch names.
 */

const state = vi.hoisted(() => ({ language: 'en' as 'de' | 'en' | 'ar', v2: true, camera: 'ready' as 'ready' | 'failed' }))

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
vi.mock('#/frontend/features/booking/server/booking-source', () => ({
  fetchBookingSource: vi.fn(async () => ({ v2: state.v2 })),
  bookingSourceQuery: () => ({ queryKey: ['public-source', 'booking'], queryFn: async () => ({ v2: state.v2 }), staleTime: Infinity }),
}))
vi.mock('#/frontend/features/call/use-media', () => ({
  useMedia: () => ({
    status: state.camera,
    error: state.camera === 'failed' ? 'denied' : null,
    stream: state.camera === 'failed' ? null : { getVideoTracks: () => [{}], getAudioTracks: () => [{}] },
    stop: () => {},
  }),
}))
vi.mock('#/frontend/features/booking/v2/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/frontend/features/booking/v2/api')>()),
  fetchTypes: vi.fn(),
  fetchSlots: vi.fn(),
  createBooking: vi.fn(),
  fetchAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
  videoPreflight: vi.fn(),
  videoJoin: vi.fn(),
}))
vi.mock('#/frontend/api/booking.api', () => ({ fetchBookingTypes: vi.fn(), fetchSlots: vi.fn() }))

const api = await import('#/frontend/features/booking/v2/api')
const legacyApi = await import('#/frontend/api/booking.api')
const { BookingFlowPageV2 } = await import('#/frontend/pages/public/booking/v2/BookingFlowPageV2')
const { BookingManagePageV2 } = await import('#/frontend/pages/public/booking/v2/BookingManagePageV2')
const { BookingRoomPageV2, countdown } = await import('#/frontend/pages/public/booking/v2/BookingRoomPageV2')
const { BookingBand } = await import('#/frontend/features/booking/BookingBand')
const { CANCEL_REASON_KEYS } = await import('#/frontend/features/booking/v2/booking-v2-copy')
const { BOOKING_FORM_LIMITS } = await import('#/frontend/features/booking/v2/BookingFormV2')
const { MAX_SLOT_DAYS, slotChunks } = await import('#/frontend/features/booking/v2/queries')
const { getContent } = await import('#/frontend/content')
const { detectTimezone, dayIn } = await import('#/frontend/features/booking/booking-time')

/* The calendar opens on "today", so today is fixed: Monday 5 October 2026. */
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

const slotFor = (startsAt: string, timeZone: string) => ({
  startsAt,
  endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(),
  localDate: dayIn(new Date(startsAt), timeZone),
  localTime: '10:00',
})

const slotsAnswer = async ({ from, days, timeZone }: { from: string; days: number; timeZone: string }) => {
  const dates = Array.from({ length: days }, (_, index) => new Date(Date.parse(`${from}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10))

  return {
    timeZone,
    days: dates.map((date) => ({
      date,
      slots: [SLOT, SLOT_2].filter((slot) => dayIn(new Date(slot), timeZone) === date).map((slot) => slotFor(slot, timeZone)),
    })),
    nextAvailableDate: null,
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

const receipt = (method: VisitorAppointment['method'], confirmationSent = true) => ({
  appointment: appointment({ method }),
  manageUrl: 'https://yamanwarda.de/en/booking/manage/YW-7K3QM9PX#secret-credential',
  roomUrl: method === 'video' ? 'https://yamanwarda.de/en/booking/room/YW-7K3QM9PX#secret-credential' : null,
  confirmationSent,
})

const refused = (code: string, status = 409) => new ApiRequestError({ message: code, code, status })

const wrap = (node: ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  state.language = 'en'
  state.v2 = true
  state.camera = 'ready'
  vi.mocked(api.fetchTypes).mockResolvedValue([TYPE])
  vi.mocked(api.fetchSlots).mockImplementation(slotsAnswer)
  window.scrollTo = () => {}
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

/* ------------------------------------------------------------------ rules */

describe('copies that must equal the contract', () => {
  it('keeps the reasons, header, limits and choices in step', () => {
    expect([...CANCEL_REASON_KEYS]).toEqual([...CANCEL_REASONS])
    expect(api.BOOKING_TOKEN_HEADER).toBe(MANAGE_TOKEN_HEADER)
    expect(MAX_SLOT_DAYS).toBe(BOOKING_LIMITS.maxSlotDays)

    for (const key of Object.keys(BOOKING_FORM_LIMITS) as Array<keyof typeof BOOKING_FORM_LIMITS>) {
      expect(BOOKING_FORM_LIMITS[key]).toBe(BOOKING_LIMITS[key])
    }

    for (const language of ['de', 'en', 'ar'] as const) {
      const { form } = getContent(language).contact

      expect(form.projectTypes.map((option) => option.value)).toEqual([...SUBJECT_CHOICES])
      expect(form.budgets.map((option) => option.value)).toEqual([...BUDGET_CHOICES])
    }
  })

  it('asks a month in pieces the server accepts', () => {
    expect(slotChunks('2026-10-01', '2026-10-31')).toEqual([
      { from: '2026-10-01', days: 14 },
      { from: '2026-10-15', days: 14 },
      { from: '2026-10-29', days: 3 },
    ])
    expect(slotChunks('2026-10-30', '2026-10-31')).toEqual([{ from: '2026-10-30', days: 2 }])
  })

  it('reads the credential from both link shapes', () => {
    expect(api.readFragmentToken('#abc123')).toBe('abc123')
    expect(api.readFragmentToken('#token=legacy%2Btoken')).toBe('legacy+token')
    expect(api.readFragmentToken('')).toBe('')
  })

  it('downloads a V2 page only when asked, then renders it without waiting', async () => {
    const { lazyPage } = await import('#/frontend/features/booking/v2/lazy-page')
    const load = vi.fn(async () => ({ word }: { word: string }) => <p>{word}</p>)
    const page = lazyPage(load)

    expect(load).not.toHaveBeenCalled()
    wrap(<page.Page word="late" />)
    expect(await screen.findByText('late')).toBeTruthy()
    cleanup()

    await page.preload()
    wrap(<page.Page word="ready" />)
    // Already here: no suspended first frame.
    expect(screen.getByText('ready')).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('counts down in minutes, then hours', () => {
    expect(countdown(760_000)).toBe('12:40')
    expect(countdown(3_723_000)).toBe('1:02:03')
    expect(countdown(-5)).toBe('00:00')
  })
})

/* ---------------------------------------------------------------- booking */

const toDetails = async (method?: RegExp) => {
  wrap(<BookingFlowPageV2 slug="intro" />)

  const video = await screen.findByRole('radio', { name: /video call/i })

  expect(video.getAttribute('aria-checked')).toBe('true')
  if (method) fireEvent.click(screen.getByRole('radio', { name: method }))

  const day = await screen.findByRole('gridcell', { name: dayIn(new Date(SLOT), detectTimezone()) })

  await waitFor(() => expect((day as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(day)
  fireEvent.click(within(screen.getAllByRole('radiogroup').at(-1)!).getAllByRole('radio')[0]!)
  fireEvent.click(screen.getByRole('button', { name: 'Pick a time' }))
  await screen.findByLabelText('Name')
}

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } })

const confirm = () => act(async () => fireEvent.click(screen.getByRole('button', { name: /confirm booking/i })))

describe('booking with the switch on', () => {
  it('asks how to meet first, with video chosen, and no phone for a video call', async () => {
    await toDetails()

    expect(screen.queryByLabelText('Phone', { exact: false })).toBeNull()
    expect(screen.getByLabelText('What is it about', { exact: false })).toBeTruthy()
    expect(screen.getByLabelText('Budget range', { exact: false })).toBeTruthy()
    expect(screen.queryByLabelText('Timeline', { exact: false })).toBeNull()
    expect(screen.getByRole('link', { name: 'Privacy policy' }).getAttribute('href')).toBe('/en/datenschutz')
  })

  it('checks on the first press, focuses the first wrong field, then books a video call once', async () => {
    vi.mocked(api.createBooking).mockResolvedValue(receipt('video'))
    await toDetails()

    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0)
    await confirm()
    await waitFor(() => expect(document.getElementById('booking-name')?.getAttribute('aria-invalid')).toBe('true'))
    expect(document.getElementById('booking-email')?.getAttribute('aria-invalid')).toBe('true')
    await waitFor(() => expect(document.activeElement?.id).toBe('booking-name'))
    expect(api.createBooking).not.toHaveBeenCalled()

    fill('Name', 'Dana Example')
    fill('Email', 'dana@example.com')
    fireEvent.change(screen.getByLabelText('What is it about', { exact: false }), { target: { value: 'website' } })
    await confirm()

    await screen.findByText('You are booked')
    expect(api.createBooking).toHaveBeenCalledTimes(1)

    const sent = vi.mocked(api.createBooking).mock.calls[0]![0]

    expect(sent).toMatchObject({
      typeSlug: 'intro',
      method: 'video',
      startsAt: SLOT,
      language: 'en',
      name: 'Dana Example',
      email: 'dana@example.com',
      phone: '',
      subject: 'website',
      budget: null,
      website: '',
    })
    expect(sent.submissionId).toMatch(/^[0-9a-f-]{36}$/u)
    expect(sent.timeZone).toBe(detectTimezone())
    expect(screen.getByText(/A confirmation is on its way/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /open the call page/i }).getAttribute('href')).toBe('/en/booking/room/YW-7K3QM9PX#secret-credential')
    expect(screen.getByText('YW-7K3QM9PX')).toBeTruthy()
    // The private link stays on this site and keeps the credential in the fragment.
    expect(screen.getAllByRole('link').some((link) => link.getAttribute('href') === '/en/booking/manage/YW-7K3QM9PX#secret-credential')).toBe(true)
  })

  it('needs a phone number only for a phone call, and says it will call that number', async () => {
    vi.mocked(api.createBooking).mockResolvedValue(receipt('phone'))
    await toDetails(/phone call/i)

    fill('Name', 'Dana')
    fill('Email', 'dana@example.com')
    await confirm()
    await waitFor(() => expect(document.getElementById('booking-phone')?.getAttribute('aria-invalid')).toBe('true'))
    expect(screen.getByText('Enter a phone number for a phone call.')).toBeTruthy()

    fill('Phone', '+49 170 1234567')
    await confirm()

    await screen.findByText(
      (_, element) => element?.tagName === 'P' && /I will call you at the scheduled time on \+49 170 1234567\.$/u.test(element.textContent ?? ''),
    )
    expect(document.querySelector('bdi[dir="ltr"]')?.textContent).toBe('+49 170 1234567')
    expect(vi.mocked(api.createBooking).mock.calls[0]![0]).toMatchObject({ method: 'phone', phone: '+49 170 1234567' })
    expect(screen.queryByRole('link', { name: /open the call page/i })).toBeNull()
  })

  it('says the place is agreed by email for an in-person meeting', async () => {
    vi.mocked(api.createBooking).mockResolvedValue(receipt('in_person'))
    await toDetails(/in person/i)
    fill('Name', 'Dana')
    fill('Email', 'dana@example.com')
    await confirm()

    await screen.findByText(/We agree on the meeting place by email/)
  })

  it('keeps the booking and the link when the confirmation email failed', async () => {
    vi.mocked(api.createBooking).mockResolvedValue(receipt('video', false))
    await toDetails()
    fill('Name', 'Dana')
    fill('Email', 'dana@example.com')
    await confirm()

    expect((await screen.findByRole('status')).textContent).toMatch(/could not be sent just now/)
    expect(screen.queryByText(/A confirmation is on its way/)).toBeNull()
  })

  it('goes back to the times, refreshed, when the time was just taken', async () => {
    vi.mocked(api.createBooking).mockRejectedValue(refused('SLOT_UNAVAILABLE'))
    await toDetails()
    const asked = vi.mocked(api.fetchSlots).mock.calls.length

    fill('Name', 'Dana')
    fill('Email', 'dana@example.com')
    await confirm()

    expect((await screen.findByRole('alert')).textContent).toMatch(/Someone took this time a moment ago/)
    expect(screen.getByRole('radio', { name: /video call/i })).toBeTruthy()
    await waitFor(() => expect(vi.mocked(api.fetchSlots).mock.calls.length).toBeGreaterThan(asked))
  })

  it('retries with the same submission id, so a lost answer never books twice', async () => {
    vi.mocked(api.createBooking).mockRejectedValueOnce(refused('NETWORK', 0)).mockResolvedValueOnce(receipt('video'))
    await toDetails()
    fill('Name', 'Dana')
    fill('Email', 'dana@example.com')

    await confirm()
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be made/)
    await confirm()
    await screen.findByText('You are booked')

    const [first, second] = vi.mocked(api.createBooking).mock.calls.map(([input]) => input)

    expect(second!.submissionId).toBe(first!.submissionId)
  })

  it('shows a field the server refused next to that field', async () => {
    vi.mocked(api.createBooking).mockRejectedValue(
      new ApiRequestError({ message: 'x', code: 'VALIDATION_ERROR', status: 422, details: { issues: [{ field: 'email', message: 'x' }] } }),
    )
    await toDetails()
    fill('Name', 'Dana')
    fill('Email', 'dana@example.com')
    await confirm()

    await waitFor(() => expect(document.getElementById('booking-email')?.getAttribute('aria-invalid')).toBe('true'))
  })
})

/* ------------------------------------------------------------ manage link */

describe('the private page', () => {
  it('shows the time in the visitor zone, the deadline, the video entry and both actions', async () => {
    vi.mocked(api.fetchAppointment).mockResolvedValue(appointment())
    wrap(<BookingManagePageV2 reference="YW-7K3QM9PX" token="secret" />)

    await screen.findByText(/You can change or cancel online until/)
    expect(vi.mocked(api.fetchAppointment)).toHaveBeenCalledWith('YW-7K3QM9PX', 'secret')
    expect(screen.getAllByText(new RegExp(`\\(${detectTimezone().replaceAll('_', ' ')}\\)`)).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /open the call page/i }).getAttribute('href')).toBe('/en/booking/room/YW-7K3QM9PX#secret')
    expect(screen.getByRole('button', { name: /move to another time/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /i cannot make it/i })).toBeTruthy()
  })

  it('cancels with one of five reasons, and Other needs a few words', async () => {
    vi.mocked(api.fetchAppointment).mockResolvedValue(appointment())
    vi.mocked(api.cancelAppointment).mockResolvedValue(appointment({ status: 'cancelled', canChange: false }))
    wrap(<BookingManagePageV2 reference="YW-7K3QM9PX" token="secret" />)

    fireEvent.click(await screen.findByRole('button', { name: /i cannot make it/i }))
    expect(screen.getAllByRole('radio')).toHaveLength(5)

    const press = () => act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel booking' })))

    await press()
    expect(await screen.findByText('Choose a reason.')).toBeTruthy()
    await waitFor(() => expect((document.activeElement as HTMLInputElement | null)?.type).toBe('radio'))

    fireEvent.click(screen.getByRole('radio', { name: 'Other' }))
    await press()
    expect(await screen.findByText('Tell me briefly why.')).toBeTruthy()
    expect(api.cancelAppointment).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Tell me briefly why'), { target: { value: 'Moving abroad' } })
    await press()

    await screen.findByText(/Your booking is cancelled/)
    expect(api.cancelAppointment).toHaveBeenCalledWith('YW-7K3QM9PX', 'secret', { reason: 'other', text: 'Moving abroad' })
    expect(screen.getByRole('link', { name: /book a new time/i })).toBeTruthy()
  })

  it('sends a listed reason without text', async () => {
    vi.mocked(api.fetchAppointment).mockResolvedValue(appointment())
    vi.mocked(api.cancelAppointment).mockResolvedValue(appointment({ status: 'cancelled', canChange: false }))
    wrap(<BookingManagePageV2 reference="YW-7K3QM9PX" token="secret" />)

    fireEvent.click(await screen.findByRole('button', { name: /i cannot make it/i }))
    fireEvent.click(screen.getByRole('radio', { name: 'I booked by mistake' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel booking' })))

    await waitFor(() => expect(api.cancelAppointment).toHaveBeenCalledWith('YW-7K3QM9PX', 'secret', { reason: 'booked_by_mistake', text: '' }))
  })

  it('moves the booking to a new time in the visitor zone', async () => {
    vi.mocked(api.fetchAppointment).mockResolvedValue(appointment())
    vi.mocked(api.rescheduleAppointment).mockResolvedValue(appointment({ startsAt: SLOT_2 }))
    wrap(<BookingManagePageV2 reference="YW-7K3QM9PX" token="secret" />)

    fireEvent.click(await screen.findByRole('button', { name: /move to another time/i }))
    const day = await screen.findByRole('gridcell', { name: dayIn(new Date(SLOT_2), detectTimezone()) })

    await waitFor(() => expect((day as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(day)
    fireEvent.click(within(screen.getAllByRole('radiogroup').at(-1)!).getAllByRole('radio')[0]!)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /confirm new time/i })))

    await screen.findByText(/Your booking was moved/)
    expect(api.rescheduleAppointment).toHaveBeenCalledWith('YW-7K3QM9PX', 'secret', { startsAt: SLOT_2, timeZone: detectTimezone() })
  })

  it('says to reply by email once the change limit has passed', async () => {
    vi.mocked(api.fetchAppointment).mockResolvedValue(
      appointment({ startsAt: '2026-10-05T13:00:00.000Z', endsAt: '2026-10-05T13:30:00.000Z', changeDeadline: '2026-10-05T01:00:00.000Z', canChange: false }),
    )
    wrap(<BookingManagePageV2 reference="YW-7K3QM9PX" token="secret" />)

    await screen.findByText(/starts in less than 12 hours/)
    expect(screen.queryByRole('button', { name: /move to another time/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /i cannot make it/i })).toBeNull()
  })

  it('reads a wrong or missing credential as a link that does not work', async () => {
    vi.mocked(api.fetchAppointment).mockRejectedValue(refused('BOOKING_LINK_INVALID', 404))
    wrap(<BookingManagePageV2 reference="YW-7K3QM9PX" token="wrong" />)

    expect((await screen.findByRole('alert')).textContent).toMatch(/no longer valid/)
    cleanup()

    wrap(<BookingManagePageV2 reference="YW-7K3QM9PX" token="" />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/no longer valid/)
  })
})

/* ------------------------------------------------------------- video room */

describe('the video room', () => {
  it('waits early with a countdown and a camera and microphone check', async () => {
    vi.mocked(api.videoPreflight).mockResolvedValue({
      state: 'early',
      startsAt: '2026-10-05T08:12:40.000Z',
      endsAt: '2026-10-05T08:42:40.000Z',
      joinClosesAt: '2026-10-05T09:42:40.000Z',
      serverTime: NOW.toISOString(),
    })
    wrap(<BookingRoomPageV2 reference="YW-7K3QM9PX" token="secret" />)

    await screen.findByText('You are early')
    expect(screen.getByText('12:40')).toBeTruthy()
    expect(screen.getByText('Camera works')).toBeTruthy()
    expect(screen.getByText('Microphone works')).toBeTruthy()
    expect(api.videoJoin).not.toHaveBeenCalled()
  })

  it('offers email when the camera or microphone is blocked', async () => {
    state.camera = 'failed'
    vi.mocked(api.videoPreflight).mockResolvedValue({
      state: 'early',
      startsAt: '2026-10-05T08:12:40.000Z',
      endsAt: '2026-10-05T08:42:40.000Z',
      joinClosesAt: '2026-10-05T09:42:40.000Z',
      serverTime: NOW.toISOString(),
    })
    wrap(<BookingRoomPageV2 reference="YW-7K3QM9PX" token="secret" />)

    await screen.findByText('Your camera or microphone is blocked')
    expect(screen.getByText(/Allow access in your browser settings/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /write an email/i }).getAttribute('href')).toBe('mailto:info@yamanwarda.de')
  })

  it('says honestly that the call cannot open yet, with a way to reach Yaman', async () => {
    vi.mocked(api.videoPreflight).mockResolvedValue({
      state: 'open',
      startsAt: NOW.toISOString(),
      endsAt: '2026-10-05T08:30:00.000Z',
      joinClosesAt: '2026-10-05T09:30:00.000Z',
      serverTime: NOW.toISOString(),
    })
    vi.mocked(api.videoJoin).mockRejectedValue(refused('PROVIDER_UNAVAILABLE', 503))
    wrap(<BookingRoomPageV2 reference="YW-7K3QM9PX" token="secret" />)

    await screen.findByText('The video call cannot open on this website yet')
    expect(screen.getByRole('link', { name: /write an email/i }).getAttribute('href')).toBe('mailto:info@yamanwarda.de')
    expect(api.videoJoin).toHaveBeenCalledTimes(1)
  })

  it('never shows a call without a call screen, even when a seat is issued', async () => {
    vi.mocked(api.videoPreflight).mockResolvedValue({
      state: 'open',
      startsAt: NOW.toISOString(),
      endsAt: '2026-10-05T08:30:00.000Z',
      joinClosesAt: '2026-10-05T09:30:00.000Z',
      serverTime: NOW.toISOString(),
    })
    vi.mocked(api.videoJoin).mockResolvedValue({ token: 'fake', role: 'guest', startsAt: '', endsAt: '', joinClosesAt: '' })
    wrap(<BookingRoomPageV2 reference="YW-7K3QM9PX" token="secret" />)

    await screen.findByText('The video call cannot open on this website yet')
  })

  it('says when the call has ended, and when the link is wrong', async () => {
    vi.mocked(api.videoPreflight).mockResolvedValueOnce({ state: 'ended', startsAt: '', endsAt: '', joinClosesAt: '', serverTime: '' })
    wrap(<BookingRoomPageV2 reference="YW-7K3QM9PX" token="secret" />)
    await screen.findByText('The call has ended')
    cleanup()

    vi.mocked(api.videoPreflight).mockRejectedValueOnce(refused('BOOKING_LINK_INVALID', 404))
    wrap(<BookingRoomPageV2 reference="YW-7K3QM9PX" token="nope" />)
    await screen.findByText('This link is not valid.')
  })
})

/* ------------------------------------------------------- next free times */

describe('the home band', () => {
  it('quotes Backend2 times when the switch is on', async () => {
    wrap(<BookingBand />)

    const link = await screen.findByRole('link', { name: /Wed/ })

    expect(link.getAttribute('href')).toBe('/en/booking/intro')
    expect(api.fetchTypes).toHaveBeenCalledWith('en')
    expect(vi.mocked(api.fetchSlots).mock.calls[0]![0]).toMatchObject({ slug: 'intro', method: 'video', from: '2026-10-05' })
    expect(legacyApi.fetchBookingTypes).not.toHaveBeenCalled()
  })

  it('keeps the legacy times when the switch is off', async () => {
    state.v2 = false
    vi.mocked(legacyApi.fetchBookingTypes).mockResolvedValue([
      { slug: 'legacy-call', name: 'Call', description: '', durationMinutes: 30, locationKind: 'VIDEO', priceCents: 0, currency: 'EUR' },
    ] as never)
    vi.mocked(legacyApi.fetchSlots).mockResolvedValue({
      bookingType: {} as never,
      timezone: 'Europe/Berlin',
      lastBookableDate: '2026-11-01',
      days: [{ date: '2026-10-07', slots: [{ startsAt: SLOT, endsAt: SLOT }] }],
    })
    wrap(<BookingBand />)

    const link = await screen.findByRole('link', { name: /Wed/ })

    expect(link.getAttribute('href')).toBe('/en/booking/legacy-call')
    expect(api.fetchTypes).not.toHaveBeenCalled()
  })
})
