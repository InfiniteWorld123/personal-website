import PostalMime from 'postal-mime'

/**
 * The letter carrier.
 *
 * Cloudflare Email Routing hands this Worker every message addressed to
 * `reply@yamanwarda.de` — including the sub-addressed form the inbox sends as
 * its Reply-To, `reply+<token>@yamanwarda.de`, because Email Routing keeps the
 * `+part` and matches the rule on the base address (RFC 5233).
 *
 * All this Worker does is turn the letter into JSON, sign it, and hand it to
 * the site. It never decides anything: the site verifies the signature over
 * the exact bytes sent, finds the conversation by the token in the address,
 * and refuses everything else.
 *
 * It is deliberately a separate Worker from the site. An email handler cannot
 * live on the site's Worker without making every page deploy an email deploy
 * too, and this one has exactly one job.
 */

type Env = {
  /** Shared with the site. The signature is worthless if these differ. */
  INBOUND_MAIL_SECRET: string
  /** Where the site listens, e.g. https://yamanwarda.de/api/inbound-email */
  INBOUND_ENDPOINT: string
}

const toHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const sign = async (body: string, secret: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    if (!env.INBOUND_MAIL_SECRET || !env.INBOUND_ENDPOINT) {
      console.error('inbound: not configured')
      // Refusing is better than swallowing: the sender learns it did not arrive.
      message.setReject('This address is not accepting mail right now.')

      return
    }

    const parsed = await PostalMime.parse(message.raw)

    const payload = JSON.stringify({
      // The envelope recipient carries the token; the parsed headers do not
      // always, because a client may have written a different To.
      to: [message.to],
      from: message.from,
      subject: parsed.subject ?? message.headers.get('subject') ?? '',
      text: parsed.text ?? '',
      html: parsed.html ?? '',
      messageId: message.headers.get('message-id') ?? '',
    })

    const response = await fetch(env.INBOUND_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-inbound-signature': await sign(payload, env.INBOUND_MAIL_SECRET),
      },
      body: payload,
    })

    // 2xx means the site took it — recorded, or knowingly dropped as unmatched.
    if (response.ok) return

    console.error('inbound: the site refused the letter', { status: response.status })

    /*
     * A 5xx is the site's fault and the sender should be told, so their mail
     * client can retry rather than assume delivery. A 4xx is this letter's own
     * fault — an unknown token, a signature the site did not accept — and
     * retrying will not change it, so it ends here.
     */
    if (response.status >= 500) {
      message.setReject('The mailbox is temporarily unavailable. Please try again later.')
    }
  },
}
