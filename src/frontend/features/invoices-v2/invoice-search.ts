/**
 * What the Invoices routes accept in their address.
 *
 * Spelled out here rather than read from `invoice.contract.ts`, because a
 * route's `validateSearch` is part of the route tree every visitor downloads,
 * and the contract carries valibot. `src/tests/invoices-ui.test.tsx` keeps
 * these lists equal to the contract's.
 */

export const INVOICE_VIEWS = ['all', 'draft', 'open', 'overdue', 'paid', 'cancelled'] as const
export type InvoiceView = (typeof INVOICE_VIEWS)[number]

export const SUBSCRIPTION_VIEWS = ['all', 'active', 'paused', 'ended'] as const
export type SubscriptionView = (typeof SUBSCRIPTION_VIEWS)[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

export const uuidOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' && UUID.test(value) ? value : undefined

export type InvoicesSearch = { view?: Exclude<InvoiceView, 'all'>; q?: string; page?: number }

export const parseInvoicesSearch = (search: Record<string, unknown>): InvoicesSearch => {
  const page = Number(search.page)

  return {
    view:
      INVOICE_VIEWS.includes(search.view as InvoiceView) && search.view !== 'all'
        ? (search.view as Exclude<InvoiceView, 'all'>)
        : undefined,
    q: typeof search.q === 'string' && search.q.trim() ? search.q.trim().slice(0, 120) : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  }
}

export type SubscriptionsSearch = { sub?: string; view?: Exclude<SubscriptionView, 'all'>; page?: number }

export const parseSubscriptionsSearch = (search: Record<string, unknown>): SubscriptionsSearch => {
  const page = Number(search.page)

  return {
    sub: uuidOrUndefined(search.sub),
    view:
      SUBSCRIPTION_VIEWS.includes(search.view as SubscriptionView) && search.view !== 'all'
        ? (search.view as Exclude<SubscriptionView, 'all'>)
        : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  }
}

export type NewInvoiceSearch = { client?: string }
