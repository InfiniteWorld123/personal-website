import type { Currency, InvoiceMode } from '../../contracts/invoice.contract'
import { stripeUnavailable } from '../../http/error'
import { liveInvoicingEnabled } from './invoice.config'

/**
 * The thin edge between Invoices and Stripe.
 *
 * `fetch` and form encoding only — no SDK — so it runs unchanged in a
 * Cloudflare Worker. V2 remains the only issuer: Stripe is used for Checkout
 * (a one-time payment link), for saving a card with the customer's consent
 * (Checkout in `setup` mode), and for off-session PaymentIntents that V2
 * itself schedules. Stripe Billing and Stripe Invoicing are deliberately not
 * used, so Stripe never sends a competing invoice and its own recovery rules
 * can never cancel a subscription — V2 decides every retry.
 *
 * The mode is enforced by the key itself: `sk_test_…` serves test-mode
 * invoices only, `sk_live_…` serves live ones only, and a live key is refused
 * outright unless `INVOICES_LIVE_ENABLED=true`. The key is never logged.
 */

export type CheckoutSession = { id: string; url: string; expiresAt: Date | null }

export type ChargeResult =
  | { status: 'succeeded' | 'processing'; paymentIntentId: string }
  | { status: 'failed'; paymentIntentId: string | null; message: string }

export type StripeGateway = {
  mode: InvoiceMode
  createPaymentCheckout(input: {
    invoiceId: string
    number: string
    amountMinor: number
    currency: Currency
    description: string
    customerEmail: string | null
    successUrl: string
    cancelUrl: string
    idempotencyKey: string
  }): Promise<CheckoutSession>
  createCustomer(input: {
    email: string
    name: string
    subscriptionId: string
    idempotencyKey: string
  }): Promise<{ id: string }>
  createSetupCheckout(input: {
    customerId: string
    subscriptionId: string
    currency: Currency
    successUrl: string
    cancelUrl: string
    idempotencyKey: string
  }): Promise<CheckoutSession>
  /** The card a completed setup session saved. */
  retrieveSetupIntent(id: string): Promise<{ paymentMethodId: string; cardLabel: string }>
  chargeOffSession(input: {
    customerId: string
    paymentMethodId: string
    amountMinor: number
    currency: Currency
    description: string
    metadata: Record<string, string>
    idempotencyKey: string
  }): Promise<ChargeResult>
}

/* ----------------------------------------------------------- the real one */

const API = 'https://api.stripe.com/v1'

