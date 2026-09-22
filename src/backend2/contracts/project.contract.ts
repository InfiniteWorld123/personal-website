import * as v from 'valibot'
import {
  type RichTextDoc,
  RichTextDocSchema,
  type RichTextNode,
  collectImageNodes,
  collectMediaIds,
  isRichTextEmpty,
} from './rich-text.contract'

/**
 * The Projects contract, shared by the server and the Dashboard editor.
 *
 * See `docs/v2/projects.md` and `docs/v2/projects-backend.md`.
 *
 * Pure — valibot and plain TypeScript, nothing server-only — because the
 * editor has to be able to show the publication checklist *before* anything is
 * sent, and the server has to enforce exactly the same rules afterwards. One
 * set of rules in one file is the only way those two stay honest; a test
 * asserts this module pulls in nothing from `db/`, `media/` or Node.
 */

/* ----------------------------------------------------------------- the words */

export const LANGUAGES = ['de', 'en', 'ar'] as const
export type Language = (typeof LANGUAGES)[number]

/** Upper-cased for the blocker sentences: "AR: summary is empty". */
const LANGUAGE_LABEL: Record<Language, string> = { de: 'DE', en: 'EN', ar: 'AR' }

export const PROJECT_TYPES = ['demo', 'personal', 'client'] as const
export type ProjectType = (typeof PROJECT_TYPES)[number]

export const WORK_STATUSES = ['in_progress', 'completed'] as const
export type WorkStatus = (typeof WORK_STATUSES)[number]

export const LINK_KINDS = ['website', 'source', 'other'] as const
export type LinkKind = (typeof LINK_KINDS)[number]

export const IMAGE_ROLES = ['cover', 'gallery', 'inline'] as const
export type ImageRole = (typeof IMAGE_ROLES)[number]

/**
 * Derived on every read, never stored twice
 * (`docs/v2/projects-backend.md` §3).
 */
export const PROJECT_STATES = [
  'draft',
  'published',
  'published_with_pending_changes',
  'unpublished',
  'archived',
] as const
export type ProjectState = (typeof PROJECT_STATES)[number]

/** What the Dashboard list may filter by. `all` excludes archived. */
export const LIST_STATES = ['all', ...PROJECT_STATES, 'pending'] as const
export type ListState = (typeof LIST_STATES)[number]

/* ---------------------------------------------------------------- the limits */

export const PROJECT_LIMITS = {
  slug: 80,
  name: 120,
  categoryLabel: 80,
  summary: 400,
  clientName: 120,
  linkUrl: 500,
  linkLabel: 80,
  techName: 60,
  techCount: 24,
  otherLinks: 6,
  gallery: 12,
  /** Per language. A case study is a story, not an album. */
  inlineImages: 20,
  /** Across cover, gallery and every case study, for one version. */
  mediaPerProject: 40,
  altText: 500,
} as const

/** The Dashboard list. Public batches are six, as `/work` already does. */
export const PROJECT_PAGE_SIZE = { min: 1, default: 20, max: 50 } as const
export const PUBLIC_BATCH = { min: 1, default: 6, max: 36, maxOffset: 600 } as const

/* ------------------------------------------------------------------ the slug */

/**
 * A suggestion, never an imposition: the owner edits it before publishing, and
 * after publication the old one keeps resolving anyway (D6).
 *
 * The German and Arabic names are the reason for the transliteration table.
 * `ä → ae` rather than `a` because that is how German actually writes it when
 * the umlaut is unavailable, and Arabic letters are dropped rather than
 * guessed at — an Arabic-only name produces an empty suggestion, and the
 * editor asks for one instead of inventing `mshrw-1`.
 */
