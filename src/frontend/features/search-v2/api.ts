import { ApiRequestError } from '#/frontend/api/response'
import type { SearchResult } from '#/backend2/contracts/search.contract'

/**
 * The Dashboard's side of global search (`docs/v2/search.md`).
 *
 * One read: `GET /api/v2/owner/search?q=`. Plain `fetch`, like the other V2
 * clients, and it takes the query's abort signal so an answer to an older
 * question is cancelled rather than raced against a newer one.
 *
 * The limits are spelled out here rather than imported from the contract, so
 * the palette does not carry the contract's validation library with it;
 * `search-ui.test.tsx` keeps them equal to the contract.
 */

export const SEARCH_MIN = 2
export const SEARCH_MAX = 100

const SEARCH = '/api/v2/owner/search'

type Envelope = { success: boolean; message?: string; code?: string; data?: unknown; details?: unknown }

export const searchEverything = async (q: string, signal?: AbortSignal): Promise<SearchResult> => {
  const response = await fetch(`${SEARCH}?${new URLSearchParams({ q }).toString()}`, {
    credentials: 'same-origin',
    signal,
  })
  const body = (await response.json().catch(() => null)) as Envelope | null

  if (!response.ok || !body?.success) {
    throw new ApiRequestError({
      message: body?.message ?? 'The server did not answer',
      code: body?.code ?? null,
      status: response.status,
      details: body?.details,
    })
  }

  return body.data as SearchResult
}
