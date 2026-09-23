import { content } from '#/frontend/content/base'
import { readContentPath } from '#/frontend/content/content-path'
import { site } from '#/frontend/content/site'
import {
  CONTENT_LIMITS,
  type ContentFieldDefinition,
  type ContentFormat,
  type ContentKind,
  type ContentLanguage,
  type ContentSlot,
  type ContentValue,
} from '../../contracts/content.contract'

/**
 * The release registry: every static field the Dashboard may edit.
 *
 * Written out by hand, key by key, on purpose. `docs/v2/content.md`: "A newly
 * added public field is not automatically editable until the release registry
 * intentionally includes it." The legacy editor derived its list from the
 * content tree, so a new string became editable the moment it existed; here a
 * new string stays code-only until somebody adds a line below.
 *
 * The defaults — what **Original** restores — are the wording the release
 * ships in `src/frontend/content/{de,en,ar}.ts` and `site.ts`.
 *
 * What is deliberately absent, and why:
 *
 * - `services.items.*`, `home.services.cards.*` and `price.*` belong to
 *   Services V2, `work.items.*` to Projects V2, articles to Blog V2. The same
 *   service text or price must never be editable in two modules.
 * - Route destinations, navigation labels bound to routes, form microcopy and
 *   small interface words ("load more", "back") — the legacy editor's own
 *   exclusions, kept.
 */

type Entry = readonly [key: string, kind: ContentKind]

