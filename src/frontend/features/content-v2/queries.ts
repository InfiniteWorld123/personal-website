import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Page } from '#/backend2/contracts/pagination.contract'
import type {
  ContentFieldState,
  ContentHistoryEntry,
  ContentSaveResult,
  ContentSlot,
  ContentSnapshot,
  ContentValue,
} from '#/backend2/contracts/content.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { notify } from '#/frontend/lib/notify'
import {
  type ContentHistoryQuery,
  listContentHistory,
  markContentReviewed,
  readContent,
  restoreContentHistory,
  restoreContentOriginal,
  saveContentField,
} from './api'
import { LANGUAGE_NAME } from './content-words'
import { contentStore, slotKey } from './content-store'

/**
 * What Content reads, and how a save lands.
 *
 * The snapshot is the server's truth. A successful write answers with the
 * whole field, which goes straight into the cache — the editor sends that
 * revision back with the next save, and a value one behind would be refused
 * as a conflict.
 *
 * Saves do not go through `useMutation`, on purpose. The app's mutation cache
 * toasts every failure; a field already says "Not saved" beside itself, with
 * the owner's wording kept and a retry button, and a second announcement in
 * the corner would say less. A field that is off screen when its answer comes
 * back is announced by a toast here instead.
 */

export const contentKeys = {
  all: ['backend2', 'content'] as const,
  snapshot: () => [...contentKeys.all, 'snapshot'] as const,
  history: (query: ContentHistoryQuery) => [...contentKeys.all, 'history', query] as const,
}

/** Anything the server answered on purpose is taken at its word. */
const retry = (attempt: number, error: unknown) =>
  !(error instanceof ApiRequestError && error.status < 500) && attempt < 2

export const useContentSnapshot = () =>
  useQuery<ContentSnapshot>({
    queryKey: contentKeys.snapshot(),
    queryFn: readContent,
    retry,
    // A refetch on focus is harmless: fields only refill when a revision moves.
    staleTime: 15_000,
  })

export const useContentHistory = (query: ContentHistoryQuery, enabled = true) =>
  useQuery<Page<ContentHistoryEntry>>({
    queryKey: contentKeys.history(query),
    queryFn: () => listContentHistory(query),
    placeholderData: (previous) => previous,
    enabled,
    retry,
  })

/** Puts one field — every language of it — into the cached snapshot. */
export const putField = (client: QueryClient, field: ContentFieldState) => {
  client.setQueryData<ContentSnapshot>(contentKeys.snapshot(), (snapshot) => {
    if (!snapshot) return snapshot

    const reviewCounts = { ...snapshot.reviewCounts }
    const previous = snapshot.fields.find((item) => item.key === field.key)

    for (const language of ['de', 'en', 'ar'] as const) {
      const before = previous?.slots[language]?.needsReview ? 1 : 0
      const after = field.slots[language]?.needsReview ? 1 : 0
      reviewCounts[language] += after - before
    }

    return {
      ...snapshot,
      reviewCounts,
      fields: snapshot.fields.map((item) => (item.key === field.key ? field : item)),
    }
  })
}

/** After a conflict: what the server says is live now, so the next save sends the right revision. */
const putSlotValue = (client: QueryClient, key: string, slot: ContentSlot, current: { value: ContentValue; revision: number }) => {
  client.setQueryData<ContentSnapshot>(contentKeys.snapshot(), (snapshot) => {
    if (!snapshot) return snapshot

    return {
      ...snapshot,
      fields: snapshot.fields.map((item) => {
        const state = item.slots[slot]
        if (item.key !== key || !state) return item

        return { ...item, slots: { ...item.slots, [slot]: { ...state, value: current.value, revision: current.revision } } }
      }),
    }
  })
}

export const readSlot = (client: QueryClient, key: string, slot: ContentSlot) =>
  client
    .getQueryData<ContentSnapshot>(contentKeys.snapshot())
    ?.fields.find((field) => field.key === key)
    ?.slots[slot]

export type SaveRequest = {
  key: string
  slot: ContentSlot
  label: string
  legalUnlocked: boolean
} & (
  | { kind: 'edit'; value: ContentValue }
  | { kind: 'original'; value: ContentValue }
  | { kind: 'history'; historyId: string; side: 'before' | 'after'; value: ContentValue }
)

/** How long "Saved · live now" stays before the field goes back to "Live". */
export const SAVED_FOR_MS = 2_600

/**
 * The one way a change leaves the browser. Returns whether it went live.
 *
 * The expected revision is read from the cache at the moment of sending, so a
 * retry after a conflict sends the revision the owner has now seen.
 */
export const useContentSaver = () => {
  const client = useQueryClient()

  return async (request: SaveRequest): Promise<boolean> => {
    const id = slotKey(request.key, request.slot)
    const pending = request.value
    const expectedRevision = readSlot(client, request.key, request.slot)?.revision ?? 0
    const where = `${request.label} (${request.slot === 'shared' ? 'all languages' : request.slot.toUpperCase()})`

    contentStore.set(id, { status: 'saving', value: pending, label: request.label })

    try {
      const result: ContentSaveResult =
        request.kind === 'edit'
          ? await saveContentField({ key: request.key, language: request.slot, value: request.value, expectedRevision, legalUnlocked: request.legalUnlocked })
          : request.kind === 'original'
            ? await restoreContentOriginal({ key: request.key, language: request.slot, expectedRevision, legalUnlocked: request.legalUnlocked })
            : await restoreContentHistory({ id: request.historyId, side: request.side, expectedRevision, legalUnlocked: request.legalUnlocked })

      putField(client, result.field)
      contentStore.set(id, { status: 'saved', label: request.label, savedAt: Date.now() })
      window.setTimeout(() => {
        if (contentStore.get(id)?.status === 'saved') contentStore.set(id, undefined)
      }, SAVED_FOR_MS)
      void client.invalidateQueries({ queryKey: [...contentKeys.all, 'history'] })

      if (!contentStore.isMounted(id)) notify.success(`Saved and live: ${where}`)

      return true
    } catch (error) {
      const refusal = error instanceof ApiRequestError ? error : null
      const current = (refusal?.details as { current?: { value: ContentValue; revision: number } } | undefined)?.current

      if (refusal?.code === 'CONFLICT' && current) {
        putSlotValue(client, request.key, request.slot, current)
        contentStore.set(id, { status: 'conflict', value: pending, theirs: current.value, label: request.label })
      } else if (refusal?.code === 'VALIDATION_ERROR' || refusal?.code === 'LEGAL_LOCKED') {
        contentStore.set(id, { status: 'invalid', value: pending, error: refusal.message, label: request.label })
      } else {
        contentStore.set(id, {
          status: 'failed',
          value: pending,
          error: refusal && refusal.status < 500 ? refusal.message : undefined,
          label: request.label,
        })
      }

      if (!contentStore.isMounted(id)) {
        notify.error(`Not saved: ${where}. Visitors still see the previous wording — open the field to try again.`)
      }

      return false
    }
  }
}

export const useMarkReviewed = () => {
  const client = useQueryClient()

  return async (key: string, slot: ContentSlot, label: string) => {
    try {
      putField(client, await markContentReviewed({ key, language: slot }))
      notify.success(`Checked: ${label} (${LANGUAGE_NAME[slot]})`)
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'That could not be marked as checked')
    }
  }
}
