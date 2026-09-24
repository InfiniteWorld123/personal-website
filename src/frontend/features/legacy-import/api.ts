import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { ImportPlan, ImportStepResult } from '#/backend2/contracts/import.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { csrfToken } from '#/frontend/features/auth-v2/api'

/**
 * "Copy from the old site" — the Dashboard side of
 * `/api/v2/owner/import/legacy`. Deletable with the backend module after the
 * cutover.
 */

const PATH = '/api/v2/owner/import/legacy'

/**
 * A server-side failure arrives as "An unexpected error occurred" on purpose;
 * the two that have an owner-sized explanation are named here instead.
 */
const EXPLAINED: Record<string, string> = {
  PROVIDER_UNAVAILABLE:
    'The old site’s database cannot be reached from here. Nothing was changed. Try again on the live site, or later.',
  STORAGE_UNAVAILABLE: 'Media storage is not available here, so no picture can be copied. Nothing was changed.',
}

type Envelope = { success: boolean; message?: string; code?: string; data?: unknown; details?: unknown }

const request = async <T>(init: RequestInit = {}): Promise<T> => {
  const headers = new Headers(init.headers)

  if (init.method === 'POST') {
    headers.set('content-type', 'application/json')
    const token = csrfToken()
    if (token) headers.set('x-v2-csrf', token)
  }

  const response = await fetch(PATH, { credentials: 'same-origin', ...init, headers })
  const body = (await response.json().catch(() => null)) as Envelope | null

  if (!response.ok || !body?.success) {
    const code = body?.code ?? null

    throw new ApiRequestError({
      message: (code && EXPLAINED[code]) ?? body?.message ?? 'The server did not answer',
      code,
      status: response.status,
      details: body?.details,
    })
  }

  return body.data as T
}

export const legacyImportKey = ['backend2', 'import', 'legacy'] as const

/** The dry run. Only on request: it reads the old site every time. */
export const useLegacyImportPlan = () =>
  useQuery<ImportPlan>({
    queryKey: legacyImportKey,
    queryFn: () => request<ImportPlan>(),
    enabled: false,
    retry: false,
    staleTime: Infinity,
  })

export type ImportProgress = { done: number; total: number; last: string | null; problems: string[] }

/**
 * The copy: one step per request, repeated until the server says nothing
 * remains. Stopping half-way is safe — every finished step is kept, and the
 * next press carries on from there.
 */
export const useRunLegacyImport = () => {
  const [progress, setProgress] = useState<ImportProgress | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      const state: ImportProgress = { done: 0, total: 0, last: null, problems: [] }

      setProgress({ ...state })

      for (let guard = 0; guard < 500; guard += 1) {
        const step = await request<ImportStepResult>({ method: 'POST', body: JSON.stringify({ confirm: true }) })

        if (step.did) {
          state.done += 1
          state.last = step.did
          if (step.did.startsWith('Could not')) state.problems.push(step.did)
        }

        state.total = state.done + step.remaining
        setProgress({ ...state, problems: [...state.problems] })

        if (step.remaining === 0) return state
      }

      return state
    },
  })

  return { ...mutation, progress }
}
