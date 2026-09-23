import 'dotenv/config'

import { readFile, writeFile } from 'node:fs/promises'
import {
  applyContentImport,
  compareContentImport,
  planContentImport,
  readLegacyExport,
  rollbackContentImport,
} from '../modules/content/content.import'
import { closePool, readDatabaseUrl } from './client'

/**
 * `bun run db2:content:import -- --source <export.json> [mode]`.
 *
 * Step two of the Content import (`docs/v2/content.md`). Reads the file that
 * `content-export-legacy.ts` wrote, and only the V2 database.
 *
 * Modes — the default is the harmless one:
 *
 *   (none)             dry run: print the manifest, write nothing
 *   --manifest <file>  also save the full manifest as JSON
 *   --apply            write the plan into an empty V2 content store
 *   --compare          list every field where V2 and the export disagree
 *   --rollback <id>    remove one import's rows (refused if any were edited)
 *
 * Never run `--apply` against a database the owner has not approved.
 */

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)

  return index >= 0 ? process.argv[index + 1] : undefined
}

const flag = (name: string): boolean => process.argv.includes(name)

if (import.meta.main) {
  try {
    const rollback = argument('--rollback')

    if (rollback) {
      readDatabaseUrl()
      const { removed } = await rollbackContentImport(rollback)
      console.log(`Rolled back import ${rollback}: ${removed} values removed; V2 shows the release wording.`)
    } else {
      const sourcePath = argument('--source')
      if (!sourcePath) throw new Error('Pass --source <export.json>')

      const plan = planContentImport(readLegacyExport(JSON.parse(await readFile(sourcePath, 'utf8'))))
      const { counts } = plan.manifest

      console.log(`Registry fields: ${plan.manifest.registryFields}`)
      console.log(
        `Rows: ${counts.rows} (${counts.fromLegacyOverride} from legacy overrides, ` +
          `${counts.fromReleaseDefault} from release wording)`,
      )
      for (const [slot, slotCounts] of Object.entries(counts.perSlot)) {
        console.log(`  ${slot}: ${slotCounts.rows} rows, ${slotCounts.fromLegacyOverride} overridden`)
      }
      console.log(`Differ from release wording: ${plan.manifest.differsFromDefault.length}`)
      console.log(`Excluded legacy keys: ${counts.excluded}; invalid: ${counts.invalid}`)
      for (const item of plan.manifest.excluded) {
        console.log(`  excluded ${item.language} ${item.key} (${item.reason})`)
      }
      for (const item of plan.manifest.invalid) {
        console.log(`  INVALID ${item.language} ${item.key}: ${item.message}`)
      }
      console.log(`Legacy drafts left out: ${plan.manifest.source.ignoredDrafts}`)

      const manifestPath = argument('--manifest')
      if (manifestPath) {
        await writeFile(manifestPath, `${JSON.stringify(plan.manifest, null, 2)}\n`, 'utf8')
        console.log(`Manifest written to ${manifestPath}`)
      }

      if (flag('--apply')) {
        readDatabaseUrl()
        const { importId, written } = await applyContentImport(plan, `legacy export ${plan.manifest.source.exportedAt}`)
        console.log(`Imported ${written} values as import ${importId}. Roll back with --rollback ${importId}.`)
      } else if (flag('--compare')) {
        readDatabaseUrl()
        const differences = await compareContentImport(plan)
        for (const item of differences) {
          console.log(`  differs ${item.language} ${item.key}: V2 ${JSON.stringify(item.v2)} / legacy ${JSON.stringify(item.legacy)}`)
        }
        console.log(differences.length === 0 ? 'V2 matches the export.' : `${differences.length} fields differ.`)
        if (differences.length > 0) process.exitCode = 1
      } else {
        console.log('Dry run: nothing was written.')
      }
    }
  } catch (error) {
    // A refusal is an answer, not a crash: say it in one line, with its details.
    const details = (error as { details?: unknown }).details
    console.error(`Refused: ${error instanceof Error ? error.message : String(error)}`)
    if (details) console.error(JSON.stringify(details, null, 2))
    process.exitCode = 1
  } finally {
    await closePool()
  }
}
