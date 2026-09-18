import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

/**
 * Anything `queryOptions()` hands back.
 *
 * The generics are deliberately not tracked: every query in the admin has a
 * different result type, this hook does nothing with any of them but pass the
 * object straight to React Query, and threading them through would mean a
 * generic signature nobody can call with two queries at once.
 */
export type WarmableQuery = { queryKey: readonly unknown[] }

/**
 * Warms the data behind a link before the click.
 *
 * The router already preloads the *route* on intent (`defaultPreload: 'intent'`
 * in `config/router.tsx`). What it cannot do is fetch what React Query will ask
 * for once that route renders, so the old sequence was: hover does nothing,
 * click navigates, the page mounts, *then* the request leaves, and he watches a
 * spinner for a round trip he had already paid for by pointing at the row.
 *
 * `prefetchQuery` rather than `ensureQueryData`: it never throws, so a section
 * that is failing cannot turn a hover into an unhandled rejection, and it
 * respects `staleTime` — pointing along a list of forty rows does not refetch
 * the thirty-nine already in the cache.
 *
 * Attached to hover, to focus, and to the first touch, so a keyboard and a
 * phone get the same head start as a mouse.
 */
export const usePrefetch = () => {
  const client = useQueryClient()

  return useCallback(
    (...options: WarmableQuery[]) => {
      const warm = () => {
        for (const option of options) {
          void client.prefetchQuery(option as Parameters<typeof client.prefetchQuery>[0])
        }
      }

      return { onMouseEnter: warm, onFocus: warm, onTouchStart: warm }
    },
    [client],
  )
}

/** The handlers `usePrefetch()(…)` hands back, spread onto a link or a row. */
export type PrefetchHandlers = ReturnType<ReturnType<typeof usePrefetch>>