/** Stripe's nested form encoding: `a[b][c]=value`. */
export const formEncode = (value: Record<string, unknown>, prefix = ''): string[] => {
  const parts: string[] = []

  for (const [key, inner] of Object.entries(value)) {
    if (inner === undefined || inner === null) continue

    const name = prefix ? `${prefix}[${key}]` : key

    if (Array.isArray(inner)) {
      inner.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          parts.push(...formEncode(item as Record<string, unknown>, `${name}[${index}]`))
        } else {
          parts.push(`${encodeURIComponent(`${name}[${index}]`)}=${encodeURIComponent(String(item))}`)
        }
      })
    } else if (typeof inner === 'object') {
      parts.push(...formEncode(inner as Record<string, unknown>, name))
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(inner))}`)
    }
  }

  return parts
}

export const keyMode = (key: string): InvoiceMode | null => {
  if (/^(sk|rk)_test_/u.test(key)) return 'test'
  if (/^(sk|rk)_live_/u.test(key)) return 'live'

  return null
}

const createHttpGateway = (key: string, mode: InvoiceMode): StripeGateway => {
  const call = async <T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<T> => {
    const headers: Record<string, string> = {
      authorization: `Bearer ${key}`,
      'stripe-version': '2024-06-20',
    }

    if (body) headers['content-type'] = 'application/x-www-form-urlencoded'
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey

    let response: Response

    try {
      response = await fetch(`${API}${path}`, {
        method,
        headers,
        body: body ? formEncode(body).join('&') : undefined,
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw stripeUnavailable('Stripe could not be reached. Try again in a moment.')
    }

    const json = (await response.json().catch(() => ({}))) as Record<string, any>

    if (!response.ok) {
      const error = new Error(String(json?.error?.message ?? `Stripe answered ${response.status}`)) as Error & {
        stripe?: Record<string, any>
        status?: number
      }

      error.stripe = json?.error
      error.status = response.status
      throw error
    }

    return json as T
  }

  const session = (json: Record<string, any>): CheckoutSession => ({
    id: String(json.id),
    url: String(json.url),
    expiresAt: typeof json.expires_at === 'number' ? new Date(json.expires_at * 1000) : null,
  })

  const wrap = async <T>(fn: () => Promise<T>, message: string): Promise<T> => {
    try {
      return await fn()
    } catch (error) {
      if ((error as { code?: string }).code === 'STRIPE_UNAVAILABLE') throw error

      throw stripeUnavailable(message, {
        stripeMessage: error instanceof Error ? error.message.slice(0, 300) : undefined,
      })
    }
  }

  return {
    mode,
    createPaymentCheckout: (input) =>
      wrap(async () => {
        const json = await call<Record<string, any>>(
          'POST',
          '/checkout/sessions',
          {
            mode: 'payment',
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            customer_email: input.customerEmail ?? undefined,
            client_reference_id: input.invoiceId,
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: input.currency.toLowerCase(),
                  unit_amount: input.amountMinor,
                  product_data: { name: input.description },
                },
              },
            ],
            metadata: { v2_invoice_id: input.invoiceId, v2_invoice_number: input.number },
            payment_intent_data: {
              description: input.description,
              metadata: { v2_invoice_id: input.invoiceId, v2_invoice_number: input.number },
            },
          },
          input.idempotencyKey,
        )

        return session(json)
      }, 'Stripe could not create the payment link'),
    createCustomer: (input) =>
      wrap(async () => {
        const json = await call<Record<string, any>>(
          'POST',
          '/customers',
          { email: input.email, name: input.name, metadata: { v2_subscription_id: input.subscriptionId } },
          input.idempotencyKey,
        )

        return { id: String(json.id) }
      }, 'Stripe could not create the customer'),
    createSetupCheckout: (input) =>
      wrap(async () => {
        const json = await call<Record<string, any>>(
          'POST',
          '/checkout/sessions',
          {
            mode: 'setup',
            customer: input.customerId,
            currency: input.currency.toLowerCase(),
            payment_method_types: ['card'],
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            metadata: { v2_subscription_id: input.subscriptionId },
            setup_intent_data: { metadata: { v2_subscription_id: input.subscriptionId } },
          },
          input.idempotencyKey,
        )

        return session(json)
      }, 'Stripe could not create the card setup link'),
    retrieveSetupIntent: (id) =>
      wrap(async () => {
        const json = await call<Record<string, any>>(
          'GET',
          `/setup_intents/${encodeURIComponent(id)}?expand[]=payment_method`,
        )
        const method = json.payment_method as Record<string, any> | string | null
        const card = typeof method === 'object' && method ? method.card : null

        return {
          paymentMethodId: typeof method === 'string' ? method : String(method?.id ?? ''),
          cardLabel: card ? `${String(card.brand ?? 'card')} •••• ${String(card.last4 ?? '')}`.trim() : '',
        }
      }, 'Stripe could not read the saved card'),
    chargeOffSession: async (input) => {
      try {
        const json = await call<Record<string, any>>(
          'POST',
          '/payment_intents',
          {
            amount: input.amountMinor,
            currency: input.currency.toLowerCase(),
            customer: input.customerId,
            payment_method: input.paymentMethodId,
            off_session: 'true',
            confirm: 'true',
            description: input.description,
            metadata: input.metadata,
          },
          input.idempotencyKey,
        )
        const status = String(json.status)

        if (status === 'succeeded' || status === 'processing') {
          return { status, paymentIntentId: String(json.id) }
        }

        return {
          status: 'failed',
          paymentIntentId: String(json.id),
          message: `The charge needs the customer (${status})`,
        }
      } catch (error) {
        const stripe = (error as { stripe?: Record<string, any> }).stripe

        if (stripe) {
          // A decline is an answer, not an outage.
          return {
            status: 'failed',
            paymentIntentId: stripe.payment_intent?.id ? String(stripe.payment_intent.id) : null,
            message: String(stripe.message ?? 'The card was declined').slice(0, 300),
          }
        }

        throw stripeUnavailable('Stripe could not be reached for the charge')
      }
    },
  }
}

/* ------------------------------------------------------------- resolution */

let override: StripeGateway | undefined

export const useStripeGatewayForTest = (gateway: StripeGateway | undefined): void => {
  override = gateway
}

/**
 * The gateway for a document of `mode`, or a clear refusal.
 */
export const resolveStripeGateway = (
  mode: InvoiceMode,
  environment: Record<string, string | undefined> = process.env,
): StripeGateway => {
  if (override) {
    if (override.mode !== mode) {
      throw stripeUnavailable(`Stripe is configured for ${override.mode} mode only`)
    }

    return override
  }

  const key = environment.STRIPE_SECRET_KEY?.trim() ?? ''
  const detected = keyMode(key)

  if (!detected) throw stripeUnavailable('Stripe is not configured here')
  if (detected === 'live' && !liveInvoicingEnabled(environment)) {
    throw stripeUnavailable('A live Stripe key is present but real invoicing is switched off')
  }
  if (detected !== mode) {
    throw stripeUnavailable(
      mode === 'test'
        ? 'Test-mode invoices need a Stripe test key (sk_test_…)'
        : 'Live invoices need a live Stripe key, which is not configured',
    )
  }

  return createHttpGateway(key, detected)
}

/** Where Stripe sends the customer back to. The public site until a page exists. */
export const returnUrls = (
  kind: 'payment' | 'setup',
  environment: Record<string, string | undefined> = process.env,
): { successUrl: string; cancelUrl: string } => {
  const base = (environment.BASE_URL?.trim() || 'http://localhost:3000').replace(/\/+$/u, '')

  return {
    successUrl: `${base}/?${kind}=complete`,
    cancelUrl: `${base}/?${kind}=cancelled`,
  }
}

/* ----------------------------------------------------------------- a fake */

/**
 * An in-memory Stripe for tests and local demos: records what was asked,
 * answers like Stripe, and lets a test decide whether a charge succeeds.
 */
export const createFakeStripeGateway = (mode: InvoiceMode = 'test') => {
  let counter = 0
  const next = (prefix: string) => `${prefix}_fake_${(counter += 1)}`
  const byIdempotency = new Map<string, unknown>()
  const calls: Array<{ kind: string; input: unknown }> = []
  const state = { chargeOutcome: 'succeeded' as 'succeeded' | 'failed' | 'processing' }

  const once = <T>(key: string, make: () => T): T => {
    if (!byIdempotency.has(key)) byIdempotency.set(key, make())

    return byIdempotency.get(key) as T
  }

  const gateway: StripeGateway = {
    mode,
    createPaymentCheckout: async (input) => {
      calls.push({ kind: 'checkout', input })

      return once(input.idempotencyKey, () => {
        const id = next('cs')

        return { id, url: `https://checkout.stripe.test/${id}`, expiresAt: new Date(Date.now() + 86_400_000) }
      })
    },
    createCustomer: async (input) => {
      calls.push({ kind: 'customer', input })

      return once(input.idempotencyKey, () => ({ id: next('cus') }))
    },
    createSetupCheckout: async (input) => {
      calls.push({ kind: 'setup', input })

      return once(input.idempotencyKey, () => {
        const id = next('cs')

        return { id, url: `https://checkout.stripe.test/${id}`, expiresAt: null }
      })
    },
    retrieveSetupIntent: async (id) => {
      calls.push({ kind: 'setup_intent', input: id })

      return { paymentMethodId: `pm_for_${id}`, cardLabel: 'visa •••• 4242' }
    },
    chargeOffSession: async (input) => {
      calls.push({ kind: 'charge', input })

      return once(input.idempotencyKey, () => {
        const id = next('pi')

        return state.chargeOutcome === 'failed'
          ? { status: 'failed' as const, paymentIntentId: id, message: 'Your card was declined.' }
          : { status: state.chargeOutcome, paymentIntentId: id }
      })
    },
  }

  return { gateway, calls, state }
}
