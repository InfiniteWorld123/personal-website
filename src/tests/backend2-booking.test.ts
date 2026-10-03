import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from './helpers/backend2-db'

/**
 * Booking, end to end, against a real PostgreSQL inside this process.
 *
 * What is under test: the calendar never double-books, the clock change is
 * handled rather than hoped about, every appointment has exactly one Inbox
 * conversation, a visitor's private link opens only their own appointment,
 * emails and reminders go once, and the call page says where the video
 * appointment stands. Email is faked; nothing leaves the process.
 */
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
const { useTurnstileForTest } = await import('#/backend2/modules/booking/booking.guard')
const { ownerCalendarPaths } = await import('#/backend2/modules/booking/booking.owner.route')
const time = await import('#/backend2/modules/booking/booking.time')
const { computeCandidates, isWithinHours } = await import('#/backend2/modules/booking/booking.slots')
const appointments = await import('#/backend2/modules/booking/appointment.service')
const repo = await import('#/backend2/modules/booking/booking.repo')
const video = await import('#/backend2/modules/booking/video.service')

type Json = Record<string, any>

const database = await createTestDatabase()
const app = createAppForTest()

let sent: Array<{ to: string; subject: string; text: string; replyTo: string }> = []
let failSends = false

beforeEach(async () => {
  await database.reset()
  sent = []
  failSends = false
  useInboxTransportForTest({
    mode: 'fake',
    send: async (email) => {
      if (failSends) return { ok: false, provider: 'fake', reason: 'The email service had a problem.' }

      sent.push({ to: email.to, subject: email.subject, text: email.text, replyTo: email.replyTo })

      return { ok: true, provider: 'fake', providerMessageId: `p-${sent.length}` }
    },
  })
  useTurnstileForTest(undefined)
})