const TRANSLITERATE: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss',
  à: 'a', á: 'a', â: 'a', ã: 'a', å: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', õ: 'o', ø: 'o',
  ù: 'u', ú: 'u', û: 'u',
  ñ: 'n', ç: 'c', ý: 'y',
}

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[äöüßàáâãåèéêëìíîïòóôõøùúûñçý]/g, (character) => TRANSLITERATE[character] ?? character)
    .normalize('NFD')
    // Strip the combining accents NFD just separated out.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PROJECT_LIMITS.slug)
    // A trailing hyphen can reappear after the slice.
    .replace(/-+$/g, '')

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const isValidSlug = (value: string): boolean =>
  value.length <= PROJECT_LIMITS.slug && SLUG_PATTERN.test(value)

/* --------------------------------------------------------------- the payload */

export type ProjectLink = {
  kind: LinkKind
  url: string
  isPublic: boolean
  labels: Record<Language, string>
}

export type ProjectTexts = {
  name: string
  categoryLabel: string
  summary: string
  caseStudy: RichTextDoc | null
}

export type ProjectImageInput = {
  mediaId: string
  alt: Record<Language, string>
}

/** Exactly what `PUT /owner/projects/:id` accepts. */
export type ProjectDraftInput = {
  slug: string
  type: ProjectType
  workStatus: WorkStatus
  clientName: string | null
  showClientName: boolean
  tech: string[]
  links: ProjectLink[]
  texts: Record<Language, ProjectTexts>
  cover: ProjectImageInput | null
  gallery: ProjectImageInput[]
}

/* ------------------------------------------------------------- the schemas */

const trimmed = (max: number, label: string) =>
  v.pipe(v.string(label), v.trim(), v.maxLength(max, `${label} is too long`))

const LanguageRecord = <TSchema extends v.GenericSchema>(schema: TSchema) =>
  v.object({ de: schema, en: schema, ar: schema })

const AltRecordSchema = LanguageRecord(
  v.pipe(
    v.optional(v.string(), ''),
    v.trim(),
    v.maxLength(PROJECT_LIMITS.altText, 'That alternative text is too long'),
  ),
)

const MediaIdSchema = v.pipe(v.string(), v.trim(), v.uuid('That is not a file from Media'))

const ImageInputSchema = v.object({ mediaId: MediaIdSchema, alt: AltRecordSchema })

/**
 * A URL a visitor could be sent to. `http(s)` only, by protocol allowlist —
 * `javascript:` parses as a valid URL, so a URL check alone proves nothing.
 */
const LinkUrlSchema = v.pipe(
  v.string('A link needs an address'),
  v.trim(),
  v.maxLength(PROJECT_LIMITS.linkUrl, 'That address is too long'),
  v.check((value) => {
    if (value === '') return true

    try {
      return ['http:', 'https:'].includes(new URL(value).protocol)
    } catch {
      return false
    }
  }, 'A link must start with http:// or https://'),
)

const LinkSchema = v.object({
  kind: v.picklist(LINK_KINDS, 'That is not a kind of link'),
  url: LinkUrlSchema,
  isPublic: v.optional(v.boolean(), false),
  labels: LanguageRecord(
    v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(PROJECT_LIMITS.linkLabel)),
  ),
})

const TextsSchema = v.object({
  name: trimmed(PROJECT_LIMITS.name, 'The name'),
  categoryLabel: trimmed(PROJECT_LIMITS.categoryLabel, 'The category label'),
  summary: trimmed(PROJECT_LIMITS.summary, 'The summary'),
  caseStudy: v.nullish(RichTextDocSchema, null),
})

/**
 * The draft rules. An unfinished project must stay saveable
 * (`docs/v2/projects-backend.md` §8.1), so every text may be empty and only
 * *shape* is enforced here. What a visitor is allowed to see is decided later,
 * by `publishBlockers`.
 */
