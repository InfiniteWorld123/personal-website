import { afterEach, describe, expect, it, vi } from 'vitest'
import { bookingMail } from '#/backend2/modules/booking/booking.mail'
import {
  DEFAULT_GUEST_PRESET,
  fixedMeetingLink,
  DEFAULT_HOST_PRESET,
  realtimeKitConfig,
  realtimeKitProvider,
  resolveVideoProvider,
  VideoUnavailableError,
} from '#/backend2/modules/booking/booking.video'

type Sent = { url: string; method: string; body: any; auth: string | null }

/** A stand-in for Cloudflare's API that records every request it gets. */
const fakeCloudflare = (answer: (sent: Sent) => { status?: number; body: unknown }) => {
  const sent: Sent[] = []
  const fetcher = (async (url: string, init: RequestInit) => {
    const request: Sent = {
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      auth: new Headers(init.headers).get('authorization'),
    }

    sent.push(request)

    const { status = 200, body } = answer(request)

    return new Response(JSON.stringify(body), { status })
  }) as unknown as typeof fetch

  return { sent, fetcher }
}

const config = { accountId: 'acc', appId: 'app', apiToken: 'secret', hostPreset: 'host-p', guestPreset: 'guest-p' }
const base = 'https://api.cloudflare.com/client/v4/accounts/acc/realtime/kit/app'

afterEach(() => vi.restoreAllMocks())

describe('RealtimeKit settings', () => {
  const live = { BOOKING_VIDEO_MODE: 'live', REALTIMEKIT_APP_ID: 'app', REALTIMEKIT_API_TOKEN: 'secret' }

  it('switches on only with live mode, an app and a token; the account falls back to CF_ACCOUNT_ID', () => {
    expect(realtimeKitConfig({ ...live, CF_ACCOUNT_ID: 'cf' })).toEqual({
      accountId: 'cf',
      appId: 'app',
      apiToken: 'secret',
      hostPreset: DEFAULT_HOST_PRESET,
      guestPreset: DEFAULT_GUEST_PRESET,
    })
    expect(realtimeKitConfig({ ...live, REALTIMEKIT_ACCOUNT_ID: 'own', CF_ACCOUNT_ID: 'cf' })?.accountId).toBe('own')
    expect(realtimeKitConfig({ ...live, CF_ACCOUNT_ID: 'cf', REALTIMEKIT_HOST_PRESET: 'h', REALTIMEKIT_GUEST_PRESET: 'g' })).toMatchObject({
      hostPreset: 'h',
      guestPreset: 'g',
    })
    expect(realtimeKitConfig({ ...live })).toBeNull()
    expect(realtimeKitConfig({ ...live, CF_ACCOUNT_ID: 'cf', BOOKING_VIDEO_MODE: 'test' })).toBeNull()
    expect(realtimeKitConfig({ ...live, CF_ACCOUNT_ID: 'cf', REALTIMEKIT_API_TOKEN: ' ' })).toBeNull()
  })

  it('is honest in production without them, and a fake room locally', () => {
    expect(resolveVideoProvider({ NODE_ENV: 'production' }).name).toBe('unavailable')
    expect(resolveVideoProvider({ NODE_ENV: 'development' }).name).toBe('fake')
    expect(resolveVideoProvider({ ...live, CF_ACCOUNT_ID: 'cf', NODE_ENV: 'production' }).name).toBe('realtimekit')
  })
})

