import { editableFieldByKey } from '#/frontend/content/editable'
import type { ContentValue } from '#/shared/types/content.types'

/** `home.hero.headline` → `Home · Hero · Headline`, so a key reads as a place. */
export const humanizeKey = (key: string): string =>
  key
    .replace(/\[\]$/, '')
    .split('.')
    .map((segment) =>
      /^\d+$/.test(segment)
        ? `#${Number(segment) + 1}`
        : segment.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (first) => first.toUpperCase()),
    )
    .join(' · ')

/** How long the value reads, counting a list as its longest entry. */
export const valueLength = (value: ContentValue | undefined): number => {
  if (typeof value === 'string') return value.length
  if (Array.isArray(value)) return Math.max(...value.map((entry) => entry.length), 0)

  return 0
}

export const valueText = (value: ContentValue | undefined): string => {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.join(' · ')

  return String(value)
}

export const recommendedMax = (key: string): number => editableFieldByKey.get(key)?.max ?? 0

/**
 * The label above a field in the form. The page and the section are already
 * the heading it sits under, so the label is only what is left of the key —
 * `home.hero.headline` under Home › Hero reads simply as `Headline`.
 */
export const fieldLabel = (key: string): string => {
  const segments = key.replace(/\[\]$/, '').split('.')
  const tail = segments.length > 2 ? segments.slice(2) : segments.slice(1)

  return humanizeKey(tail.join('.')) || humanizeKey(key)
}

/** `home.hero.headline` sits in the `hero` section of the `home` page. */
export const sectionOf = (key: string): string => {
  const segments = key.replace(/\[\]$/, '').split('.')

  return segments.length > 2 ? segments[1] : 'general'
}

export const sectionLabel = (section: string): string =>
  section === 'general' ? 'General' : humanizeKey(section)

/** Which public page the preview should show for a given group of fields. */
export const PREVIEWABLE_PAGES = new Set([
  'home',
  'services',
  'about',
  'faq',
  'contact',
  'stack',
  'legal',
])

export const PAGE_LABEL: Record<string, string> = {
  home: 'Landing page',
  services: 'Services',
  work: 'Work',
  about: 'About',
  blog: 'Blog',
  faq: 'FAQ',
  contact: 'Contact',
  stack: 'Stack',
  legal: 'Legal',
  shell: 'Header & footer',
  notFound: 'Not found',
  site: 'Details & prices',
}

export const LANGUAGE_LABEL: Record<string, string> = {
  de: 'Deutsch',
  en: 'English',
  ar: 'العربية',
  '*': 'All languages',
}
