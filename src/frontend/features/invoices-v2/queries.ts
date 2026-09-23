import { useEffect } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InvoiceMode, OwnerInvoice, OwnerSubscription } from '#/backend2/contracts/invoice.contract'
import { ApiRequestError } from '#/frontend/api/response'
import * as api from './api'

/**
 * What Invoices reads, and what is re-read after each write. Every write
 * touches the list, its totals and the one invoice, so they share a prefix
 * and are refreshed together.
 */
export const invoiceKeys = {
  all: ['backend2', 'invoices'] as const,
  list: (query: api.InvoicesQuery) => [...invoiceKeys.all, 'list', query] as const,
  summary: (mode: InvoiceMode) => [...invoiceKeys.all, 'summary', mode] as const,
  one: (id: string) => [...invoiceKeys.all, 'one', id] as const,
  settings: () => [...invoiceKeys.all, 'settings'] as const,
  subscriptions: (query: api.SubscriptionsQuery) => [...invoiceKeys.all, 'subscriptions', query] as const,
  subscription: (id: string) => [...invoiceKeys.all, 'subscription', id] as const,
  periods: (id: string, page: number) => [...invoiceKeys.all, 'periods', id, page] as const,
  notices: (status: string, page: number) => [...invoiceKeys.all, 'notices', status, page] as const,
}

/** Anything the server answered on purpose is taken at its word. */
const retry = (attempt: number, error: unknown) =>
  !(error instanceof ApiRequestError && error.status < 500) && attempt < 2

export const useInvoiceSettings = () =>
  useQuery({ queryKey: invoiceKeys.settings(), queryFn: api.readSettings, retry, staleTime: 30_000 })

export const useInvoices = (query: api.InvoicesQuery, enabled = true) =>
  useQuery({
    queryKey: invoiceKeys.list(query),
    queryFn: () => api.listInvoices(query),
    placeholderData: keepPreviousData,
    enabled,
    retry,
  })

/**
 * Makes the next step feel instant: the following page of the list is read
 * as soon as this one is shown, and an invoice as the pointer rests on its
 * row. Both are ordinary cached reads, so the click just shows them.
 */
export const usePrefetchNextInvoices = (query: api.InvoicesQuery, hasMore: boolean | undefined) => {
  const client = useQueryClient()

  useEffect(() => {
    if (!hasMore) return

    const next = { ...query, page: (query.page ?? 1) + 1 }

    void client.prefetchQuery({ queryKey: invoiceKeys.list(next), queryFn: () => api.listInvoices(next), staleTime: 30_000 })
  }, [client, hasMore, query])
}

export const usePrefetchInvoice = () => {
  const client = useQueryClient()

  return (id: string) =>
    void client.prefetchQuery({ queryKey: invoiceKeys.one(id), queryFn: () => api.readInvoice(id), staleTime: 30_000 })
}

export const useInvoiceSummary = (mode: InvoiceMode) =>
  useQuery({ queryKey: invoiceKeys.summary(mode), queryFn: () => api.readSummary(mode), retry })

export const useInvoice = (id: string | undefined) =>
  useQuery({
    queryKey: invoiceKeys.one(id ?? ''),
    queryFn: () => api.readInvoice(id!),
    enabled: Boolean(id),
    retry,
  })

export const useSubscriptions = (query: api.SubscriptionsQuery) =>
  useQuery({
    queryKey: invoiceKeys.subscriptions(query),
    queryFn: () => api.listSubscriptions(query),
    placeholderData: keepPreviousData,
    retry,
  })

export const useSubscription = (id: string | undefined) =>
  useQuery({
    queryKey: invoiceKeys.subscription(id ?? ''),
    queryFn: () => api.readSubscription(id!),
    enabled: Boolean(id),
    retry,
  })

export const usePeriods = (id: string, page: number) =>
  useQuery({
    queryKey: invoiceKeys.periods(id, page),
    queryFn: () => api.listPeriods(id, page, 6),
    placeholderData: keepPreviousData,
    retry,
  })

export const useNotices = (status: 'pending' | 'prepared' | 'all', page: number) =>
  useQuery({
    queryKey: invoiceKeys.notices(status, page),
    queryFn: () => api.listNotices({ status, page, pageSize: 5 }),
    placeholderData: keepPreviousData,
    retry,
  })

/**
 * Writes that answer with the whole invoice put it straight into the cache:
 * the next edit sends its `revision` back, and a value one behind the
 * server's would surface as a 409. Everything else under Invoices is re-read.
 */
export const useInvoiceMutation = <TInput, TOutput>(
  run: (input: TInput) => Promise<TOutput>,
  pick: (output: TOutput) => OwnerInvoice | OwnerInvoice[] | null = () => null,
) => {
  const client = useQueryClient()

  return useMutation({
    mutationFn: run,
    onSuccess: async (output) => {
      const picked = pick(output)

      for (const invoice of Array.isArray(picked) ? picked : picked ? [picked] : []) {
        client.setQueryData(invoiceKeys.one(invoice.id), invoice)
      }

      // A preview belongs to one revision; it is never re-read, only replaced.
      await client.invalidateQueries({ queryKey: invoiceKeys.all, predicate: (query) => query.queryKey[2] !== 'preview' })
    },
  })
}

export const useSubscriptionMutation = <TInput, TOutput>(
  run: (input: TInput) => Promise<TOutput>,
  pick: (output: TOutput) => OwnerSubscription | null,
) => {
  const client = useQueryClient()

  return useMutation({
    mutationFn: run,
    onSuccess: async (output) => {
      const picked = pick(output)

      if (picked) client.setQueryData(invoiceKeys.subscription(picked.id), picked)

      await client.invalidateQueries({ queryKey: invoiceKeys.all })
    },
  })
}
