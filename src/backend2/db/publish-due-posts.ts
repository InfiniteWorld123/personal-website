import 'dotenv/config'

import { publishDuePosts } from '../modules/blog/post.due'
import { closePool, readDatabaseUrl } from './client'

/**
 * `bun run db2:blog:publish-due`.
 *
 * Publishes every Blog article whose scheduled time has passed, exactly once,
 * and nothing else. The same function runs before every public Blog read and
 * every Dashboard list, so a schedule never waits for this command; it exists
 * for a scheduler to call — a Cloudflare Cron Trigger once one is deployed —
 * and for trying the flow by hand.
 *
 * Idempotent: with nothing due it publishes nothing, and running it twice at
 * once publishes each article once.
 */

if (import.meta.main) {
  try {
    readDatabaseUrl()

    const { published, failed } = await publishDuePosts()

    for (const id of published) console.log(`Published scheduled article: ${id}`)

    console.log(
      `Blog schedules checked. ${published.length} published` +
        (failed > 0 ? `, ${failed} failed and will be tried again.` : '.'),
    )

    if (failed > 0) process.exitCode = 1
  } finally {
    await closePool()
  }
}
