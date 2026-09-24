import { Client } from 'pg'
import { content } from '#/frontend/content/base'
import { servicePrices } from '#/frontend/content/site'
import { ApiError } from '../../http/error'
import { HttpStatus } from '../../http/status'

/**
 * THE OLD SITE, READ-ONLY. The one Backend2 file that knows it exists.
 *
 * Everything "Copy from the old site" learns about the legacy website comes
 * through here: its database, its image files, and the services copy the
 * public `/services` page renders from code. Nothing else in Backend2 opens
 * the legacy database, and nothing here can write to it — every read runs
 * inside `BEGIN TRANSACTION READ ONLY`, which PostgreSQL itself enforces.
 *
 * Delete this file (and `modules/import/`, the route, and the Settings
 * section) once the cutover is finished: nothing else depends on it.
 *
 * It imports nothing from `src/backend/`. Reaching the legacy database the way
 * the legacy backend does — the `HYPERDRIVE` binding on Cloudflare,
 * `DATABASE_URL` elsewhere — is repeated here in a few lines instead.
 */

export type Lang = 'de' | 'en' | 'ar'
const LANGS: Lang[] = ['de', 'en', 'ar']

export type LegacyImage = {
  src: string
  width: number | null
  height: number | null
  alt: Partial<Record<Lang, string>>
}

export type LegacyProject = {
  id: string
  slug: string
  status: 'live' | 'building'
  websiteUrl: string | null
  sourceUrl: string | null
  texts: Partial<
    Record<
      Lang,
      { name: string; kind: string; summary: string; problem: string; approach: string; shows: string; features: string[] }
    >
  >
  tech: string[]
  cover: LegacyImage | null
  gallery: LegacyImage[]
}

export type LegacyService = {
  slug: string
  priceCents: number
  texts: Record<
    Lang,
    { name: string; short: string; promise: string; audienceTitle: string; audience: string[]; includes: string[]; priceNote: string }
  >
}

export type LegacyTag = { id: string; slug: string; names: Partial<Record<Lang, string>> }

export type LegacyPost = {
  id: string
  slug: string
  projectId: string | null
  cover: LegacyImage | null
  texts: Partial<Record<Lang, { title: string; excerpt: string; body: unknown }>>
  tagIds: string[]
}

export type LegacyBookingType = {
  id: string
  slug: string
  durationMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  minimumNoticeMinutes: number
  windowDays: number
  slotIntervalMinutes: number
  maxPerDay: number | null
  locationKind: 'VIDEO' | 'PHONE' | 'IN_PERSON'
  locationValue: string | null
  priceCents: number
  texts: Partial<Record<Lang, { name: string; description: string }>>
}

/** Weekday as the legacy site stores it: 0 = Sunday … 6 = Saturday. */
export type LegacyRule = { typeId: string | null; weekday: number; start: number; end: number }

export type LegacyException = {
  typeId: string | null
  date: string
  kind: 'BLOCK' | 'OPEN'
  start: number | null
  end: number | null
  reason: string
}

export type LegacySnapshot = {
  projects: LegacyProject[]
  services: LegacyService[]
  posts: LegacyPost[]
  tags: LegacyTag[]
  bookingTypes: LegacyBookingType[]
  rules: LegacyRule[]
  /** Today and later only, in the owner's time zone. */
  exceptions: LegacyException[]
  /** Rows that are not public on the old site and are therefore not copied. */
  hidden: { projects: number; posts: number; bookingTypes: number }
  /** The section headings the old project page printed, per language. */
  headings: Record<Lang, { problem: string; approach: string; shows: string; features: string }>
}

export type LegacyConnection = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>
  end: () => Promise<void>
}

/** Reads one image file of the old site. */
export type LegacyImageSource = {
  open: (src: string) => Promise<{ body: ReadableStream<Uint8Array>; size: number | null }>
  /** The size in bytes, when the old site says; null when it does not. */
  measure: (src: string) => Promise<number | null>
}

/* ------------------------------------------------------------------ plumbing */

let override: { connect?: () => Promise<LegacyConnection>; images?: LegacyImageSource } = {}

/** Tests hand in a second in-process PostgreSQL and an in-memory file set. */
export const useLegacySourceForTest = (next: typeof override): void => {
  override = next
}

