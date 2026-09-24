/** A tag as anything that displays one needs it: a slug to link, a name to show. */
export type PublicTag = { slug: string; name: string }

/**
 * An article card as the public pages draw it: one language already chosen,
 * no ids, no drafts, no timestamps beyond the publication date.
 */
export type PublicPostSummary = {
  slug: string
  title: string
  excerpt: string
  publishedOn: string
  readingMinutes: number
  cover: { src: string; width: number; height: number; alt: string } | null
  tags: PublicTag[]
  /**
   * Times the article has been opened, and likes it received.
   *
   * Both are approximate on purpose: times, never people. The UI says
   * "reads", never "readers".
   */
  viewCount: number
  likeCount: number
}

export type PublicPost = PublicPostSummary & {
  /** Set when the article is about one of the case studies. */
  project: { slug: string; name: string } | null
}
