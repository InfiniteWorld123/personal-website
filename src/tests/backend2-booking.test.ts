import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from './helpers/backend2-db'

/**
 * Booking, end to end, against a real PostgreSQL inside this process.
 *
 * What is under test: the calendar never double-books, the clock change is
 * handled rather than hoped about, every appointment has exactly one Inbox
 * conversation, a visitor's private link opens only their own appointment,
 * emails and reminders go once, and the video room opens exactly when the
 * rules say. Email and video are faked; nothing leaves the process.
 */
process.env.DATABASE_URL = 'postgres://legacy.invalid/legacy'
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
process.env.PUBLIC_SITE_URL = 'https://yamanwarda.de'
delete process.env.BACKEND2_OWNER_AUTH
delete process.env.TURNSTILE_SECRET_KEY
delete process.env.INBOX_SEND_MODE

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { useInboxTransportForTest } = await import('#/backend2/modules/inbox/inbox.transport')
const { useVideoProviderForTest, VideoUnavailableError } = await import('#/backend2/modules/booking/booking.video')
const { useTurnstileForTest } = await import('#/backend2/modules/booking/booking.guard')
const { ownerCalendarPaths } = await import('#/backend2/modules/booking/booking.owner.route')
const time = await import('#/backend2/modules/booking/booking.time')
const { computeCandidates, isWithinHours } = await import('#/backend2/modules/booking/booking.slots')
const appointments = await import('#/backend2/modules/booking/appointment.service')
const video = await import('#/backend2/modules/booking/video.service')

type Json = Record<string, any>

const database = await createTestDatabase()
const app = createAppForTest()

let sent: Array<{ to: string; subject: string; text: string; replyTo: string }> = []
let failSends = false
let participants = 0
let meetings = 0

beforeEach(async () => {
  await database.reset()
  sent = []
  failSends = false
  participants = 0
  meetings = 0
  useInboxTransportForTest({
    mode: 'fake',
    send: async (email) => {
      if (failSends) return { ok: false, provider: 'fake', reason: 'The email service had a problem.' }

      sent.push({ to: email.to, subject: email.subject, text: email.text, replyTo: email.replyTo })

      return { ok: true, provider: 'fake', providerMessageId: `p-${sent.length}` }
    },
  })
  useVideoProviderForTest({
    name: 'fake',
    createMeeting: async () => ({ meetingId: `m-${(meetings += 1)}` }),
    participantToken: async (input) => {
      if (!input.participantId) participants += 1

      return { participantId: input.participantId ?? `p-${input.role}`, token: `t-${crypto.randomUUID()}` }
    },
    endMeeting: async () => {},
  })
  useTurnstileForTest(undefined)
})

afterEach(() => {
  useInboxTransportForTest(undefined)
  useVideoProviderForTest(undefined)
  useTurnstileForTest(undefined)
  delete process.env.BACKEND2_OWNER_AUTH
})

afterAll(async () => {
  await database.close()
})

/* ---------------------------------------------------------------- plumbing */

const call = async (
  method: string,
  path: string,
  body?: unknown,
  options: { host?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Json }> => {
  const host = options.host ?? 'localhost:3000'
  const request = new Request(`http://${host}/api/v2${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json', origin: `http://${host}` }),
      ...options.headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const response = await runWithDb(database.db, async () => app.fetch(request))
  const text = await response.text()

  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Json) }
}

const inDb = <T>(fn: () => Promise<T>): Promise<T> => runWithDb(database.db, fn)

const texts = (name = 'Intro call') => ({
  de: { name: `${name} DE`, description: '' },
  en: { name, description: 'A first talk' },
  ar: { name: `${name} AR`, description: '' },
})

const makeType = async (over: Json = {}): Promise<Json> => {
  const result = await call('POST', '/owner/calendar/types', {
    slug: 'intro',
    enabled: true,
    durationMinutes: 30,
    bufferMinutes: 0,
    slotStepMinutes: 30,
    methods: ['video', 'in_person', 'phone'],
    texts: texts(),
    ...over,
  })

  expect(result.status, JSON.stringify(result.body)).toBe(201)

  return result.body.data
}

/** Open every day, all day, so tests do not depend on the weekday they run on. */
const openAllWeek = () =>
  call('PUT', '/owner/calendar/availability', {
    weekly: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 0, endMinute: 1440 })),
    exceptions: [],
  })

