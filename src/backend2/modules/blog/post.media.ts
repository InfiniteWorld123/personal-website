import { type BlogDraftInput, LANGUAGES, blogDisplayTitle, blogMediaIds } from '../../contracts/blog.contract'
import type { ReferenceEntry } from '../media/media.repo'
import { type ReferenceScope, releaseReferences, replaceReferences } from '../media/media.service'

/**
 * How the Blog tells the shared Media vault which files an article uses.
 *
 * In-process, never over HTTP: a reference is what makes a file undeletable
 * and — at `published` scope — publicly servable, so the browser must not be
 * able to write one (`docs/v2/media.md`). Each snapshot is its own scope on
 * purpose. Saving a draft that drops an image cannot take that image off the
 * live page or out of a frozen schedule, and taking an article down stops its
 * files being served without touching the draft's claim on them.
 */

type BlogScope = Extract<ReferenceScope, 'draft' | 'scheduled' | 'published'>

/**
 * One row per file: the cover first, then every inline image in reading
 * order, German, English, Arabic. The same photograph used as the cover and
 * again inside the text is one use of one file as far as deletion is
 * concerned.
 */
export const referenceEntries = (draft: BlogDraftInput): ReferenceEntry[] => {
  const entries: ReferenceEntry[] = []
  const seen = new Set<string>()

  const add = (assetId: string, usage: ReferenceEntry['usage']) => {
    if (seen.has(assetId)) return

    seen.add(assetId)
    entries.push({ assetId, usage, position: entries.length })
  }

  if (draft.cover) add(draft.cover.mediaId, 'cover')

  for (const language of LANGUAGES) {
    for (const id of blogMediaIds(draft.texts[language].body)) add(id, 'inline')
  }

  return entries
}

const SUFFIX: Record<BlogScope, string> = {
  draft: ' (draft)',
  scheduled: ' (scheduled)',
  published: '',
}

/** The complete set one snapshot uses, restated. What it does not name stops being a use. */
export const syncReferences = async (input: {
  postId: string
  scope: BlogScope
  draft: BlogDraftInput
}): Promise<void> =>
  replaceReferences({
    module: 'blog',
    ownerType: 'post',
    ownerId: input.postId,
    scope: input.scope,
    // The sentence the Media library shows when it refuses to delete a file.
    label: `Blog: ${blogDisplayTitle(input.draft.texts, 'en')}${SUFFIX[input.scope]}`,
    entries: referenceEntries(input.draft),
  })

/** Everything one snapshot used, forgotten. The files themselves stay in the vault. */
export const releaseScope = async (postId: string, scope: BlogScope): Promise<void> =>
  releaseReferences({ module: 'blog', ownerType: 'post', ownerId: postId, scope })
