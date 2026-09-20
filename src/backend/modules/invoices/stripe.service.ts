import { getDb } from '#/backend/db/client'
import { env } from '#/shared/env'
import type { Invoice } from '#/shared/types/invoice.types'
import { DOCUMENT_TITLE } from '#/shared/validation/invoice.validation'

/**
 * Paying an invoice by card.
 *
 * Stripe's API directly, doing exactly one job: carry the money and say when
 * it arrived. **He stays the seller and his invoice stays the document** —
 * which is why a Merchant of Record was refused (Polar would have issued its
 * own invoice for the same money) and why the Better Auth plugin was too (user
 * accounts his clients do not have, subscriptions only, and a third meaning
 * for a word `0022` had just finished making singular).
 *
 * Nothing here is required. Without a key an invoice simply says "pay by
 * transfer", which is what every invoice said until today.
 */

const API = 'https://api.stripe.com/v1'

export const stripeReady = (): boolean => Boolean(env.STRIPE_SECRET_KEY)

/**
 * Stripe speaks `application/x-www-form-urlencoded`, including for nesting.
 *
 * `line_items[0][price]` rather than JSON — their API has always been form
 * encoded, and sending JSON gets a cheerful 200 with every field ignored.
 */
const form = (fields: Record<string, string | number>): string =>
  new URLSearchParams(
    Object.entries(fields).map(([key, value]) => [key, String(value)]),
  ).toString()

const call = async <T>(
  path: string,
  fields: Record<string, string | number>,
  method: 'POST' | 'GET' = 'POST',
): Promise<T> => {
  const response = await fetch(`${API}/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY ?? ''}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    ...(method === 'POST' ? { body: form(fields) } : {}),
  })

  const body = (await response.json()) as { error?: { message?: string } }

  if (!response.ok) {
    throw new Error(body.error?.message ?? `Stripe refused ${path} (${response.status})`)
  }

  return body as T
}

/* -------------------------------------------------------------------------- */
/* Making the link                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A payment link for exactly this invoice, made once at issue.
 *
 * A **Payment Link**, not a Checkout Session. A session expires within a day
 * and an invoice is due in fourteen, so a client paying on the twelfth would
 * meet a dead page and no way to say so. A link does not expire.
 *
 * Two calls, because Stripe's payment links need a price object rather than an
 * inline amount — the product is created inline with the price, so it is two
 * rather than three.
 *
 * `metadata.invoice_id` is the whole reason the webhook can find its way home.
 * The amount is the invoice's **total**, gross, exactly what the client owes;
 * Stripe's fee is deducted from the payout and is his expense, not a part of
 * the debt the client still carries.
 */
export const createPaymentLink = async (
  invoice: Invoice,
): Promise<{ url: string; id: string } | null> => {
  if (!stripeReady() || invoice.totalCents <= 0 || !invoice.number) return null

  const title = DOCUMENT_TITLE[invoice.language][invoice.kind]

  const price = await call<{ id: string }>('prices', {
    currency: invoice.currency.toLowerCase(),
    unit_amount: invoice.totalCents,
    'product_data[name]': `${title} ${invoice.number}`,
  })

  const link = await call<{ id: string; url: string }>('payment_links', {
    'line_items[0][price]': price.id,
    'line_items[0][quantity]': 1,
    // Home again. The webhook reads this to know which invoice was paid, and
    // nothing else in the payload can tell it.
    'metadata[invoice_id]': invoice.id,
    'metadata[invoice_number]': invoice.number,
    // So his Stripe dashboard reads like his books rather than like a list of
    // anonymous amounts.
    'payment_intent_data[metadata][invoice_id]': invoice.id,
    'payment_intent_data[description]': `${title} ${invoice.number}`,
  })

  await getDb().query('UPDATE invoices SET pay_url = $2, pay_link_id = $3 WHERE id = $1;', [
    invoice.id,
    link.url,
    link.id,
  ])

  return { url: link.url, id: link.id }
}

/**
 * Keeps the link's life tied to one rule: **it is on exactly while paying the
 * full amount is the right thing to do.**
 *
 * Found the hard way on 20 Sep, from the paid side: an invoice was settled by
 * card and its link stayed active at Stripe. A client's accountant finding
 * that link in the mail a month later pays the whole invoice a second time —
 * a real double charge off a client's card, which this system would then
 * politely record as an overpayment he owes back.
 *
 * So instead of closing the link at each place that might settle an invoice
 * (and missing one, which is how the paid case slipped past the cancelled
 * case), every event that moves money calls this one function, and it derives
 * the answer from the books:
 *
 *     active  ⇔  ISSUED invoice, and what is owed still equals the total
 *
 * That kills the link on full payment, on any partial payment or credit note
 * (the link's fixed amount no longer matches what is owed — paying it would
 *  overcharge), and on cancellation. And it **revives** the link when a
 * mistyped payment is deleted and the invoice is whole again — the same rule
 * read in the other direction.
 *
 * Deactivating rather than deleting, because Stripe keeps its record either
 * way and a deleted link loses the trail back to why.
 */
export const syncPaymentLink = async (invoiceId: string): Promise<void> => {
  if (!stripeReady()) return

  const found = await getDb().query<{
    pay_link_id: string | null
    status: string
    kind: string
    total_cents: number | string
    settled_cents: number | string
  }>(
    `SELECT i.pay_link_id, i.status, i.kind, i.total_cents,
            ((SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p WHERE p.invoice_id = i.id)
             + (SELECT COALESCE(SUM(n.total_cents), 0) FROM invoices n
                 WHERE n.corrects_id = i.id AND n.kind = 'CREDIT_NOTE' AND n.status = 'ISSUED')
            ) AS settled_cents
       FROM invoices i WHERE i.id = $1;`,
    [invoiceId],
  )

  const row = found.rows[0]

  if (!row?.pay_link_id) return

  const untouched = Number(row.settled_cents) === 0
  const shouldBeActive =
    row.status === 'ISSUED' && row.kind === 'INVOICE' && untouched && Number(row.total_cents) > 0

  const link = await call<{ active: boolean }>(`payment_links/${row.pay_link_id}`, {}, 'GET')

  if (link.active !== shouldBeActive) {
    await call(`payment_links/${row.pay_link_id}`, { active: String(shouldBeActive) })
  }
}

/* -------------------------------------------------------------------------- */
/* Believing a message                                                        */
/* -------------------------------------------------------------------------- */

const encoder = new TextEncoder()

/**
 * Constant-time comparison.
 *
 * `a === b` on a signature leaks how many leading characters were right,
 * through how long it took to say no. That is enough to guess a signature one
 * character at a time, given patience — and the endpoint it protects can mark
 * any invoice paid.
 */
const sameSignature = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false

  let difference = 0

  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }

  return difference === 0
}

const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/**
 * Five minutes, which is Stripe's own recommendation.
 *
 * Without it a signed message stays valid for ever: anyone who once saw a
 * genuine payload — a proxy log, a screenshot, a misconfigured mirror — could
 * replay it a year later and book the payment again. The `external_id` index
 * would catch a replay of the *same* payment; this catches the rest.
 */
const TOLERANCE_SECONDS = 300

/**
 * Whether this really came from Stripe.
 *
 * The endpoint is public — it has to be, Stripe has no session — so this
 * signature is the only thing between a stranger and an invoice marked paid.
 * It fails closed in every direction: no secret configured, no header, a
 * malformed header, an old timestamp, a wrong digest.
 */
export const verifyStripeSignature = async (
  payload: string,
  header: string | null,
): Promise<boolean> => {
  const secret = env.STRIPE_WEBHOOK_SECRET

  if (!secret || !header) return false

  const parts = new Map(
    header.split(',').map((piece) => {
      const [key, ...rest] = piece.trim().split('=')

      return [key ?? '', rest.join('=')] as const
    }),
  )

  const timestamp = parts.get('t')
  const signature = parts.get('v1')

  if (!timestamp || !signature) return false

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp))

  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`))

  return sameSignature(hex(digest), signature)
}