const dayAfterTomorrow = (): string => time.addDays(time.localParts(new Date(), 'Europe/Berlin').date, 2)

const firstSlot = async (method = 'video', date = dayAfterTomorrow(), timeZone = 'Europe/Berlin'): Promise<Json> => {
  const result = await call('GET', `/public/booking/types/intro/slots?method=${method}&from=${date}&days=1&timeZone=${encodeURIComponent(timeZone)}`)

  expect(result.status, JSON.stringify(result.body)).toBe(200)

  return result.body.data.days[0].slots[10]
}

const book = async (over: Json = {}) =>
  call('POST', '/public/booking/appointments', {
    submissionId: crypto.randomUUID(),
    typeSlug: 'intro',
    method: 'video',
    timeZone: 'Europe/Berlin',
    language: 'en',
    name: 'Daniel Brandt',
    email: 'daniel@example.com',
    ...over,
  })

const tokenOf = (manageUrl: string): string => manageUrl.split('#')[1]!

const setup = async () => {
  await makeType()
  await openAllWeek()
}

/* ----------------------------------------------------------------- the clock */

describe('local time', () => {
  it('skips the spring gap and takes the first of the autumn repeat', () => {
    // 29 March 2026: Berlin jumps from 02:00 to 03:00.
    expect(time.zonedToInstant('2026-03-29', 150, 'Europe/Berlin')).toBeNull()
    expect(time.zonedToInstant('2026-03-29', 180, 'Europe/Berlin')!.toISOString()).toBe('2026-03-29T01:00:00.000Z')
    // 25 October 2026: 02:30 happens twice; the earlier is 00:30 UTC.
    expect(time.zonedToInstant('2026-10-25', 150, 'Europe/Berlin')!.toISOString()).toBe('2026-10-25T00:30:00.000Z')
    expect(time.zonedToInstant('2026-07-01', 540, 'Europe/Berlin')!.toISOString()).toBe('2026-07-01T07:00:00.000Z')
    expect(time.zonedToInstant('2026-01-15', 540, 'Europe/Berlin')!.toISOString()).toBe('2026-01-15T08:00:00.000Z')
  })

  it('offers no start inside the gap and keeps real durations across the change', () => {
    const exceptions = new Map([['2026-03-29', [{ startMinute: 60, endMinute: 240 }]]])
    const candidates = computeCandidates({
      dates: ['2026-03-29'],
      type: { durationMinutes: 30, bufferMinutes: 0, slotStepMinutes: 30 },
      weekly: [],
      exceptions,
      blocked: [],
      earliest: null,
      latest: null,
    })

    expect(candidates.map((slot) => time.localParts(slot.start, 'Europe/Berlin').time)).toEqual([
      '01:00',
      '01:30',
      '03:00',
      '03:30',
    ])
  })

  it('keeps buffers clear on both sides', () => {
    const blocked = [{ start: new Date('2026-07-01T08:00:00Z'), end: new Date('2026-07-01T08:45:00Z') }]
    const starts = computeCandidates({
      dates: ['2026-07-01'],
      type: { durationMinutes: 30, bufferMinutes: 15, slotStepMinutes: 15 },
      weekly: [{ weekday: 3, startMinute: 540, endMinute: 720 }],
      exceptions: new Map(),
      blocked,
      earliest: null,
      latest: null,
    }).map((slot) => time.localParts(slot.start, 'Europe/Berlin').time)

    // 09:30 would run into 10:00 with its buffer; 10:45 is the first free start after.
    expect(starts).toEqual(['09:00', '09:15', '10:45', '11:00', '11:15', '11:30'])
  })

  it('says whether a time is inside the owner’s hours', () => {
    const weekly = [{ weekday: 3, startMinute: 540, endMinute: 1020 }]

    expect(isWithinHours({ start: new Date('2026-07-01T07:00:00Z'), durationMinutes: 60, weekly, exceptions: new Map() })).toBe(true)
    expect(isWithinHours({ start: new Date('2026-07-01T14:30:00Z'), durationMinutes: 60, weekly, exceptions: new Map() })).toBe(false)
  })
})

/* ---------------------------------------------------------------- the fence */