const unavailable = (message: string) =>
  new ApiError({ status: HttpStatus.SERVICE_UNAVAILABLE, code: 'PROVIDER_UNAVAILABLE', message })

const workerEnv = async (): Promise<Record<string, unknown> | undefined> => {
  try {
    const specifier = ['cloudflare', 'workers'].join(':')

    return ((await import(/* @vite-ignore */ specifier)) as { env?: Record<string, unknown> }).env
  } catch {
    return undefined
  }
}

const connect = async (): Promise<LegacyConnection> => {
  if (override.connect) return override.connect()

  const hyperdrive = (await workerEnv())?.HYPERDRIVE as { connectionString?: string } | undefined
  const url = hyperdrive?.connectionString ?? process.env.DATABASE_URL?.trim()

  if (!url) throw unavailable('The old site’s database cannot be reached from here. Nothing was changed.')
  if (url === process.env.DATABASE_URL_V2?.trim()) {
    throw unavailable('The old site’s database address is the V2 one. Nothing was changed.')
  }

  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 })

  try {
    await client.connect()
  } catch {
    throw unavailable('The old site’s database did not answer. Nothing was changed.')
  }

  return { query: (text, values) => client.query(text, values), end: () => client.end() }
}

/* ------------------------------------------------------------------ reading */

const group = <T extends { key: string }>(rows: T[]) => {
  const map = new Map<string, T[]>()

  for (const row of rows) map.set(row.key, [...(map.get(row.key) ?? []), row])

  return map
}

const byLanguage = <T>(rows: Array<{ language: string } & T>): Partial<Record<Lang, T>> =>
  Object.fromEntries(rows.filter((row) => LANGS.includes(row.language as Lang)).map((row) => [row.language, row]))

const toImage = (row: { src: string; width: number | null; height: number | null }, alt: Partial<Record<Lang, string>>): LegacyImage => ({
  src: row.src,
  width: row.width,
  height: row.height,
  alt,
})

/**
 * Everything the old site shows visitors, in one read-only transaction.
 *
 * Only public rows: published projects and articles, active booking types.
 * Leads, clients, invoices, chats, bookings made and accounts are never
 * selected at all.
 */
