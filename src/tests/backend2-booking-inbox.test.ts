import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from './helpers/backend2-db'

/**
 * A booking's emails as the Inbox keeps them, against a real PostgreSQL in
 * this process.
 *
 * What matters: the visitor's email carries the private manage and video
 * links, the Inbox's own copy never does (`docs/v2/booking.md`: "a copy of
 * the database alone opens nothing"), a Retry still sends the real links, and
 * the conversation says the appointment's current time after a change.
 * Email is faked; nothing leaves the process.
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
const time = await import('#/backend2/modules/booking/booking.time')
const { PRIVATE_LINK_NOTES, redactPrivateLinks, restorePrivateLinks } = await import('#/backend2/modules/booking/booking.mail')

type Json = Record<string, any>

const database = await createTestDatabase()
const app = createAppForTest()

let sent: Array<{ to: string; subject: string; text: string; html: string; replyTo: string }> = []
let failSends = false

beforeEach(async () => {
  await database.reset()
  sent = []
  failSends = false
  useInboxTransportForTest({
    mode: 'fake',
    send: async (email) => {
      if (failSends) return { ok: false, provider: 'fake', reason: 'The email service had a problem.' }

      sent.push({ to: email.to, subject: email.subject, text: email.text, html: email.html, replyTo: email.replyTo })

      return { ok: true, provider: 'fake', providerMessageId: `p-${sent.length}` }
    },
  })
  useTurnstileForTest(undefined)
})

afterEach(() => {
  useInboxTransportForTest(undefined)
  useTurnstileForTest(undefined)
})

afterAll(async () => {
  await database.close()
})

/* ---------------------------------------------------------------- plumbing */

