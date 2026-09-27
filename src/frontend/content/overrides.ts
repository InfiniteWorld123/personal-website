import type { Language } from '#/frontend/i18n/language'
import { content } from './base'
import type { ContentLink } from '#/backend2/contracts/content.contract'
import type { ContentValue } from '#/shared/types/content.types'
import { writeContentPath } from './content-path'
import { servicePrices, site } from './site'
import type { ServiceSlug, SiteContent } from './types'

/**
 * What the owner has published on top of the code, held for the process.
 *
 * Module state is the right shape here because the answer is the same for
 * every visitor: this is the site's copy, not one person's session. Only
 * saved wording reaches this store — the Dashboard previews unsaved wording
 * from its own editor state, so an unfinished sentence cannot leak onto the
 * public site through a variable that outlives a request.
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
          for (const key of keys) {
            const value = overrides[key]
            // Only the shared facts hold links; a language never does.
            if (typeof value === 'string' || typeof value === 'number' || value.every((entry) => typeof entry === 'string')) {
              writeContentPath(draft, key, value as string | number | string[])
            }
          }
          return draft
        })()

  merged.set(language, { version, value })

  return value
}

const sharedText = (key: string, fallback: string): string => {
  const value = current.shared[key]
  return typeof value === 'string' ? value : fallback
}

/** The profile links the owner saved, or the release list; hidden ones left out. */
const visibleLinks = (): ContentLink[] => {
  const saved = current.shared['site.links']
  const links = Array.isArray(saved) && saved.every((entry) => typeof entry === 'object')
    ? (saved as ContentLink[])
    : site.links

  return links.filter((link) => !link.hidden)
}

/**
 * The owner's own details. Read through this rather than importing `site`
 * directly wherever a value is editable, so the footer and the contact page
 * cannot disagree about the address after it changes.
 *
 * `links` holds only the links shown on the website, in the owner's order.
 * `github` is the first shown GitHub link, for the places that show GitHub
 * alone; it is absent when the owner removed or hid it.
 */
export const getSite = () => {
  const links = visibleLinks()

  return {
    ...site,
    email: sharedText('site.email', site.email),
    phone: sharedText('site.phone', site.phone),
    city: sharedText('site.city', site.city),
    links,
    github: links.find((link) => link.platform === 'github')?.url,
  }
}

export const getServicePrices = (): Record<ServiceSlug, number | null> => {
  const resolved = { ...servicePrices }

  for (const slug of Object.keys(resolved) as ServiceSlug[]) {
    const value = current.shared[`price.${slug}`]
    if (typeof value === 'number' && Number.isFinite(value)) resolved[slug] = value
  }

  return resolved
}
