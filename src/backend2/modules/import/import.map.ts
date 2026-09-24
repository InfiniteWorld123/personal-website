import type { BlogDraftInput, BlogNode } from '../../contracts/blog.contract'
import type { Availability, BookingMethod, TypeTexts } from '../../contracts/booking.contract'
import type { ProjectDraftInput, ProjectImageInput, ProjectLink } from '../../contracts/project.contract'
import type { RichTextNode } from '../../contracts/rich-text.contract'
import type { ServiceDraftInput } from '../../contracts/service.contract'
import type {
  Lang,
  LegacyBookingType,
  LegacyImage,
  LegacyPost,
  LegacyProject,
  LegacyService,
  LegacySnapshot,
} from './legacy.source'

/**
 * Old rows in, V2 drafts out. Pure: no database, no storage, no clock.
 *
 * The rule the whole file keeps is the owner's: copy what the old site shows,
 * and invent nothing. Where V2 needs something the old site never had, the
 * gap is left empty — V2's own publication checks then keep the item private —
 * and a sentence goes into `notes` so the owner knows to fill it.
 */

const LANGS: Lang[] = ['de', 'en', 'ar']
const LABEL: Record<Lang, string> = { de: 'German', en: 'English', ar: 'Arabic' }

/** The copied file for an old image address, or null when it could not be copied. */
export type AssetFor = (src: string) => string | null

