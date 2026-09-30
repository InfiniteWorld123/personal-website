import { isProductionEnvironment } from '../../security/runtime-mode'

/**
 * The video room, behind an adapter.
 *
 * `docs/v2/booking.md`: Cloudflare RealtimeKit is the media layer, and it is a
 * future deployment dependency — "not something to activate, pay for, or
 * deploy during planning/local implementation". So there are three adapters:
 *
 *  - **fake**, the default off production: it issues opaque test tokens and
 *    records nothing. It proves the rules Backend2 enforces, not that a call
 *    works.
 *  - **realtimekit**, used only when `BOOKING_VIDEO_MODE=live`, the app id and
 *    the API token exist (the account id falls back to `CF_ACCOUNT_ID`).
 *    Written against Cloudflare's published REST API.
 *  - **unavailable**, in production without that opt-in: every join answers
 *    `PROVIDER_UNAVAILABLE` instead of pretending.
 *
 * Nothing here ever reaches the browser except a participant's own short-lived
 * token. The API token that creates meetings stays on the server.
 */

type Env = Record<string, string | undefined>

export type VideoProvider = {
  name: 'fake' | 'realtimekit' | 'unavailable'
  /** A meeting with recording, transcription and export off. */
  createMeeting(input: { title: string }): Promise<{ meetingId: string }>
  /** Adds one participant, or refreshes that same participant's token. */
  participantToken(input: {
    meetingId: string
    participantId: string | null
    role: 'host' | 'guest'
    name: string
  }): Promise<{ participantId: string; token: string }>
  endMeeting(meetingId: string): Promise<void>
}

export class VideoUnavailableError extends Error {}

let override: VideoProvider | undefined

export const useVideoProviderForTest = (provider: VideoProvider | undefined): void => {
  override = provider
}

const fakeProvider: VideoProvider = {
  name: 'fake',
  createMeeting: async () => ({ meetingId: `fake-meeting-${crypto.randomUUID()}` }),
  participantToken: async (input) => ({
    participantId: input.participantId ?? `fake-${input.role}-${crypto.randomUUID()}`,
    token: `fake-token-${crypto.randomUUID()}`,
  }),
  endMeeting: async () => {},
}

const unavailableProvider: VideoProvider = {
  name: 'unavailable',
  createMeeting: async () => {
    throw new VideoUnavailableError('Video is not configured')
  },
  participantToken: async () => {
    throw new VideoUnavailableError('Video is not configured')
  },
  endMeeting: async () => {},
}

export type RealtimeKitConfig = {
  accountId: string
  appId: string
  apiToken: string
  hostPreset: string
  guestPreset: string
}

/**
 * The presets an app gets when it is created in the Cloudflare dashboard.
 * Recording, transcription and streaming never start by themselves: each
 * meeting below is created with all of them off, and the call screen offers
 * no button that starts one.
 */
export const DEFAULT_HOST_PRESET = 'group_call_host'
export const DEFAULT_GUEST_PRESET = 'group_call_participant'

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * RealtimeKit over REST (`developers.cloudflare.com/api/resources/realtime_kit`).
 * Every answer is checked: an id or token that is missing is a failure, never
 * an empty string stored or handed to a browser.
 */
export const realtimeKitProvider = (config: RealtimeKitConfig, fetcher: typeof fetch = fetch): VideoProvider => {
  const base = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/realtime/kit/${config.appId}`
  const call = async (path: string, init: RequestInit): Promise<any> => {
    let response: Response

    try {
      response = await fetcher(`${base}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${config.apiToken}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new VideoUnavailableError('The video service could not be reached')
    }

    const body = await response.json().catch(() => null)

    if (!response.ok || body?.success === false) {
      // The status only: the provider's answer can echo a participant's name.
      console.error('Backend2 video provider refused', { status: response.status, path: path.split('/')[1] })

      throw new VideoUnavailableError('The video service refused the request')
    }

    return body
  }

  return {
    name: 'realtimekit',
    createMeeting: async (input) => {
      const body = await call('/meetings', {
        method: 'POST',
        body: JSON.stringify({
          title: input.title,
          record_on_start: false,
          live_stream_on_start: false,
          persist_chat: false,
          transcribe_on_end: false,
          summarize_on_end: false,
        }),
      })
      const meetingId = text(body?.data?.id)

      if (!meetingId) throw new VideoUnavailableError('The video service returned no meeting')

      return { meetingId }
    },
    participantToken: async (input) => {
      if (input.participantId) {
        const body = await call(`/meetings/${input.meetingId}/participants/${input.participantId}/token`, { method: 'POST' })
        const token = text(body?.data?.token)

        if (!token) throw new VideoUnavailableError('The video service returned no token')

        return { participantId: input.participantId, token }
      }

      const body = await call(`/meetings/${input.meetingId}/participants`, {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          preset_name: input.role === 'host' ? config.hostPreset : config.guestPreset,
          custom_participant_id: `${input.role}-${input.meetingId}`,
        }),
      })
      const participantId = text(body?.data?.id)
      const token = text(body?.data?.token)

      if (!participantId || !token) throw new VideoUnavailableError('The video service returned no participant')

      return { participantId, token }
    },
    endMeeting: async (meetingId) => {
      // Out of the running call first — INACTIVE alone only stops new joins.
      // No live session answers 404, which is fine: there is nobody to remove.
      await call(`/meetings/${meetingId}/active-session/kick`, {
        method: 'POST',
        body: JSON.stringify({ custom_participant_ids: [`host-${meetingId}`, `guest-${meetingId}`] }),
      }).catch(() => {})
      await call(`/meetings/${meetingId}`, { method: 'PATCH', body: JSON.stringify({ status: 'INACTIVE' }) })
    },
  }
}

/** The live settings, or null when video is not switched on here. */
export const realtimeKitConfig = (environment: Env): RealtimeKitConfig | null => {
  const accountId = text(environment.REALTIMEKIT_ACCOUNT_ID) || text(environment.CF_ACCOUNT_ID)
  const appId = text(environment.REALTIMEKIT_APP_ID)
  const apiToken = text(environment.REALTIMEKIT_API_TOKEN)

  if (text(environment.BOOKING_VIDEO_MODE) !== 'live' || !accountId || !appId || !apiToken) return null

  return {
    accountId,
    appId,
    apiToken,
    hostPreset: text(environment.REALTIMEKIT_HOST_PRESET) || DEFAULT_HOST_PRESET,
    guestPreset: text(environment.REALTIMEKIT_GUEST_PRESET) || DEFAULT_GUEST_PRESET,
  }
}

/**
 * The owner's fixed Google Meet room (`BOOKING_MEET_LINK`), chosen on
 * 30 Sep 2026 over RealtimeKit for now. When set, video appointments meet
 * there: the emails, the visitor's call page and the Dashboard all point to
 * it, and the owner admits the visitor. Only a real Meet address counts.
 */
export const fixedMeetingLink = (environment: Env = process.env): string | null => {
  const link = text(environment.BOOKING_MEET_LINK)

  return /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/u.test(link) ? link : null
}

export const resolveVideoProvider = (environment: Env = process.env): VideoProvider => {
  if (override) return override

  const config = realtimeKitConfig(environment)

  if (config) return realtimeKitProvider(config)

  return isProductionEnvironment(environment) ? unavailableProvider : fakeProvider
}
