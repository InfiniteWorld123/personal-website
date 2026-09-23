import { withTransaction } from '../../db/client'
import {
  type BlogDraftInput,
  type OwnerBlogPost,
  SCHEDULE_HORIZON_DAYS,
  berlinWallTimeToInstant,
  blogPublishIssues,
  blogSubstance,
  canonicalBlogDraft,
} from '../../contracts/blog.contract'
import { articleScheduled, conflict, notFound, validationFailed } from '../../http/error'
import * as comments from './comment.repo'
import { releaseScope, syncReferences } from './post.media'
import * as repo from './post.repo'
import { getPost, isSlugAvailable, staleRevision } from './post.service'

/**
 * The transitions that change what a visitor can see, or will see.
 *
 * Every one takes the article's row with `FOR UPDATE` first, so two
 * overlapping requests — or a request and a schedule coming due — queue
 * rather than interleave. Each runs in one transaction: on any failure nothing
 * is written, the live version keeps its text and its images, and the draft
 * keeps every pending change so the owner corrects it rather than retypes it.
 */

const lockOrFail = async (postId: string): Promise<repo.PostRow> => {
  const row = await repo.lockPost(postId)

  if (!row) throw notFound('That article does not exist')
  if (!row.draft_version_id) throw notFound('That article has no draft')

  return row
}

const loadDraft = async (row: repo.PostRow): Promise<BlogDraftInput> => {
  const stored = await repo.loadVersion(row.draft_version_id!)

  if (!stored) throw notFound('That article has no draft')

  return stored.draft
}

/**
 * The publication rules, and the address.
 *
 * The issues are `docs/v2/blog.md`'s: a complete title, summary and article in
 * all three languages, and alternative text for every picture. A taken address
 * is a conflict rather than a missing field — the draft is fine, another
 * article simply holds the URL — and it is checked after the lock, so two
 * articles cannot claim it in the same instant.
 */
const assertPublishable = async (row: repo.PostRow, draft: BlogDraftInput): Promise<void> => {
  const issues = blogPublishIssues(draft)

  if (issues.length > 0) {
    throw validationFailed('This article is not ready to publish yet', {
      issues,
      missing: issues.map((issue) => issue.message),
    })
  }

  if (!(await isSlugAvailable({ slug: draft.slug, postId: row.id }))) {
    throw conflict('Another article already uses that web address')
  }
}

/**
 * **Publish** and **Publish update**, which are one operation: the server
 * knows which from whether something is live.
 *
 * An update keeps everything that makes the article the same article — its
 * identity, its address, its original date, its reads, its likes and its
 * comments — and shows a "last updated" date only when what the article says
 * actually changed. A republication after a take down restores all of it.
 */
export const publishPost = async (input: {
  postId: string
  draftRevision: number
}): Promise<OwnerBlogPost> => {
  await withTransaction(async () => {
    const row = await lockOrFail(input.postId)

    // Overtaking a schedule silently would publish the draft instead of the
    // snapshot the owner approved. `docs/v2/blog.md`: cancel or replace it
    // explicitly.
    if (row.scheduled_version_id) throw articleScheduled()
    if (row.draft_revision !== input.draftRevision) throw staleRevision()

    const draft = await loadDraft(row)

    await assertPublishable(row, draft)

    if (!(await repo.claimSlug({ postId: row.id, slug: draft.slug }))) {
      throw conflict('The web address of a published article cannot change')
    }

    /*
     * The previous live version is detached before the new one is written:
     * the unique index allows one published version per article, and the
     * pointer is deferrable, so it may be empty for the length of a statement.
     * The whole transaction still commits or rolls back as one.
     */
    if (row.published_version_id) {
      await repo.clearPublished(row.id)
      await repo.deleteVersion(row.published_version_id)
    }

    const versionId = await repo.copyVersion({
      postId: row.id,
      fromVersionId: row.draft_version_id!,
      kind: 'published',
    })

    const substance = blogSubstance(draft)

    await repo.setPublished({
      postId: row.id,
      versionId,
      draftRevision: row.draft_revision,
      substance,
      // Null before the first publication, so a first publication is never
      // an "update".
      contentUpdated: row.published_substance !== null && row.published_substance !== substance,
    })

    // The published scope is what makes these files reachable by a visitor.
    await syncReferences({ postId: row.id, scope: 'published', draft })
  })

  return getPost(input.postId)
}

