import type { RichTextDoc } from '#/shared/validation/rich-text'
import type {
  PostCoverInput,
  PostLanguage,
  PostTranslationInput,
} from '#/shared/validation/post.validation'

/** A tag as anything that displays one needs it: a slug to link, a name to show. */
export type PublicTag = { slug: string; name: string }

/** The admin's view of a tag: every name at once, because it edits all three. */
export type AdminTag = {
  id: string
  slug: string
  names: Record<PostLanguage, string>
  /** How many posts carry it, so an unused tag is safe to delete. */
  postCount: number
}

/** One row of the admin list. No body: the table shows none of the article. */
export type AdminPostListItem = {
  id: string
  slug: string
  /** Best available title, so a draft written in one language is still findable. */
  displayTitle: string
  isPublished: boolean
  publishedOn: string | null
  languages: PostLanguage[]
  tags: PublicTag[]
  projectSlug: string | null
  updatedAt: string
}

export type AdminPostList = {
  items: AdminPostListItem[]
  total: number
  page: number
  pageCount: number
}

/** The full record the edit form loads and saves back. */
export type AdminPostDetail = {
  id: string
  slug: string
  projectId: string | null
  cover: PostCoverInput | null
  isPublished: boolean
  publishedOn: string | null
  tagIds: string[]
  translations: Partial<Record<PostLanguage, PostTranslationInput>>
  createdAt: string
  updatedAt: string
}

/** A project the post form can point at. Just enough to name it in a select. */
export type PostProjectOption = { id: string; slug: string; name: string }

/**
 * What the public site receives: one language already chosen, no ids, no
 * drafts, no timestamps beyond the publication date.
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
   * Times the article has been opened, and readers who liked it.
   *
   * Both are approximate on purpose: no row anywhere records who did either,
   * so nothing about a visitor is stored to make them exact. See
   * `0019_post_engagement.sql`. The UI says "reads", never "readers".
   */
  viewCount: number
  likeCount: number
}

export type PublicPost = PublicPostSummary & {
  body: RichTextDoc
  /** Set when the article is about one of the case studies. */
  project: { slug: string; name: string } | null
}