/* -------------------------------------------------------------------------- */
/* Acting on one                                                              */
/* -------------------------------------------------------------------------- */

type StripeEvent = {
  id?: string
  type?: string
  data?: {
    object?: {
      id?: string
      payment_intent?: string
      amount_total?: number
      currency?: string
      metadata?: Record<string, string>
    }
  }
}

/**
 * Records the money, once.
 *
 * Only `checkout.session.completed`, which is the moment Stripe considers the
 * payment done. Everything else is acknowledged and ignored: an endpoint that
 * argued with events it did not ask for would be a source of retries.
 *
 * `received_on` is **today in Berlin**, because that is the day the money
 * became his and the day his own tax return counts — the Zuflussprinzip, the
 * same rule the payment form's date field exists to honour.
 *
 * `ON CONFLICT DO NOTHING` against `payments_external_idx` is what makes a
 * repeated delivery harmless. Stripe will repeat itself; the contract is that
 * receivers are idempotent, not that senders are careful.
 */
export const applyStripeEvent = async (event: StripeEvent): Promise<'recorded' | 'ignored'> => {
  if (event.type !== 'checkout.session.completed') return 'ignored'

  const session = event.data?.object
  const invoiceId = session?.metadata?.invoice_id
  const amount = session?.amount_total

  if (!invoiceId || !amount || amount <= 0) return 'ignored'

  // The payment intent, not the session: it is the id that appears on his
  // Stripe dashboard beside the money, so a row here can be traced to it.
  const external = session.payment_intent ?? session.id ?? event.id

  if (!external) return 'ignored'

  const written = await getDb().query(
    `INSERT INTO payments (invoice_id, amount_cents, method, received_on, reference, note, external_id)
     SELECT $1, $2, 'CARD',
            ((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Berlin')::date),
            $3, 'Paid by card', $4
      WHERE EXISTS (SELECT 1 FROM invoices WHERE id = $1)
     ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING;`,
    [invoiceId, amount, external, external],
  )

  const recorded = Boolean(written.rowCount && written.rowCount > 0)

  /*
   * The payment that just landed almost certainly settled the invoice, and
   * the link that took it must not take a second one. Best-effort: the
   * payment is booked whatever happens here, and the webhook must answer 200
   * either way — see the route.
   */
  if (recorded) {
    await syncPaymentLink(invoiceId).catch((error: unknown) => {
      console.error('[stripe] paid, but its link may still be live:', invoiceId, error)
    })
  }

  return recorded ? 'recorded' : 'ignored'
}