describe('the owner fence', () => {
  it('answers every owner calendar route with 404 from a non-local host', async () => {
    for (const route of ownerCalendarPaths) {
      const result = await call(route.method, route.path.replace('/api/v2', ''), route.method === 'GET' ? undefined : {}, {
        host: 'yamanwarda.de',
      })

      expect(result.status, `${route.method} ${route.path}`).toBe(404)
    }
  })
})

/* ------------------------------------------------------------ types & slots */

describe('types, settings and slots', () => {
  it('refuses to switch on a type a visitor could not read', async () => {
    const refused = await call('POST', '/owner/calendar/types', {
      slug: 'half',
      enabled: true,
      durationMinutes: 30,
      methods: ['video'],
      texts: { ...texts(), ar: { name: '', description: '' } },
    })

    expect(refused.body.code).toBe('VALIDATION_ERROR')

    const draft = await makeType({ slug: 'half', enabled: false, texts: { ...texts(), ar: { name: '', description: '' } } })

    expect(draft.enableBlockers).toEqual(['Add the AR name'])
  })

  it('lists only switched-on types to visitors, in their language, video first', async () => {
    await makeType({ methods: ['phone', 'video'] })
    await makeType({ slug: 'hidden', enabled: false })

    const result = await call('GET', '/public/booking/types?language=de')

    expect(result.body.data).toEqual([
      expect.objectContaining({ slug: 'intro', name: 'Intro call DE', defaultMethod: 'video' }),
    ])
  })

  it('shows slots in the visitor’s zone, and none before the notice period', async () => {
    await setup()

    const today = time.localParts(new Date(), 'Europe/Berlin').date
    const now = await call('GET', `/public/booking/types/intro/slots?method=video&from=${today}&days=1`)
    const earliest = Date.now() + 24 * 3_600_000

    for (const slot of now.body.data.days[0].slots) expect(Date.parse(slot.startsAt)).toBeGreaterThanOrEqual(earliest)

    const tokyo = await call(
      'GET',
      `/public/booking/types/intro/slots?method=video&from=${dayAfterTomorrow()}&days=1&timeZone=Asia%2FTokyo`,
    )
    const first = tokyo.body.data.days[0].slots[0]

    expect(tokyo.body.data.timeZone).toBe('Asia/Tokyo')
    expect(time.localParts(new Date(first.startsAt), 'Asia/Tokyo').time).toBe(first.localTime)
    expect((await call('GET', '/public/booking/types/intro/slots?method=video&from=2026-01-01&days=1&timeZone=Mars%2FBase')).status).toBe(422)
    expect((await call('GET', '/public/booking/types/intro/slots?method=video&from=2026-01-01&days=40')).status).toBe(422)
  })

  it('says when the next free day is, if the window shown is empty', async () => {
    await makeType()
    await call('PUT', '/owner/calendar/availability', {
      weekly: [],
      exceptions: [{ date: time.addDays(dayAfterTomorrow(), 5), ranges: [{ startMinute: 600, endMinute: 660 }], note: '' }],
    })

    const result = await call('GET', `/public/booking/types/intro/slots?method=video&from=${dayAfterTomorrow()}&days=2`)

    expect(result.body.data.days.every((day: Json) => day.slots.length === 0)).toBe(true)
    expect(result.body.data.nextAvailableDate).toBe(time.addDays(dayAfterTomorrow(), 5))
  })

  it('keeps settings inside their bounds', async () => {
    expect((await call('PUT', '/owner/calendar/settings', { minNoticeMinutes: 0, windowDays: 400, changeLimitHours: 12, reminderMinutes: 60 })).status).toBe(422)

    const saved = await call('PUT', '/owner/calendar/settings', { minNoticeMinutes: 60, windowDays: 30, changeLimitHours: 24, reminderMinutes: 2880 })

    expect(saved.body.data).toMatchObject({ minNoticeMinutes: 60, windowDays: 30, reminderMinutes: 2880, timeZone: 'Europe/Berlin' })
  })
})

/* ------------------------------------------------------------ public booking */

