import { mkdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

/**
 * A V2 database on this machine, for development.
 *
 * PGlite is PostgreSQL compiled to WebAssembly, and this puts it behind a
 * socket speaking the real wire protocol — so `pg`, the pool and every query
 * in Backend2 talk to it exactly as they would to Neon, with no account, no
 * connection string to obtain and no risk of touching the legacy database.
 *
 * It is a convenience, not a decision: `DATABASE_URL_V2` may point at a real
 * PostgreSQL whenever the owner prefers. The data lives in `.backend2-media/`'s
 * sibling directory and is gitignored with it.
 *
 *   bun run db2:dev            # leave it running
 *   DATABASE_URL_V2=postgres://postgres@127.0.0.1:5433/postgres bun run dev
 */
const PORT = Number(process.env.BACKEND2_DEV_DB_PORT ?? 5433)
const DATA_DIRECTORY = '.backend2-db'

await mkdir(DATA_DIRECTORY, { recursive: true })

const pglite = await PGlite.create({ dataDir: DATA_DIRECTORY })
const server = new PGLiteSocketServer({ db: pglite, port: PORT, host: '127.0.0.1' })

await server.start()

console.log(`V2 development database listening on 127.0.0.1:${PORT}`)
console.log(`DATABASE_URL_V2=postgres://postgres@127.0.0.1:${PORT}/postgres`)

const stop = async () => {
  await server.stop()
  await pglite.close()
  process.exit(0)
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
