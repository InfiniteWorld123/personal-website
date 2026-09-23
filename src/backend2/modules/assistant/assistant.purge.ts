import 'dotenv/config'

import { closePool, readDatabaseUrl } from '../../db/client'
import { purgeExpiredConversations } from './assistant.service'

/**
 * `bun run db2:assistant:purge`.
 *
 * Applies the owner's transcript-retention setting once. With `manual` (the
 * default) it deletes nothing and says so: conversations stay until the
 * owner deletes them. With "delete after N days" it deletes every
 * conversation idle for longer, with its messages.
 *
 * The same rule also runs opportunistically before new questions while
 * automatic deletion is on, so this command is for a scheduler (a Cloudflare
 * Cron Trigger once one is deployed) and for trying the flow by hand.
 * Idempotent.
 */

if (import.meta.main) {
  try {
    readDatabaseUrl()

    const { mode, deleted } = await purgeExpiredConversations()

    console.log(
      mode === 'manual'
        ? 'Assistant retention is manual: nothing was deleted.'
        : `Assistant retention applied: ${deleted} conversation(s) deleted.`,
    )
  } finally {
    await closePool()
  }
}