describe('booking from the website', () => {
  it('confirms at once, opens exactly one Inbox conversation, and emails the visitor', async () => {
    await setup()

    const slot = await firstSlot()
    const result = await book({ startsAt: slot.startsAt, subject: 'software', budget: '3000-6000', company: 'Brandt GmbH' })

    expect(result.status, JSON.stringify(result.body)).toBe(201)
    expect(result.body.data.appointment).toMatchObject({ status: 'confirmed', method: 'video', typeName: 'Intro call' })
    expect(result.body.data.manageUrl).toMatch(/^https:\/\/yamanwarda\.de\/en\/booking\/manage\/YW-[A-Z0-9]{8}#[0-9a-f]{64}$/u)
    expect(result.body.data.roomUrl).toContain('/en/booking/room/')
    expect(result.body.data.confirmationSent).toBe(true)

    expect(sent).toHaveLength(1)
    expect(sent[0]!.subject).toMatch(/^Appointment confirmed: Intro call/u)
    expect(sent[0]!.text).toContain(result.body.data.manageUrl)
    expect(sent[0]!.text).toContain('Join the video call')

    const inbox = await call('GET', '/owner/inbox/conversations?view=sent')

    expect(inbox.body.data.total).toBe(1)
    expect(inbox.body.data.items[0]).toMatchObject({ origin: 'booking', counterpartEmail: 'daniel@example.com' })

    const detail = await call('GET', `/owner/inbox/conversations/${inbox.body.data.items[0].id}`)

    expect(detail.body.data.conversation.facts).toMatchObject({
      'What is it about': 'Custom web application or software',
      'Budget range': '€3,000 to €6,000',
      Company: 'Brandt GmbH',
      Method: 'Video call',
    })

    // No Lead, no Client: those tables are not touched by Booking at all.
    const { rows } = await database.db.query(`SELECT to_regclass('v2_leads') AS leads`)

    if (rows[0].leads) expect((await database.db.query('SELECT count(*)::int AS n FROM v2_leads')).rows[0].n).toBe(0)
  })

  it('treats a repeated submission as the same booking and emails once', async () => {
    await setup()

    const slot = await firstSlot()
    const submissionId = crypto.randomUUID()
    const first = await book({ startsAt: slot.startsAt, submissionId })
    const second = await book({ startsAt: slot.startsAt, submissionId })

    expect(second.status).toBe(201)
    expect(second.body.data.appointment.reference).toBe(first.body.data.appointment.reference)
    expect(sent).toHaveLength(1)
  })

  it('never double-books, and the database refuses an overlap on its own', async () => {
    await setup()

    const slot = await firstSlot()

    expect((await book({ startsAt: slot.startsAt })).status).toBe(201)

    const again = await book({ startsAt: slot.startsAt, email: 'other@example.com' })

    expect(again.status).toBe(409)
    expect(again.body.code).toBe('SLOT_UNAVAILABLE')

    // And the slot has left the list.
    const list = await call('GET', `/public/booking/types/intro/slots?method=video&from=${dayAfterTomorrow()}&days=1`)

    expect(list.body.data.days[0].slots.map((s: Json) => s.startsAt)).not.toContain(slot.startsAt)

    await expect(
      database.db.query(
        `INSERT INTO v2_booking_appointments (reference, manage_token_hash, manage_nonce, type_name, duration_minutes, method,
           starts_at, ends_at, blocked, source, visitor_name, visitor_email, language)
         VALUES ('YW-TESTTEST', 'h', 'n', 'x', 30, 'video', $1, $2, tstzrange($1, $2, '[)'), 'manual', 'x', 'x@x.de', 'en')`,
        [slot.startsAt, slot.endsAt],
      ),
    ).rejects.toMatchObject({ code: '23P01' })
  })

  it('refuses a time that is not offered, too soon or too far', async () => {
    await setup()

    const offGrid = new Date(Date.parse((await firstSlot()).startsAt) + 7 * 60_000).toISOString()

    expect((await book({ startsAt: offGrid })).body.code).toBe('SLOT_UNAVAILABLE')
    expect((await book({ startsAt: new Date(Date.now() + 3_600_000).toISOString() })).body.code).toBe('BOOKING_TOO_SOON')
    expect((await book({ startsAt: new Date(Date.now() + 90 * 86_400_000).toISOString() })).body.code).toBe('BOOKING_TOO_FAR')
  })

  it('needs a phone number only for a phone call, and only allowed ways to meet', async () => {
    await makeType({ methods: ['video', 'phone'] })
    await openAllWeek()

    const slot = await firstSlot('phone')
    const noPhone = await book({ startsAt: slot.startsAt, method: 'phone' })

    expect(noPhone.status).toBe(422)
    expect(noPhone.body.details.issues[0].field).toBe('phone')
    expect((await book({ startsAt: slot.startsAt, method: 'in_person' })).status).toBe(422)

    const ok = await book({ startsAt: slot.startsAt, method: 'phone', phone: '+49 170 1234567' })

    expect(ok.status).toBe(201)
    expect(sent[0]!.text).toContain('I will call you on +49 170 1234567')
  })

  it('refuses bots and a failed human check', async () => {
    await setup()

    const slot = await firstSlot()

    expect((await book({ startsAt: slot.startsAt, website: 'http://spam' })).body.code).toBe('VERIFICATION_FAILED')

    useTurnstileForTest(async () => false)
    expect((await book({ startsAt: slot.startsAt })).body.code).toBe('VERIFICATION_FAILED')
    expect(sent).toHaveLength(0)
  })

  it('keeps the booking when the confirmation email fails, and says so', async () => {
    await setup()
    failSends = true

    const result = await book({ startsAt: (await firstSlot()).startsAt })

    expect(result.status).toBe(201)
    expect(result.body.data.confirmationSent).toBe(false)

    const list = await call('GET', '/owner/calendar/appointments')
    const detail = await call('GET', `/owner/calendar/appointments/${list.body.data.items[0].id}`)

    expect(detail.body.data.history.map((entry: Json) => entry.kind)).toEqual(['created', 'email_failed'])
  })
})

/* ------------------------------------------------------------ visitor link */

describe('the visitor’s private link', () => {
  const booked = async () => {
    await setup()

    const result = await book({ startsAt: (await firstSlot()).startsAt, language: 'de' })

    return { reference: result.body.data.appointment.reference as string, token: tokenOf(result.body.data.manageUrl) }
  }

  const asVisitor = (token: string) => ({ headers: { 'x-booking-token': token } })

  it('opens only with the right credential, and the same way for any wrong one', async () => {
    const { reference, token } = await booked()

    const ok = await call('GET', `/public/booking/appointments/${reference}`, undefined, asVisitor(token))

    expect(ok.status).toBe(200)
    expect(JSON.stringify(ok.body)).not.toMatch(/daniel@example\.com|manage_|nonce/u)

    for (const [ref, tok] of [[reference, 'wrong'], [reference, ''], ['YW-AAAAAAAA', token], ['nonsense', token]]) {
      const refused = await call('GET', `/public/booking/appointments/${ref}`, undefined, asVisitor(tok!))

      expect(refused.status).toBe(404)
      expect(refused.body.code).toBe('BOOKING_LINK_INVALID')
    }
  })

  it('reschedules within the same conversation, keeping type and method', async () => {
    const { reference, token } = await booked()
    const target = (await firstSlot('video', time.addDays(dayAfterTomorrow(), 1))).startsAt
    const moved = await call('POST', `/public/booking/appointments/${reference}/reschedule`, { startsAt: target }, asVisitor(token))

    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    expect(moved.body.data).toMatchObject({ startsAt: target, method: 'video' })
    expect(sent.map((email) => email.subject.split(':')[0])).toEqual(['Termin bestätigt', 'Termin verschoben'])
    expect(new Set(sent.map((email) => email.replyTo)).size).toBe(1)
    expect((await call('GET', '/owner/inbox/conversations?view=sent')).body.data.total).toBe(1)
  })

  it('cancels with a reason; Other needs words', async () => {
    const { reference, token } = await booked()
    const vague = await call('POST', `/public/booking/appointments/${reference}/cancel`, { reason: 'other', text: '' }, asVisitor(token))

    expect(vague.status).toBe(422)

    const done = await call(
      'POST',
      `/public/booking/appointments/${reference}/cancel`,
      { reason: 'other', text: 'Project postponed' },
      asVisitor(token),
    )

    expect(done.body.data).toMatchObject({ status: 'cancelled', canChange: false })

    const list = await call('GET', '/owner/calendar/appointments?status=cancelled')
    const detail = await call('GET', `/owner/calendar/appointments/${list.body.data.items[0].id}`)

    expect(detail.body.data).toMatchObject({ cancelledBy: 'visitor', cancelReason: 'Other: Project postponed', reminderState: 'cancelled' })
    expect(sent.at(-1)!.subject).toMatch(/^Termin abgesagt/u)

    // The freed time is bookable again.
    expect((await book({ startsAt: detail.body.data.startsAt, email: 'next@example.com' })).status).toBe(201)
  })

  it('stops online changes inside the deadline', async () => {
    await setup()

    const type = (await call('GET', '/owner/calendar/types')).body.data.items[0]
    const created = await call('POST', '/owner/calendar/appointments', {
      typeId: type.id,
      method: 'video',
      startsAt: new Date(Date.now() + 6 * 3_600_000).toISOString(),
      language: 'en',
      name: 'Soon',
      email: 'soon@example.com',
      sendInvitation: true,
    })

    expect(created.status, JSON.stringify(created.body)).toBe(201)

    const link = sent[0]!.text.match(/manage\/(YW-[A-Z0-9]{8})#([0-9a-f]{64})/u)!
    const refused = await call('POST', `/public/booking/appointments/${link[1]}/cancel`, { reason: 'time_conflict' }, asVisitor(link[2]!))

    expect(refused.body.code).toBe('CHANGE_DEADLINE_PASSED')

    // The owner can still cancel, with a reason, and the visitor is told.
    const owner = await call('POST', `/owner/calendar/appointments/${created.body.data.id}/cancel`, { reason: 'Ill today' })

    expect(owner.body.data).toMatchObject({ status: 'cancelled', cancelledBy: 'owner', cancelReason: 'Ill today' })
    expect(sent.at(-1)!.text).toContain('Reason: Ill today')
    expect((await call('POST', `/owner/calendar/appointments/${created.body.data.id}/cancel`, { reason: '' })).status).toBe(422)
  })
})

/* ------------------------------------------------------------- owner side */

describe('the owner’s appointments', () => {
  it('saves a manual appointment without emailing, outside hours with a warning, never overlapping', async () => {
    await makeType()
    await call('PUT', '/owner/calendar/availability', {
      weekly: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1020 })),
      exceptions: [],
    })

    const type = (await call('GET', '/owner/calendar/types')).body.data.items[0]
    const late = time.zonedToInstant(dayAfterTomorrow(), 22 * 60, 'Europe/Berlin')!.toISOString()
    const saved = await call('POST', '/owner/calendar/appointments', {
      typeId: type.id,
      method: 'in_person',
      startsAt: late,
      language: 'ar',
      name: 'Karim',
      email: 'karim@example.com',
    })

    expect(saved.status, JSON.stringify(saved.body)).toBe(201)
    expect(saved.body.data).toMatchObject({ outsideHours: true, invitation: 'not_sent', inboxConversationId: null })
    expect(sent).toHaveLength(0)

    const clash = await call('POST', '/owner/calendar/appointments', {
      typeId: type.id,
      method: 'video',
      startsAt: new Date(Date.parse(late) + 10 * 60_000).toISOString(),
      language: 'en',
      name: 'X',
      email: 'x@example.com',
    })

    expect(clash.body.code).toBe('SLOT_UNAVAILABLE')

    // One minute ahead is fine for the owner.
    const soon = await call('POST', '/owner/calendar/appointments', {
      typeId: type.id,
      method: 'video',
      startsAt: new Date(Date.now() + 60_000).toISOString(),
      language: 'en',
      name: 'Y',
      email: 'y@example.com',
    })

    expect(soon.status).toBe(201)
    expect(soon.body.data.reminderState).toBe('skipped')

    // The invitation goes once, in Arabic, however often it is pressed.
    const first = await call('POST', `/owner/calendar/appointments/${saved.body.data.id}/send-invitation`)
    const second = await call('POST', `/owner/calendar/appointments/${saved.body.data.id}/send-invitation`)

    expect(first.body.data).toMatchObject({ alreadySent: false, delivery: 'accepted' })
    expect(second.body.data.alreadySent).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.subject).toMatch(/^دعوة إلى موعد/u)
    expect(sent[0]!.text).toContain('نتفق على مكان اللقاء')
  })

  it('reschedules with a revision check and tells the visitor', async () => {
    await setup()

    const booked = await book({ startsAt: (await firstSlot()).startsAt })
    const list = await call('GET', '/owner/calendar/appointments')
    const detail = (await call('GET', `/owner/calendar/appointments/${list.body.data.items[0].id}`)).body.data
    const target = new Date(Date.parse(detail.startsAt) + 3 * 3_600_000).toISOString()

    expect((await call('PATCH', `/owner/calendar/appointments/${detail.id}`, { revision: detail.revision + 5, startsAt: target })).status).toBe(409)

    const moved = await call('PATCH', `/owner/calendar/appointments/${detail.id}`, { revision: detail.revision, startsAt: target })

    expect(moved.body.data.startsAt).toBe(target)
    expect(sent.at(-1)!.subject).toMatch(/^Appointment rescheduled/u)
    expect(booked.status).toBe(201)
  })

  it('marks completed or no-show only once it has started', async () => {
    await setup()
    await book({ startsAt: (await firstSlot()).startsAt })

    const id = (await call('GET', '/owner/calendar/appointments')).body.data.items[0].id

    expect((await call('POST', `/owner/calendar/appointments/${id}/status`, { status: 'completed' })).status).toBe(409)

    await database.db.query(
      `UPDATE v2_booking_appointments SET starts_at = now() - interval '2 hours', ends_at = now() - interval '90 minutes',
         blocked = tstzrange(now() - interval '2 hours', now() - interval '90 minutes', '[)') WHERE id = $1`,
      [id],
    )

    expect((await call('POST', `/owner/calendar/appointments/${id}/status`, { status: 'no_show' })).body.data.status).toBe('no_show')
  })

  it('lists with filters, search and deterministic pages; bounds the range', async () => {
    await setup()

    const day = dayAfterTomorrow()
    const slots = (await call('GET', `/public/booking/types/intro/slots?method=video&from=${day}&days=1`)).body.data.days[0].slots

    for (const [index, slot] of slots.slice(20, 25).entries()) {
      await book({ startsAt: slot.startsAt, email: `p${index}@example.com`, name: `Person ${index}` })
    }

    const page1 = (await call('GET', '/owner/calendar/appointments?pageSize=2')).body.data
    const page3 = (await call('GET', '/owner/calendar/appointments?pageSize=2&page=3')).body.data

    expect(page1).toMatchObject({ total: 5, pageCount: 3 })
    expect(page3.items).toHaveLength(1)
    expect(Date.parse(page1.items[0].startsAt)).toBeLessThan(Date.parse(page1.items[1].startsAt))
    expect((await call('GET', '/owner/calendar/appointments?q=Person%203')).body.data.total).toBe(1)
    expect((await call('GET', '/owner/calendar/appointments?method=phone')).body.data.total).toBe(0)
    expect(
      (await call('GET', `/owner/calendar/appointments?from=2026-01-01T00:00:00Z&to=2026-06-01T00:00:00Z`)).status,
    ).toBe(422)
  })

  it('refuses to delete a type with upcoming appointments', async () => {
    await setup()
    await book({ startsAt: (await firstSlot()).startsAt })

    const type = (await call('GET', '/owner/calendar/types')).body.data.items[0]

    expect(type.upcomingCount).toBe(1)
    expect((await call('DELETE', `/owner/calendar/types/${type.id}`)).body.code).toBe('TYPE_IN_USE')
  })
})

