import * as v from 'valibot'
import { PageQuerySchema } from './pagination.contract'

/**
 * Content V2 — the public website's static copy (`docs/v2/content.md`).
 *
 * Shared by Backend2 and the Dashboard. It imports nothing but Valibot and
 * the pagination envelope, so the browser can run the exact rules the server
 * enforces: the editor's field errors and the server's refusals come from the
 * same function, `checkContentValue`.
 *
 * There is no draft and no Publish here, on purpose. A saved field is live.
 */

/** The three public languages. */
export const CONTENT_LANGUAGES = ['de', 'en', 'ar'] as const
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number]

/**
 * Where a stored value belongs: one public language, or `shared` for a fact
 * that is the same in all three (an email address, a profile link).
 */
export const CONTENT_SLOTS = ['de', 'en', 'ar', 'shared'] as const
export type ContentSlot = (typeof CONTENT_SLOTS)[number]

/**
 * The three shapes the public components can render.
 *
 * - `text` — one line: a heading, a label, a button.
 * - `longText` — a paragraph. Line breaks are kept.
 * - `list` — an ordered list of one-line entries.
 * - `links` — the owner's profile links, in order: a platform, an address,
 *   and whether it is shown. Only the shared `site.links` fact has it.
 */
export type ContentKind = 'text' | 'longText' | 'list' | 'links'

/** What the field is for. `legal` is locked in the editor until unlocked on purpose. */
export type ContentScope = 'copy' | 'seo' | 'legal' | 'fact'

/** Extra checks for the shared facts. */
export type ContentFormat = 'plain' | 'email' | 'url' | 'phone'

/**
 * The platforms a profile link can be. The platform decides the icon and the
 * name the website shows, so every icon comes from one drawn set; `website`
 * is any other address, named by its own label or host.
 */
export const LINK_PLATFORMS = [
  'github',
  'linkedin',
  'instagram',
  'x',
  'youtube',
  'whatsapp',
  'telegram',
  'website',
] as const
export type LinkPlatform = (typeof LINK_PLATFORMS)[number]

/** The name shown beside the icon when the link has no label of its own. */
export const LINK_PLATFORM_NAME: Record<LinkPlatform, string> = {
  github: 'GitHub',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  x: 'X',
  youtube: 'YouTube',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  website: 'Website',
}

/**
 * Where each platform's links live. A GitHub link that points somewhere else
 * is almost always a paste into the wrong row, so it is refused.
 */
const LINK_HOSTS: Record<Exclude<LinkPlatform, 'website'>, readonly string[]> = {
  github: ['github.com'],
  linkedin: ['linkedin.com'],
  instagram: ['instagram.com'],
  x: ['x.com', 'twitter.com'],
  youtube: ['youtube.com', 'youtu.be'],
  whatsapp: ['wa.me', 'whatsapp.com'],
  telegram: ['t.me', 'telegram.me'],
}

/** One profile link. `label` empty means the platform's own name. */
export type ContentLink = {
  platform: LinkPlatform
  url: string
  label: string
  /** Kept in the list but not shown on the website. */
  hidden: boolean
}

export type ContentValue = string | string[] | ContentLink[]

/** A `list` value: lines of text. (An empty list reads as one too, harmlessly.) */
export const isTextList = (value: ContentValue): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')

/** Any value as one line of text: lines and link names joined. */
export const contentAsText = (value: ContentValue, separator = ' · '): string =>
  typeof value === 'string'
    ? value
    : isTextList(value)
      ? value.join(separator)
      : value.filter((link) => !link.hidden).map(linkName).join(separator)

/**
 * The hard limits. A request over these is refused outright; the per-field
 * `guidance` in the registry is only advice about how the wording will look.
 */
export const CONTENT_LIMITS = {
  text: 500,
  longText: 6000,
  listEntry: 600,
  listEntries: 24,
  links: 12,
  linkLabel: 40,
} as const

