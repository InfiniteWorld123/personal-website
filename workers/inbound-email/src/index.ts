import PostalMime from 'postal-mime'
import { filesFrom } from './files'

/**
 * The letter carrier.
 *
 * Cloudflare Email Routing hands this Worker two kinds of message:
 *
 * - **An answer**, addressed to `reply+<token>@yamanwarda.de`. Email Routing
 *   keeps the `+part` and matches the rule on the base address (RFC 5233), so
 *   one rule on `reply@` catches every conversation.
 * - **Ordinary mail** to `info@yamanwarda.de`, once that rule points here —
 *   an invoice, a newsletter, a stranger. The owner asked for his real
 *   address in the admin, not a leads-only inbox.
 *
 * **A copy is always forwarded to the mailbox that used to receive it.** The
 * admin is new and this address is how clients reach him; a bug here would
 * cost him a client, and a duplicate in Gmail costs him nothing. Forwarding is
 * attempted after the site has taken the letter, so a failure to forward never
 * costs the record.
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
  /**
   * Kept as a safety net while the admin inbox is young: every letter is also
   * delivered to this address, exactly as it was before the Worker existed.
   * Unset means "do not forward", which is the right behaviour once the owner
   * trusts the admin and not a day sooner.
   */
  FORWARD_COPY_TO?: string
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
      inReplyTo: message.headers.get('in-reply-to') ?? '',
      // Named so the site can file a letter that belongs to no conversation
      // under the person who sent it, instead of dropping it.
      fromName: parsed.from?.name ?? '',
      files: filesFrom(parsed.attachments ?? []),
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
    if (response.ok) {
      await forwardCopy(message, env)

      return
    }

    console.error('inbound: the site refused the letter', { status: response.status })

    /*
     * A 5xx is the site's fault and the sender should be told, so their mail
     * client can retry rather than assume delivery. A 4xx is this letter's own
     * fault — an unknown token, a signature the site did not accept — and
     * retrying will not change it, so it ends here.
     */
    if (response.status >= 500) {
      // Forwarded first: rejecting ends the message, and the owner should
      // still receive a letter the site could not take.
      await forwardCopy(message, env)
      message.setReject('The mailbox is temporarily unavailable. Please try again later.')

      return
    }

    await forwardCopy(message, env)
  },
}

/**
 * Delivers the letter to the old mailbox as well.
 *
 * Failures are logged and swallowed on purpose: the letter is already
 * recorded, and throwing here would make Email Routing retry a message the
 * site has already stored — the same reply twice in the same conversation.
 */
const forwardCopy = async (message: ForwardableEmailMessage, env: Env): Promise<void> => {
  if (!env.FORWARD_COPY_TO) return

  try {
    await message.forward(env.FORWARD_COPY_TO)
  } catch (error) {
    console.error('inbound: the copy could not be forwarded', {
      name: error instanceof Error ? error.name : 'UnknownError',
    })
  }
}
