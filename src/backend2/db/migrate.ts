import 'dotenv/config'

import { readFile, readdir } from 'node:fs/promises'

import { closePool, getDb, readDatabaseUrl } from './client'

const migrationsDirectory = new URL('./migrations/', import.meta.url)

/**
 * The V2 migration history: its own ledger table (`v2_schema_migrations`)
 * and its own directory.
 */
export const runV2Migrations = async (): Promise<string[]> => {
  // Throws when DATABASE_URL_V2 is missing.
  readDatabaseUrl()

  const db = getDb()

  await db.query(`
    CREATE TABLE IF NOT EXISTS v2_schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const files = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort()

  const applied = await db.query<{ name: string }>('SELECT name FROM v2_schema_migrations')
  const appliedNames = new Set(applied.rows.map((row) => row.name))
  const ran: string[] = []

  for (const file of files) {
    if (appliedNames.has(file)) continue

    const sql = await readFile(new URL(file, migrationsDirectory), 'utf8')

    // One transaction per file: a migration either lands whole or not at all.
    await db.query('BEGIN')

    try {
      await db.query(sql)
      await db.query('INSERT INTO v2_schema_migrations (name) VALUES ($1)', [file])
      await db.query('COMMIT')
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {})

      throw error
    }

    ran.push(file)
  }

  return ran
}

/** The migration SQL, for the in-process test database. */
export const readMigrationSql = async (): Promise<Array<{ name: string; sql: string }>> => {
  const files = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort()

  return Promise.all(
    files.map(async (name) => ({
      name,
      sql: await readFile(new URL(name, migrationsDirectory), 'utf8'),
    })),
  )
}

// Run only when executed directly, so importing this file in a test does not
// open a connection to anything.
if (import.meta.main) {
  try {
    const ran = await runV2Migrations()

    for (const name of ran) console.log(`Applied V2 migration: ${name}`)
    console.log(`V2 database migrations are up to date (${ran.length} applied).`)
  } finally {
    await closePool()
  }
}