/** One editable field, as the registry defines it and the editor receives it. */
export type ContentFieldDefinition = {
  /** `home.hero.headline`, `home.hero.typed[]`, `site.email`. */
  key: string
  /** The public page it belongs to, for the editor's navigation. */
  page: string
  /** The section inside that page. */
  section: string
  kind: ContentKind
  scope: ContentScope
  format: ContentFormat
  /** Written once for all three languages. */
  shared: boolean
  /** May be left empty. Only the optional phone number, today. */
  optional: boolean
  /** Recommended length, for the counter. `0` means no useful recommendation. */
  guidance: number
  /** For lists: the entries the layout supports. */
  minEntries: number
  maxEntries: number
}

export type ContentIssue = { field: string; message: string }

/* ------------------------------------------------------------- the checks */

// Control characters other than tab and newline have no place in copy.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
const PHONE = /^\+?[0-9][0-9 ()/.-]{4,28}[0-9]$/u

const isHttpsUrl = (value: string): boolean => {
  try {
    const url = new URL(value)

    return url.protocol === 'https:' && url.hostname.includes('.') && !url.username && !url.password
  } catch {
    return false
  }
}

/** `github.com`, `www.github.com` and `de.linkedin.com` all belong to their platform. */
const onHost = (value: string, hosts: readonly string[]): boolean => {
  const host = new URL(value).hostname.toLowerCase()

  return hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}

