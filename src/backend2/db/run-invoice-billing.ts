import 'dotenv/config'

import { runBilling } from '../modules/invoices/subscription.billing'
import { closePool, readDatabaseUrl } from './client'

/**
 * `bun run db2:invoices:run-billing`.
 *
 * Decides every subscription period that has started, attempts the card
 * charges that are due, and prepares due reminders — each exactly once,
 * however often it runs and even when two runs overlap (see
 * `modules/invoices/subscription.billing.ts`). It exists for a scheduler to
 * call — a Cloudflare Cron Trigger once one is deployed, once or a few times
 * a day — and for trying the flow by hand.
 *
 * Nothing real happens unless `INVOICES_LIVE_ENABLED=true`: live automatic
 * subscriptions are refused, and a live Stripe key is not used.
 */

if (import.meta.main) {
  try {
    readDatabaseUrl()

    const summary = await runBilling()

    console.log(
      `Invoices billing run: ${summary.periodsDecided} period(s) decided, ${summary.draftsCreated} draft(s), ` +
        `${summary.invoicesIssued} issued, ${summary.chargesAttempted} charge(s) attempted ` +
        `(${summary.chargesFailed} failed), ${summary.noticesPrepared} notice(s) prepared.`,
    )

    for (const error of summary.errors) console.log(`  ! ${error.message}`)

    if (summary.errors.length > 0) process.exitCode = 1
  } finally {
    await closePool()
  }
}
