import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

/**
 * A real PostgreSQL for the Projects integration suite.
 *
 * PGlite is PostgreSQL compiled to WebAssembly: the same SQL, the same
 * constraints, the same deferred unique indexes — running inside the test
 * process with no server, no account and no connection string. That is why
 * these tests prove the module rather than skipping when a database is not
 * configured, and why they can never touch the legacy or development database.
 */

const migrationsDirectory = new URL('../../backend2/db/migrations/', import.meta.url)

export type TestDatabase = {
  db: { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> }
  reset: () => Promise<void>
  close: () => Promise<void>
}

export const createTestDatabase = async (): Promise<TestDatabase> => {
  const pglite = new PGlite()

  const files = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort()

  for (const file of files) {
    await pglite.exec(await readFile(new URL(file, migrationsDirectory), 'utf8'))
  }

  return {
    db: {
      query: async (text: string, values?: unknown[]) =>
        (await pglite.query(text, values as unknown[])) as { rows: any[] },
    },
    /**
     * Empties every table without rebuilding the schema.
     *
     * Read from the catalogue rather than written out by hand: a table added
     * in a later migration is emptied between tests the day it appears, which
     * is how the Auth tables joined without anyone editing this list.
     */
    reset: async () => {
      const { rows } = (await pglite.query(
        `SELECT tablename FROM pg_tables
          WHERE schemaname = 'public'
            AND tablename LIKE 'v2\\_%'
            AND tablename <> 'v2_schema_migrations'`,
      )) as { rows: Array<{ tablename: string }> }

      if (rows.length === 0) return

      await pglite.exec(
        `TRUNCATE ${rows.map((row) => row.tablename).join(', ')} RESTART IDENTITY CASCADE`,
      )
    },
    close: () => pglite.close(),
  }
}

/** An in-memory image store, so a test never writes a file anywhere. */
export const createMemoryStore = () => {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>()

  return {
    objects,
    store: {
      async put({ key, body, contentType }: { key: string; body: Uint8Array; contentType: string }) {
        objects.set(key, { bytes: body.slice(), contentType })
      },
      async get(key: string) {
        const object = objects.get(key)

        if (!object) return null

        return {
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(object.bytes)
              controller.close()
            },
          }),
          contentType: object.contentType,
        }
      },
      async remove(key: string) {
        objects.delete(key)
      },
    },
  }
}

/** The smallest real PNG the probe will accept, at the size asked for. */
export const pngBytes = (width: number, height: number): Uint8Array<ArrayBuffer> => {
  const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  const bytes = new Uint8Array(new ArrayBuffer(64))

  bytes.set(header, 0)
  // IHDR length + type, then the dimensions the probe reads at offsets 16/20.
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8)

  const view = new DataView(bytes.buffer)

  view.setUint32(16, width)
  view.setUint32(20, height)

  return bytes
}
