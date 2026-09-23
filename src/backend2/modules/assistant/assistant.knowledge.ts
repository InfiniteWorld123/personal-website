import type { AssistantLanguage, AssistantSourceKind } from '../../contracts/assistant.contract'
import type { PublicServicePrice } from '../../contracts/service.contract'
import { getDb } from '../../db/client'
import { catchUpSchedules } from '../blog/post.due'
import { listPublicPosts, readPublicPost } from '../blog/post.service'
import { contentRegistry } from '../content/content.registry'
import { readPublicContent } from '../content/content.service'
import { listPublicProjects, readPublicProject } from '../projects/project.service'
import { listPublicServices, readPublicService } from '../services/service.service'
import { COPY } from './assistant.language'
import { clip } from './assistant.text'

/**
 * What the assistant knows: the owner's currently published website content,
 * and nothing else (`docs/v2/ai-assistant.md`).
 *
 * Every piece is read through the owning module's **public** reader —
 * `listPublicServices`/`readPublicService`, the Projects and Blog equivalents,
 * and `readPublicContent`. Those functions join only the live version, so a
 * draft, a scheduled article, an unpublished service, a private client name or
 * a Lead is not filtered out here: it is never reached. Duplicating their
 * publishing rules here would be a second copy that could disagree.
 *
 * The documents are cached per language, keyed by a **fingerprint** of the
 * publication state (one cheap query per question). Publishing, updating,
 * unpublishing, archiving, deleting or editing static copy changes the
 * fingerprint, so the very next question rebuilds from the public readers —
 * a withdrawn page stops informing answers immediately, not after a timeout.
 */

export type KnowledgeDocument = {
  /** Stable within one build: `service:website`, `faq:0.1`. */
  id: string
  kind: AssistantSourceKind
  language: AssistantLanguage
  title: string
  /** A path on this website. */
  url: string
  /** The searchable prose, in the published wording. */
  text: string
  /** For a service: the published price, already worded for this language. */
  priceLine: string | null
  /** Every amount the website itself publishes in this document, in euros. */
  amounts: number[]
}

/**
 * Upper bounds, so a large catalogue cannot turn one question into hundreds
 * of queries. Far above the site's real size; documented in the spec.
 */
const MAX_ITEMS_PER_MODULE = 60
const MAX_TEXT_PER_DOCUMENT = 6000
const BATCH = 36

/* ------------------------------------------------------------- the fingerprint */

/**
 * One value that changes whenever anything a visitor can read changes.
 *
 * It reads only publication bookkeeping — ids, live-version pointers,
 * publication times and revisions — never text, so it costs one small query.
 * It over-invalidates on purpose (an owner's draft save may change it too):
 * a needless rebuild is cheap, a stale answer is not.
 */
export const readKnowledgeFingerprint = async (): Promise<string> => {
  // A scheduled article whose time has come is live for visitors now; the
  // public Blog reads do the same catch-up before answering.
  await catchUpSchedules()

  const { rows } = await getDb().query<{ fingerprint: string }>(
    `SELECT md5(concat_ws('|',
       (SELECT coalesce(string_agg(concat_ws(':', id, published_version_id, published_at,
                                             published_draft_revision), ',' ORDER BY id), '')
          FROM v2_services),
       (SELECT coalesce(string_agg(concat_ws(':', id, lifecycle, published_version_id, published_at,
                                             published_draft_revision), ',' ORDER BY id), '')
          FROM v2_projects),
       (SELECT coalesce(string_agg(concat_ws(':', id, slug, published_version_id, published_at,
                                             published_draft_revision, content_updated_at), ',' ORDER BY id), '')
          FROM v2_blog_posts),
       (SELECT coalesce(string_agg(concat_ws(':', field_key, language, revision, updated_at),
                                   ',' ORDER BY field_key, language), '')
          FROM v2_content_values)
     )) AS fingerprint`,
  )

  return rows[0]?.fingerprint ?? ''
}