export const readLegacySnapshot = async (): Promise<LegacySnapshot> => {
  const connection = await connect()

  try {
    await connection.query('BEGIN TRANSACTION READ ONLY')

    const q = async (text: string, values?: unknown[]) => (await connection.query(text, values)).rows

    const projects = await q(
      `SELECT id::text, slug, status, website_url, source_url FROM projects
        WHERE is_published ORDER BY sort_order, created_at`,
    )
    const projectTexts = await q(
      `SELECT project_id::text AS key, language, name, kind, summary, problem, approach, shows, features
         FROM project_translations t JOIN projects p ON p.id = t.project_id WHERE p.is_published`,
    )
    const tech = await q(
      `SELECT project_id::text AS key, name FROM project_tech t JOIN projects p ON p.id = t.project_id
        WHERE p.is_published ORDER BY t.sort_order, t.name`,
    )
    const images = await q(
      `SELECT i.project_id::text AS key, i.id::text, i.src, i.width, i.height, i.is_cover
         FROM project_images i JOIN projects p ON p.id = i.project_id
        WHERE p.is_published ORDER BY i.sort_order, i.created_at`,
    )
    const imageAlts = await q(
      `SELECT a.project_image_id::text AS key, a.language, a.alt FROM project_image_translations a
         JOIN project_images i ON i.id = a.project_image_id JOIN projects p ON p.id = i.project_id
        WHERE p.is_published`,
    )
    const posts = await q(
      `SELECT id::text, slug, project_id::text, cover_src, cover_width, cover_height FROM posts
        WHERE is_published ORDER BY published_at, created_at`,
    )
    const postTexts = await q(
      `SELECT post_id::text AS key, language, title, excerpt, body, cover_alt
         FROM post_translations t JOIN posts p ON p.id = t.post_id WHERE p.is_published`,
    )
    const postTags = await q(
      `SELECT pt.post_id::text AS key, pt.tag_id::text AS tag_id FROM post_tags pt
         JOIN posts p ON p.id = pt.post_id WHERE p.is_published ORDER BY pt.sort_order`,
    )
    const tags = await q(`SELECT id::text, slug FROM tags ORDER BY slug`)
    const tagNames = await q(`SELECT tag_id::text AS key, language, name FROM tag_translations`)
    const types = await q(
      `SELECT id::text, slug, duration_minutes, buffer_before_minutes, buffer_after_minutes,
              minimum_notice_minutes, booking_window_days, slot_interval_minutes, max_per_day,
              location_kind, location_value, price_cents
         FROM booking_types WHERE is_active ORDER BY sort_order, created_at`,
    )
    const typeTexts = await q(
      `SELECT booking_type_id::text AS key, language, name, description FROM booking_type_translations`,
    )
    const rules = await q(
      `SELECT booking_type_id::text AS type_id, weekday, starts_at_minute, ends_at_minute
         FROM availability_rules ORDER BY weekday, starts_at_minute`,
    )
    const exceptions = await q(
      `SELECT booking_type_id::text AS type_id, to_char(on_date, 'YYYY-MM-DD') AS on_date, kind,
              starts_at_minute, ends_at_minute, reason
         FROM availability_exceptions
        WHERE on_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Berlin')::date
        ORDER BY on_date, starts_at_minute NULLS FIRST`,
    )
    const hidden = (
      await q(
        `SELECT (SELECT count(*) FROM projects WHERE NOT is_published)::int AS projects,
                (SELECT count(*) FROM posts WHERE NOT is_published)::int AS posts,
                (SELECT count(*) FROM booking_types WHERE NOT is_active)::int AS types`,
      )
    )[0] as { projects: number; posts: number; types: number }

    await connection.query('COMMIT')

    const textsOf = group(projectTexts)
    const techOf = group(tech)
    const imagesOf = group(images)
    const altsOf = group(imageAlts)
    const postTextsOf = group(postTexts)
    const tagsOf = group(postTags)
    const namesOf = group(tagNames)
    const typeTextsOf = group(typeTexts)

    const altFor = (imageId: string) =>
      Object.fromEntries(
        Object.entries(byLanguage(altsOf.get(imageId) ?? [])).map(([language, row]) => [language, row.alt]),
      ) as Partial<Record<Lang, string>>

    return {
      projects: projects.map((row) => {
        const shots = imagesOf.get(row.id) ?? []
        // The old card showed the first picture when none was marked as the cover.
        const cover = shots.find((shot) => shot.is_cover) ?? shots[0] ?? null

        return {
          id: row.id,
          slug: row.slug,
          status: row.status,
          websiteUrl: row.website_url,
          sourceUrl: row.source_url,
          texts: byLanguage(
            (textsOf.get(row.id) ?? []).map((text) => ({ ...text, features: text.features ?? [] })),
          ),
          tech: (techOf.get(row.id) ?? []).map((entry) => entry.name),
          cover: cover ? toImage(cover, altFor(cover.id)) : null,
          gallery: shots.filter((shot) => shot !== cover).map((shot) => toImage(shot, altFor(shot.id))),
        }
      }),
      services: staticServices(),
      posts: posts.map((row) => {
        const texts = postTextsOf.get(row.id) ?? []

        return {
          id: row.id,
          slug: row.slug,
          projectId: row.project_id,
          cover: row.cover_src
            ? toImage(
                { src: row.cover_src, width: row.cover_width, height: row.cover_height },
                Object.fromEntries(
                  texts.filter((text) => LANGS.includes(text.language)).map((text) => [text.language, text.cover_alt]),
                ),
              )
            : null,
          texts: byLanguage(texts),
          tagIds: (tagsOf.get(row.id) ?? []).map((entry) => entry.tag_id),
        }
      }),
      tags: tags.map((row) => ({
        id: row.id,
        slug: row.slug,
        names: Object.fromEntries(
          Object.entries(byLanguage(namesOf.get(row.id) ?? [])).map(([language, entry]) => [language, entry.name]),
        ),
      })),
      bookingTypes: types.map((row) => ({
        id: row.id,
        slug: row.slug,
        durationMinutes: row.duration_minutes,
        bufferBeforeMinutes: row.buffer_before_minutes,
        bufferAfterMinutes: row.buffer_after_minutes,
        minimumNoticeMinutes: row.minimum_notice_minutes,
        windowDays: row.booking_window_days,
        slotIntervalMinutes: row.slot_interval_minutes,
        maxPerDay: row.max_per_day,
        locationKind: row.location_kind,
        locationValue: row.location_value,
        priceCents: row.price_cents,
        texts: byLanguage(typeTextsOf.get(row.id) ?? []),
      })),
      rules: rules.map((row) => ({
        typeId: row.type_id,
        weekday: row.weekday,
        start: row.starts_at_minute,
        end: row.ends_at_minute,
      })),
      exceptions: exceptions.map((row) => ({
        typeId: row.type_id,
        date: row.on_date,
        kind: row.kind,
        start: row.starts_at_minute,
        end: row.ends_at_minute,
        reason: row.reason ?? '',
      })),
      hidden: { projects: hidden.projects, posts: hidden.posts, bookingTypes: hidden.types },
      headings: { de: content.de.work.detail, en: content.en.work.detail, ar: content.ar.work.detail },
    }
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => {})

    if (error instanceof ApiError) throw error

    console.error('Reading the old site failed', error instanceof Error ? error.message : error)

    throw unavailable('The old site’s database could not be read. Nothing was changed.')
  } finally {
    await connection.end().catch(() => {})
  }
}