/* --------------------------------------------------------------- reminders */

describe('reminders', () => {
  it('sends each due reminder once, and none for cancelled or never-invited appointments', async () => {
    await setup()

    const booked = await book({ startsAt: (await firstSlot()).startsAt })
    const type = (await call('GET', '/owner/calendar/types')).body.data.items[0]

    await call('POST', '/owner/calendar/appointments', {
      typeId: type.id,
      method: 'video',
      startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      language: 'en',
      name: 'Quiet',
      email: 'quiet@example.com',
    })

    sent = []

    const start = Date.parse(booked.body.data.appointment.startsAt)
    const due = new Date(start - 23 * 3_600_000)
    const later = new Date(Date.now() + 3 * 86_400_000 - 3_600_000)

    expect(await inDb(() => appointments.sendDueReminders(new Date(start - 25 * 3_600_000)))).toEqual({ sent: 0, failed: 0 })
    expect(await inDb(() => appointments.sendDueReminders(due))).toEqual({ sent: 1, failed: 0 })
    expect(await inDb(() => appointments.sendDueReminders(due))).toEqual({ sent: 0, failed: 0 })
    expect(await inDb(() => appointments.sendDueReminders(later))).toEqual({ sent: 0, failed: 0 })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.subject).toMatch(/^Reminder of your appointment/u)
  })

  it('moves unsent reminders when the owner changes the timing', async () => {
    await setup()
    await book({ startsAt: (await firstSlot()).startsAt })
    await call('PUT', '/owner/calendar/settings', { minNoticeMinutes: 1440, windowDays: 60, changeLimitHours: 12, reminderMinutes: 2880 })

    const id = (await call('GET', '/owner/calendar/appointments')).body.data.items[0].id
    const detail = (await call('GET', `/owner/calendar/appointments/${id}`)).body.data

    expect(Date.parse(detail.startsAt) - Date.parse(detail.reminderDueAt)).toBe(2880 * 60_000)
  })
})

