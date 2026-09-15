import type { Language } from '#/frontend/i18n/language'
import { content } from './base'
import { type ContentValue, writeContentPath } from './content-path'
import { servicePrices, site } from './site'
import type { ServiceSlug, SiteContent } from './types'

/**
 * What the owner has published on top of the code, held for the process.
 *
 * Module state is the right shape here because the answer is the same for
 * every visitor: this is the site's copy, not one person's session. Drafts
 * never reach this store — the admin previews its own unpublished wording
 * through React state, so an unfinished sentence cannot leak onto the public
 * site through a variable that outlives a request.
 */

export type OverrideMap = Record<string, ContentValue>

export type ContentOverrides = {
  de: OverrideMap
  en: OverrideMap
  ar: OverrideMap
  /** Values that are the same in all three languages: addresses, prices. */
  shared: OverrideMap
}

export const emptyOverrides = (): ContentOverrides => ({ de: {}, en: {}, ar: {}, shared: {} })

let current: ContentOverrides = emptyOverrides()

/** Bumped on every change so the merged copy can be memoized without staleness. */
let version = 0

const merged = new Map<Language, { version: number; value: SiteContent }>()

export const applyContentOverrides = (overrides: ContentOverrides): void => {
  current = overrides
  version += 1
  merged.clear()
}

export const currentContentOverrides = (): ContentOverrides => current

/**
 * The code's copy with the published overrides written over it.
 *
 * Rebuilt only when something was published, because every public render of
 * every page calls this: cloning eleven pages of copy per render would be the
 * most expensive thing on the page.
 */
export const resolveContent = (language: Language): SiteContent => {
  const cached = merged.get(language)
  if (cached && cached.version === version) return cached.value

  const overrides = current[language]
  const keys = Object.keys(overrides)

  // Nothing published for this language: hand back the code's own object.
  const value =
    keys.length === 0
      ? content[language]
      : (() => {
          const draft = structuredClone(content[language]) as SiteContent
          for (const key of keys) writeContentPath(draft, key, overrides[key])
          return draft
        })()

  merged.set(language, { version, value })

  return value
}

const sharedText = (key: string, fallback: string): string => {
  const value = current.shared[key]
  return typeof value === 'string' ? value : fallback
}

/**
 * The owner's own details. Read through this rather than importing `site`
 * directly wherever a value is editable, so the footer and the contact page
 * cannot disagree about the address after it changes.
 */
export const getSite = () => ({
  ...site,
  email: sharedText('site.email', site.email),
  phone: sharedText('site.phone', site.phone),
  city: sharedText('site.city', site.city),
  github: sharedText('site.github', site.github),
  linkedin: sharedText('site.linkedin', site.linkedin),
})

export const getServicePrices = (): Record<ServiceSlug, number> => {
  const resolved = { ...servicePrices }

  for (const slug of Object.keys(resolved) as ServiceSlug[]) {
    const value = current.shared[`price.${slug}`]
    if (typeof value === 'number' && Number.isFinite(value)) resolved[slug] = value
  }

  return resolved
}