/** What the website writes beside a link's icon. */
export const linkName = (link: Pick<ContentLink, 'platform' | 'url' | 'label'>): string => {
  if (link.label !== '') return link.label
  if (link.platform !== 'website') return LINK_PLATFORM_NAME[link.platform]

  try {
    return new URL(link.url).hostname.replace(/^www\./u, '')
  } catch {
    return LINK_PLATFORM_NAME.website
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The `links` shape: every row checked, the first problem named by its path. */
const checkLinks = (
  field: ContentFieldDefinition,
  raw: unknown,
): { ok: true; value: ContentLink[] } | { ok: false; issues: ContentIssue[] } => {
  const fail = (message: string, path = 'value') => ({ ok: false as const, issues: [{ field: path, message }] })

  if (!Array.isArray(raw) || !raw.every(isRecord)) return fail('This field expects a list of links')

  const links: ContentLink[] = []

  for (const [index, row] of raw.entries()) {
    const path = `value.${index}`

    if (!(LINK_PLATFORMS as readonly unknown[]).includes(row.platform)) {
      return fail('Choose a platform for this link', `${path}.platform`)
    }
    const platform = row.platform as LinkPlatform

    if (typeof row.url !== 'string') return fail('Enter the link', `${path}.url`)
    const url = tidy(row.url)

    if (url === '') return fail('Enter the link', `${path}.url`)
    if (url.length > CONTENT_LIMITS.text || CONTROL.test(url) || url.includes('\n') || !isHttpsUrl(url)) {
      return fail('Enter a full link that starts with https://', `${path}.url`)
    }
    if (platform !== 'website' && !onHost(url, LINK_HOSTS[platform])) {
      return fail(
        `A ${LINK_PLATFORM_NAME[platform]} link starts with https://${LINK_HOSTS[platform][0]}/`,
        `${path}.url`,
      )
    }

    if (row.label !== undefined && typeof row.label !== 'string') return fail('The name must be text', `${path}.label`)
    const label = tidy(row.label ?? '')

    if (label.includes('\n') || CONTROL.test(label)) return fail('The name must be one line', `${path}.label`)
    if (label.length > CONTENT_LIMITS.linkLabel) {
      return fail(`A name can have at most ${CONTENT_LIMITS.linkLabel} characters`, `${path}.label`)
    }

    if (row.hidden !== undefined && typeof row.hidden !== 'boolean') return fail('Choose shown or hidden', `${path}.hidden`)

    if (links.some((link) => link.url === url)) return fail('This link is already in the list', `${path}.url`)

    links.push({ platform, url, label, hidden: row.hidden === true })
  }

  if (links.length < field.minEntries || links.length > field.maxEntries) {
    return fail(`This list can have at most ${field.maxEntries} links`)
  }

  return { ok: true, value: links }
}

/** Line endings as the browser may send them, normalised; outer spaces removed. */
const tidy = (value: string): string => value.replace(/\r\n?/gu, '\n').trim()

/**
 * Normalises and checks one value against its field.
 *
 * Returns the value that will be stored — trimmed, with line endings
 * normalised — or the issues that refuse it. The Dashboard runs this in the
 * browser and the server runs it again, authoritatively.
 */
export const checkContentValue = (
  field: ContentFieldDefinition,
  raw: unknown,
): { ok: true; value: ContentValue } | { ok: false; issues: ContentIssue[] } => {
  const fail = (message: string, path = 'value') => ({
    ok: false as const,
    issues: [{ field: path, message }],
  })

  if (field.kind === 'links') return checkLinks(field, raw)

  if (field.kind === 'list') {
    if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== 'string')) {
      return fail('This field expects a list of lines')
    }

    const entries = (raw as string[]).map(tidy)
    const issues: ContentIssue[] = []

    entries.forEach((entry, index) => {
      const path = `value.${index}`

      if (entry === '') issues.push({ field: path, message: 'This line is empty' })
      else if (entry.includes('\n')) issues.push({ field: path, message: 'A line cannot contain a line break' })
      else if (CONTROL.test(entry)) issues.push({ field: path, message: 'This line contains an invalid character' })
      else if (entry.length > CONTENT_LIMITS.listEntry) {
        issues.push({ field: path, message: `A line can have at most ${CONTENT_LIMITS.listEntry} characters` })
      }
    })

    if (issues.length > 0) return { ok: false, issues }

    if (entries.length < field.minEntries || entries.length > field.maxEntries) {
      return fail(
        field.minEntries === field.maxEntries
          ? `This list needs exactly ${field.minEntries} lines`
          : `This list needs between ${field.minEntries} and ${field.maxEntries} lines`,
      )
    }

    // The public components key each entry by its text, so two identical
    // lines would render as one.
    const seen = new Set<string>()
    for (const [index, entry] of entries.entries()) {
      if (seen.has(entry)) return fail('Two lines in this list are the same', `value.${index}`)
      seen.add(entry)
    }

    return { ok: true, value: entries }
  }

  if (typeof raw !== 'string') return fail('This field expects text')

  const value = tidy(raw)

  if (value === '') {
    return field.optional ? { ok: true, value: '' } : fail('This text cannot be empty')
  }

  if (CONTROL.test(value)) return fail('This text contains an invalid character')

  if (field.kind === 'text' && value.includes('\n')) {
    return fail('This text is one line and cannot contain a line break')
  }

  const limit = field.kind === 'text' ? CONTENT_LIMITS.text : CONTENT_LIMITS.longText
  if (value.length > limit) return fail(`This text can have at most ${limit} characters`)

  if (field.format === 'email' && !EMAIL.test(value)) return fail('Enter a valid email address')
  if (field.format === 'url' && !isHttpsUrl(value)) {
    return fail('Enter a full link that starts with https://')
  }
  if (field.format === 'phone' && !PHONE.test(value)) {
    return fail('Enter a phone number using digits, spaces, and an optional leading +')
  }

  return { ok: true, value }
}

/** Whether a field is written in `slot`: shared facts only in `shared`, copy only per language. */
export const slotMatchesField = (field: ContentFieldDefinition, slot: ContentSlot): boolean =>
  field.shared ? slot === 'shared' : slot !== 'shared'

/**
 * A value in one fixed spelling. PostgreSQL's `jsonb` hands a link back with
 * its keys reordered, so two equal link lists can stringify differently.
 */
const canonical = (value: ContentValue): string =>
  JSON.stringify(
    typeof value === 'string' || isTextList(value)
      ? value
      : value.map((link) => [link.platform, link.url, link.label, link.hidden]),
  )