const call = async (
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Json }> => {
  const request = new Request(`http://localhost:3000/api/v2${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json', origin: 'http://localhost:3000' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const response = await runWithDb(database.db, async () => app.fetch(request))
  const text = await response.text()

  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Json) }
}

const setup = async () => {
  const type = await call('POST', '/owner/calendar/types', {
    slug: 'intro',
    enabled: true,
    durationMinutes: 30,
    bufferMinutes: 0,
    slotStepMinutes: 30,
    methods: ['video', 'in_person', 'phone'],
    texts: {
      de: { name: 'Erstgespräch', description: '' },
      en: { name: 'Intro call', description: 'A first talk' },
      ar: { name: 'مكالمة تعارف', description: '' },
    },
  })

  expect(type.status, JSON.stringify(type.body)).toBe(201)

  await call('PUT', '/owner/calendar/availability', {
    weekly: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 0, endMinute: 1440 })),
    exceptions: [],
  })
}

const dayAfterTomorrow = (): string => time.addDays(time.localParts(new Date(), 'Europe/Berlin').date, 2)

const slotOn = async (date: string): Promise<string> => {
  const result = await call('GET', `/public/booking/types/intro/slots?method=video&from=${date}&days=1&timeZone=Europe%2FBerlin`)

  expect(result.status, JSON.stringify(result.body)).toBe(200)

  return result.body.data.days[0].slots[10].startsAt
}

const book = async () => {
  await setup()

  const result = await call('POST', '/public/booking/appointments', {
    submissionId: crypto.randomUUID(),
    typeSlug: 'intro',
    method: 'video',
    timeZone: 'Europe/Berlin',
    language: 'en',
    name: 'Daniel Brandt',
    email: 'daniel@example.com',
    startsAt: await slotOn(dayAfterTomorrow()),
  })

  expect(result.status, JSON.stringify(result.body)).toBe(201)

  return result.body.data as { manageUrl: string; roomUrl: string; appointment: Json }
}

const credentialOf = (manageUrl: string): string => manageUrl.split('#')[1]!

const storedMessages = async () =>
  (await database.db.query(`SELECT * FROM v2_inbox_messages ORDER BY occurred_at, id`)).rows

/* ------------------------------------------------------------------- tests */

describe('a booking email in the Inbox', () => {
  it('sends the private links to the visitor and keeps them out of the Inbox’s copy', async () => {
    const booked = await book()
    const credential = credentialOf(booked.manageUrl)

    expect(credential).toMatch(/^[0-9a-f]{64}$/u)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.text).toContain(booked.manageUrl)
    expect(sent[0]!.text).toContain(booked.roomUrl)
    expect(sent[0]!.html).toContain(credential)

    const [message] = await storedMessages()

    expect(message.body_text).toContain(PRIVATE_LINK_NOTES.manage)
    expect(message.body_text).toContain(PRIVATE_LINK_NOTES.room)

    // Nowhere in the Inbox's tables — and not in what the owner's screen reads.
    const everything = JSON.stringify([
      (await database.db.query('SELECT * FROM v2_inbox_conversations')).rows,
      await storedMessages(),
    ])

    expect(everything).not.toContain(credential)

    const conversationId = message.conversation_id
    const detail = await call('GET', `/owner/inbox/conversations/${conversationId}`)

    expect(detail.status).toBe(200)
    expect(JSON.stringify(detail.body)).not.toContain(credential)
  })

  it('puts the real links back when the owner retries a failed email', async () => {
    failSends = true

    const booked = await book()
    const [message] = await storedMessages()

    expect(message.delivery_status).toBe('failed')

    failSends = false

    const retried = await call('POST', `/owner/inbox/messages/${message.id}/retry`)

    expect(retried.status, JSON.stringify(retried.body)).toBe(200)
    expect(retried.body.data.delivery.status).toBe('accepted')
    expect(sent).toHaveLength(1)
    expect(sent[0]!.text).toContain(booked.manageUrl)
    expect(sent[0]!.text).toContain(booked.roomUrl)
    expect(sent[0]!.text).not.toContain('only in the visitor')

    // The stored copy is still without them.
    expect(JSON.stringify(await storedMessages())).not.toContain(credentialOf(booked.manageUrl))
  })

  it('shows the new time in the conversation after a reschedule, in the same thread', async () => {
    const booked = await book()
    const reference = booked.appointment.reference as string
    const target = await slotOn(time.addDays(dayAfterTomorrow(), 1))
    const moved = await call(
      'POST',
      `/public/booking/appointments/${reference}/reschedule`,
      { startsAt: target },
      { 'x-booking-token': credentialOf(booked.manageUrl) },
    )

    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    expect(sent).toHaveLength(2)
    // One conversation, one reply address: the visitor's answers still thread.
    expect(new Set(sent.map((email) => email.replyTo)).size).toBe(1)

    const { rows } = await database.db.query('SELECT * FROM v2_inbox_conversations')

    expect(rows).toHaveLength(1)

    const newTime = time.formatForEmail(new Date(target), 'Europe/Berlin', 'en')

    expect(rows[0].facts.Appointment).toContain(newTime)
    expect(rows[0].subject).toBe(sent[1]!.subject)
    expect(rows[0].subject).toMatch(/^Appointment rescheduled/u)
    expect(rows[0].message_count).toBe(2)
  })

  it('names and restores exactly the manage and the video link', () => {
    const text = [
      'Join the video call: https://yamanwarda.de/en/booking/room/YW-ABCD2345#' + 'a'.repeat(64),
      'Change or cancel: https://yamanwarda.de/en/booking/manage/YW-ABCD2345#' + 'b'.repeat(64),
      'Book again: https://yamanwarda.de/en/booking',
    ].join('\n')
    const redacted = redactPrivateLinks(text)

    expect(redacted).toBe(
      [
        `Join the video call: ${PRIVATE_LINK_NOTES.room}`,
        `Change or cancel: ${PRIVATE_LINK_NOTES.manage}`,
        'Book again: https://yamanwarda.de/en/booking',
      ].join('\n'),
    )
    expect(
      restorePrivateLinks(redacted, {
        manageUrl: 'https://yamanwarda.de/en/booking/manage/YW-ABCD2345#' + 'b'.repeat(64),
        roomUrl: 'https://yamanwarda.de/en/booking/room/YW-ABCD2345#' + 'a'.repeat(64),
      }),
    ).toBe(text)
  })
})