const DRAFT_FIELDS = {
  slug: v.pipe(
    v.optional(v.string(), ''),
    v.trim(),
    v.maxLength(PROJECT_LIMITS.slug, 'That address is too long'),
    v.check(
      (value) => value === '' || SLUG_PATTERN.test(value),
      'A web address may use lowercase letters, numbers and single hyphens only',
    ),
  ),
  type: v.picklist(PROJECT_TYPES, 'Choose a project type'),
  workStatus: v.optional(v.picklist(WORK_STATUSES, 'Choose a work status'), 'in_progress'),
  clientName: v.nullish(trimmed(PROJECT_LIMITS.clientName, 'The client name'), null),
  showClientName: v.optional(v.boolean(), false),
  tech: v.optional(
    v.pipe(
      v.array(v.pipe(v.string(), v.trim(), v.maxLength(PROJECT_LIMITS.techName))),
      v.maxLength(PROJECT_LIMITS.techCount, 'That is more technologies than a page can carry'),
      // A blank chip is a stray keystroke, not a technology.
      v.transform((entries) => entries.filter((entry) => entry !== '')),
    ),
    [],
  ),
  links: v.optional(v.pipe(v.array(LinkSchema), v.maxLength(8)), []),
  texts: LanguageRecord(TextsSchema),
  cover: v.nullish(ImageInputSchema, null),
  gallery: v.optional(
    v.pipe(
      v.array(ImageInputSchema),
      v.maxLength(PROJECT_LIMITS.gallery, 'That is more gallery images than a page can carry'),
    ),
    [],
  ),
} as const

/**
 * The rules no single field can check on its own.
 *
 * A plain function returning sentences rather than a valibot action, because
 * the same rules apply to two schemas — the draft on its own and the draft
 * with its revision — and `rawCheck` types itself against one exact schema.
 * Every sentence is collected rather than thrown at the first, because the
 * editor draws a list.
 */
const crossFieldIssues = (draft: ProjectDraftInput): string[] => {
  const issues: string[] = []

  for (const kind of ['website', 'source'] as const) {
    if (draft.links.filter((link) => link.kind === kind).length > 1) {
      issues.push(`A project may have only one ${kind} link`)
    }
  }

  if (draft.links.filter((link) => link.kind === 'other').length > PROJECT_LIMITS.otherLinks) {
    issues.push(`A project may have at most ${PROJECT_LIMITS.otherLinks} other links`)
  }

  for (const language of LANGUAGES) {
    if (collectMediaIds(draft.texts[language].caseStudy).length > PROJECT_LIMITS.inlineImages) {
      issues.push(
        `The ${LANGUAGE_LABEL[language]} case study uses more than ${PROJECT_LIMITS.inlineImages} images`,
      )
    }
  }

  if (countMedia(draft).length > PROJECT_LIMITS.mediaPerProject) {
    issues.push(`A project may use at most ${PROJECT_LIMITS.mediaPerProject} files`)
  }

  return issues
}

export const ProjectDraftSchema = v.pipe(
  v.object(DRAFT_FIELDS),
  // Inlined rather than shared as a value: `rawCheck` binds its generic to
  // the schema it is piped onto, and a named action would have to pick one of
  // the two schemas below to be typed against.
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) return

    for (const message of crossFieldIssues(dataset.value as unknown as ProjectDraftInput)) {
      addIssue({ message })
    }
  }),
) as unknown as v.GenericSchema<unknown, ProjectDraftInput>

/** Every distinct library file one draft uses: cover, gallery and inline. */
export const countMedia = (draft: {
  cover: ProjectImageInput | null
  gallery: ProjectImageInput[]
  texts: Record<Language, ProjectTexts>
}): string[] => {
  const ids = new Set<string>()

  if (draft.cover) ids.add(draft.cover.mediaId)
  for (const image of draft.gallery) ids.add(image.mediaId)
  for (const language of LANGUAGES) {
    for (const id of collectMediaIds(draft.texts[language].caseStudy)) ids.add(id)
  }

  return [...ids]
}

/**
 * The body of `PUT /owner/projects/:id`: the draft, plus the revision guard.
 *
 * Built from the same field set rather than intersected with the draft schema,
 * so the cross-field rules run once over one object and a failure reports one
 * path the editor can point at.
 */