const fileName = (src: string) => src.split(/[?#]/)[0]!.split('/').filter(Boolean).pop() ?? src

const missingImage = (src: string) => `Add the image “${fileName(src)}” yourself — it could not be copied.`

const altOf = (image: LegacyImage) =>
  ({ de: image.alt.de ?? '', en: image.alt.en ?? '', ar: image.alt.ar ?? '' })

const text = (value: string): RichTextNode[] => (value.trim() === '' ? [] : [{ type: 'text', text: value.trim() }])

/* ----------------------------------------------------------------- projects */

export const projectImages = (project: LegacyProject): string[] =>
  [...(project.cover ? [project.cover] : []), ...project.gallery].map((image) => image.src)

/**
 * The old page's four blocks, as the case study: each heading in the old
 * page's own words, then the text, and the features as a list.
 */
const caseStudyOf = (
  copy: NonNullable<LegacyProject['texts'][Lang]>,
  headings: LegacySnapshot['headings'][Lang],
) => {
  const content: RichTextNode[] = []

  for (const [heading, body] of [
    [headings.problem, copy.problem],
    [headings.approach, copy.approach],
    [headings.shows, copy.shows],
  ] as const) {
    if (body.trim() === '') continue

    content.push({ type: 'heading', attrs: { level: 2 }, content: text(heading) })
    content.push({ type: 'paragraph', content: text(body) })
  }

  const features = copy.features.filter((feature) => feature.trim() !== '')

  if (features.length > 0) {
    content.push({ type: 'heading', attrs: { level: 2 }, content: text(headings.features) })
    content.push({
      type: 'bulletList',
      content: features.map((feature) => ({ type: 'listItem', content: [{ type: 'paragraph', content: text(feature) }] })),
    })
  }

  return content.length > 0 ? { type: 'doc' as const, content } : null
}

const linkOf = (kind: 'website' | 'source', url: string | null, notes: string[]): ProjectLink[] => {
  if (!url?.trim()) return []

  try {
    if (['http:', 'https:'].includes(new URL(url.trim()).protocol)) {
      return [{ kind, url: url.trim(), isPublic: true, labels: { de: '', en: '', ar: '' } }]
    }
  } catch {
    // Reported below.
  }

  notes.push(`The ${kind} link “${url}” is not a web address V2 accepts; add it yourself.`)

  return []
}

export const projectDraft = (
  project: LegacyProject,
  headings: LegacySnapshot['headings'],
  assetFor: AssetFor,
): { draft: ProjectDraftInput; notes: string[] } => {
  const notes: string[] = []

  const image = (legacy: LegacyImage): ProjectImageInput | null => {
    const mediaId = assetFor(legacy.src)

    if (!mediaId) {
      notes.push(missingImage(legacy.src))

      return null
    }

    return { mediaId, alt: altOf(legacy) }
  }

  const texts = Object.fromEntries(
    LANGS.map((language) => {
      const copy = project.texts[language]

      if (!copy) {
        notes.push(`The old site has no ${LABEL[language]} text for this project.`)

        return [language, { name: '', categoryLabel: '', summary: '', caseStudy: null }]
      }

      return [
        language,
        {
          name: copy.name.trim(),
          categoryLabel: copy.kind.trim(),
          summary: copy.summary.trim(),
          caseStudy: caseStudyOf(copy, headings[language]),
        },
      ]
    }),
  ) as ProjectDraftInput['texts']

  const cover = project.cover ? image(project.cover) : null
  const gallery = project.gallery.map(image).filter((entry): entry is ProjectImageInput => entry !== null)

  return {
    draft: {
      slug: project.slug,
      // The old site had no project type. "Personal" is what its /work page
      // called every one of them; the plan tells the owner to check it.
      type: 'personal',
      workStatus: project.status === 'live' ? 'completed' : 'in_progress',
      clientName: null,
      showClientName: false,
      tech: [...new Set(project.tech.map((name) => name.trim()).filter(Boolean))],
      links: [...linkOf('website', project.websiteUrl, notes), ...linkOf('source', project.sourceUrl, notes)],
      texts,
      cover,
      gallery,
    },
    notes,
  }
}

/* ----------------------------------------------------------------- services */

/**
 * The `/services` block as one V2 service. The "promise" paragraph, the
 * "a good fit if you" list and the price note become the longer text, in the
 * plain-text form the V2 page already renders: a line ending in a colon is a
 * heading, lines starting with "- " are a list.
 */
export const serviceDraft = (service: LegacyService): ServiceDraftInput => ({
  slug: service.slug,
  // All three are on today's homepage.
  featured: true,
  // "from €990", a one-off project price: nothing on the page says per month.
  price: { mode: 'from', amountCents: service.priceCents, period: 'one_time', promotion: { active: false, amountCents: null } },
  texts: Object.fromEntries(
    LANGS.map((language) => {
      const copy = service.texts[language]
      const body = [
        copy.promise.trim(),
        [`${copy.audienceTitle.trim()}:`, ...copy.audience.map((line) => `- ${line.trim()}`)].join('\n'),
        copy.priceNote.trim(),
      ]
        .filter((block) => block !== '' && block !== ':')
        .join('\n\n')

      return [
        language,
        {
          name: copy.name.trim(),
          summary: copy.short.trim(),
          included: copy.includes.map((line) => line.trim()).filter(Boolean),
          body,
          promotionLabel: '',
          seoTitle: '',
          seoDescription: '',
        },
      ]
    }),
  ) as ServiceDraftInput['texts'],
})

/* -------------------------------------------------------------------- posts */

type LegacyNode = { type?: unknown; attrs?: Record<string, unknown>; content?: unknown; text?: unknown; marks?: unknown }

const walkLegacy = (nodes: unknown, visit: (node: LegacyNode) => void) => {
  if (!Array.isArray(nodes)) return

  for (const node of nodes as LegacyNode[]) {
    if (!node || typeof node !== 'object') continue

    visit(node)
    walkLegacy(node.content, visit)
  }
}

const bodyOf = (post: LegacyPost, language: Lang): unknown => (post.texts[language]?.body as { content?: unknown })?.content

export const postImages = (post: LegacyPost): string[] => {
  const sources = post.cover ? [post.cover.src] : []

  for (const language of LANGS) {
    walkLegacy(bodyOf(post, language), (node) => {
      if (node.type === 'image' && typeof node.attrs?.src === 'string') sources.push(node.attrs.src)
    })
  }

  return [...new Set(sources)]
}

/**
 * The legacy article body, as a V2 one. The two formats are the same
 * ProseMirror tree except at the image, which points at a Media file in V2
 * instead of an address. An image that could not be copied is left out, and
 * named in the notes.
 */
const convertBody = (nodes: unknown, assetFor: AssetFor, notes: string[]): BlogNode[] => {
  if (!Array.isArray(nodes)) return []

  const out: BlogNode[] = []

  for (const node of nodes as LegacyNode[]) {
    if (!node || typeof node !== 'object') continue

    if (node.type === 'image') {
      const src = String(node.attrs?.src ?? '')
      const mediaId = assetFor(src)

      if (!mediaId) {
        notes.push(missingImage(src))
        continue
      }

      out.push({
        type: 'image',
        attrs: {
          mediaId,
          alt: typeof node.attrs?.alt === 'string' ? node.attrs.alt : '',
          width: typeof node.attrs?.width === 'number' ? node.attrs.width : null,
          height: typeof node.attrs?.height === 'number' ? node.attrs.height : null,
        },
      })
      continue
    }

    const copy = { ...node } as Record<string, unknown>

    if (Array.isArray(node.content)) copy.content = convertBody(node.content, assetFor, notes)

    out.push(copy as BlogNode)
  }

  return out
}

export const postDraft = (input: {
  post: LegacyPost
  tagIds: string[]
  projectId: string | null
  assetFor: AssetFor
}): { draft: BlogDraftInput; notes: string[] } => {
  const notes: string[] = []
  const { post } = input

  const coverId = post.cover ? input.assetFor(post.cover.src) : null

  if (post.cover && !coverId) notes.push(missingImage(post.cover.src))

  const texts = Object.fromEntries(
    LANGS.map((language) => {
      const copy = post.texts[language]

      if (!copy) notes.push(`The old site has no ${LABEL[language]} text for this article.`)

      return [
        language,
        {
          title: copy?.title.trim() ?? '',
          summary: copy?.excerpt.trim() ?? '',
          body: { type: 'doc' as const, content: convertBody(bodyOf(post, language), input.assetFor, notes) },
          seoTitle: '',
          seoDescription: '',
        },
      ]
    }),
  ) as BlogDraftInput['texts']

  return {
    draft: {
      slug: post.slug,
      cover: post.cover && coverId ? { mediaId: coverId, alt: altOf(post.cover) } : null,
      projectId: input.projectId,
      tagIds: input.tagIds,
      texts,
    },
    notes: [...new Set(notes)],
  }
}

/* ------------------------------------------------------------------ booking */

const METHOD: Record<LegacyBookingType['locationKind'], BookingMethod> = {
  VIDEO: 'video',
  PHONE: 'phone',
  IN_PERSON: 'in_person',
}

export const bookingTypeInput = (
  type: LegacyBookingType,
  settings: { minNoticeMinutes: number; windowDays: number },
) => {
  const notes: string[] = []
  const texts = Object.fromEntries(
    LANGS.map((language) => [
      language,
      { name: type.texts[language]?.name.trim() ?? '', description: type.texts[language]?.description.trim() ?? '' },
    ]),
  ) as TypeTexts

  if (type.bufferBeforeMinutes !== type.bufferAfterMinutes) {
    notes.push(
      `The old site kept ${type.bufferBeforeMinutes} min free before and ${type.bufferAfterMinutes} min after; V2 has one break, set to ${Math.max(type.bufferBeforeMinutes, type.bufferAfterMinutes)} min.`,
    )
  }
  if (type.priceCents > 0) notes.push('The old type had a price; V2 booking types have none, so it was not copied.')
  if (type.maxPerDay !== null) notes.push(`The old limit of ${type.maxPerDay} per day has no V2 setting and was not copied.`)
  if (type.locationValue?.trim()) notes.push(`The old meeting place “${type.locationValue.trim()}” has no V2 field and was not copied.`)
  if (type.minimumNoticeMinutes !== settings.minNoticeMinutes || type.windowDays !== settings.windowDays) {
    notes.push(
      `The old type asked for ${type.minimumNoticeMinutes} min notice and ${type.windowDays} days ahead; V2 keeps ${settings.minNoticeMinutes} min and ${settings.windowDays} days for all types (Calendar settings). Change them there if you want the old values.`,
    )
  }

  return {
    input: {
      slug: type.slug,
      enabled: false,
      durationMinutes: type.durationMinutes,
      bufferMinutes: Math.max(type.bufferBeforeMinutes, type.bufferAfterMinutes),
      slotStepMinutes: type.slotIntervalMinutes,
      methods: [METHOD[type.locationKind]],
      texts,
    },
    notes,
  }
}

type Window = { startMinute: number; endMinute: number }

const merge = (windows: Window[]): Window[] =>
  [...windows]
    .sort((a, b) => a.startMinute - b.startMinute)
    .reduce<Window[]>((all, next) => {
      const last = all[all.length - 1]

      if (last && next.startMinute <= last.endMinute) last.endMinute = Math.max(last.endMinute, next.endMinute)
      else all.push({ ...next })

      return all
    }, [])

const subtract = (windows: Window[], cut: Window): Window[] =>
  windows.flatMap((window) => {
    if (cut.endMinute <= window.startMinute || cut.startMinute >= window.endMinute) return [window]

    return [
      ...(cut.startMinute > window.startMinute ? [{ startMinute: window.startMinute, endMinute: cut.startMinute }] : []),
      ...(cut.endMinute < window.endMinute ? [{ startMinute: cut.endMinute, endMinute: window.endMinute }] : []),
    ]
  })

/** ISO weekday (1 = Monday … 7 = Sunday) from the legacy 0 = Sunday. */
const isoWeekday = (legacy: number) => (legacy === 0 ? 7 : legacy)

/**
 * The old weekly hours and future exceptions, in V2's shape.
 *
 * V2 keeps one set of hours for every type; the old site could keep hours per
 * type. Rules for every copied type and the shared ones are combined. An old
 * exception day becomes the exact hours that day had on the old site — the
 * weekly hours, plus what it opened, minus what it blocked — because a V2
 * exception replaces the day rather than adding to it.
 */
export const availabilityOf = (
  snapshot: Pick<LegacySnapshot, 'rules' | 'exceptions'>,
  typeIds: Set<string>,
): Availability & { notes: string[] } => {
  const notes: string[] = []
  const applies = (typeId: string | null) => typeId === null || typeIds.has(typeId)
  const rules = snapshot.rules.filter((rule) => applies(rule.typeId))

  if (rules.length < snapshot.rules.length) notes.push('Hours that belonged only to booking types that are not copied were left out.')

  const weekly = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) =>
    merge(
      rules
        .filter((rule) => isoWeekday(rule.weekday) === weekday)
        .map((rule) => ({ startMinute: rule.start, endMinute: rule.end })),
    ).map((window) => ({ weekday, ...window })),
  )

  const exceptions = [...new Set(snapshot.exceptions.filter((entry) => applies(entry.typeId)).map((entry) => entry.date))].map(
    (date) => {
      const onDay = snapshot.exceptions.filter((entry) => entry.date === date && applies(entry.typeId))
      const weekday = isoWeekday(new Date(`${date}T00:00:00Z`).getUTCDay())
      let windows = merge([
        ...weekly.filter((range) => range.weekday === weekday).map(({ startMinute, endMinute }) => ({ startMinute, endMinute })),
        ...onDay
          .filter((entry) => entry.kind === 'OPEN' && entry.start !== null && entry.end !== null)
          .map((entry) => ({ startMinute: entry.start!, endMinute: entry.end! })),
      ])

      for (const entry of onDay.filter((item) => item.kind === 'BLOCK')) {
        windows = subtract(windows, {
          startMinute: entry.start ?? 0,
          endMinute: entry.end ?? 1440,
        })
      }

      return {
        date,
        ranges: windows,
        note: [...new Set(onDay.map((entry) => entry.reason.trim()).filter(Boolean))].join(' · ').slice(0, 200),
      }
    },
  )

  return { weekly, exceptions, notes }
}
