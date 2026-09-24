import { useEffect, useRef, useState } from 'react'

/** Backend2's public cap on one batch (`PUBLIC_BATCH.max`, `PUBLIC_SERVICE_BATCH.max`). */
const MAX_BATCH = 36

/**
 * "Load more" for a list whose server sends only the batches shown.
 *
 * The route loads everything up to `?page=` on the first render — one bounded
 * request, so a deep link still shows every preceding batch. A later "Load
 * more" only changes `?page=`, and the route's loader does not run again for a
 * search change; so this asks the server for the missing batch alone and
 * appends it, keeping what is already on screen.
 */
export function useMoreBatches<T>({
  items,
  total,
  wanted,
  loadMore,
}: {
  items: T[]
  total: number
  /** How many the current `?page=` shows. */
  wanted: number
  loadMore: (offset: number, limit: number) => Promise<{ items: T[]; total: number }>
}): { items: T[]; total: number; loading: boolean; failed: boolean; retry: () => void } {
  const [extra, setExtra] = useState({ base: items, items: [] as T[], total })
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const load = useRef(loadMore)
  load.current = loadMore

  // New loader data — another language, a fresh visit — starts over.
  const fresh = extra.base === items
  const appended = fresh ? extra.items : []
  const knownTotal = fresh ? extra.total : total
  const all = appended.length ? items.concat(appended) : items
  const missing = Math.min(wanted, knownTotal) - all.length
  const offset = all.length

  useEffect(() => {
    setFailed(false)
  }, [items])

  useEffect(() => {
    if (missing <= 0 || failed) return

    let live = true

    load
      .current(offset, Math.min(MAX_BATCH, missing))
      .then((batch) => {
        if (!live) return
        setExtra((previous) => {
          const kept = previous.base === items ? previous.items : []
          // Only an answer that continues the list is appended.
          if (items.length + kept.length !== offset) return previous
          return { base: items, items: [...kept, ...batch.items], total: batch.total }
        })
      })
      .catch(() => {
        if (live) setFailed(true)
      })

    return () => {
      live = false
    }
  }, [items, offset, missing, failed, attempt])

  return {
    items: all,
    total: knownTotal,
    loading: missing > 0 && !failed,
    failed,
    retry: () => {
      setFailed(false)
      setAttempt((count) => count + 1)
    },
  }
}