/* ---------------------------------------------------------------- plain text */

type Node = { type?: string; text?: string; content?: Node[]; attrs?: Record<string, unknown> }

const BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock', 'tableRow'])

/** A rich-text tree as prose: text nodes joined, one line per block. Images and videos say nothing. */
export const richTextToPlain = (doc: { content?: Node[] } | null | undefined): string => {
  if (!doc?.content) return ''

  const lines: string[] = []

  const walk = (nodes: Node[], into: string[]): void => {
    for (const node of nodes) {
      if (node.type === 'text' && typeof node.text === 'string') {
        into.push(node.text)
      } else if (node.type === 'hardBreak') {
        into.push(' ')
      } else if (node.content) {
        if (BLOCKS.has(node.type ?? '')) {
          const inner: string[] = []

          walk(node.content, inner)

          const line = inner.join('').trim()

          if (line) lines.push(line)
        } else {
          walk(node.content, into)
        }
      }
    }
  }

  const loose: string[] = []

  walk(doc.content, loose)

  if (loose.join('').trim()) lines.push(loose.join('').trim())

  return lines.join('\n')
}

/* --------------------------------------------------------------------- prices */

const groupThousands = (digits: string, separator: string): string =>
  digits.replace(/\B(?=(\d{3})+(?!\d))/gu, separator)

/** `149000` cents → `1.490 €` (de), `€1,490` (en), `1,490 €` (ar). */
export const formatEuros = (amountCents: number, language: AssistantLanguage): string => {
  const whole = Math.floor(amountCents / 100)
  const cents = amountCents % 100

  if (language === 'de') {
    return `${groupThousands(String(whole), '.')}${cents ? `,${String(cents).padStart(2, '0')}` : ''} €`
  }

  const number = `${groupThousands(String(whole), ',')}${cents ? `.${String(cents).padStart(2, '0')}` : ''}`

  return language === 'en' ? `€${number}` : `${number} €`
}

/** The published price, with its qualifications, as one line in one language. */
export const priceLineOf = (price: PublicServicePrice | null, language: AssistantLanguage): string | null => {
  if (!price) return null

  const words = COPY.price

  if (price.mode === 'quote') return `${words.label[language]}: ${words.quote[language]}`

  const amount = formatEuros(price.amountCents, language)
  const period = words.period[price.period][language]
  const main = price.mode === 'from' ? `${words.from[language]} ${amount}` : amount
  const offer = price.promotion
    ? ` (${words.offer[language]}${price.promotion.label ? ` – ${price.promotion.label}` : ''}: ${formatEuros(
        price.promotion.amountCents,
        language,
      )})`
    : ''

  return `${words.label[language]}: ${main} ${period}${offer}`
}

const amountsOfPrice = (price: PublicServicePrice | null): number[] =>
  !price || price.mode === 'quote'
    ? []
    : [price.amountCents / 100, ...(price.promotion ? [price.promotion.amountCents / 100] : [])]

/* ------------------------------------------------------------------ builders */

/** Pages through a public list reader until it is done or the bound is reached. */
const collect = async <T>(
  read: (offset: number, limit: number) => Promise<{ items: T[]; hasMore: boolean }>,
): Promise<T[]> => {
  const items: T[] = []

  for (let offset = 0; items.length < MAX_ITEMS_PER_MODULE; offset += BATCH) {
    const batch = await read(offset, Math.min(BATCH, MAX_ITEMS_PER_MODULE - items.length))

    items.push(...batch.items)

    if (!batch.hasMore || batch.items.length === 0) break
  }

  return items
}

/** A detail read that may legitimately 404 (withdrawn a moment ago, not in this language). */
const orNull = async <T>(read: () => Promise<T>): Promise<T | null> => {
  try {
    return await read()
  } catch {
    return null
  }
}