const COPY: readonly Entry[] = [

  // shell
  ['shell.cta', 'text'],
  ['shell.footer.tagline', 'longText'],
  ['shell.footer.location', 'text'],
  ['shell.footer.email', 'text'],
  ['shell.footer.links', 'text'],
  ['shell.footer.builtWith', 'longText'],

  // home
  ['home.meta.title', 'text'],
  ['home.meta.description', 'longText'],
  ['home.hero.eyebrow', 'text'],
  ['home.hero.greeting', 'text'],
  ['home.hero.prefix', 'text'],
  ['home.hero.typed[]', 'list'],
  ['home.hero.staticLine', 'text'],
  ['home.hero.headline', 'text'],
  ['home.hero.sub', 'longText'],
  ['home.hero.cta', 'text'],
  ['home.hero.secondary', 'text'],
  ['home.hero.availability', 'text'],
  ['home.story.eyebrow', 'text'],
  ['home.story.title', 'text'],
  ['home.story.sub', 'longText'],
  ['home.story.steps.0.label', 'text'],
  ['home.story.steps.0.title', 'text'],
  ['home.story.steps.0.body', 'longText'],
  ['home.story.steps.1.label', 'text'],
  ['home.story.steps.1.title', 'text'],
  ['home.story.steps.1.body', 'longText'],
  ['home.story.steps.2.label', 'text'],
  ['home.story.steps.2.title', 'text'],
  ['home.story.steps.2.body', 'longText'],
  ['home.story.demo.caption', 'text'],
  ['home.story.demo.project', 'text'],
  ['home.story.demo.notes[]', 'list'],
  ['home.story.demo.navigation[]', 'list'],
  ['home.story.demo.request', 'text'],
  ['home.story.demo.appointment', 'text'],
  ['home.story.demo.confirmed', 'text'],
  ['home.story.demo.action', 'text'],
  ['home.services.eyebrow', 'text'],
  ['home.services.title', 'text'],
  ['home.services.sub', 'longText'],
  ['home.work.eyebrow', 'text'],
  ['home.work.title', 'text'],
  ['home.work.sub', 'longText'],
  ['home.process.eyebrow', 'text'],
  ['home.process.title', 'text'],
  ['home.process.sub', 'longText'],
  ['home.process.steps.0.title', 'text'],
  ['home.process.steps.0.body', 'longText'],
  ['home.process.steps.1.title', 'text'],
  ['home.process.steps.1.body', 'longText'],
  ['home.process.steps.2.title', 'text'],
  ['home.process.steps.2.body', 'longText'],
  ['home.process.steps.3.title', 'text'],
  ['home.process.steps.3.body', 'longText'],
  ['home.fit.eyebrow', 'text'],
  ['home.fit.title', 'text'],
  ['home.fit.forTitle', 'text'],
  ['home.fit.forItems[]', 'list'],
  ['home.fit.notForTitle', 'text'],
  ['home.fit.notForItems[]', 'list'],
  ['home.fit.honesty', 'longText'],
  ['home.about.eyebrow', 'text'],
  ['home.about.title', 'text'],
  ['home.about.body', 'longText'],
  ['home.about.link', 'text'],
  ['home.cta.title', 'text'],
  ['home.cta.body', 'longText'],
  ['home.cta.button', 'text'],
  ['home.cta.alt', 'text'],

  // services
  ['services.meta.title', 'text'],
  ['services.meta.description', 'longText'],
  ['services.eyebrow', 'text'],
  ['services.title', 'text'],
  ['services.intro', 'longText'],
  ['services.shared.title', 'text'],
  ['services.shared.items.0.title', 'text'],
  ['services.shared.items.0.body', 'longText'],
  ['services.shared.items.1.title', 'text'],
  ['services.shared.items.1.body', 'longText'],
  ['services.shared.items.2.title', 'text'],
  ['services.shared.items.2.body', 'longText'],
  ['services.shared.items.3.title', 'text'],
  ['services.shared.items.3.body', 'longText'],
  ['services.shared.faqLink', 'text'],
  ['services.cta.title', 'text'],
  ['services.cta.body', 'longText'],
  ['services.cta.button', 'text'],

  // about
  ['about.meta.title', 'longText'],
  ['about.meta.description', 'longText'],
  ['about.eyebrow', 'text'],
  ['about.title', 'text'],
  ['about.intro', 'longText'],
  ['about.story.title', 'text'],
  ['about.story.chapters.0.title', 'text'],
  ['about.story.chapters.0.paragraphs[]', 'list'],
  ['about.story.chapters.1.title', 'text'],
  ['about.story.chapters.1.paragraphs[]', 'list'],
  ['about.story.chapters.2.title', 'text'],
  ['about.story.chapters.2.paragraphs[]', 'list'],
  ['about.method.title', 'text'],
  ['about.method.items.0.title', 'text'],
  ['about.method.items.0.body', 'longText'],
  ['about.method.items.1.title', 'text'],
  ['about.method.items.1.body', 'longText'],
  ['about.method.items.2.title', 'text'],
  ['about.method.items.2.body', 'longText'],
  ['about.method.items.3.title', 'text'],
  ['about.method.items.3.body', 'longText'],
  ['about.expect.title', 'text'],
  ['about.expect.intro', 'longText'],
  ['about.expect.items.0.title', 'text'],
  ['about.expect.items.0.body', 'longText'],
  ['about.expect.items.1.title', 'text'],
  ['about.expect.items.1.body', 'longText'],
  ['about.expect.items.2.title', 'text'],
  ['about.expect.items.2.body', 'longText'],
  ['about.expect.items.3.title', 'text'],
  ['about.expect.items.3.body', 'longText'],
  ['about.platform.title', 'text'],
  ['about.platform.body', 'longText'],
  ['about.platform.link', 'text'],
  ['about.portraitAlt', 'text'],
  ['about.cta.title', 'text'],
  ['about.cta.body', 'longText'],
  ['about.cta.button', 'text'],
  ['about.cta.alt', 'text'],

  // work
  ['work.meta.title', 'text'],
  ['work.meta.description', 'longText'],
  ['work.eyebrow', 'text'],
  ['work.title', 'text'],
  ['work.intro', 'longText'],

  // blog
  ['blog.meta.title', 'text'],
  ['blog.meta.description', 'longText'],
  ['blog.eyebrow', 'text'],
  ['blog.title', 'text'],
  ['blog.intro', 'longText'],
  ['blog.home.eyebrow', 'text'],
  ['blog.home.title', 'text'],
  ['blog.home.sub', 'longText'],

  // contact
  ['contact.meta.title', 'text'],
  ['contact.meta.description', 'longText'],
  ['contact.eyebrow', 'text'],
  ['contact.title', 'text'],
  ['contact.intro', 'longText'],
  ['contact.aside.title', 'text'],
  ['contact.aside.body', 'longText'],
  ['contact.aside.emailLabel', 'text'],
  ['contact.aside.locationLabel', 'text'],
  ['contact.aside.location', 'longText'],
  ['contact.aside.languagesLabel', 'text'],
  ['contact.aside.languages', 'text'],

  // faq
  ['faq.meta.title', 'text'],
  ['faq.meta.description', 'longText'],
  ['faq.eyebrow', 'text'],
  ['faq.title', 'text'],
  ['faq.intro', 'longText'],
  ['faq.groups.0.title', 'text'],
  ['faq.groups.0.items.0.question', 'text'],
  ['faq.groups.0.items.0.answer', 'longText'],
  ['faq.groups.0.items.1.question', 'text'],
  ['faq.groups.0.items.1.answer', 'longText'],
  ['faq.groups.0.items.2.question', 'text'],
  ['faq.groups.0.items.2.answer', 'longText'],
  ['faq.groups.0.items.3.question', 'text'],
  ['faq.groups.0.items.3.answer', 'longText'],
  ['faq.groups.1.title', 'text'],
  ['faq.groups.1.items.0.question', 'text'],
  ['faq.groups.1.items.0.answer', 'longText'],
  ['faq.groups.1.items.1.question', 'text'],
  ['faq.groups.1.items.1.answer', 'longText'],
  ['faq.groups.2.title', 'text'],
  ['faq.groups.2.items.0.question', 'text'],
  ['faq.groups.2.items.0.answer', 'longText'],
  ['faq.groups.2.items.1.question', 'text'],
  ['faq.groups.2.items.1.answer', 'longText'],

  // stack
  ['stack.meta.title', 'text'],
  ['stack.meta.description', 'longText'],
  ['stack.eyebrow', 'text'],
  ['stack.title', 'text'],
  ['stack.intro', 'longText'],
  ['stack.platform.title', 'text'],
  ['stack.platform.body', 'longText'],
  ['stack.platform.layers.0.label', 'text'],
  ['stack.platform.layers.0.value', 'text'],
  ['stack.platform.layers.1.label', 'text'],
  ['stack.platform.layers.1.value', 'text'],
  ['stack.platform.layers.2.label', 'text'],
  ['stack.platform.layers.2.value', 'text'],
  ['stack.platform.layers.3.label', 'text'],
  ['stack.platform.layers.3.value', 'text'],
  ['stack.built.title', 'text'],
  ['stack.built.body', 'longText'],
  ['stack.built.link', 'text'],
  ['stack.links.title', 'text'],
  ['stack.links.email', 'text'],

  // legal
  ['legal.impressum.meta.title', 'text'],
  ['legal.impressum.meta.description', 'text'],
  ['legal.impressum.eyebrow', 'text'],
  ['legal.impressum.title', 'text'],
  ['legal.impressum.intro', 'text'],
  ['legal.impressum.sections.0.title', 'text'],
  ['legal.impressum.sections.0.lines[]', 'list'],
  ['legal.impressum.sections.1.title', 'text'],
  ['legal.impressum.sections.1.lines[]', 'list'],
  ['legal.impressum.sections.2.title', 'text'],
  ['legal.impressum.sections.2.lines[]', 'list'],
  ['legal.impressum.sections.3.title', 'text'],
  ['legal.impressum.sections.3.body', 'longText'],
  ['legal.impressum.sections.4.title', 'text'],
  ['legal.impressum.sections.4.body', 'longText'],
  ['legal.impressum.sections.5.title', 'text'],
  ['legal.impressum.sections.5.body', 'longText'],
  ['legal.impressum.sections.6.title', 'text'],
  ['legal.impressum.sections.6.body', 'longText'],
  ['legal.impressum.updated', 'text'],
  ['legal.privacy.meta.title', 'text'],
  ['legal.privacy.meta.description', 'longText'],
  ['legal.privacy.eyebrow', 'text'],
  ['legal.privacy.title', 'text'],
  ['legal.privacy.intro', 'longText'],
  ['legal.privacy.sections.0.title', 'text'],
  ['legal.privacy.sections.0.lines[]', 'list'],
  ['legal.privacy.sections.1.title', 'text'],
  ['legal.privacy.sections.1.body', 'longText'],
  ['legal.privacy.sections.2.title', 'text'],
  ['legal.privacy.sections.2.body', 'longText'],
  ['legal.privacy.sections.3.title', 'text'],
  ['legal.privacy.sections.3.body', 'longText'],
  ['legal.privacy.sections.4.title', 'text'],
  ['legal.privacy.sections.4.body', 'longText'],
  ['legal.privacy.sections.5.title', 'text'],
  ['legal.privacy.sections.5.body', 'longText'],
  ['legal.privacy.sections.6.title', 'text'],
  ['legal.privacy.sections.6.lines[]', 'list'],
  ['legal.privacy.sections.7.title', 'text'],
  ['legal.privacy.sections.7.body', 'longText'],
  ['legal.privacy.sections.8.title', 'text'],
  ['legal.privacy.sections.8.body', 'longText'],
  ['legal.privacy.updated', 'text'],

  // notFound
  ['notFound.title', 'text'],
  ['notFound.body', 'text'],
  ['notFound.link', 'text'],
]

