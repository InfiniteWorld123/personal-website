import type { InvoiceMode } from '../../contracts/invoice.contract'
import { liveInvoicingDisabled, stripeUnavailable } from '../../http/error'

/**
 * The switch between practising and real invoicing.
 *
 * `INVOICES_LIVE_ENABLED=true` must be set, deliberately, before any live
 * document can be numbered or any live card charged. It is absent by
 * default, absent from `.env.example`, and not set anywhere by this module —
 * so on the night Invoices was built nothing real could be issued, however
 * complete the seller details. Read on every call, like the owner fence.
 */
export const liveInvoicingEnabled = (
  environment: Record<string, string | undefined> = process.env,
): boolean => environment.INVOICES_LIVE_ENABLED?.trim() === 'true'

/** The owner handles checkout and recurring collection directly in Stripe. */
export const usesExternalStripe = (
  mode: InvoiceMode,
  environment: Record<string, string | undefined> = process.env,
): boolean => mode === 'live' && environment.INVOICES_LIVE_STRIPE_DISABLED?.trim() === 'true'

export const assertSiteStripeAllowed = (
  mode: InvoiceMode,
  environment: Record<string, string | undefined> = process.env,
): void => {
  if (usesExternalStripe(mode, environment)) {
    throw stripeUnavailable('Create live payment links and card subscriptions in your Stripe Dashboard.')
  }
}

export const assertModeAllowed = (mode: InvoiceMode): void => {
  if (mode === 'live' && !liveInvoicingEnabled()) {
    throw liveInvoicingDisabled(
      'Real invoicing is switched off (INVOICES_LIVE_ENABLED is not true). Use test mode, ' +
        'or turn it on only after the seller details and tax setup are verified.',
    )
  }
}
