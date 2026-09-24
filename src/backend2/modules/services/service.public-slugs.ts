import * as repo from './service.repo'

/**
 * Every published service address, for the sitemap.
 *
 * Paged like the public list — a hundred at a time, in the owner's order — so
 * the sitemap never asks for the whole catalogue in one query. Only the
 * published version is joined, so a draft or a service that was taken down has
 * no entry, exactly as it has no page.
 */
export const listPublishedServiceSlugs = async (): Promise<string[]> => {
  const slugs: string[] = []
  const limit = 100

  for (let offset = 0; ; offset += limit) {
    const { rows, total } = await repo.listPublished({ offset, limit, featuredOnly: false })

    slugs.push(...rows.map((row) => row.slug))

    if (rows.length === 0 || offset + rows.length >= total) return slugs
  }
}