/**
 * Lists whose length the layout fixes. The homepage demo positions its three
 * notes and three navigation tabs one by one (`note-0`…`note-2`, the second
 * tab drawn as active), so those lists can be reordered and reworded but not
 * grown or shrunk. Every other list renders however many lines it holds.
 */
const FIXED_LENGTH: Record<string, number> = {
  'home.story.demo.notes[]': 3,
  'home.story.demo.navigation[]': 3,
}

/** Facts about the owner, held once for all three languages. */
const FACTS: ReadonlyArray<{ key: string; format: ContentFormat; optional: boolean }> = [
  { key: 'site.email', format: 'email', optional: false },
  // Empty until the owner fills it in; the site leaves it out while empty.
  { key: 'site.phone', format: 'phone', optional: true },
  { key: 'site.city', format: 'plain', optional: false },
  { key: 'site.github', format: 'url', optional: false },
  { key: 'site.linkedin', format: 'url', optional: false },
]

/** The editor's page order; `site` last because it is not a page. */
export const CONTENT_PAGES = [
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
] as const

/** Search engines cut titles and descriptions at about these lengths. */
const SEO_GUIDANCE: Record<string, number> = { title: 60, description: 155 }

const readDefault = (language: ContentLanguage, key: string): ContentValue | undefined => {
  const value = readContentPath(content[language], key)

  return typeof value === 'number' ? undefined : value
}