afterEach(() => {
  useInboxTransportForTest(undefined)
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

  it('answers a stretch far before or after the booking window with a handful of queries', async () => {
    await setup()

    let queries = 0
    const counted = {
      query: (text: string, values?: unknown[]) => {
        queries += 1

        return database.db.query(text, values)
      },
    }
    const slots = (from: string) => {
      queries = 0

      return runWithDb(counted, () =>
        appointments.availableSlots({ typeSlug: 'intro', method: 'video', from, days: 14, timeZone: 'Europe/Berlin' }),
      )
    }
    const today = time.localParts(new Date(), 'Europe/Berlin').date

    // Before: a fortnight at a time from the year 2000 — thousands of queries.
    const past = await slots('2000-01-01')

    expect(past.days.every((day) => day.slots.length === 0)).toBe(true)
    expect([time.addDays(today, 1), time.addDays(today, 2)]).toContain(past.nextAvailableDate)
    expect(queries).toBeLessThanOrEqual(5)

    const beyond = await slots(time.addDays(today, 200))

    expect(beyond.days.every((day) => day.slots.length === 0)).toBe(true)
    expect(beyond.nextAvailableDate).toBeNull()
    expect(queries).toBeLessThanOrEqual(2)

    // Nothing free anywhere: the search stops at the window's end (60 days, five fortnights).
    await call('PUT', '/owner/calendar/availability', { weekly: [], exceptions: [] })

    expect((await slots('2000-01-01')).nextAvailableDate).toBeNull()
    expect(queries).toBeLessThanOrEqual(2 + 5 * 3)
  })

  it('files each start under its own local day, however far the zone is from Berlin', async () => {
    await setup()

    for (const timeZone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      const result = await call(
        'GET',
        `/public/booking/types/intro/slots?method=video&from=${dayAfterTomorrow()}&days=3&timeZone=${encodeURIComponent(timeZone)}`,
      )
      const all = result.body.data.days.flatMap((day: Json) => day.slots.map((slot: Json) => ({ day: day.date, ...slot })))

      expect(all.length).toBeGreaterThan(100)

      for (const slot of all) {
        const local = time.localParts(new Date(slot.startsAt), timeZone)

        expect([slot.localDate, slot.localTime]).toEqual([slot.day, local.time])
        expect(local.date).toBe(slot.day)
      }

      expect(all.map((slot: Json) => slot.startsAt)).toEqual([...all.map((slot: Json) => slot.startsAt)].sort())
    }
  })

  it('refuses dates and times it cannot read with 422, never a 500', async () => {
    await setup()

    const slotsFrom = (from: string) => call('GET', `/public/booking/types/intro/slots?method=video&from=${from}&days=7`)

    for (const from of ['9999-12-25', '2026-02-30', '1970-01-01']) expect((await slotsFrom(from)).status, from).toBe(422)

    for (const startsAt of ['2026-10-03T10:00:00+02', '2026-02-30T10:00:00Z', '9999-12-31T10:00:00Z']) {
      expect((await book({ startsAt })).status, startsAt).toBe(422)
      expect((await call('GET', `/owner/calendar/appointments?from=${encodeURIComponent(startsAt)}`)).status, startsAt).toBe(422)
    }

    // A full offset is as good as `Z`.
    const slot = await firstSlot()

    expect((await book({ startsAt: slot.startsAt.replace(/\.000Z$/u, '+00:00') })).status).toBe(201)
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
    expect(second.body.data.confirmationSent).toBe(true)
    expect(sent).toHaveLength(1)
  })

  it('tells a repeated submission the truth about a confirmation that failed', async () => {
    await setup()
    failSends = true

    const slot = await firstSlot()
    const submissionId = crypto.randomUUID()
    const first = await book({ startsAt: slot.startsAt, submissionId })
    const second = await book({ startsAt: slot.startsAt, submissionId })

    expect(first.body.data.confirmationSent).toBe(false)
    expect(second.body.data.appointment.reference).toBe(first.body.data.appointment.reference)
    expect(second.body.data.confirmationSent).toBe(false)
  })

  it('lets neither failing human checks nor a time just taken spend anyone’s allowance', async () => {
    await setup()

    const slots = (await call('GET', `/public/booking/types/intro/slots?method=video&from=${dayAfterTomorrow()}&days=1`)).body.data.days[0].slots

    // Someone else's address, a dozen bad tokens: more than either limit allows.
    useTurnstileForTest(async () => false)

    for (let attempt = 0; attempt < 12; attempt += 1) {
      expect((await book({ startsAt: slots[10].startsAt, email: 'victim@example.com' })).body.code).toBe('VERIFICATION_FAILED')
    }

    useTurnstileForTest(undefined)
    expect((await book({ startsAt: slots[10].startsAt, email: 'victim@example.com' })).status).toBe(201)

    // A visitor who keeps pressing Book on a time just taken is not locked out.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      expect((await book({ startsAt: slots[10].startsAt, email: 'late@example.com' })).body.code).toBe('SLOT_UNAVAILABLE')
    }

    expect((await book({ startsAt: slots[11].startsAt, email: 'late@example.com' })).status).toBe(201)
  })

  it('allows five bookings a day per address and ten submits an hour per network', async () => {
    await setup()

    const slots = (await call('GET', `/public/booking/types/intro/slots?method=video&from=${dayAfterTomorrow()}&days=1`)).body.data.days[0].slots

    for (const slot of slots.slice(10, 15)) expect((await book({ startsAt: slot.startsAt, email: 'keen@example.com' })).status).toBe(201)

    expect((await book({ startsAt: slots[15].startsAt, email: 'keen@example.com' })).body.code).toBe('RATE_LIMITED')

    // Six submits so far from this network; four more are fine, the eleventh is not.
    for (const [index, slot] of slots.slice(16, 20).entries()) {
      expect((await book({ startsAt: slot.startsAt, email: `other${index}@example.com` })).status).toBe(201)
    }

    expect((await book({ startsAt: slots[20].startsAt, email: 'last@example.com' })).body.code).toBe('RATE_LIMITED')
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

    expect((await book({ startsAt: slot.startsAt, hp_x9: 'http://spam' })).body.code).toBe('VERIFICATION_FAILED')

    useTurnstileForTest(async () => false)
    expect((await book({ startsAt: slot.startsAt })).body.code).toBe('VERIFICATION_FAILED')
    expect(sent).toHaveLength(0)
  })

  it('ignores the old `website` field a browser may still fill in, and books', async () => {
    await setup()

    const slot = await firstSlot()

    expect((await book({ startsAt: slot.startsAt, website: 'https://my-shop.example' })).status).toBe(201)
  })

  it('books real people with unusual addresses and writes to them, like the Contact form and the Inbox', async () => {
    await setup()

    for (const email of ["sean.o'neill@example.ie", 'anna@my--agency.de', 'info@bäckerei-müller.de']) {
      const slot = await firstSlot()
      const booked = await book({ startsAt: slot.startsAt, email })

      expect(booked.status, `${email}: ${JSON.stringify(booked.body)}`).toBe(201)
    }

    expect(sent.map((mail) => mail.to)).toContain('info@xn--bckerei-mller-bfb28a.de')
    expect((await book({ startsAt: (await firstSlot()).startsAt, email: 'jürgen@example.de' })).body.code).toBe('VALIDATION_ERROR')
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

  it('lets the manage page offer times that overlap the appointment being moved', async () => {
    await makeType({ durationMinutes: 60 })
    await openAllWeek()

    const day = dayAfterTomorrow()
    const slot = await firstSlot('video', day)
    const booked = await book({ startsAt: slot.startsAt })
    const reference = booked.body.data.appointment.reference as string
    const token = tokenOf(booked.body.data.manageUrl)
    const halfHourLater = new Date(Date.parse(slot.startsAt) + 30 * 60_000).toISOString()
    const path = `/public/booking/types/intro/slots?method=video&from=${day}&days=1`
    const starts = (result: { body: Json }) => result.body.data.days[0].slots.map((s: Json) => s.startsAt)

    expect(starts(await call('GET', path))).not.toContain(halfHourLater)
    expect(starts(await call('GET', `${path}&reference=${reference}`, undefined, asVisitor(token)))).toEqual(
      expect.arrayContaining([slot.startsAt, halfHourLater]),
    )

    const wrong = await call('GET', `${path}&reference=${reference}`, undefined, asVisitor('wrong'))

    expect(wrong.status).toBe(404)
    expect(wrong.body.code).toBe('BOOKING_LINK_INVALID')

    const moved = await call('POST', `/public/booking/appointments/${reference}/reschedule`, { startsAt: halfHourLater }, asVisitor(token))

    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    expect(moved.body.data.startsAt).toBe(halfHourLater)
  })

  it('clears the outside-hours mark when the visitor moves into the hours', async () => {
    await makeType()
    await call('PUT', '/owner/calendar/availability', {
      weekly: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1020 })),
      exceptions: [],
    })

    const type = (await call('GET', '/owner/calendar/types')).body.data.items[0]
    const created = await call('POST', '/owner/calendar/appointments', {
      typeId: type.id,
      method: 'video',
      startsAt: time.zonedToInstant(dayAfterTomorrow(), 22 * 60, 'Europe/Berlin')!.toISOString(),
      language: 'en',
      name: 'Late',
      email: 'late@example.com',
      sendInvitation: true,
    })

    expect(created.body.data.outsideHours).toBe(true)

    const link = sent[0]!.text.match(/manage\/(YW-[A-Z0-9]{8})#([0-9a-f]{64})/u)!
    const target = (await firstSlot()).startsAt
    const moved = await call('POST', `/public/booking/appointments/${link[1]}/reschedule`, { startsAt: target }, asVisitor(link[2]!))

    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    expect((await call('GET', `/owner/calendar/appointments/${created.body.data.id}`)).body.data).toMatchObject({
      startsAt: target,
      outsideHours: false,
    })
  })

  it('offers no new times once the type stops offering the booked way of meeting', async () => {
    const { reference, token } = await booked()
    const view = () => call('GET', `/public/booking/appointments/${reference}`, undefined, asVisitor(token))

    expect((await view()).body.data.typeSlug).toBe('intro')

    const type = (await call('GET', '/owner/calendar/types')).body.data.items[0]

    expect((await call('PATCH', `/owner/calendar/types/${type.id}`, { methods: ['phone'] })).status).toBe(200)
    expect((await view()).body.data.typeSlug).toBeNull()
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

  it('skips the reminder of an invitation sent after the reminder’s moment', async () => {
    await setup()

    const type = (await call('GET', '/owner/calendar/types')).body.data.items[0]
    const save = (startsAt: Date, email: string) =>
      call('POST', '/owner/calendar/appointments', { typeId: type.id, method: 'video', startsAt: startsAt.toISOString(), language: 'en', name: 'Invited', email })
    const late = (await save(new Date(Date.now() + 3 * 86_400_000), 'late@example.com')).body.data
    const onTime = (await save(new Date(Date.now() + 4 * 86_400_000), 'ontime@example.com')).body.data
    const afterDue = new Date(Date.parse(late.reminderDueAt) + 3_600_000)

    expect(late.reminderState).toBe('pending')

    await inDb(() => appointments.sendInvitation(late.id, afterDue))
    await inDb(() => appointments.sendInvitation(onTime.id, afterDue))

    expect((await call('GET', `/owner/calendar/appointments/${late.id}`)).body.data.reminderState).toBe('skipped')
    expect((await call('GET', `/owner/calendar/appointments/${onTime.id}`)).body.data.reminderState).toBe('pending')
    expect(await inDb(() => appointments.sendDueReminders(afterDue))).toEqual({ sent: 0, failed: 0 })
    expect(sent.map((email) => email.subject.split(':')[0])).toEqual(['Invitation to an appointment', 'Invitation to an appointment'])
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
    expect(moved.body.data.emailDelivery).toBe('accepted')
    expect(sent.at(-1)!.subject).toMatch(/^Appointment rescheduled/u)
    expect(booked.status).toBe(201)
  })

  it.each([false, true])('reports the current move and cancellation email outcome when failure is %s', async (failure) => {
    await setup()
    await book({ startsAt: (await firstSlot()).startsAt })
    const detail = (await call('GET', '/owner/calendar/appointments')).body.data.items[0]
    const target = new Date(Date.parse(detail.startsAt) + 3 * 3_600_000).toISOString()
    const current = (await call('GET', `/owner/calendar/appointments/${detail.id}`)).body.data
    failSends = failure

    const moved = await call('PATCH', `/owner/calendar/appointments/${detail.id}`, { revision: current.revision, startsAt: target, notify: true })
    expect(moved.status).toBe(200)
    expect(moved.body.data).toMatchObject({ startsAt: target, status: 'confirmed', emailDelivery: failure ? 'failed' : 'accepted' })
    const cancelled = await call('POST', `/owner/calendar/appointments/${detail.id}/cancel`, { reason: 'Plans changed', notify: true })
    expect(cancelled.status).toBe(200)
    expect(cancelled.body.data).toMatchObject({ status: 'cancelled', emailDelivery: failure ? 'failed' : 'accepted' })
    expect(sent).toHaveLength(failure ? 1 : 3)
    expect(cancelled.body.data.history.filter((entry: Json) => entry.kind === 'email_failed')).toHaveLength(failure ? 2 : 0)
  })

  it('reports no email for changes to a never-invited manual appointment', async () => {
    await setup()
    const type = (await call('GET', '/owner/calendar/types')).body.data.items[0]
    const startsAt = (await firstSlot()).startsAt
    const saved = await call('POST', '/owner/calendar/appointments', { typeId: type.id, method: 'video', startsAt, language: 'en', name: 'Daniel', email: 'daniel@example.com', sendInvitation: false })
    const moved = await call('PATCH', `/owner/calendar/appointments/${saved.body.data.id}`, { revision: saved.body.data.revision, startsAt: new Date(Date.parse(startsAt) + 3 * 3_600_000).toISOString(), notify: true })
    expect(moved.body.data.emailDelivery).toBe('not_sent')
    const cancelled = await call('POST', `/owner/calendar/appointments/${saved.body.data.id}/cancel`, { reason: 'Plans changed', notify: true })
    expect(cancelled.body.data.emailDelivery).toBe('not_sent')
    expect(sent).toHaveLength(0)
  })

  it('returns failed for an invitation while keeping the appointment and not sending twice', async () => {
    await setup()
    const type = (await call('GET', '/owner/calendar/types')).body.data.items[0]
    const saved = await call('POST', '/owner/calendar/appointments', { typeId: type.id, method: 'video', startsAt: (await firstSlot()).startsAt, language: 'en', name: 'Daniel', email: 'daniel@example.com', sendInvitation: false })
    failSends = true
    const first = await call('POST', `/owner/calendar/appointments/${saved.body.data.id}/send-invitation`)
    expect(first.body.data).toMatchObject({ alreadySent: false, delivery: 'failed' })
    const second = await call('POST', `/owner/calendar/appointments/${saved.body.data.id}/send-invitation`)
    expect(second.body.data).toMatchObject({ alreadySent: true, delivery: 'not_sent' })
    const detail = (await call('GET', `/owner/calendar/appointments/${saved.body.data.id}`)).body.data
    expect(detail.status).toBe('confirmed')
    expect(detail.inboxConversationId).toBeTruthy()
    expect(detail.history.filter((entry: Json) => entry.kind === 'email_failed')).toHaveLength(1)
    expect(sent).toHaveLength(0)
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

  it('drops a claimed reminder when the appointment was cancelled or moved before it went', async () => {
    await setup()

    const slots = (await call('GET', `/public/booking/types/intro/slots?method=video&from=${dayAfterTomorrow()}&days=1`)).body.data.days[0].slots
    const first = await book({ startsAt: slots[10].startsAt })
    const second = await book({ startsAt: slots[20].startsAt, email: 'two@example.com' })
    const [cancelled, moved] = (await call('GET', '/owner/calendar/appointments')).body.data.items as Json[]
    // Both reminders are due, neither appointment has started.
    const due = new Date(Date.parse(first.body.data.appointment.startsAt) - 3_600_000)
    const detail = async (id: string) => (await call('GET', `/owner/calendar/appointments/${id}`)).body.data

    // A run claims both reminders; before it sends them, one is cancelled and the other moved.
    expect((await inDb(() => repo.claimDueReminders(due, 25))).sort()).toEqual([cancelled!.id, moved!.id].sort())

    await call('POST', `/public/booking/appointments/${first.body.data.appointment.reference}/cancel`, { reason: 'time_conflict' }, {
      headers: { 'x-booking-token': tokenOf(first.body.data.manageUrl) },
    })

    const target = (await firstSlot('video', time.addDays(dayAfterTomorrow(), 3))).startsAt

    await call('POST', `/public/booking/appointments/${second.body.data.appointment.reference}/reschedule`, { startsAt: target }, {
      headers: { 'x-booking-token': tokenOf(second.body.data.manageUrl) },
    })
    sent = []

    expect(await inDb(() => appointments.emailVisitor({ appointmentId: cancelled!.id, kind: 'reminder', now: due }))).toBe('skipped')
    expect(await inDb(() => appointments.emailVisitor({ appointmentId: moved!.id, kind: 'reminder', now: due }))).toBe('skipped')
    expect(await inDb(() => appointments.emailVisitor({ appointmentId: cancelled!.id, kind: 'rescheduled', now: due }))).toBe('skipped')
    expect(sent).toHaveLength(0)
    expect(await detail(cancelled!.id)).toMatchObject({ status: 'cancelled', reminderState: 'cancelled', reminderSentAt: null })

    // The moved one keeps the reminder for its new time, and gets exactly that one.
    const next = await detail(moved!.id)

    expect(next).toMatchObject({ reminderState: 'pending', reminderSentAt: null })
    expect(await inDb(() => appointments.sendDueReminders(new Date(Date.parse(next.reminderDueAt) + 60_000)))).toEqual({ sent: 1, failed: 0 })
    expect(sent).toHaveLength(1)
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

  it('points the email, the call page and the Dashboard at the fixed Google Meet room when one is set', async () => {
    process.env.BOOKING_MEET_LINK = 'https://meet.google.com/pfj-yvde-wyu'

    try {
      const { reference, token, id } = await booked()
      const pre = await call('POST', `/public/booking/appointments/${reference}/video/preflight`, {}, { headers: { 'x-booking-token': token } })
      const detail = await call('GET', `/owner/calendar/appointments/${id}`)

      expect(pre.body.data.meetLink).toBe('https://meet.google.com/pfj-yvde-wyu')
      expect(detail.body.data.meetLink).toBe('https://meet.google.com/pfj-yvde-wyu')
      expect(sent.at(-1)!.text).toContain('https://meet.google.com/pfj-yvde-wyu')
      expect(sent.at(-1)!.text).not.toContain('/booking/room/')
    } finally {
      delete process.env.BOOKING_MEET_LINK
    }
  })

  it('tells the call page where the appointment stands: early, open until an hour after the end, then closed', async () => {
    const { reference, token, startsAt } = await booked()
    const pre = await call('POST', `/public/booking/appointments/${reference}/video/preflight`, {}, { headers: { 'x-booking-token': token } })

    expect(pre.status).toBe(200)
    expect(pre.body.data.state).toBe('early')
    expect(pre.body.data.token).toBeUndefined()
    expect(pre.body.data.meetLink).toBeNull()

    const at = (minutes: number) => inDb(() => video.visitorPreflight({ reference, token }, new Date(startsAt.getTime() + minutes * 60_000)))

    expect((await at(1)).state).toBe('open')
    expect((await at(45)).state).toBe('open')
    expect((await at(95)).state).toBe('closed')
  })

  it('says cancelled for a cancelled appointment, and ended for an older room the owner closed', async () => {
    const { reference, token, id } = await booked()

    await database.db.query('UPDATE v2_booking_appointments SET video_ended_at = now() WHERE id = $1', [id])
    expect((await inDb(() => video.visitorPreflight({ reference, token }))).state).toBe('ended')

    expect((await call('POST', `/owner/calendar/appointments/${id}/cancel`, { reason: 'Ill', notify: false })).status).toBe(200)
    expect((await inDb(() => video.visitorPreflight({ reference, token }))).state).toBe('cancelled')
  })

  it('clears an older ended room when the appointment is moved', async () => {
    const { reference, token, id, startsAt } = await booked()
    const ended = async () =>
      (await database.db.query('SELECT video_ended_at FROM v2_booking_appointments WHERE id = $1', [id])).rows[0].video_ended_at
    const endRoom = () => database.db.query('UPDATE v2_booking_appointments SET video_ended_at = now() WHERE id = $1', [id])

    await endRoom()

    const revision = (await call('GET', `/owner/calendar/appointments/${id}`)).body.data.revision
    const ownerTarget = new Date(startsAt.getTime() + 3 * 3_600_000)

    expect((await call('PATCH', `/owner/calendar/appointments/${id}`, { revision, startsAt: ownerTarget.toISOString() })).status).toBe(200)
    expect(await ended()).toBeNull()

    await endRoom()

    const visitorTarget = (await firstSlot('video', time.addDays(dayAfterTomorrow(), 2))).startsAt
    const moved = await call('POST', `/public/booking/appointments/${reference}/reschedule`, { startsAt: visitorTarget }, {
      headers: { 'x-booking-token': token },
    })

    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    expect(await ended()).toBeNull()
    expect((await inDb(() => video.visitorPreflight({ reference, token }))).state).toBe('early')
  })

  it('refuses the call page for a phone appointment', async () => {
    const phone = await booked('phone')

    await expect(inDb(() => video.visitorPreflight({ reference: phone.reference, token: phone.token }))).rejects.toMatchObject({
      code: 'NOT_VIDEO',
    })
  })

  it('no longer offers in-site call seats to the visitor or the owner', async () => {
    const { reference, token, id } = await booked()
    const headers = { 'x-booking-token': token }

    expect((await call('POST', `/public/booking/appointments/${reference}/video/join`, {}, { headers })).status).toBe(404)
    expect((await call('POST', `/owner/calendar/appointments/${id}/video/join`, {})).status).toBe(404)
    expect((await call('POST', `/owner/calendar/appointments/${id}/video/end`, {})).status).toBe(404)
  })
})