/** Two values are the same wording. Order matters in a list. */
export const sameContentValue = (a: ContentValue, b: ContentValue): boolean => canonical(a) === canonical(b)

/* ------------------------------------------------------------ the requests */

const SlotSchema = v.picklist(CONTENT_SLOTS, 'Choose de, en, ar, or shared')

/** `0` means the field has never been saved in V2 and still shows its original. */
const RevisionSchema = v.pipe(
  v.number('Send the revision you last saw'),
  v.integer(),
  v.minValue(0),
)

/**
 * One field in one language. `expectedRevision` is the revision the editor
 * last saw: a newer one on the server means somebody saved in between, and
 * the write is refused rather than allowed to overwrite it.
 *
 * `legalUnlocked` must be `true` for a Legal field — the server half of the
 * editor's deliberate unlock.
 */
export const ContentSaveSchema = v.object({
  language: SlotSchema,
  value: v.unknown(),
  expectedRevision: RevisionSchema,
  legalUnlocked: v.optional(v.boolean(), false),
})

export const ContentRestoreOriginalSchema = v.object({
  language: SlotSchema,
  expectedRevision: RevisionSchema,
  legalUnlocked: v.optional(v.boolean(), false),
})

/**
 * Bringing back a value from history. `side` picks which half of the change:
 * `after` (the wording that change wrote, the default) or `before` (the
 * wording it replaced — undoing it).
 */
export const ContentRestoreHistorySchema = v.object({
  expectedRevision: RevisionSchema,
  side: v.optional(v.picklist(['before', 'after']), 'after'),
  legalUnlocked: v.optional(v.boolean(), false),
})

export const ContentReviewedSchema = v.object({ language: SlotSchema })

export const ContentHistoryQuerySchema = v.object({
  ...PageQuerySchema.entries,
  key: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
  language: v.optional(SlotSchema),
})

export const PublicContentQuerySchema = v.object({
  language: v.picklist(CONTENT_LANGUAGES, 'Choose de, en, or ar'),
})

export type ContentSaveInput = v.InferOutput<typeof ContentSaveSchema>
export type ContentHistoryQuery = v.InferOutput<typeof ContentHistoryQuerySchema>

/* ----------------------------------------------------------- the responses */

/** One field in one language (or the shared slot), as the editor sees it. */
export type ContentSlotState = {
  /** What visitors read now. */
  value: ContentValue
  /** The release default — what **Original** restores. */
  original: ContentValue
  /** Whether the live value is the original wording. */
  isOriginal: boolean
  /** `0` until the field is first saved in V2. Send it back as `expectedRevision`. */
  revision: number
  /** Another language changed after this one: worth a look. Never blocks anything. */
  needsReview: boolean
  updatedAt: string | null
}

export type ContentFieldState = ContentFieldDefinition & {
  /** Keyed by `de`/`en`/`ar`, or by `shared` alone for a shared fact. */
  slots: Partial<Record<ContentSlot, ContentSlotState>>
}

export type ContentSnapshot = {
  /** The navigation order of pages. */
  pages: string[]
  fields: ContentFieldState[]
  /** Fields flagged for translation review, per language. */
  reviewCounts: Record<ContentLanguage, number>
}

/** What a successful save answers: the whole field, every language, as it is now live. */
export type ContentSaveResult = {
  field: ContentFieldState
  /** `false` when the value was already live — nothing was written or recorded. */
  changed: boolean
}

export type ContentHistoryAction = 'edit' | 'restore_original' | 'restore_history'

export type ContentHistoryEntry = {
  id: string
  key: string
  language: ContentSlot
  action: ContentHistoryAction
  before: ContentValue
  after: ContentValue
  /** The field's revision this change produced. */
  revision: number
  /** For a restore from history: the entry it came from. */
  restoredFrom: string | null
  createdAt: string
}

/** The public read: one language's copy and the shared facts. Nothing else. */
export type PublicContent = {
  language: ContentLanguage
  fields: Record<string, ContentValue>
  shared: Record<string, ContentValue>
}