describe('RealtimeKit requests', () => {
  it('creates a meeting with recording, streaming, stored chat and transcripts off', async () => {
    const cf = fakeCloudflare(() => ({ body: { success: true, data: { id: 'm-1' } } }))

    await expect(realtimeKitProvider(config, cf.fetcher).createMeeting({ title: 'Intro · ABC' })).resolves.toEqual({ meetingId: 'm-1' })
    expect(cf.sent).toEqual([
      {
        url: `${base}/meetings`,
        method: 'POST',
        auth: 'Bearer secret',
        body: {
          title: 'Intro · ABC',
          record_on_start: false,
          live_stream_on_start: false,
          persist_chat: false,
          transcribe_on_end: false,
          summarize_on_end: false,
        },
      },
    ])
  })

  it('adds each person once with their preset, then only refreshes their token', async () => {
    const cf = fakeCloudflare((sent) =>
      sent.url.endsWith('/token')
        ? { body: { success: true, data: { token: 'fresh' } } }
        : { body: { success: true, data: { id: 'p-9', token: 'first' } } },
    )
    const provider = realtimeKitProvider(config, cf.fetcher)

    await expect(provider.participantToken({ meetingId: 'm-1', participantId: null, role: 'guest', name: 'Dana' })).resolves.toEqual({
      participantId: 'p-9',
      token: 'first',
    })
    await expect(provider.participantToken({ meetingId: 'm-1', participantId: null, role: 'host', name: 'Yaman' })).resolves.toMatchObject({
      participantId: 'p-9',
    })
    await expect(provider.participantToken({ meetingId: 'm-1', participantId: 'p-9', role: 'guest', name: 'Dana' })).resolves.toEqual({
      participantId: 'p-9',
      token: 'fresh',
    })

    expect(cf.sent.map((s) => [s.method, s.url.replace(base, ''), s.body])).toEqual([
      ['POST', '/meetings/m-1/participants', { name: 'Dana', preset_name: 'guest-p', custom_participant_id: 'guest-m-1' }],
      ['POST', '/meetings/m-1/participants', { name: 'Yaman', preset_name: 'host-p', custom_participant_id: 'host-m-1' }],
      ['POST', '/meetings/m-1/participants/p-9/token', undefined],
    ])
  })

  it('treats a refusal, a network failure or an answer without an id or token as "not available"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const refused = fakeCloudflare(() => ({ status: 401, body: { success: false, errors: [{ message: 'Dana is not allowed' }] } }))
    const hollow = fakeCloudflare(() => ({ body: { success: true, data: {} } }))
    const says = fakeCloudflare(() => ({ body: { success: false } }))
    const offline = (async () => {
      throw new TypeError('network down')
    }) as unknown as typeof fetch

    await expect(realtimeKitProvider(config, refused.fetcher).createMeeting({ title: 't' })).rejects.toBeInstanceOf(VideoUnavailableError)
    await expect(realtimeKitProvider(config, hollow.fetcher).createMeeting({ title: 't' })).rejects.toBeInstanceOf(VideoUnavailableError)
    await expect(realtimeKitProvider(config, says.fetcher).createMeeting({ title: 't' })).rejects.toBeInstanceOf(VideoUnavailableError)
    await expect(realtimeKitProvider(config, offline).createMeeting({ title: 't' })).rejects.toBeInstanceOf(VideoUnavailableError)
    await expect(
      realtimeKitProvider(config, hollow.fetcher).participantToken({ meetingId: 'm', participantId: null, role: 'guest', name: 'x' }),
    ).rejects.toBeInstanceOf(VideoUnavailableError)
    await expect(
      realtimeKitProvider(config, hollow.fetcher).participantToken({ meetingId: 'm', participantId: 'p', role: 'guest', name: 'x' }),
    ).rejects.toBeInstanceOf(VideoUnavailableError)

    // The log carries a status, never the provider's words.
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('Dana')
  })

  it('ends a call by removing both people, then closing the room — even with nobody in it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const cf = fakeCloudflare((sent) => (sent.url.endsWith('/kick') ? { status: 404, body: { success: false } } : { body: { success: true, data: {} } }))

    await realtimeKitProvider(config, cf.fetcher).endMeeting('m-1')

    expect(cf.sent.map((s) => [s.method, s.url.replace(base, ''), s.body])).toEqual([
      ['POST', '/meetings/m-1/active-session/kick', { custom_participant_ids: ['host-m-1', 'guest-m-1'] }],
      ['PATCH', '/meetings/m-1', { status: 'INACTIVE' }],
    ])
  })
})

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