export const SaveDraftSchema = v.pipe(
  v.object({
    ...DRAFT_FIELDS,
    // The editor sends back what it was given; a stale value means a second
    // tab saved in between, and that is a 409 rather than a silent overwrite.
    draftRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) return

    for (const message of crossFieldIssues(dataset.value as unknown as ProjectDraftInput)) {
      addIssue({ message })
    }
  }),
) as unknown as v.GenericSchema<unknown, ProjectDraftInput & { draftRevision: number }>

export const CreateProjectSchema = v.object({
  type: v.picklist(PROJECT_TYPES, 'Choose a project type'),
  workStatus: v.optional(v.picklist(WORK_STATUSES), 'in_progress'),
  name: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(PROJECT_LIMITS.name)), ''),
})

export const RevisionSchema = v.object({
  draftRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
})

export const PositionSchema = v.object({
  position: v.pipe(v.number(), v.integer(), v.minValue(1)),
})

/* -------------------------------------------------------------- the queries */

const IntFromQuery = (fallback: number, min: number, max: number) =>
  v.pipe(
    v.optional(v.union([v.string(), v.number()]), fallback),
    v.transform((value) => (typeof value === 'number' ? value : Number(String(value).trim()))),
    v.number('That is not a number'),
    v.integer('That is not a whole number'),
    v.minValue(min),
    v.maxValue(max),
  )

export const ProjectListQuerySchema = v.object({
  page: IntFromQuery(1, 1, 100_000),
  pageSize: IntFromQuery(PROJECT_PAGE_SIZE.default, PROJECT_PAGE_SIZE.min, PROJECT_PAGE_SIZE.max),
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120)), ''),
  type: v.optional(v.picklist(['all', ...PROJECT_TYPES] as const), 'all'),
  workStatus: v.optional(v.picklist(['all', ...WORK_STATUSES] as const), 'all'),
  state: v.optional(v.picklist(LIST_STATES), 'all'),
  language: v.optional(v.picklist(LANGUAGES), 'en'),
})

export type ProjectListQuery = v.InferOutput<typeof ProjectListQuerySchema>

export const PublicListQuerySchema = v.object({
  language: v.optional(v.picklist(LANGUAGES), 'de'),
  offset: IntFromQuery(0, 0, PUBLIC_BATCH.maxOffset),
  limit: IntFromQuery(PUBLIC_BATCH.default, PUBLIC_BATCH.min, PUBLIC_BATCH.max),
})

export const PublicDetailQuerySchema = v.object({
  language: v.optional(v.picklist(LANGUAGES), 'de'),
})

/* ---------------------------------------------------- the publication rules */

/**
 * What must be true before a visitor sees it
 * (`docs/v2/projects-backend.md` §8.2).
 *
 * A pure function returning sentences rather than a boolean, and shared with
 * the Dashboard on purpose: the editor draws this list as the publication
 * checklist, and the server runs the identical function before it writes
 * anything. There is no second copy of the rules to drift.
 *
 * Every sentence names the language and the field, because "publish failed" is
 * not something the owner can act on.
 *
 * The slug being *free* is not checked here: that needs the database, it is a
 * `409 CONFLICT` rather than a validation failure, and this function has to
 * stay runnable in a browser.
 */
