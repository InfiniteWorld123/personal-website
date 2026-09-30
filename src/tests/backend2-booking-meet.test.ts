import { describe, expect, it } from 'vitest'
import { bookingMail } from '#/backend2/modules/booking/booking.mail'
import { fixedMeetingLink } from '#/backend2/modules/booking/booking.video'

describe('the fixed Google Meet room', () => {
  it('takes only a real Meet address', () => {
    expect(fixedMeetingLink({ BOOKING_MEET_LINK: ' https://meet.google.com/pfj-yvde-wyu ' })).toBe('https://meet.google.com/pfj-yvde-wyu')
    expect(fixedMeetingLink({})).toBeNull()
    expect(fixedMeetingLink({ BOOKING_MEET_LINK: 'https://evil.example/pfj-yvde-wyu' })).toBeNull()
    expect(fixedMeetingLink({ BOOKING_MEET_LINK: 'http://meet.google.com/pfj-yvde-wyu' })).toBeNull()
  })

  it('puts the Meet link in a video booking email, and the call page link otherwise', () => {
    const input = {
      kind: 'confirmation' as const,
      language: 'de' as const,
      visitorName: 'Dana',
      typeName: 'Erstgespräch',
      startsAt: new Date('2026-10-05T08:00:00.000Z'),
      timeZone: 'Europe/Berlin',
      method: 'video' as const,
      phone: null,
      reference: 'YW-ABCDEFGH',
      manageUrl: 'https://yamanwarda.de/de/booking/manage/YW-ABCDEFGH#0123456789abcdef0123',
      roomUrl: 'https://yamanwarda.de/de/booking/room/YW-ABCDEFGH#0123456789abcdef0123',
    }
    const meet = bookingMail(input, 'https://meet.google.com/pfj-yvde-wyu').text
    const site = bookingMail(input, null).text

    expect(meet).toContain('Zum Videocall auf Google Meet: https://meet.google.com/pfj-yvde-wyu')
    expect(meet).not.toContain('/booking/room/')
    expect(site).toContain('/booking/room/')
  })
})
