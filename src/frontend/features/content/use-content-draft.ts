import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { codeDefault, editableFieldByKey } from '#/frontend/content/editable'
import type { Language } from '#/frontend/i18n/language'
import type { ContentSnapshot, ContentValue } from '#/shared/types/content.types'
import { useSaveDraft } from './content-queries'

const AUTOSAVE_MS = 700

type PendingMap = Map<string, ContentValue>

const fieldLanguage = (key: string, language: Language): string =>
  editableFieldByKey.get(key)?.shared ? '*' : language

/**
 * The editor's working copy.
 *
 * What a field shows, in order: the letters just typed, then the saved draft,
 * then what is published, then the wording in the code. That chain is the
 * whole "overrides only" decision made visible — nothing was ever overwritten,
 * so every step back is still there.
 *
 * Typing is kept out of React state on purpose. A keystroke goes into a ref
 * and is committed on a timer; putting it through state would re-render the
 * element the caret is sitting in, and the caret would jump to the end of the
 * line after every letter.
 */
export const useContentDraft = (snapshot: ContentSnapshot | undefined, language: Language) => {
  const save = useSaveDraft()
  const pending = useRef<PendingMap>(new Map())
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [version, setVersion] = useState(0)
  const [unsaved, setUnsaved] = useState(0)

  const bumpVersion = useCallback(() => setVersion((value) => value + 1), [])

  const stored = useMemo(() => {
    const drafts = new Map<string, ContentValue>()
    const published = new Map<string, ContentValue>()

    for (const field of snapshot?.fields ?? []) {
      const id = `${field.language}:${field.key}`
      if (field.draft !== null) drafts.set(id, field.draft)
      if (field.published !== null) published.set(id, field.published)
    }

    return { drafts, published }
  }, [snapshot])

  const currentValue = useCallback(
    (key: string): ContentValue | undefined => {
      const id = `${fieldLanguage(key, language)}:${key}`

      return (
        pending.current.get(id) ??
        stored.drafts.get(id) ??
        stored.published.get(id) ??
        codeDefault(key, language)
      )
    },
    [language, stored],
  )

  /** True when the wording differs from what visitors are being served today. */
  const hasDraft = useCallback(
    (key: string): boolean => {
      const id = `${fieldLanguage(key, language)}:${key}`

      return pending.current.has(id) || stored.drafts.has(id)
    },
    [language, stored],
  )

  const flush = useCallback(
    (id: string) => {
      const value = pending.current.get(id)
      if (value === undefined) return

      const [fieldLang, ...rest] = id.split(':')
      const key = rest.join(':')

      pending.current.delete(id)
      setUnsaved((count) => Math.max(0, count - 1))

      save.mutate({ key, language: fieldLang as 'de' | 'en' | 'ar' | '*', value })
    },
    [save],
  )

  const onEdit = useCallback(
    (key: string, value: ContentValue) => {
      const id = `${fieldLanguage(key, language)}:${key}`
      const wasPending = pending.current.has(id)

      pending.current.set(id, value)
      if (!wasPending) setUnsaved((count) => count + 1)

      const existing = timers.current.get(id)
      if (existing) clearTimeout(existing)

      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id)
          flush(id)
        }, AUTOSAVE_MS),
      )
    },
    [flush, language],
  )

  /** Sends everything still on a timer, without waiting for it. */
  const flushAll = useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer)
    timers.current.clear()

    for (const id of [...pending.current.keys()]) flush(id)
  }, [flush])

  useEffect(() => {
    if (unsaved === 0) return

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Set for the browsers that still read it; the modern ones only need
      // `preventDefault` to show their own wording.
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', warn)

    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  // Leaving the page inside the app is not a reload, so nothing prompts —
  // the edits are simply sent on the way out.
  useEffect(() => flushAll, [flushAll])

  return {
    currentValue,
    hasDraft,
    onEdit,
    version,
    bumpVersion,
    flushAll,
    unsaved,
    isSaving: save.isPending,
    saveError: save.error,
  }
}