/**
 * The length the design was built for: the longest translation plus a
 * quarter. The same rule the legacy editor used, so its counters mean the same.
 */
const guidanceFor = (key: string, kind: ContentKind): number => {
  const leaf = key.split('.').at(-1) ?? ''
  if (key.includes('.meta.') && leaf in SEO_GUIDANCE) return SEO_GUIDANCE[leaf]

  const longest = Math.max(
    ...(['de', 'en', 'ar'] as const).map((language) => {
      const value = readDefault(language, key)
      if (typeof value === 'string') return value.length
      if (Array.isArray(value)) return Math.max(0, ...value.map((entry) => entry.length))
      return 0
    }),
  )

  return Math.max(kind === 'list' ? 16 : 40, Math.ceil((longest * 1.25) / 10) * 10)
}

/** `legal.impressum.sections.0.title` → page `legal`, section `impressum`. */
const sectionFor = (key: string): string => {
  const parts = key.replace(/\[\]$/u, '').split('.')

  return parts.length >= 3 ? parts[1] : 'header'
}

const buildRegistry = (): ContentFieldDefinition[] => {
  const copy = COPY.map(([key, kind]): ContentFieldDefinition => {
    for (const language of ['de', 'en', 'ar'] as const) {
      const value = readDefault(language, key)
      const shapeMatches = kind === 'list' ? Array.isArray(value) : typeof value === 'string'

      // A registry line that no longer matches the content tree is a release
      // bug, and failing at start-up is the only way it cannot reach the owner.
      if (!shapeMatches) {
        throw new Error(`Content registry: ${key} (${language}) is not a ${kind} in the content tree`)
      }
    }

    const fixed = FIXED_LENGTH[key]

    return {
      key,
      page: key.split('.')[0],
      section: sectionFor(key),
      kind,
      scope: key.startsWith('legal.') ? 'legal' : key.includes('.meta.') ? 'seo' : 'copy',
      format: 'plain',
      shared: false,
      optional: false,
      guidance: guidanceFor(key, kind),
      minEntries: kind === 'list' ? (fixed ?? 1) : 0,
      maxEntries: kind === 'list' ? (fixed ?? CONTENT_LIMITS.listEntries) : 0,
    }
  })

  const facts = FACTS.map(
    ({ key, format, optional }): ContentFieldDefinition => ({
      key,
      page: 'site',
      section: 'facts',
      kind: 'text',
      scope: 'fact',
      format,
      shared: true,
      optional,
      guidance: 0,
      minEntries: 0,
      maxEntries: 0,
    }),
  )

  return [...copy, ...facts]
}

export const contentRegistry: readonly ContentFieldDefinition[] = buildRegistry()

const byKey: ReadonlyMap<string, ContentFieldDefinition> = new Map(
  contentRegistry.map((field) => [field.key, field]),
)

export const findContentField = (key: string): ContentFieldDefinition | undefined => byKey.get(key)

/** The slots a field is written in: the three languages, or `shared` alone. */
export const slotsOf = (field: ContentFieldDefinition): ContentSlot[] =>
  field.shared ? ['shared'] : ['de', 'en', 'ar']

/** The release default for one field in one slot. */
export const originalValue = (field: ContentFieldDefinition, slot: ContentSlot): ContentValue => {
  if (field.shared) {
    const fact = (site as Record<string, unknown>)[field.key.slice('site.'.length)]

    return typeof fact === 'string' ? fact : ''
  }

  if (slot === 'shared') throw new Error(`${field.key} is written per language`)

  const value = readDefault(slot, field.key)
  if (value === undefined) throw new Error(`${field.key} has no default in ${slot}`)

  return value
}