/* ------------------------------------------------------------------- video */

describe('the video room', () => {
  const booked = async (method = 'video') => {
    await setup()

    const result = await book({ startsAt: (await firstSlot(method)).startsAt, method, phone: '+491701234567' })
    const reference = result.body.data.appointment.reference as string
    const id = (await call('GET', '/owner/calendar/appointments')).body.data.items[0].id as string

    return { reference, token: tokenOf(result.body.data.manageUrl), id, startsAt: new Date(result.body.data.appointment.startsAt) }
  }

  it('lets the visitor test early, but gives no token before the start', async () => {
    const { reference, token } = await booked()
    const pre = await call('POST', `/public/booking/appointments/${reference}/video/preflight`, {}, { headers: { 'x-booking-token': token } })

    expect(pre.body.data.state).toBe('early')
    expect(pre.body.data.token).toBeUndefined()

    const early = await call('POST', `/public/booking/appointments/${reference}/video/join`, {}, { headers: { 'x-booking-token': token } })

    expect(early.body.code).toBe('VIDEO_NOT_OPEN')
    expect(meetings).toBe(0)
  })

  it('opens at the start with two seats only, and closes an hour after the end', async () => {
    const { reference, token, id, startsAt } = await booked()
    const atStart = new Date(startsAt.getTime() + 1000)

    const guest = await inDb(() => video.visitorJoin({ reference, token }, atStart))
    const again = await inDb(() => video.visitorJoin({ reference, token }, atStart))
    const host = await inDb(() => video.ownerJoin(id, atStart))

    expect(guest.role).toBe('guest')
    expect(host.role).toBe('host')
    expect(again.token).not.toBe(guest.token)
    expect(meetings).toBe(1)
    expect(participants).toBe(2)

    const overtime = new Date(startsAt.getTime() + 45 * 60_000)

    expect((await inDb(() => video.visitorPreflight({ reference, token }, overtime))).state).toBe('open')

    const tooLate = new Date(startsAt.getTime() + 95 * 60_000)

    await expect(inDb(() => video.visitorJoin({ reference, token }, tooLate))).rejects.toMatchObject({ code: 'VIDEO_CLOSED' })
  })

  it('lets the owner end the room, after which nobody joins', async () => {
    const { reference, token, id, startsAt } = await booked()
    const during = new Date(startsAt.getTime() + 60_000)

    await inDb(() => video.ownerEnd(id, during))
    await expect(inDb(() => video.visitorJoin({ reference, token }, during))).rejects.toMatchObject({ code: 'VIDEO_CLOSED' })
    await expect(inDb(() => video.ownerJoin(id, during))).rejects.toMatchObject({ code: 'VIDEO_CLOSED' })
  })

  it('refuses video for a phone appointment and reports an unavailable provider', async () => {
    const phone = await booked('phone')

    await expect(inDb(() => video.visitorJoin({ reference: phone.reference, token: phone.token }, new Date()))).rejects.toMatchObject({
      code: 'NOT_VIDEO',
    })

    await database.reset()

    const { reference, token, startsAt } = await booked()

    useVideoProviderForTest({
      name: 'unavailable',
      createMeeting: async () => {
        throw new VideoUnavailableError('off')
      },
      participantToken: async () => {
        throw new VideoUnavailableError('off')
      },
      endMeeting: async () => {},
    })

    await expect(inDb(() => video.visitorJoin({ reference, token }, new Date(startsAt.getTime() + 1000)))).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    })
  })
})
