import type { ContentLanguage, ContentValue } from './content-primitives'

export type { ContentLanguage, ContentValue }

/** One key in one language, as the editor sees it. */
export type ContentFieldState = {
  key: string
  language: ContentLanguage
  /** Written but not published. `null` means the draft matches what is live. */
  draft: ContentValue | null
  /** Live on the site. `null` means the site is still serving the code's wording. */
  published: ContentValue | null
  needsReview: boolean
  updatedAt: string | null
}

export type ContentSnapshot = {
  fields: ContentFieldState[]
  /** Drafts waiting to be published, across every language. */
  draftCount: number
  /** Keys flagged for review, per language. */
  reviewCounts: Record<string, number>
}

/** One line of the confirmation shown before publishing. */
export type ContentDiffEntry = {
  key: string
  language: ContentLanguage
  from: ContentValue | null
  to: ContentValue
}

export type ContentRevision = {
  id: string
  key: string
  language: ContentLanguage
  value: ContentValue | null
  createdAt: string
}

/** What a public page render needs: published values only, grouped by language. */
export type PublishedContent = {
  de: Record<string, ContentValue>
  en: Record<string, ContentValue>
  ar: Record<string, ContentValue>
  shared: Record<string, ContentValue>
}
