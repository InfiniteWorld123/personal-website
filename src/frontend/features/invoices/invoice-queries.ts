import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addPayment,
  attachInvoice,
  cancelSubscription,
  correctInvoice,
  clientFromLead,
  createClient,
  createInvoice,
  createSubscription,
  deleteClient,
  deleteInvoice,
  deletePayment,
  deleteSubscription,
  fetchClients,
  fetchInvoice,
  fetchInvoices,
  fetchLetter,
  fetchPersonInvoices,
  fetchSellerState,
  fetchSentLetters,
  fetchSubscriptionLetter,
  fetchSubscriptions,
  fetchSummary,
  issueInvoice,
  updateClient,
  updateInvoice,
  updateSubscription,
} from '#/frontend/api/invoice.api'
import type { LetterTarget, PreparedLetter } from '#/shared/types/invoice.types'
import type {
  ClientWriteInput,
  CorrectionInput,
  InvoiceWriteInput,
  LetterKind,
  PaymentInput,
  SubscriptionWriteInput,
} from '#/shared/validation/invoice.validation'

/**
 * One key prefix for the section, so any write refreshes everything it could
 * have changed.
 *
 * Recording a payment changes that invoice, its settlement, its place in the
 * list and four of the six figures on top. One invalidation covers all of
 * them; the alternative is a set of hand-patched caches that each have to stay
 * correct as the screens change — and on a money screen, a cache that drifts
 * is a figure he cannot trust.
 */
const INVOICES = ['admin', 'invoices'] as const

export const invoicesQuery = (settlement: string, search: string) =>
  queryOptions({
    queryKey: [...INVOICES, 'list', settlement, search],
    queryFn: () => fetchInvoices(settlement, search),
  })

export const invoiceQuery = (invoiceId: string) =>
  queryOptions({
    queryKey: [...INVOICES, 'one', invoiceId],
    queryFn: () => fetchInvoice(invoiceId),
    enabled: invoiceId !== '',
  })

export const summaryQuery = () =>
  queryOptions({ queryKey: [...INVOICES, 'summary'], queryFn: fetchSummary })

/**
 * The sent register.
 *
 * Under the section's key prefix like everything else, so sending a letter
 * from the inbox — which is what writes a row here — leaves this page stale
 * and it refetches rather than showing a register missing its newest entry.
 */
export const sentLettersQuery = () =>
  queryOptions({ queryKey: [...INVOICES, 'letters'], queryFn: fetchSentLetters })

/**
 * What this person has been billed, for the composer's attach panel.
 *
 * Under the section's key prefix, so issuing an invoice while the composer is
 * open leaves this stale and the panel shows the new document rather than a
 * list that is one invoice behind.
 */
export const personInvoicesQuery = (personId: string, enabled = true) =>
  queryOptions({
    queryKey: [...INVOICES, 'for-person', personId],
    queryFn: () => fetchPersonInvoices(personId),
    enabled: enabled && personId !== '',
  })

/**
 * The money that does not stop.
 *
 * Under the section's key prefix, so opening the invoice list — which is what
 * turns a due subscription into a draft — leaves this stale and it redraws
 * with the new `nextPeriod` rather than the month it just billed.
 */
export const subscriptionsQuery = () =>
  queryOptions({ queryKey: [...INVOICES, 'subscriptions'], queryFn: fetchSubscriptions })

export const clientsQuery = (search: string) =>
  queryOptions({ queryKey: [...INVOICES, 'clients', search], queryFn: () => fetchClients(search) })

/**
 * Whether `seller.ts` still holds placeholders.
 *
 * Asked once per screen and allowed to be stale for a while: it only changes
 * when he edits a file and redeploys, which is not something that happens
 * while he is looking at the page.
 */
export const sellerQuery = () =>
  queryOptions({
    queryKey: [...INVOICES, 'seller'],
    queryFn: fetchSellerState,
    staleTime: 5 * 60_000,
  })

/**
 * The letter this invoice would send, for the composer to open on.
 *
 * Cached under the invoice and the kind, so the click that navigates and the
 * composer that renders a moment later share one request rather than each
 * preparing the letter separately.
 */
export const letterQuery = (invoiceId: string, kind: LetterKind, enabled = true) =>
  queryOptions({
    queryKey: [...INVOICES, 'letter', invoiceId, kind],
    queryFn: () => fetchLetter(invoiceId, kind),
    enabled: enabled && invoiceId !== '',
    staleTime: 5 * 60_000,
  })

/**
 * The agreement a subscription starts with, prepared for the composer.
 *
 * Cached under the subscription so the click that navigates and the composer
 * that renders a moment later share one request — the same argument
 * `letterQuery` makes, and the reason the PDF is copied once rather than
 * twice.
 */
export const subscriptionLetterQuery = (subscriptionId: string, enabled = true) =>
  queryOptions({
    queryKey: [...INVOICES, 'subscription-letter', subscriptionId],
    queryFn: () => fetchSubscriptionLetter(subscriptionId),
    enabled: enabled && subscriptionId !== '',
    staleTime: 5 * 60_000,
  })

