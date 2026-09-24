import type { Language, PublicProjectDetail } from '../../contracts/project.contract'
import { toPublicDetail } from './project.mapper'
import * as repo from './project.repo'

/**
 * One batch of published projects with everything a public card shows.
 *
 * `listPublicProjects` answers with `PublicProjectCard`, which has no links —
 * but the accepted `/work` card and the homepage carousel show the website and
 * source buttons beside every project. Reading each project's detail one by
 * one to find them would be a query per card, so this reads the batch once and
 * builds each entry with the same `toPublicDetail` projection the detail route
 * uses: only published versions, only links marked public, a client name only
 * when the owner chose to show it. Nothing here can reach a draft.
 *
 * Bounded like the public route: the caller passes `offset` and `limit`, and
 * the website never asks for more than one page of cards at a time.
 */
export const listPublicProjectEntries = async (input: {
  language: Language
  offset: number
  limit: number
}): Promise<{ items: PublicProjectDetail[]; total: number; hasMore: boolean }> => {
  const { rows, total } = await repo.listPublished({ offset: input.offset, limit: input.limit })

  const contents = await Promise.all(rows.map((version) => repo.loadVersionContent(version.id)))
  const sizes = await repo.loadAssetSizes(
    contents.flatMap((content) => [
      ...(content.cover ? [content.cover.assetId] : []),
      ...content.gallery.map((image) => image.assetId),
    ]),
  )

  const items = rows.map((version, index) =>
    toPublicDetail({
      version,
      content: contents[index]!,
      language: input.language,
      publishedAt: version.published_at,
      // The published version's slug is the current address by construction.
      canonicalSlug: version.slug,
      sizes,
    }),
  )

  return { items, total, hasMore: input.offset + items.length < total }
}

/** Every published address, for the sitemap: page by page, never the whole table at once. */
export const listPublishedProjectSlugs = async (): Promise<string[]> => {
  const slugs: string[] = []
  const limit = 100

  for (let offset = 0; ; offset += limit) {
    const { rows, total } = await repo.listPublished({ offset, limit })

    slugs.push(...rows.map((row) => row.slug))

    if (rows.length === 0 || offset + rows.length >= total) return slugs
  }
}