const serviceDocuments = async (language: AssistantLanguage): Promise<KnowledgeDocument[]> => {
  const cards = await collect((offset, limit) =>
    listPublicServices({ language, offset, limit, featured: 'all' }),
  )
  const documents: KnowledgeDocument[] = []

  for (const card of cards) {
    const detail = await orNull(() => readPublicService({ slug: card.slug, language }))

    if (!detail) continue

    const priceLine = priceLineOf(detail.price, language)

    documents.push({
      id: `service:${detail.canonicalSlug}`,
      kind: 'service',
      language,
      title: detail.name,
      url: `/${language}/services#${detail.canonicalSlug}`,
      text: clip(
        [detail.summary, detail.included.join('\n'), detail.body, priceLine ?? ''].filter(Boolean).join('\n'),
        MAX_TEXT_PER_DOCUMENT,
      ),
      priceLine,
      amounts: amountsOfPrice(detail.price),
    })
  }

  return documents
}

const projectDocuments = async (language: AssistantLanguage): Promise<KnowledgeDocument[]> => {
  const cards = await collect((offset, limit) => listPublicProjects({ language, offset, limit }))
  const documents: KnowledgeDocument[] = []

  for (const card of cards) {
    const detail = await orNull(() => readPublicProject({ slug: card.slug, language }))

    if (!detail) continue

    documents.push({
      id: `project:${detail.canonicalSlug}`,
      kind: 'project',
      language,
      title: detail.name,
      url: `/${language}/work/${detail.canonicalSlug}`,
      text: clip(
        [
          detail.categoryLabel ?? '',
          detail.summary,
          detail.tech.length > 0 ? detail.tech.join(', ') : '',
          richTextToPlain(detail.caseStudy),
        ]
          .filter(Boolean)
          .join('\n'),
        MAX_TEXT_PER_DOCUMENT,
      ),
      priceLine: null,
      amounts: [],
    })
  }

  return documents
}

const postDocuments = async (language: AssistantLanguage): Promise<KnowledgeDocument[]> => {
  const cards = await collect((offset, limit) => listPublicPosts({ language, offset, limit, tag: '' }))
  const documents: KnowledgeDocument[] = []

  for (const card of cards) {
    const detail = await orNull(() => readPublicPost({ slug: card.slug, language }))

    if (!detail) continue

    documents.push({
      id: `post:${detail.slug}`,
      kind: 'post',
      language,
      title: detail.title,
      url: `/${language}/blog/${detail.slug}`,
      text: clip(
        [detail.summary, detail.tags.map((tag) => tag.name).join(', '), richTextToPlain(detail.body)]
          .filter(Boolean)
          .join('\n'),
        MAX_TEXT_PER_DOCUMENT,
      ),
      priceLine: null,
      amounts: [],
    })
  }

  return documents
}

/**
 * Static copy that answers questions. SEO titles, legal text, the navigation
 * shell and the 404 page are left out: they are either not prose a visitor
 * asks about or (legal) belong on their own page, which the privacy link
 * already points at.
 */
const CONTENT_PAGES = ['home', 'services', 'work', 'about', 'blog', 'contact', 'stack'] as const

const pagePath = (language: AssistantLanguage, page: string): string =>
  page === 'home' ? `/${language}` : `/${language}/${page}`

const asText = (value: unknown): string =>
  typeof value === 'string' ? value : Array.isArray(value) ? value.filter((v) => typeof v === 'string').join('\n') : ''

/** Labels for the owner's public facts, so "what is your email?" finds the address. */
export const CONTACT_FACTS_ID = 'page:contact.facts'

const FACT_LABELS = {
  title: { de: 'Kontaktdaten', en: 'Contact details', ar: 'بيانات التواصل' },
  email: { de: 'E-Mail', en: 'Email', ar: 'البريد الإلكتروني' },
  phone: { de: 'Telefon', en: 'Phone', ar: 'الهاتف' },
  city: { de: 'Standort', en: 'Based in', ar: 'المدينة' },
} as const

