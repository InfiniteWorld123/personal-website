import { AsyncLocalStorage } from 'node:async_hooks'
import { Pool, type PoolClient, type QueryResultRow } from 'pg'

/**
 * The V2 database, and nothing else.
 *
 * A separate module from `src/backend/db/client.ts` on purpose. Backend2 must
 * be able to outlive the legacy backend, and — far more importantly — it must
 * be incapable of reaching the legacy database at all.
 */

/**
 * The database as a service sees it: it may run a query and read the rows back,
 * and nothing else. It may not take a connection out of the pool, open its own
 * transaction, or close anything.
 *
 * Narrow on purpose, and narrower than `pg.QueryResult`. Requiring only `rows`
 * is what lets the integration suite hand the whole application a real
 * PostgreSQL that is not `pg` at all.
 */
export type Db = {
  query: <R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: R[] }>
}

/**
 * The V2 connection string, checked rather than trusted.
 *
 * A typo that points `DATABASE_URL_V2` at the legacy database would let V2
 * write into tables the foundation says it may never touch. So it is refused
 * here, at the only place a connection is ever opened, instead of being
 * written down as a rule somebody has to remember.
 */
export const readDatabaseUrl = (
  environment: Record<string, string | undefined> = process.env,
): string => {
  const url = environment.DATABASE_URL_V2?.trim()

  if (!url) {
    throw new Error(
      'DATABASE_URL_V2 is missing. Backend2 uses its own database; set it in .env ' +
        '(see docs/v2/projects-backend.md §13).',
    )
  }

  if (url === environment.DATABASE_URL?.trim()) {
    throw new Error(
      'DATABASE_URL_V2 is the same as DATABASE_URL. V2 must never share the legacy ' +
        'database. Create a separate database and point DATABASE_URL_V2 at it.',
    )
  }

  return url
}

/** True when the V2 database is configured at all. Public routes need this. */
export const isDatabaseConfigured = (
  environment: Record<string, string | undefined> = process.env,
): boolean => {
  try {
    readDatabaseUrl(environment)

    return true
  } catch {
    return false
  }
}

/**
 * True inside a Cloudflare Worker. A Worker may not reuse a socket between
 * requests, so a pool that outlives a request holds connections that are
 * already dead.
 */
export const isWorkerRuntime = (): boolean =>
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers'

let sharedPool: Pool | undefined
const requestPool = new AsyncLocalStorage<{ pool?: Pool }>()

/*
 * On Cloudflare, V2 connects through its own Hyperdrive binding when one is
 * configured (`HYPERDRIVE_V2`): Hyperdrive keeps warm connections to the
 * database, so a request does not pay for a fresh TLS handshake to Neon.
 * Without the binding the Worker connects to `DATABASE_URL_V2` directly, which
 * works, only slower. Resolved on first use, like the legacy client, because
 * a top-level await would break the Worker's module graph.
 */
let hyperdriveV2Url: string | undefined
let hyperdriveV2Resolution: Promise<void> | undefined

const resolveHyperdriveV2 = (): Promise<void> =>
  (hyperdriveV2Resolution ??= (async () => {
    try {
      const specifier = ['cloudflare', 'workers'].join(':')
      const workerModule = (await import(/* @vite-ignore */ specifier)) as { env?: Record<string, unknown> }
      const binding = workerModule.env?.HYPERDRIVE_V2 as { connectionString?: string } | undefined

      hyperdriveV2Url = binding?.connectionString
    } catch {
      hyperdriveV2Url = undefined
    }
  })())

const getPool = (): Pool => {
  const scope = requestPool.getStore()

  if (scope) {
    // `readDatabaseUrl` still runs first: V2 is only "configured" with its own URL.
    const configured = readDatabaseUrl()

    return (scope.pool ??= new Pool({
      connectionString: hyperdriveV2Url ?? configured,
      max: 5,
      connectionTimeoutMillis: 10_000,
    }))
  }

  return (sharedPool ??= new Pool({ connectionString: readDatabaseUrl() }))
}

export const closePool = async (): Promise<void> => {
  const scope = requestPool.getStore()
  const pool = scope ? scope.pool : sharedPool

  if (scope) scope.pool = undefined
  else sharedPool = undefined

  await pool?.end().catch(() => {})
}

/**
 * The database for the current call: a transaction if one is open, an injected
 * handle if a test provided one, otherwise the pool.
 *
 * The injection point is what lets the integration suite run the real SQL
 * against PGlite — a genuine PostgreSQL, in process, with no server and no
 * account (`docs/v2/projects-backend.md` §12.2).
 */
const activeConnection = new AsyncLocalStorage<Db>()
const injectedDb = new AsyncLocalStorage<Db>()

export const getDb = (): Db => activeConnection.getStore() ?? injectedDb.getStore() ?? getPool()

/** Runs `fn` with `db` as the database for every call beneath it. */
export const runWithDb = <T>(db: Db, fn: () => Promise<T>): Promise<T> => injectedDb.run(db, fn)

/** Runs one request with a connection that does not outlive it. */
export const withRequestScope = async <T>(fn: () => Promise<T>): Promise<T> => {
  if (!isWorkerRuntime() || injectedDb.getStore()) return fn()

  await resolveHyperdriveV2()

  return requestPool.run({}, async () => {
    try {
      return await fn()
    } finally {
      await closePool()
    }
  })
}

/**
 * Runs `fn` inside BEGIN/COMMIT, rolling back on throw. Every `getDb()`
 * reached from `fn` — however deep — sees the same connection.
 *
 * Called from inside another transaction it **joins** that one rather than
 * opening a second. A second connection would see none of the outer
 * transaction's uncommitted rows, and would wait for ever on any row the outer
 * transaction has locked.
 */
export const withTransaction = async <T>(fn: (db: Db) => Promise<T>): Promise<T> => {
  const open = activeConnection.getStore()

  if (open) return fn(open)

  const injected = injectedDb.getStore()

  if (injected) {
    await injected.query('BEGIN')

    try {
      const result = await activeConnection.run(injected, () => fn(injected))
      await injected.query('COMMIT')

      return result
    } catch (error) {
      await injected.query('ROLLBACK').catch(() => {})

      throw error
    }
  }

  const connection: PoolClient = await getPool().connect()

  try {
    await connection.query('BEGIN')
    const result = await activeConnection.run(connection, () => fn(connection))
    await connection.query('COMMIT')

    connection.release()

    return result
  } catch (error) {
    // A failed ROLLBACK must not replace the error that caused it.
    await connection.query('ROLLBACK').catch(() => {})
    connection.release(error instanceof Error ? error : new Error(String(error)))

    throw error
  }
}