export const publishBlockers = (draft: ProjectDraftInput): string[] => {
  const blockers: string[] = []

  if (draft.slug === '') blockers.push('The web address is empty')
  else if (!isValidSlug(draft.slug)) blockers.push('The web address is not valid')

  if (!PROJECT_TYPES.includes(draft.type)) blockers.push('The project type is not set')
  if (!WORK_STATUSES.includes(draft.workStatus)) blockers.push('The work status is not set')

  for (const language of LANGUAGES) {
    const label = LANGUAGE_LABEL[language]
    const texts = draft.texts[language]

    if (texts.name.trim() === '') blockers.push(`${label}: the project name is empty`)
    if (texts.summary.trim() === '') blockers.push(`${label}: the summary is empty`)
  }

  // Cover and gallery alt text, in all three languages (rule 4).
  if (draft.cover) {
    for (const language of LANGUAGES) {
      if (draft.cover.alt[language].trim() === '') {
        blockers.push(`The cover image has no ${LANGUAGE_LABEL[language]} alternative text`)
      }
    }
  }

  draft.gallery.forEach((image, index) => {
    for (const language of LANGUAGES) {
      if (image.alt[language].trim() === '') {
        blockers.push(
          `Gallery image ${index + 1} has no ${LANGUAGE_LABEL[language]} alternative text`,
        )
      }
    }
  })

  // Inline images, inside whichever case study is actually written (rule 5).
  for (const language of LANGUAGES) {
    const caseStudy = draft.texts[language].caseStudy

    if (isRichTextEmpty(caseStudy)) continue

    collectImageNodes(caseStudy).forEach((image, index) => {
      if (image.alt.trim() === '') {
        blockers.push(
          `${LANGUAGE_LABEL[language]}: case-study image ${index + 1} has no alternative text`,
        )
      }
    })
  }

  for (const link of draft.links) {
    if (!link.isPublic) continue

    if (link.url.trim() === '') {
      blockers.push(`The public ${link.kind} link has no address`)
      continue
    }

    if (link.kind !== 'other') continue

    for (const language of LANGUAGES) {
      if (link.labels[language].trim() === '') {
        blockers.push(`A public link has no ${LANGUAGE_LABEL[language]} label`)
      }
    }
  }

  if (draft.showClientName && (draft.clientName ?? '').trim() === '') {
    blockers.push('The client name is shown publicly but is empty')
  }

  return blockers
}

/* --------------------------------------------- the shapes the Dashboard gets */

/**
 * What the owner API answers with.
 *
 * These live in the contract rather than beside the mapper that builds them
 * because `docs/v2/projects-backend.md` §11 is explicit: `contracts/` is the
 * only part of `src/backend2/` the frontend may import. A DTO the editor has
 * to render is a shared shape, so it belongs on the shared side of that line —
 * and the mapper imports it back, so there is still exactly one definition.
 */
export type OwnerImage = {
  mediaId: string
  /** Already a URL the dashboard can put in `src`; never a storage key. */
  url: string
  width: number | null
  height: number | null
  byteSize: number
  alt: Record<Language, string>
}

export type ProjectVersionPayload = {
  slug: string
  type: ProjectType
  workStatus: WorkStatus
  clientName: string | null
  showClientName: boolean
  tech: string[]
  links: ProjectLink[]
  texts: Record<Language, ProjectTexts>
  cover: OwnerImage | null
  gallery: OwnerImage[]
}

export type OwnerProject = {
  id: string
  position: number
  state: ProjectState
  lifecycle: 'active' | 'archived'
  draftRevision: number
  createdAt: string
  updatedAt: string
  firstPublishedAt: string | null
  publishedAt: string | null
  hasPendingChanges: boolean
  /** What the owner is editing. */
  draft: ProjectVersionPayload
  /** What visitors see right now; null when the project is not published. */
  published: ProjectVersionPayload | null
  /** Recomputed on every read, so the editor's checklist is never stale. */
  publishBlockers: string[]
  slugAvailable: boolean
}

export type OwnerListItem = {
  id: string
  position: number
  state: ProjectState
  type: ProjectType
  workStatus: WorkStatus
  slug: string
  publishedSlug: string | null
  displayName: string
  languagesComplete: Language[]
  coverUrl: string | null
  imageCount: number
  hasPendingChanges: boolean
  updatedAt: string
  publishedAt: string | null
}

/* ------------------------------------------------ the shapes visitors get */

/**
 * What a public response carries — and what the owner's preview carries,
 * because the preview is built by the same projection.
 *
 * In the contract for the same reason as the owner shapes above: the
 * Dashboard renders the preview, and the public site will render the real
 * thing, and neither may import from `src/backend2/modules/`.
 */
export type PublicImage = {
  url: string
  width: number | null
  height: number | null
  alt: string
}

