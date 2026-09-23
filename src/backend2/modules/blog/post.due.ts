import { withTransaction } from '../../db/client'
import { blogSubstance } from '../../contracts/blog.contract'
import { releaseScope, syncReferences } from './post.media'
import * as repo from './post.repo'

/**
 * Scheduled first publications, made real.
 *
 * `docs/v2/blog.md`: "If a temporary service outage delays the job, publish
 * the approved snapshot when processing resumes, once only, and surface the
 * delay in the dashboard."
 *
 * Nothing here needs a clock of its own. `publishDuePosts` publishes every
 * schedule whose time has passed, and it is safe to call from anywhere at any
 * moment: from a Cloudflare Cron Trigger once one is deployed, from the
 * `bun run db2:blog:publish-due` command, and — through `catchUpSchedules` —
 * before every public read and every Dashboard list. So an article is live for
 * the first visitor who asks after its time, even on a machine where no
 * scheduler runs at all.
 *
 * "Once only" is a property of the locks, not of hope: each due article is
 * taken `FOR UPDATE SKIP LOCKED` inside its own transaction and the schedule is
 * cleared in the same transaction that publishes it, so however many requests
 * notice it together, exactly one of them publishes it. The publication time
 * recorded is the moment it really went live; when that is noticeably later
 * than the schedule, the Dashboard says so.
 */

/**
 * Publishes one due article, if there is one this call has not already tried.
 * Returns its id, `null` when nothing is due, or `false` when the one it took
 * failed — so one broken article cannot stop the rest from going out.
 */
const publishNextDue = async (now: Date, skip: Set<string>): Promise<string | null | false> => {
  let taken: string | null = null

  try {
    return await withTransaction(async () => {
      const due = (await repo.lockDue(now, skip.size + 1)).find((row) => !skip.has(row.id))

      if (!due) return null

      taken = due.id

      // The lock was taken on a row that still has to be due: another request
      // may have published it between its query and this one.
      if (!due.scheduled_version_id || !due.scheduled_for || due.scheduled_draft_revision === null) {
        return null
      }

      const snapshot = await repo.loadVersion(due.scheduled_version_id)

      if (!snapshot) return null

      const substance = blogSubstance(snapshot.draft)

      /*
       * The frozen snapshot becomes the live one as it is — no copy, because
       * it already is exactly what the owner approved. The schedule is
       * cleared first: an article is never scheduled and live at once, and
       * the database checks that after every statement.
       */
      await repo.clearSchedule(due.id)
      await repo.promoteVersion(due.scheduled_version_id)
      await repo.setPublished({
        postId: due.id,
        versionId: due.scheduled_version_id,
        draftRevision: due.scheduled_draft_revision,
        substance,
        // A first publication is never an "update".
        contentUpdated: due.published_substance !== null && due.published_substance !== substance,
        schedule: { scheduledFor: due.scheduled_for },
      })

      // The frozen snapshot's files become the live page's files.
      await syncReferences({ postId: due.id, scope: 'published', draft: snapshot.draft })
      await releaseScope(due.id, 'scheduled')

      return due.id
    })
  } catch (error) {
    console.error(
      'Blog scheduled publication failed',
      error instanceof Error ? error.message : String(error),
    )

    if (taken) skip.add(taken)

    return false
  }
}

export const publishDuePosts = async (
  input: { now?: Date; limit?: number } = {},
): Promise<{ published: string[]; failed: number }> => {
  const now = input.now ?? new Date()
  const limit = input.limit ?? 20
  const published: string[] = []
  const skip = new Set<string>()
  let failed = 0

  while (published.length + failed < limit) {
    const result = await publishNextDue(now, skip)

    if (result === null) break

    if (result === false) failed += 1
    else {
      published.push(result)
      skip.add(result)
    }
  }

  return { published, failed }
}

/**
 * The cheap question first, the work only when the answer is yes.
 *
 * Called before reads. A failure here must never cost a visitor the page they
 * asked for, so it is logged and swallowed: the next request tries again,
 * which is exactly the "when processing resumes" the specification asks for.
 */
export const catchUpSchedules = async (now: Date = new Date()): Promise<void> => {
  try {
    if (!(await repo.anyDue(now))) return

    await publishDuePosts({ now })
  } catch (error) {
    console.error(
      'Blog schedule catch-up failed',
      error instanceof Error ? error.message : String(error),
    )
  }
}
