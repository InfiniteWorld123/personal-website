import { describe, expect, it, vi } from 'vitest'

vi.mock('#/shared/env', () => ({
  env: {
    BASE_URL: 'https://yamanwarda.de',
    APP_NAME: 'Yaman Warda',
    RESEND_API_KEY: 're_test',
    EMAIL_FROM: 'termin@yamanwarda.de',
    CONTACT_TO_EMAIL: 'owner@yamanwarda.de',
  },
}))

import {
  manageUrl,
  sendOwnerBookingMail,
  sendVisitorBookingMail,
  type BookingMailInput,
} from '#/backend/modules/bookings/booking.mail'

const input: BookingMailInput = {
  reference: 'BK-ABC123',
  startsAt: new Date('2026-09-17T07:00:00.000Z'),
  endsAt: new Date('2026-09-17T07:30:00.000Z'),
  durationMinutes: 30,
  visitorName: 'Katrin Vogel',
  visitorEmail: 'k.vogel@blumenhaus-erfurt.de',
  visitorTimezone: 'Europe/Berlin',
  visitorNote: 'Bestellungen laufen noch per Telefon.',
  language: 'de',
  typeName: 'Erstgespräch',
  locationLabel: 'Videocall',
}

/** The one request Resend was sent, parsed. */
const captureMail = async (send: () => Promise<void>) => {
  const fetch = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetch)

  await send()

  const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  const body = JSON.parse(String(init.body)) as {
    to: string[]
    subject: string
    html: string
    text: string
  }
  vi.unstubAllGlobals()

  return body
}

describe('booking management link', () => {
  it('uses the noindex management route rather than the booking-type route', () => {
    const url = manageUrl('BK-ABC123', 'token value', 'de')

    expect(url).toContain('/de/booking/manage/BK-ABC123#token=token%20value')
    expect(url).not.toContain('?token=')
  })
})

describe('the owner notification', () => {
  it('carries the reason the visitor gave for cancelling', async () => {
    const mail = await captureMail(() =>
      sendOwnerBookingMail(
        { ...input, cancellationReason: 'Der Termin kollidiert mit einer Lieferung.' },
        true,
      ),
    )

    expect(mail.to).toEqual(['owner@yamanwarda.de'])
    expect(mail.subject).toContain('Absage')
    expect(mail.html).toContain('Grund der Absage')
    expect(mail.html).toContain('Der Termin kollidiert mit einer Lieferung.')
    expect(mail.text).toContain('Grund der Absage: Der Termin kollidiert mit einer Lieferung.')
  })

  it('leaves the reason out when nobody gave one', async () => {
    const mail = await captureMail(() => sendOwnerBookingMail(input, true))

    expect(mail.html).not.toContain('Grund der Absage')
  })
})

describe('the visitor letter', () => {
  it('offers the management link while the booking stands', async () => {
    const mail = await captureMail(() =>
      sendVisitorBookingMail({ ...input, manageToken: 'plain-token' }, false),
    )

    expect(mail.to).toEqual(['k.vogel@blumenhaus-erfurt.de'])
    expect(mail.html).toContain('/de/booking/manage/BK-ABC123')
    expect(mail.html).toContain('BK-ABC123')
  })

  it('offers a new time instead of a dead link once it is cancelled', async () => {
    const mail = await captureMail(() =>
      sendVisitorBookingMail({ ...input, manageToken: 'plain-token' }, true),
    )

    expect(mail.html).toContain('Neuen Termin buchen')
    expect(mail.html).toContain('https://yamanwarda.de/de/booking')
    expect(mail.html).not.toContain('#token=')
  })
})