export type PublicProjectCard = {
  slug: string
  type: ProjectType
  workStatus: WorkStatus
  name: string
  categoryLabel: string | null
  summary: string
  cover: PublicImage | null
  tech: string[]
  publishedAt: string | null
}

/**
 * The case study as a visitor receives it.
 *
 * Identical to the stored tree except at one node type: an `image` carries a
 * `src` a browser can fetch instead of the `mediaId` the database keeps. The
 * id still appears inside that URL — it is the opaque public handle, and
 * `/api/v2/media/:id` serves it only while a published version references it —
 * but no field of the response is a bare internal identifier.
 */
export type PublicRichTextNode = ToPublicNode<RichTextNode>

/**
 * One stored node, as a visitor receives it — all the way down.
 *
 * Mapped rather than listed, so a node type added to the rich-text contract
 * later is carried across without anyone remembering to add it here. The
 * first version of this type only swapped the *top-level* image and left every
 * container's children typed as stored nodes, so an image inside a paragraph
 * still claimed to carry a `mediaId` and no `src`; drawing the tree
 * recursively was what exposed it.
 */
type ToPublicNode<TNode> = TNode extends { type: 'image' }
  ? { type: 'image'; attrs: { src: string; alt: string; width: number | null; height: number | null } }
  : 'content' extends keyof TNode
    ? Omit<TNode, 'content'> & { content?: PublicRichTextNode[] }
    : TNode

export type PublicRichTextDoc = { type: 'doc'; content: PublicRichTextNode[] }

export type PublicProjectDetail = PublicProjectCard & {
  canonicalSlug: string
  caseStudy: PublicRichTextDoc | null
  gallery: PublicImage[]
  website: string | null
  source: string | null
  otherLinks: Array<{ url: string; label: string }>
  client: { name: string } | null
}

/* ------------------------------------------------------------ the wording */

/**
 * The words the dashboard uses for a state, kept next to the states
 * themselves so the list and the editor cannot describe the same project
 * differently.
 *
 * "Live" rather than "Published" because the owner's question is always
 * whether a visitor can see it right now. The third state gets the longest
 * sentence because it is the one that needs explaining: work that is saved
 * and deliberately not on the site yet.
 */
export const STATE_WORDS: Record<ProjectState, { label: string; meaning: string }> = {
  draft: { label: 'Private', meaning: 'Only you can see this. It has never been published.' },
  published: { label: 'Live', meaning: 'Visitors see exactly what you have saved.' },
  published_with_pending_changes: {
    label: 'Live · edited',
    meaning: 'Visitors still see the older version. Your changes are saved but not published.',
  },
  unpublished: {
    label: 'Taken down',
    meaning: 'You published this before and then took it down.',
  },
  archived: { label: 'Archived', meaning: 'Put away. Not on the site, not in the main list.' },
}

export const TYPE_WORDS: Record<ProjectType, string> = {
  demo: 'Demo',
  personal: 'Personal',
  client: 'Client',
}

export const WORK_WORDS: Record<WorkStatus, string> = {
  in_progress: 'In progress',
  completed: 'Completed',
}

export const LANGUAGE_WORDS: Record<Language, string> = {
  de: 'Deutsch',
  en: 'English',
  ar: 'العربية',
}

/**
 * Which languages the Dashboard list may call complete: a name and a summary,
 * the same two fields publication demands (D9).
 */
export const completeLanguages = (texts: Record<Language, ProjectTexts>): Language[] =>
  LANGUAGES.filter(
    (language) => texts[language].name.trim() !== '' && texts[language].summary.trim() !== '',
  )

/**
 * The name to show when the requested language has none.
 *
 * English, then German, then Arabic — the order the dashboard itself is
 * written in. A project with no name anywhere is shown as untitled rather than
 * as a blank row the owner cannot click.
 */
export const displayName = (
  texts: Record<Language, ProjectTexts>,
  preferred: Language,
): string => {
  for (const language of [preferred, 'en', 'de', 'ar'] as const) {
    const name = texts[language]?.name.trim()

    if (name) return name
  }

  return 'Untitled project'
}
