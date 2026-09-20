import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addPayment,
  correctInvoice,
  clientFromLead,
  createClient,
  createInvoice,
  deleteClient,
  deleteInvoice,
  deletePayment,
  fetchClients,
  fetchInvoice,
  fetchInvoices,
  fetchLetter,
  fetchSellerState,
  fetchSentLetters,
  fetchSummary,
  issueInvoice,
  updateClient,
  updateInvoice,
} from '#/frontend/api/invoice.api'
import type {
  ClientWriteInput,
  CorrectionInput,
  InvoiceWriteInput,
  LetterKind,
  PaymentInput,
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

/* ----------------------------------------------------------------- payments */

export const useAddPayment = (invoiceId: string) =>
  useInvoiceMutation((input: PaymentInput) => addPayment(invoiceId, input))

export const useDeletePayment = (invoiceId: string) =>
  useInvoiceMutation((paymentId: string) => deletePayment(invoiceId, paymentId))
