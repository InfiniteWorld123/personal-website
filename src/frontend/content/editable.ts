import type { Language } from '#/frontend/i18n/language'
import { type ContentValue, readContentPath } from './content-path'
import { content } from './base'
import { servicePrices, site } from './site'

/**
 * Which strings the admin may rewrite, derived from the content tree itself
 * rather than listed by hand. A key added to `de.ts` is editable the moment it
 * exists; a hand-written list would have gone stale on the first release.
 *
 * What is deliberately *not* here is as much of the decision as what is
 * (D12, and the owner's own ruling on 13 Sep 2026 after the content lab):
 * layout and section order stay in code, and so does everything below.
 */

/** `'*'` is a value that is the same in every language — an address, a price. */
export type ContentLanguage = Language | '*'

export const CONTENT_LANGUAGES: ContentLanguage[] = ['de', 'en', 'ar', '*']

export type EditableKind = 'text' | 'area' | 'list' | 'number'

export type EditableScope = 'copy' | 'seo' | 'legal' | 'facts' | 'prices'

export type EditableField = {
  /** `home.hero.headline`, `home.hero.typed[]`, `site.email`, `price.websites`. */
  key: string
  scope: EditableScope
  kind: EditableKind
  /** Groups the editor's jump bar: a page, or `site` for facts and prices. */
  page: string
  /** Recommended length. `0` means the field has no useful limit. */
  max: number
  /** Written once for all three languages, and never flagged for review. */
  shared: boolean
}

/**
 * Paths the admin never gets to touch. Each line is a decision, not a
 * convenience:
 *
 * - `*.to` and the nav labels are bound to routes. Renaming a nav item from a
 *   text box would leave a link whose words and destination disagree.
 * - `contact.form.*` is microcopy — 'Send', 'Sending…', field errors. Roughly
 *   seventy strings that never change, and that would bury the thirty that do.
 * - `work.items.*` belongs to `/admin/projects`, which already owns it. Two
 *   editors over one sentence is two sentences.
 * - The rest is furniture: 'load more', 'back', 'previous', status words.
 */
const EXCLUDED = [
  'shell.nav',
  'shell.menu',
  'shell.language',
  'shell.theme',
  'shell.footer.more',
  'shell.footer.legal',
  'contact.form',
  'work.items',
  'work.status',
  'work.detail',
  'blog.home.all',
]

const EXCLUDED_LEAVES = new Set([
  'services.from',
  'work.visit',
  'work.source',
  'work.detailLabel',
  'work.previous',
  'work.next',
  'work.loadMore',
  'work.empty',
  'work.shown',
  'work.back',
  'blog.empty',
  'blog.allTags',
  'blog.readingTime',
  'blog.readArticle',
  'blog.loadMore',
  'blog.back',
  'blog.aboutProject',
  'blog.seeProject',
  'blog.shown',
  'blog.feed',
  'home.services.more',
  'home.work.all',
])

const isExcluded = (path: string) =>
  path.endsWith('.to') ||
  EXCLUDED_LEAVES.has(path) ||
  EXCLUDED.some((prefix) => path === prefix || path.startsWith(`${prefix}.`))

/** Search engines truncate around here; the numbers are the convention, not a guess. */
const SEO_MAX: Record<string, number> = { title: 60, description: 155 }

/**
 * The length the design was actually built for: the longest of the three
 * translations, plus a quarter for room to grow. A counter that flags the
 * wording already on the page would be noise, and a fixed number would be
 * wrong for both a button label and a legal paragraph.
 */
const recommendedMax = (path: string, kind: EditableKind): number => {
  if (kind === 'number') return 0

  const seo = path.split('.').at(-1)
  if (path.includes('.meta.') && seo && seo in SEO_MAX) return SEO_MAX[seo]

  const longest = Math.max(
    ...(['de', 'en', 'ar'] as const).map((language) => {
      const value = readContentPath(content[language], path)
      if (typeof value === 'string') return value.length
      if (Array.isArray(value)) return Math.max(...value.map((entry) => entry.length), 0)
      return 0
    }),
  )

  return Math.max(kind === 'list' ? 16 : 40, Math.ceil((longest * 1.25) / 10) * 10)
}

const scopeFor = (path: string): EditableScope => {
  if (path.startsWith('legal.')) return 'legal'
  if (path.includes('.meta.')) return 'seo'
  return 'copy'
}

const walk = (value: unknown, path: string[], out: string[]): void => {
  if (typeof value === 'string') {
    out.push(path.join('.'))
    return
  }

  if (Array.isArray(value)) {
    if (value.every((entry) => typeof entry === 'string')) out.push(`${path.join('.')}[]`)
    else value.forEach((entry, index) => walk(entry, [...path, String(index)], out))
    return
  }

  if (value && typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      walk(childValue, [...path, childKey], out)
    }
  }
}

/**
 * Facts about the owner rather than sentences about the work, so they are held
 * once for all three languages. `site.phone` starts empty and is simply absent
 * from the site until it is filled in.
 */
const FACT_KEYS = ['site.email', 'site.phone', 'site.city', 'site.github', 'site.linkedin'] as const

const buildFields = (): EditableField[] => {
  const paths: string[] = []
  walk(content.en, [], paths)

  const copy = paths
    .filter((path) => !isExcluded(path))
    .map((path): EditableField => {
      const value = readContentPath(content.de, path)
      // Above roughly one line the field is prose rather than a label, which
      // is what decides whether the editor offers it room to breathe.
      const kind: EditableKind = Array.isArray(value)
        ? 'list'
        : typeof value === 'string' && value.length > 60
          ? 'area'
          : 'text'

      return {
        key: path,
        scope: scopeFor(path),
        kind,
        page: path.split('.')[0],
        max: recommendedMax(path, kind),
        shared: false,
      }
    })

  const facts = FACT_KEYS.map(
    (key): EditableField => ({ key, scope: 'facts', kind: 'text', page: 'site', max: 0, shared: true }),
  )

  const prices = Object.keys(servicePrices).map(
    (slug): EditableField => ({
      key: `price.${slug}`,
      scope: 'prices',
      kind: 'number',
      page: 'site',
      max: 0,
      shared: true,
    }),
  )

  return [...copy, ...facts, ...prices]
}

export const editableFields: EditableField[] = buildFields()

export const editableFieldByKey: ReadonlyMap<string, EditableField> = new Map(
  editableFields.map((field) => [field.key, field]),
)

export const isEditableKey = (key: string): boolean => editableFieldByKey.has(key)

/** Order the editor's jump bar follows; `site` last because it is not a page. */
export const editablePages = [
  'home',
  'services',
  'work',
  'about',
  'blog',
  'faq',
  'contact',
  'stack',
  'legal',
  'shell',
  'notFound',
  'site',
].filter((page) => editableFields.some((field) => field.page === page))

/** The wording the code ships with — what "restore the original" restores. */
export const codeDefault = (key: string, language: Language): ContentValue | undefined => {
  if (key.startsWith('price.')) {
    return servicePrices[key.slice('price.'.length) as keyof typeof servicePrices]
  }

  if (key.startsWith('site.')) {
    const factKey = key.slice('site.'.length)
    if (factKey === 'phone') return ''
    return (site as Record<string, unknown>)[factKey] as string | undefined
  }

  return readContentPath(content[language], key)
}