/**
 * Taken down, without losing anything.
 *
 * It leaves the public list, its page, the feed, the sitemap and every public
 * answer at once — all of them read the one live version this removes — and
 * its comments disappear with it. The draft, the counters, the comments and
 * the address are kept, so republishing restores the same article.
 */
export const unpublishPost = async (postId: string): Promise<OwnerBlogPost> => {
  await withTransaction(async () => {
    const row = await lockOrFail(postId)

    if (!row.published_version_id) return

    await repo.clearPublished(row.id)
    await repo.deleteVersion(row.published_version_id)

    // Within the cache window the public media route states, the images stop
    // being servable to visitors.
    await releaseScope(row.id, 'published')
  })

  return getPost(postId)
}

/**
 * The draft, replaced by what is live: for an edit the owner regrets.
 * Refused when nothing is live, because there is then nothing to go back to
 * and the only alternative would be emptying the draft.
 */
export const discardPendingPost = async (input: {
  postId: string
  draftRevision: number
}): Promise<OwnerBlogPost> => {
  await withTransaction(async () => {
    const row = await lockOrFail(input.postId)

    if (row.draft_revision !== input.draftRevision) throw staleRevision()

    if (!row.published_version_id) {
      throw validationFailed('This article is not live, so there is no published version to go back to')
    }

    const draft = await loadDraft(row)
    const published = await repo.loadVersion(row.published_version_id)

    if (!published) throw notFound('That article has no published version')
    if (canonicalBlogDraft(draft) === canonicalBlogDraft(published.draft)) return

    await repo.overwriteVersion({
      fromVersionId: row.published_version_id,
      toVersionId: row.draft_version_id!,
    })

    const revision = await repo.bumpRevision(row.id)

    await repo.markDraftMatches({ postId: row.id, revision, published: true })
    await syncReferences({ postId: row.id, scope: 'draft', draft: published.draft })
  })

  return getPost(input.postId)
}

/* ---------------------------------------------------------------- schedules */

const scheduleRefusal = (message: string) =>
  validationFailed(message, { issues: [{ field: 'publishAt', message }], missing: [] })

/**
 * **Schedule**: freeze the saved draft now, publish it at a chosen time.
 *
 * `docs/v2/blog.md`: "Publish immediately or schedule the first publication
 * for a chosen date and time in the Europe/Berlin timezone. A scheduled
 * article must pass all publication requirements when scheduled." So the
 * snapshot is validated here, its address is claimed here, and its files are
 * held here — nothing about it can become invalid while it waits.
 *
 * Only a first publication is scheduled. A live article changes through
 * **Publish update**, which is manual in the first version; one that was taken
 * down is published again directly.
 *
 * `snapshot: 'keep'` moves an existing schedule without touching what it will
 * publish — "The owner can change or cancel the time before publication."
 */
