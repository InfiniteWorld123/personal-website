import { applyContentOverrides, emptyOverrides } from '#/frontend/content/overrides'
import type { PublishedContent } from '#/shared/types/content.types'

/**
 * Puts the published overrides into the content module.
 *
 * Two callers, and both are needed. The language route's `head()` calls it
 * first: the router builds every page's `<title>` and meta tags before React
 * renders anything — on the server, and again in the browser while it
 * hydrates — and a head that ran before the overrides were in place read the
 * code's wording, so the browser swapped the saved title for the old one.
 * The layout calls it again during render, for the components under it.
 *
 * Applied during render rather than in an effect on purpose: an effect runs
 * after the first paint, so the browser would hydrate the code's wording over
 * the server's published wording and React would report a mismatch. The call
 * is idempotent — an unchanged payload does nothing at all — which is what
 * makes running it on every head and every render safe.
 */

let lastSignature: string | undefined

export const applyPublishedContent = (published: PublishedContent | undefined): void => {
  if (!published) return

  const signature = JSON.stringify(published)
  if (signature === lastSignature) return

  lastSignature = signature

  applyContentOverrides({
    ...emptyOverrides(),
    de: published.de,
    en: published.en,
    ar: published.ar,
    shared: published.shared,
  })
}

export const useContentOverrides = (published: PublishedContent | undefined): void =>
  applyPublishedContent(published)
