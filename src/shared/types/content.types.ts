/** A profile link, as `site.links` stores it (see `content.contract.ts`). */
export type ContentLinkValue = { platform: string; url: string; label: string; hidden: boolean }

/** A sentence, a list of sentences, a price, or the owner's profile links. */
export type ContentValue = string | string[] | number | ContentLinkValue[]

/** What a public page render needs: the saved values only, grouped by language. */
export type PublishedContent = {
  de: Record<string, ContentValue>
  en: Record<string, ContentValue>
  ar: Record<string, ContentValue>
  shared: Record<string, ContentValue>
}
