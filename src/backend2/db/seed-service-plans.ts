import 'dotenv/config'

import { PACKAGE_PLAN_SEEDS, seedPaymentPlans } from '../modules/services/service.seed-plans'
import { closePool, readDatabaseUrl } from './client'

/**
 * `bun run db2:services:seed-plans`.
 *
 * Fills the instalment and rent prices of the two live packages
 * ("Gefunden werden" 99 € x 12 / 34,99 € rent, "Vertrauen gewinnen" 149 € x 12 /
 * 49,99 € rent), in the draft and in the live version, once.
 *
 * Run it after `bun run db2:migrate` has added the columns. Safe to run again:
 * it only fills plan fields that are still empty, and never changes a price, a
 * text or any other pending edit. See `service.seed-plans.ts`.
 */

if (import.meta.main) {
  try {
    readDatabaseUrl()

    const results = await seedPaymentPlans(PACKAGE_PLAN_SEEDS)

    for (const result of results) {
      console.log(`${result.slug}: ${result.outcome}`)
      for (const note of result.notes) console.log(`  - ${note}`)
    }

    const seeded = results.filter((result) => result.outcome === 'seeded').length
    const missing = results.filter((result) => result.outcome === 'not-found' || result.outcome === 'not-live').length

    console.log(`Payment plans: ${seeded} package(s) filled, ${results.length - seeded - missing} already set, ${missing} skipped.`)

    if (missing > 0) process.exitCode = 1
  } finally {
    await closePool()
  }
}
