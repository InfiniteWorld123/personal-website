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
 *  - **realtimekit**, used only when `BOOKING_VIDEO_MODE=live` and its three
 *    server-only settings exist. It is written against Cloudflare's published
 *    REST API and has **never been run** against a real account: verifying it
 *    is a cutover step.
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

/**
 * RealtimeKit over REST. Presets `booking_host` and `booking_guest` must exist
 * in the RealtimeKit app with recording, transcription, streaming and chat
 * persistence switched off — configured in Cloudflare, verified at cutover.
 */
const realtimeKitProvider = (config: { accountId: string; appId: string; apiToken: string }): VideoProvider => {
  const base = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/realtime/kit/${config.appId}`
  const call = async (path: string, init: RequestInit): Promise<any> => {
    let response: Response

    try {
      response = await fetch(`${base}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${config.apiToken}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new VideoUnavailableError('The video service could not be reached')
    }

    if (!response.ok) {
      console.error('Backend2 video provider refused', { status: response.status })

      throw new VideoUnavailableError('The video service refused the request')
    }

    return response.json().catch(() => ({}))
  }

  return {
    name: 'realtimekit',
    createMeeting: async (input) => {
      const body = await call('/meetings', {
        method: 'POST',
        body: JSON.stringify({ title: input.title, record_on_start: false, persist_chat: false }),
      })

      return { meetingId: String(body?.data?.id ?? '') }
    },
    participantToken: async (input) => {
      if (input.participantId) {
        const body = await call(`/meetings/${input.meetingId}/participants/${input.participantId}/token`, { method: 'POST' })

        return { participantId: input.participantId, token: String(body?.data?.token ?? '') }
      }

      const body = await call(`/meetings/${input.meetingId}/participants`, {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          preset_name: input.role === 'host' ? 'booking_host' : 'booking_guest',
          custom_participant_id: `${input.role}-${input.meetingId}`,
        }),
      })

      return { participantId: String(body?.data?.id ?? ''), token: String(body?.data?.token ?? '') }
    },
    endMeeting: async (meetingId) => {
      await call(`/meetings/${meetingId}`, { method: 'PATCH', body: JSON.stringify({ status: 'INACTIVE' }) })
    },
  }
}

export const resolveVideoProvider = (environment: Env = process.env): VideoProvider => {
  if (override) return override

  const accountId = environment.REALTIMEKIT_ACCOUNT_ID?.trim()
  const appId = environment.REALTIMEKIT_APP_ID?.trim()
  const apiToken = environment.REALTIMEKIT_API_TOKEN?.trim()

  if (environment.BOOKING_VIDEO_MODE?.trim() === 'live' && accountId && appId && apiToken) {
    return realtimeKitProvider({ accountId, appId, apiToken })
  }

  return isProductionEnvironment(environment) ? unavailableProvider : fakeProvider
}