/**
 * Whichever letter the composer was asked to open on.
 *
 * One function rather than a branch inside the composer, because the choice
 * is about *what was asked for* and not about how to render it. The composer
 * needs a body and a file; which document they were drawn from is this
 * module's business.
 *
 * A null target still returns a disabled query, so the composer can call a
 * hook unconditionally — React's rules leave no other shape.
 */
export const letterTargetQuery = (target: LetterTarget | null) => {
  const subscriptionId = target && 'subscriptionId' in target ? target.subscriptionId : null
  const invoiceId = target && 'invoiceId' in target ? target.invoiceId : ''
  const kind: LetterKind = target && 'kind' in target ? target.kind : 'INVOICE'

  /*
   * The keys are spelled to match `letterQuery` and `subscriptionLetterQuery`
   * exactly, and that is the whole point of writing them out again rather
   * than delegating. The button prepares the letter with `fetchQuery` and the
   * composer reads it a moment later; sharing one cache entry is what makes
   * the PDF be copied once instead of twice.
   */
  return queryOptions({
    queryKey: subscriptionId
      ? [...INVOICES, 'subscription-letter', subscriptionId]
      : [...INVOICES, 'letter', invoiceId, kind],
    // Typed as the shape both letters have in common. An invoice letter also
    // carries a `kind`, which the composer has no use for.
    queryFn: (): Promise<PreparedLetter> =>
      subscriptionId ? fetchSubscriptionLetter(subscriptionId) : fetchLetter(invoiceId, kind),
    enabled: target !== null,
    staleTime: 5 * 60_000,
  })
}

/** What identifies a prepared letter, for the composer's "seed it once" guard. */
export const letterTargetKey = (target: LetterTarget): string =>
  'subscriptionId' in target ? `subscription:${target.subscriptionId}` : `${target.invoiceId}:${target.kind}`

const useInvoiceMutation = <TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) => {
  const client = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: () => void client.invalidateQueries({ queryKey: INVOICES }),
  })
}

/* ------------------------------------------------------------------ clients */

export const useCreateClient = () =>
  useInvoiceMutation((input: ClientWriteInput) => createClient(input))

export const useUpdateClient = () =>
  useInvoiceMutation((input: { clientId: string } & ClientWriteInput) => {
    const { clientId, ...rest } = input

    return updateClient(clientId, rest)
  })

export const useDeleteClient = () => useInvoiceMutation((clientId: string) => deleteClient(clientId))

/** Turns somebody who wrote to him into somebody he can bill. */
export const useClientFromLead = () =>
  useInvoiceMutation((leadId: string) => clientFromLead(leadId))

/* ----------------------------------------------------------------- invoices */

export const useCreateInvoice = () =>
  useInvoiceMutation((input: InvoiceWriteInput) => createInvoice(input))

export const useUpdateInvoice = (invoiceId: string) =>
  useInvoiceMutation((input: InvoiceWriteInput) => updateInvoice(invoiceId, input))

export const useDeleteInvoice = () =>
  useInvoiceMutation((invoiceId: string) => deleteInvoice(invoiceId))

export const useIssueInvoice = () =>
  useInvoiceMutation((invoiceId: string) => issueInvoice(invoiceId))

export const useCorrectInvoice = (invoiceId: string) =>
  useInvoiceMutation((input: CorrectionInput) => correctInvoice(invoiceId, input))

/**
 * Copies an invoice's PDF into a conversation.
 *
 * A mutation rather than a query: it writes a file. The invalidation it
 * inherits also refreshes the panel it was opened from, so the row it came
 * from is redrawn with whatever the copy changed.
 */
export const useAttachInvoice = (personId: string) =>
  useInvoiceMutation((invoiceId: string) => attachInvoice(personId, invoiceId))

/* ------------------------------------------------------------ subscriptions */

export const useCreateSubscription = () =>
  useInvoiceMutation((input: SubscriptionWriteInput) => createSubscription(input))

export const useUpdateSubscription = () =>
  useInvoiceMutation((input: { subscriptionId: string } & SubscriptionWriteInput) => {
    const { subscriptionId, ...rest } = input

    return updateSubscription(subscriptionId, rest)
  })

export const useCancelSubscription = () =>
  useInvoiceMutation((subscriptionId: string) => cancelSubscription(subscriptionId))

export const useDeleteSubscription = () =>
  useInvoiceMutation((subscriptionId: string) => deleteSubscription(subscriptionId))

/* ----------------------------------------------------------------- payments */

export const useAddPayment = (invoiceId: string) =>
  useInvoiceMutation((input: PaymentInput) => addPayment(invoiceId, input))

export const useDeletePayment = (invoiceId: string) =>
  useInvoiceMutation((paymentId: string) => deletePayment(invoiceId, paymentId))