/**
 * The services visitors read today.
 *
 * `/services` renders them from the code (`src/frontend/content`), not from
 * the legacy `services` table — that table is the lead pipeline's vocabulary
 * and no public page reads it. The order is the `/services` page's own.
 */
const SERVICE_ORDER = ['websites', 'shopify', 'software'] as const

const staticServices = (): LegacyService[] =>
  SERVICE_ORDER.map((slug) => ({
    slug,
    priceCents: Math.round(servicePrices[slug] * 100),
    texts: Object.fromEntries(
      LANGS.map((language) => {
        const copy = content[language].services.items[slug]

        return [
          language,
          {
            name: copy.name,
            short: copy.short,
            promise: copy.promise,
            audienceTitle: copy.audienceTitle,
            audience: [...copy.audience],
            includes: [...copy.includes],
            priceNote: copy.priceNote,
          },
        ]
      }),
    ) as LegacyService['texts'],
  }))

/* ------------------------------------------------------------------- images */

type Fetcher = { fetch: (request: Request) => Promise<Response> }
type Bucket = {
  get: (key: string) => Promise<{ body: ReadableStream<Uint8Array> | null; size?: number } | null>
  head: (key: string) => Promise<{ size?: number } | null>
}

/**
 * Where an old image lives, from the address the legacy row stores:
 *
 * - `/images/...` — a file shipped with the site. On Cloudflare the Worker's
 *   own static-assets binding serves it; elsewhere the running site does.
 * - `https://...` — fetched as it is.
 * - anything else — a key in the legacy bucket (`MEDIA`), reachable only on
 *   Cloudflare, where the binding exists.
 */
export const legacyImageSource = (origin: string): LegacyImageSource => {
  if (override.images) return override.images

  const request = async (src: string, method: 'GET' | 'HEAD') => {
    const env = await workerEnv()

    if (/^\/(?![/\\])/.test(src)) {
      const url = new URL(src, origin).toString()
      const assets = env?.ASSETS as Fetcher | undefined

      return assets ? assets.fetch(new Request(url, { method })) : fetch(url, { method })
    }

    if (/^https:\/\//i.test(src)) return fetch(src, { method, redirect: 'follow' })

    const bucket = env?.MEDIA as Bucket | undefined

    if (!bucket) throw new Error('its file is in the old storage, which is only reachable on the live site')

    if (method === 'HEAD') {
      const head = await bucket.head(src)

      return new Response(null, {
        status: head ? 200 : 404,
        headers: head?.size ? { 'content-length': String(head.size) } : {},
      })
    }

    const object = await bucket.get(src)

    return new Response(object?.body ?? null, {
      status: object?.body ? 200 : 404,
      headers: object?.size ? { 'content-length': String(object.size) } : {},
    })
  }

  const sizeOf = (response: Response) => {
    const value = Number(response.headers.get('content-length'))

    return Number.isFinite(value) && value > 0 ? value : null
  }

  return {
    async open(src) {
      const response = await request(src, 'GET')

      if (!response.ok || !response.body) {
        await response.body?.cancel().catch(() => {})
        throw new Error(`the old site answered ${response.status} for it`)
      }

      return { body: response.body, size: sizeOf(response) }
    },
    async measure(src) {
      try {
        const response = await request(src, 'HEAD')

        return response.ok ? sizeOf(response) : null
      } catch {
        return null
      }
    },
  }
}
