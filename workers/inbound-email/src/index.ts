import PostalMime from 'postal-mime'
import { type DeliveryEnv, deliver } from './deliver'

/**
 * The letter carrier.
 *
 * Cloudflare Email Routing hands this Worker two kinds of message:
 *
 * - **An answer**, addressed to `reply+<token>@yamanwarda.de`. Email Routing
 *   keeps the `+part` and matches the rule on the base address (RFC 5233) —
 *   with "Subaddressing" switched on in Email Routing → Settings — so one
 *   rule on `reply@` catches every conversation.
 * - **Ordinary mail** to `info@yamanwarda.de` — an invoice, a newsletter, a
 *   stranger. The owner wants his real address in the Dashboard Inbox.
 *
 * **A copy is always forwarded to the mailbox that used to receive it**
 * (`FORWARD_COPY_TO`), before anything else is done with the letter. That
 * mailbox is the fallback: if the site is down or refuses the letter, the
 * owner still has it.
 *
 * Then the letter is turned into JSON, signed, and handed to the V2 Inbox
 * (`INBOX_V2_ENDPOINT`, `INBOX_INGRESS_SECRET`), and — while it is still
 * configured — to the legacy admin inbox (`INBOUND_ENDPOINT`,
 * `INBOUND_MAIL_SECRET`). The Worker decides nothing about conversations: the
 * site verifies the signature over the exact bytes sent and files the letter.
 * All of that is in `deliver.ts`, so it can be tested without Cloudflare.
 *
 * It is deliberately a separate Worker from the site. An email handler cannot
 * live on the site's Worker without making every page deploy an email deploy
 * too, and this one has exactly one job.
 */
export default {
  async email(message: ForwardableEmailMessage, env: DeliveryEnv): Promise<void> {
    await deliver(message, env, { parse: (raw) => PostalMime.parse(raw) })
  },
}
