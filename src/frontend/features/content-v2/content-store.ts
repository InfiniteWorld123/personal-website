import { useSyncExternalStore } from 'react'
import type { ContentSlot, ContentValue } from '#/backend2/contracts/content.contract'

/**
 * What the editor knows about a field that the server does not: the wording
 * being typed, and whether it is saving, failed, refused, or waiting to be
 * fixed.
 *
 * Kept outside React on purpose. `docs/v2/content.md`: "navigation must not
 * silently discard an in-flight or failed edit." A save that is still running
 * when the owner opens another page finishes here, and a failure lands here —
 * so the field shows it again when the owner comes back, and the leave dialog
 * can name it. Nothing in it is ever sent anywhere by itself.
 */

export type LocalStatus = 'dirty' | 'invalid' | 'saving' | 'failed' | 'conflict' | 'saved'

export type LocalEntry = {
  status: LocalStatus
  /** The owner's wording. Absent once it is the live value. */
  value?: ContentValue
  error?: string
  /** For a conflict: what visitors read now, written somewhere else. */
  theirs?: ContentValue
  /** Shown in the leave dialog and in a toast when the field is off screen. */
  label: string
  savedAt?: number
}

export const slotKey = (key: string, slot: ContentSlot) => `${key}|${slot}`

/** A state that means "visitors do not see what the owner wrote". */
export const isUnsettled = (entry: LocalEntry | undefined): boolean =>
  !!entry && ['dirty', 'invalid', 'failed', 'conflict'].includes(entry.status)

export const createContentStore = () => {
  let entries = new Map<string, LocalEntry>()
  const listeners = new Set<() => void>()
  const mounted = new Map<string, number>()

  const emit = () => listeners.forEach((listener) => listener())

  return {
    get: (key: string) => entries.get(key),
    set: (key: string, entry: LocalEntry | undefined) => {
      const next = new Map(entries)
      if (entry) next.set(key, entry)
      else next.delete(key)
      entries = next
      emit()
    },
    /** A stable object that changes whenever anything does. */
    all: () => entries,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** Every field whose wording has not reached visitors, for the leave dialog. */
    unsettled: () => [...entries.entries()].filter(([, entry]) => isUnsettled(entry)),
    isSaving: () => [...entries.values()].some((entry) => entry.status === 'saving'),
    /** Whether a field is on screen, so an outcome elsewhere is announced by a toast. */
    mount: (key: string) => {
      mounted.set(key, (mounted.get(key) ?? 0) + 1)
      return () => {
        const left = (mounted.get(key) ?? 1) - 1
        if (left <= 0) mounted.delete(key)
        else mounted.set(key, left)
      }
    },
    isMounted: (key: string) => mounted.has(key),
    /** Drops every unsettled wording: the owner chose "Leave and discard". */
    discardUnsettled: () => {
      entries = new Map([...entries.entries()].filter(([, entry]) => !isUnsettled(entry)))
      emit()
    },
    reset: () => {
      entries = new Map()
      mounted.clear()
      emit()
    },
  }
}

export type ContentStore = ReturnType<typeof createContentStore>

/** One tab, one editor: the store outlives the page so a save can finish. */
export const contentStore = createContentStore()

export const useLocalEntry = (key: string): LocalEntry | undefined =>
  useSyncExternalStore(contentStore.subscribe, () => contentStore.get(key), () => undefined)

export const useAllLocal = (): Map<string, LocalEntry> =>
  useSyncExternalStore(contentStore.subscribe, contentStore.all, contentStore.all)
