import { createContext, useContext } from 'react'
import type { ContentValue } from '#/shared/types/content-primitives'

/**
 * Puts unpublished wording in front of published wording, for one purpose:
 * the "preview as visitor" pane in `/admin/content`, which renders the real
 * public page with the drafts written into it.
 *
 * There is no provider on the public site, so every hook here returns the
 * value it was given and the pages render exactly as they always did.
 */

export type ContentOverlay = {
  value: (key: string) => ContentValue | undefined
  /** Changes whenever a draft does, so the preview re-renders. */
  version: number
}

export const ContentOverlayContext = createContext<ContentOverlay | null>(null)

export const useContentOverlay = (): ContentOverlay | null => useContext(ContentOverlayContext)

/** The draft wording for `key`, or the page's own text when there is none. */
export const useResolvedText = (key: string | undefined, fallback: string): string => {
  const overlay = useContentOverlay()
  if (!overlay || !key) return fallback

  const value = overlay.value(key)

  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback
}

export const useResolvedList = (key: string | undefined, fallback: string[]): string[] => {
  const overlay = useContentOverlay()
  if (!overlay || !key) return fallback

  const value = overlay.value(key)

  return Array.isArray(value) ? value : fallback
}
