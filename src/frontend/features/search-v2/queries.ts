import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { SearchResult } from '#/backend2/contracts/search.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { SEARCH_MAX, SEARCH_MIN, searchEverything } from './api'

export const searchKeys = {
  all: ['backend2', 'search'] as const,
  query: (q: string) => [...searchKeys.all, q] as const,
}

/** What is actually sent: trimmed, and never longer than the server accepts. */
export const searchTerm = (typed: string) => typed.trim().slice(0, SEARCH_MAX)

export const isSearchable = (term: string) => term.length >= SEARCH_MIN

/** Anything the server answered on purpose is taken at its word. */
const retry = (attempt: number, error: unknown) =>
  !(error instanceof ApiRequestError && error.status < 500) && attempt < 1

/**
 * One cache entry per question. While a newer question is on its way the
 * previous answer stays on screen (`keepPreviousData`), and the older request
 * is aborted through the signal once nothing watches it any more, so a slow
 * answer can never overwrite a newer one.
 */
export const useSearch = (term: string) =>
  useQuery<SearchResult>({
    queryKey: searchKeys.query(term.toLowerCase()),
    queryFn: ({ signal }) => searchEverything(term, signal),
    enabled: isSearchable(term),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry,
  })