const FAQ_QUESTION = /^faq\.groups\.(\d+)\.items\.(\d+)\.question$/u

const contentDocuments = async (language: AssistantLanguage): Promise<KnowledgeDocument[]> => {
  const content = await readPublicContent(language)
  const documents: KnowledgeDocument[] = []

  // The FAQ: one document per published question and answer.
  for (const field of contentRegistry) {
    const match = FAQ_QUESTION.exec(field.key)

    if (!match) continue

    const question = asText(content.fields[field.key]).trim()
    const answer = asText(content.fields[`faq.groups.${match[1]}.items.${match[2]}.answer`]).trim()

    if (!question || !answer) continue

    documents.push({
      id: `faq:${match[1]}.${match[2]}`,
      kind: 'faq',
      language,
      title: question,
      url: `/${language}/faq`,
      text: answer,
      priceLine: null,
      amounts: [],
    })
  }

  // The other pages: one document per page section, in registry order.
  const sections = new Map<string, { page: string; title: string; parts: string[] }>()

  for (const field of contentRegistry) {
    if (field.shared || field.scope !== 'copy') continue
    if (!(CONTENT_PAGES as readonly string[]).includes(field.page)) continue

    const value = asText(content.fields[field.key]).trim()

    if (!value) continue

    const key = `${field.page}.${field.section}`
    const section = sections.get(key) ?? { page: field.page, title: '', parts: [] }

    // The section's own heading, when it has one, names the source link.
    if (!section.title && /\.(title|headline|heading)$/u.test(field.key)) section.title = value

    section.parts.push(value)
    sections.set(key, section)
  }

  for (const [key, section] of sections) {
    documents.push({
      id: `page:${key}`,
      kind: 'page',
      language,
      title: clip(section.title || section.page, 120),
      url: pagePath(language, section.page),
      text: clip(section.parts.join('\n'), MAX_TEXT_PER_DOCUMENT),
      priceLine: null,
      amounts: [],
    })
  }

  // The owner's public facts: how to reach them.
  const facts = (['email', 'phone', 'city'] as const)
    .map((fact) => [fact, asText(content.shared[`site.${fact}`]).trim()] as const)
    .filter(([, value]) => value !== '')
    .map(([fact, value]) => `${FACT_LABELS[fact][language]}: ${value}`)

  if (facts.length > 0) {
    documents.push({
      id: CONTACT_FACTS_ID,
      kind: 'page',
      language,
      title: FACT_LABELS.title[language],
      url: `/${language}/contact`,
      text: facts.join('\n'),
      priceLine: null,
      amounts: [],
    })
  }

  return documents
}

/** Every published document in one language, freshly read. */
export const buildKnowledge = async (language: AssistantLanguage): Promise<KnowledgeDocument[]> => [
  ...(await serviceDocuments(language)),
  ...(await projectDocuments(language)),
  ...(await postDocuments(language)),
  ...(await contentDocuments(language)),
]

/* ----------------------------------------------------------------- the cache */

type Cached = { fingerprint: string; documents: KnowledgeDocument[] }

const cache = new Map<AssistantLanguage, Cached>()

/**
 * The published documents for one language, rebuilt whenever the
 * fingerprint moved. Per process (per Worker isolate), which is fine: a cold
 * isolate simply builds once.
 */
export const loadKnowledge = async (language: AssistantLanguage): Promise<KnowledgeDocument[]> => {
  const fingerprint = await readKnowledgeFingerprint()
  const cached = cache.get(language)

  if (cached && cached.fingerprint === fingerprint) return cached.documents

  const documents = await buildKnowledge(language)

  cache.set(language, { fingerprint, documents })

  return documents
}

/** Tests only: forget every cached build. */
export const clearKnowledgeCacheForTest = (): void => {
  cache.clear()
}
