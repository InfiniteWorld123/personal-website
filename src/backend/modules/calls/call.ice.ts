import { env } from '#/shared/env'
import type { CallIceServer } from '#/shared/types/call.types'

/**
 * The addresses two browsers use to find each other.
 *
 * Most of the time a call needs only STUN: a browser asks a public server
 * "what does my address look like from out there?", tells the other side, and
 * the two connect directly. No video passes through anyone.
 *
 * Roughly a tenth of the time that fails — a strict company firewall, a mobile
 * carrier's symmetric NAT — and the two can only meet through a relay in the
 * middle. That is TURN, and it is the only part of a call that costs money,
 * because the video really does travel through it. Cloudflare gives 1,000 GB a
 * month before charging, which is about two thousand half-hour calls; this
 * site will hold twenty.
 *
 * Credentials are short-lived and minted per call. A long-lived TURN username
 * in a JavaScript bundle is a relay anyone on the internet may use at the
 * owner's expense.
 */

const CLOUDFLARE_STUN: CallIceServer = { urls: ['stun:stun.cloudflare.com:3478'] }

/** A call lasts an hour at most; credentials outlive it by a margin and no more. */
const CREDENTIAL_TTL_SECONDS = 2 * 60 * 60

type CloudflareIceResponse = {
  iceServers?: CallIceServer | CallIceServer[]
}

export const getIceServers = async (): Promise<CallIceServer[]> => {
  const keyId = env.TURN_KEY_ID
  const apiToken = env.TURN_KEY_API_TOKEN

  // Unconfigured is a working call for most people, not a broken one. STUN
  // alone connects the large majority; the tenth that needs a relay sees the
  // connection fail and is told to try the phone number in their email.
  if (!keyId || !apiToken) return [CLOUDFLARE_STUN]

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
      },
    )

    if (!response.ok) {
      console.error('call: TURN credentials refused', response.status)

      return [CLOUDFLARE_STUN]
    }

    const body = (await response.json()) as CloudflareIceResponse
    const servers = body.iceServers

    if (!servers) return [CLOUDFLARE_STUN]

    // The API has returned both a single object and an array of them over its
    // life. Accepting either costs one line and removes a whole class of
    // outage that would only ever show up in production.
    const list = Array.isArray(servers) ? servers : [servers]
    const usable = list.filter((server) => Array.isArray(server.urls) && server.urls.length > 0)

    return usable.length > 0 ? usable : [CLOUDFLARE_STUN]
  } catch (error) {
    // A call that connects directly does not need this request to have
    // succeeded, so a failure here degrades rather than refuses.
    console.error('call: TURN credentials unreachable', error)

    return [CLOUDFLARE_STUN]
  }
}
