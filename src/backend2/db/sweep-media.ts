import 'dotenv/config'

import { sweepPendingObjects } from '../modules/media/media.service'
import { closePool, readDatabaseUrl } from './client'

/**
 * `bun run db2:media:sweep`.
 *
 * Finishes object deletions that a crash or an outage interrupted, and nothing
 * else. It reads `v2_media_pending_objects` — keys whose library row was never
 * written, and keys whose row the owner deleted — and removes those objects
 * from storage once they are past the grace period.
 *
 * What it deliberately does **not** do is delete assets that no module
 * references. That was the project-scoped cleanup, and `docs/v2/media.md` is
 * explicit that it conflicts with a shared vault: "Keeping unused assets is
 * intentional." An unused file in this library is a file the owner kept.
 *
 * Idempotent: a key that is already gone is the state the sweep wanted.
 */

const GRACE_HOURS = 24

if (import.meta.main) {
  try {
    readDatabaseUrl()

    const { removed, failed } = await sweepPendingObjects({ graceHours: GRACE_HOURS })

    for (const key of removed) console.log(`Removed orphaned object: ${key}`)
    for (const key of failed) console.error(`Could not remove: ${key}`)

    console.log(
      `Media sweep finished. ${removed.length} removed, ${failed.length} still pending ` +
        `(grace period ${GRACE_HOURS}h).`,
    )

    if (failed.length > 0) process.exitCode = 1
  } finally {
    await closePool()
  }
}
