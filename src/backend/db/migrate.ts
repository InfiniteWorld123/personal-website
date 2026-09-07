import 'dotenv/config'

import { readFile, readdir } from 'node:fs/promises'

import { pool } from './pool'

const migrationsDirectory = new URL('./migrations/', import.meta.url)

export async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort()

  const applied = await pool.query<{ name: string }>('SELECT name FROM schema_migrations')
  const appliedNames = new Set(applied.rows.map((migration) => migration.name))

  for (const migrationFile of migrationFiles) {
    if (appliedNames.has(migrationFile)) continue

    const sql = await readFile(new URL(migrationFile, migrationsDirectory), 'utf8')
    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migrationFile])
      await client.query('COMMIT')

      console.log(`Applied migration: ${migrationFile}`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}

try {
  await runMigrations()
  console.log('Database migrations are up to date.')
} finally {
  await pool.end()
}