export const schedulePost = async (input: {
  postId: string
  draftRevision: number
  date: string
  time: string
  snapshot: 'draft' | 'keep'
  now?: Date
}): Promise<OwnerBlogPost> => {
  const at = berlinWallTimeToInstant(input.date, input.time)
  const now = input.now ?? new Date()

  if (!at) {
    throw scheduleRefusal(
      'That time does not exist in Berlin: the clocks go forward that night. Choose another time.',
    )
  }

  if (at.getTime() <= now.getTime()) throw scheduleRefusal('Choose a time in the future')

  if (at.getTime() > now.getTime() + SCHEDULE_HORIZON_DAYS * 24 * 60 * 60 * 1000) {
    throw scheduleRefusal('Choose a time within the next year')
  }

  await withTransaction(async () => {
    const row = await lockOrFail(input.postId)

    if (row.published_version_id) {
      throw conflict(
        'This article is already live. Changes to it are published with Publish update, not scheduled.',
      )
    }

    if (row.first_published_at !== null) {
      throw conflict('Only a first publication can be scheduled. Publish this article again directly.')
    }

    if (row.draft_revision !== input.draftRevision) throw staleRevision()

    if (input.snapshot === 'keep') {
      if (!row.scheduled_version_id) {
        throw scheduleRefusal('There is no schedule to move yet. Schedule the article first.')
      }

      await repo.moveSchedule({ postId: row.id, at })

      return
    }

    const draft = await loadDraft(row)

    await assertPublishable(row, draft)

    if (!(await repo.claimSlug({ postId: row.id, slug: draft.slug }))) {
      throw conflict('Another article already uses that web address')
    }

    // Replacing a schedule: the old snapshot goes, the new one is frozen.
    if (row.scheduled_version_id) {
      await repo.clearSchedule(row.id)
      await repo.deleteVersion(row.scheduled_version_id)
    }

    const versionId = await repo.copyVersion({
      postId: row.id,
      fromVersionId: row.draft_version_id!,
      kind: 'scheduled',
    })

    await repo.setSchedule({ postId: row.id, versionId, at, draftRevision: row.draft_revision })

    // Held at `scheduled` scope: undeletable, and not yet public.
    await syncReferences({ postId: row.id, scope: 'scheduled', draft })
  })

  return getPost(input.postId)
}

/**
 * The schedule, gone: the frozen snapshot is discarded and the article is a
 * plain draft again. Its address is given back too — no visitor has ever seen
 * it, so there is nothing to keep it for — and the owner may change it again.
 */
export const cancelSchedule = async (postId: string): Promise<OwnerBlogPost> => {
  await withTransaction(async () => {
    const row = await lockOrFail(postId)

    if (!row.scheduled_version_id) return

    await repo.clearSchedule(row.id)
    await repo.deleteVersion(row.scheduled_version_id)
    await releaseScope(row.id, 'scheduled')
    await repo.releaseSlug(row.id)
  })

  return getPost(postId)
}

/* ------------------------------------------------------------ the article */

/**
 * Comments on or off, at once. `docs/v2/blog.md`: when they are off, "both old
 * comments and the form are hidden publicly, but the records remain in the
 * dashboard and reappear if comments are enabled again." A setting rather than
 * content, so it does not wait for **Publish update** — switching comments off
 * is exactly the thing the owner needs to happen now.
 */
export const setCommentsEnabled = async (input: {
  postId: string
  enabled: boolean
}): Promise<OwnerBlogPost> => {
  await withTransaction(async () => {
    const row = await lockOrFail(input.postId)

    if (row.comments_enabled === input.enabled) return

    await repo.setCommentsEnabled(row.id, input.enabled)
  })

  return getPost(input.postId)
}

/**
 * Permanent, and it says so by demanding the article's own id back.
 *
 * Everything about the article goes: every version and translation, every
 * comment and reply, both counters and its address, which another article may
 * then use. The files do **not** go — that is the vault. `docs/v2/media.md`:
 * deleting a record forgets its uses; the library keeps every image, and the
 * owner deletes those from Media if they want them gone.
 */
export const deletePost = async (input: {
  postId: string
  confirm: string
}): Promise<{ deleted: true; comments: number }> =>
  withTransaction(async () => {
    const row = await lockOrFail(input.postId)

    if (input.confirm !== row.id) {
      throw validationFailed('Send the article id exactly to confirm permanent deletion')
    }

    const removed = (await comments.countsForPosts([row.id])).get(row.id)?.total ?? 0

    for (const scope of ['draft', 'scheduled', 'published'] as const) {
      await releaseScope(row.id, scope)
    }

    await repo.deletePost(row.id)

    return { deleted: true as const, comments: removed }
  })
