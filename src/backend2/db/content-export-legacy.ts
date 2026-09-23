import 'dotenv/config'

import { writeFile } from 'node:fs/promises'
import { Client } from 'pg'
import type { LegacyExport } from '../modules/content/content.import'

/**
 * `bun run db2:content:export-legacy -- --out <file>`.
 *
 * Step one of the Content import (`docs/v2/content.md`): reads the wording the
 * legacy site publishes today — its *published* overrides, never its drafts —
 * and writes them to a file. Step two, `content-import.ts`, reads only that
 * file and only the V2 database.
 *
 * This is the one Backend2 file that opens the legacy database, and it cannot
 * write to it: the whole read runs inside `BEGIN TRANSACTION READ ONLY`, which
 * PostgreSQL itself enforces, and it never opens a V2 connection. It changes
 * nothing anywhere; the only thing it produces is the file.
 */

export const LEGACY_EXPORT_SQL = `
  SELECT b.key, t.language, t.published_value
    FROM content_translations t
    JOIN content_blocks b ON b.id = t.content_block_id
   WHERE t.published_value IS NOT NULL
   ORDER BY b.key, t.language`

export const LEGACY_DRAFT_COUNT_SQL = `
  SELECT count(*) AS total FROM content_translations WHERE draft_value IS NOT NULL`

/** Turns the legacy rows into the export file's shape. `'*'` becomes `shared`. */
export const toLegacyExport = (
  rows: Array<{ key: string; language: string; published_value: unknown }>,
  ignoredDrafts: number,
  exportedAt = new Date().toISOString(),
): LegacyExport => {
  const published: LegacyExport['published'] = { de: {}, en: {}, ar: {}, shared: {} }

  for (const row of rows) {
    const slot = row.language === '*' ? 'shared' : row.language
    if (slot === 'de' || slot === 'en' || slot === 'ar' || slot === 'shared') {
      published[slot][row.key] = row.published_value
    }
  }

  return { format: 'legacy-content-export', version: 1, exportedAt, published, ignoredDrafts }
}

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)

  return index >= 0 ? process.argv[index + 1] : undefined
}

if (import.meta.main) {
  const out = argument('--out')
  const url = process.env.DATABASE_URL?.trim()

  if (!out) throw new Error('Pass --out <file> for the export')
  if (!url) throw new Error('DATABASE_URL (the legacy database) is not set')

  const client = new Client({ connectionString: url })
  await client.connect()

  try {
    await client.query('BEGIN TRANSACTION READ ONLY')
    const { rows } = await client.query(LEGACY_EXPORT_SQL)
    const drafts = await client.query<{ total: string }>(LEGACY_DRAFT_COUNT_SQL)
    await client.query('COMMIT')

    const exported = toLegacyExport(rows, Number(drafts.rows[0]?.total ?? 0))
    await writeFile(out, `${JSON.stringify(exported, null, 2)}\n`, 'utf8')

    const counts = Object.entries(exported.published)
      .map(([slot, values]) => `${slot} ${Object.keys(values).length}`)
      .join(', ')
    console.log(`Exported published legacy overrides (${counts}); ${exported.ignoredDrafts} drafts left out.`)
    console.log(`Wrote ${out}. Nothing was changed in any database.`)
  } finally {
    await client.end()
  }
}
