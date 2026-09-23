import { withTransaction } from '../../db/client'
import {
  LANGUAGES,
  type Language,
  type OwnerBlogTag,
  PUBLIC_TAG_LIMIT,
  type PublicBlogTag,
  blogDisplayTitle,
  slugify,
} from '../../contracts/blog.contract'
import type { Page } from '../../contracts/pagination.contract'
import { toPage } from '../../contracts/pagination.contract'
import { conflict, nameTaken, notFound, tagInUse, validationFailed } from '../../http/error'
import { catchUpSchedules } from './post.due'
import { loadListTexts } from './post.repo'
import * as repo from './tag.repo'

/**
 * The owner's curated set of tags.
 *
 * `docs/v2/blog.md`: "Tags, not categories, organize articles. A tag has names
 * in DE/EN/AR and can be created/edited in the dashboard." And its route
 * table: "Edit or delete an unused tag safely" — a tag an article still
 * carries is not deleted from under it; the refusal names the articles, so
 * the owner can take it off them first.
 */

const iso = (value: Date): string => new Date(value).toISOString()

const toOwnerTag = (row: repo.TagRow): OwnerBlogTag => ({
  id: row.id,
  slug: row.slug,
  names: { de: '', en: '', ar: '', ...(row.names ?? {}) },
  articleCount: Number(row.article_count),
  liveArticleCount: Number(row.live_count),
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
})

export const listOwnerTags = async (input: {
  page: number
  pageSize: number
  search: string
}): Promise<Page<OwnerBlogTag>> => {
  const first = await repo.listTags({
    search: input.search,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  })
  const pageCount = Math.max(1, Math.ceil(first.total / input.pageSize))

  // A page past the end is the last page, as in every other Dashboard list.
  const page = Math.min(input.page, pageCount)
  const result =
    page === input.page
      ? first
      : await repo.listTags({
          search: input.search,
          limit: input.pageSize,
          offset: (page - 1) * input.pageSize,
        })

  return toPage({ items: result.rows.map(toOwnerTag), page, pageSize: input.pageSize, total: result.total })
}

export const getOwnerTag = async (id: string): Promise<OwnerBlogTag> => {
  const row = await repo.findTag(id)

  if (!row) throw notFound('That tag does not exist')

  return toOwnerTag(row)
}

/** Refuses a name another tag already has in the same language. */
const assertNamesFree = async (names: Record<Language, string>, excludeId: string | null) => {
  for (const language of LANGUAGES) {
    if (await repo.nameTakenBy({ language, name: names[language], excludeId })) {
      throw nameTaken(`Another tag is already called “${names[language]}” in ${language.toUpperCase()}`)
    }
  }
}

const assertSlugFree = async (slug: string, excludeId: string | null) => {
  const holder = await repo.findTagIdBySlug(slug)

  if (holder !== null && holder !== excludeId) {
    throw conflict('Another tag already uses that web address')
  }
}

export const createTag = async (input: {
  slug: string
  names: Record<Language, string>
}): Promise<OwnerBlogTag> => {
  // The address is a suggestion from the English name, then the German — an
  // Arabic-only name transliterates to nothing, and then the owner is asked.
  const slug = input.slug || slugify(input.names.en) || slugify(input.names.de)

  if (slug === '') {
    throw validationFailed('Choose a web address for the tag', {
      issues: [{ field: 'slug', message: 'Choose a web address for the tag' }],
      missing: [],
    })
  }

  const id = await withTransaction(async () => {
    await assertSlugFree(slug, null)
    await assertNamesFree(input.names, null)

    return repo.insertTag({ slug, names: input.names })
  })

  return getOwnerTag(id)
}

/**
 * A new address or new names, at once and everywhere: every article that
 * carries the tag shows the new name, and the public filter uses the new
 * address. A tag's address is a filter value, not a page, so there is nothing
 * to redirect.
 */
export const patchTag = async (input: {
  id: string
  slug?: string
  names?: Partial<Record<Language, string>>
}): Promise<OwnerBlogTag> => {
  await withTransaction(async () => {
    const current = await repo.findTag(input.id)

    if (!current) throw notFound('That tag does not exist')

    const names: Record<Language, string> = {
      de: input.names?.de ?? current.names?.de ?? '',
      en: input.names?.en ?? current.names?.en ?? '',
      ar: input.names?.ar ?? current.names?.ar ?? '',
    }

    const slug = input.slug ?? current.slug

    if (slug === '') {
      throw validationFailed('A tag needs a web address', {
        issues: [{ field: 'slug', message: 'A tag needs a web address' }],
        missing: [],
      })
    }

    await assertSlugFree(slug, input.id)
    await assertNamesFree(names, input.id)
    await repo.updateTag({ id: input.id, slug, names })
  })

  return getOwnerTag(input.id)
}

/**
 * Only an unused tag. Used means carried by any version of any article — the
 * draft, a frozen schedule or the live snapshot — because each of those would
 * otherwise lose a tag nobody asked it to lose. The database's `RESTRICT`
 * holds the same line underneath.
 */
export const deleteTag = async (id: string): Promise<{ deleted: true }> =>
  withTransaction(async () => {
    const current = await repo.findTag(id)

    if (!current) throw notFound('That tag does not exist')

    const users = await repo.tagUsers(id, 10)

    if (users.total > 0) {
      const texts = await loadListTexts(
        users.posts.map((post) => post.draft_version_id).filter((value): value is string => !!value),
      )

      throw tagInUse(
        `That tag is on ${users.total} article${users.total === 1 ? '' : 's'}. ` +
          'Remove it there before deleting it.',
        {
          articleCount: users.total,
          articles: users.posts.map((post) => ({
            id: post.id,
            title: blogDisplayTitle(
              texts.get(post.draft_version_id ?? '') ?? {
                de: { title: '' },
                en: { title: '' },
                ar: { title: '' },
              },
              'en',
            ),
          })),
        },
      )
    }

    await repo.deleteTag(id)

    return { deleted: true as const }
  })

/**
 * The filter chips. Like every public read, anything whose schedule has come
 * due is published first, so a new article's tag is not missing from the row
 * that is loaded beside it.
 */
export const listPublicTags = async (language: Language): Promise<PublicBlogTag[]> => {
  await catchUpSchedules()

  return repo.listPublicTags(language, PUBLIC_TAG_LIMIT)
}
