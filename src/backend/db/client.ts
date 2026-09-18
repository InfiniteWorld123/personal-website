import { AsyncLocalStorage } from 'node:async_hooks'
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg'
import { env } from '#/shared/env'

/**
 * The database as a service sees it. Deliberately narrower than `pg.Pool`:
 * a service may run a query and nothing else — it may not take a connection
 * out of the pool, open its own transaction, or close anything.
 *
 * Nothing outside this file imports a pool. On Cloudflare Workers a connection
 * comes from a per-request Hyperdrive binding rather than a long-lived pool,
 * and `getDb()` is the one place that has to learn the difference.
 */
export type Db = {
  query: <R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ) => Promise<QueryResult<R>>
}

let sharedPool: Pool | undefined
const requestPool = new AsyncLocalStorage<{ pool?: Pool }>()

/**
 * True inside a Cloudflare Worker. A Worker may not reuse a socket between
 * requests, so a pool that outlives a request holds connections that are
 * already dead — every second database request failed instantly until this
 * was found.
 */
export const isWorkerRuntime = (): boolean =>
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers'

/**
 * Hyperdrive's connection string, when the Worker has that binding.
 *
 * Connecting straight to Frankfurt costs a full TLS handshake on every single
 * request, because a Worker may not keep the socket. Hyperdrive holds the pool
 * on Cloudflare's side, so the handshake is theirs and already done.
 *
 * The specifier is held in a variable on purpose: `cloudflare:workers` only
 * exists inside a Worker, and a static import would break the Node build that
 * the server path still uses.
 */
let hyperdriveUrl: string | undefined
let hyperdriveResolution: Promise<void> | undefined

/**
 * Resolved on the first request rather than at module load. A top-level
 * `await` makes the whole module graph async, and Cloudflare then rejects the
 * upload with `The uploaded script has no registered event handlers` because
 * the default export is not there when it looks.
 */
const resolveHyperdriveUrl = (): Promise<void> =>
  (hyperdriveResolution ??= (async () => {
    try {
      const specifier = ['cloudflare', 'workers'].join(':')
      const workerModule = (await import(/* @vite-ignore */ specifier)) as {
        env?: Record<string, unknown>
      }
      const binding = workerModule.env?.HYPERDRIVE as { connectionString?: string } | undefined

      hyperdriveUrl = binding?.connectionString
    } catch {
      hyperdriveUrl = undefined
    }
  })())

/**
 * The pool for the current context. On a server it is process-wide and lives
 * for the life of the process. On a Worker it lasts one request and is closed
 * by `withRequestScope`.
 */
export const getPool = (): Pool => {
  const scope = requestPool.getStore()
  if (scope) {
    return (scope.pool ??= new Pool({
      connectionString: hyperdriveUrl ?? env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 10_000,
    }))
  }
  return (sharedPool ??= new Pool({ connectionString: env.DATABASE_URL }))
}

/** Closes the pool. CLI entry points, and the end of a Worker request. */
export const closePool = async (): Promise<void> => {
  const scope = requestPool.getStore()
  const pool = scope ? scope.pool : sharedPool
  if (scope) scope.pool = undefined
  else sharedPool = undefined

  await pool?.end().catch(() => {})
}

/**
 * A live handle on whatever `getPool()` currently returns. Better Auth takes a
 * `pg.Pool` once, at construction, and holds it forever; on a Worker that pool
 * is discarded after every request. This forwards each call to the current
 * one, so Better Auth never talks to a closed pool and does not have to be
 * rebuilt per request — which would cost CPU the free plan does not have.
 */
export const livePool = new Proxy({} as Pool, {
  get(_target, property) {
    const pool = getPool()
    const value = Reflect.get(pool, property, pool)

    return typeof value === 'function' ? value.bind(pool) : value
  },
  // Better Auth picks its adapter with `'connect' in db`. Without this trap the
  // question reaches the empty target, the answer is no, and it gives up with
  // `Failed to initialize database adapter`.
  has: (_target, property) => Reflect.has(getPool(), property),
  getPrototypeOf: () => Reflect.getPrototypeOf(getPool()),
})

/**
 * Runs one request with a database connection that does not outlive it.
 * A no-op on a server, where a long-lived pool is the right thing.
 */
export const withRequestScope = async <T>(fn: () => Promise<T>): Promise<T> => {
  if (!isWorkerRuntime()) return fn()

  await resolveHyperdriveUrl()

  return requestPool.run({}, async () => {
    try {
      return await fn()
    } finally {
      await closePool()
    }
  })
}

/**
 * Carries the transaction's connection down the call stack, so a service
 * called inside `withTransaction` joins that transaction without being passed
 * a handle. Same mechanism that will carry the per-request Workers client.
 */
const activeConnection = new AsyncLocalStorage<Db>()

/** The database for the current call. Inside a transaction, that transaction. */
export const getDb = (): Db => activeConnection.getStore() ?? getPool()

/**
 * Runs `fn` on one connection inside BEGIN/COMMIT, rolling back on throw.
 * Every `getDb()` reached from `fn` — however deep — sees the same connection.
 *
 * Called from inside another transaction it **joins** that one rather than
 * opening a second. Taking a second connection would be quietly catastrophic:
 * it sees none of the outer transaction's uncommitted rows, so a service that
 * writes a row and then calls a helper to finish it would find nothing there —
 * and it would wait for ever on any row the outer transaction has locked,
 * which is a deadlock with itself that no timeout in this codebase catches.
 *
 * There are no savepoints, so a nested failure is not contained: it propagates
 * and the outermost transaction rolls the whole act back. That is the right
 * answer here — every nested use is one business act, not a retryable step.
 */
export const withTransaction = async <T>(fn: (db: Db) => Promise<T>): Promise<T> => {
  const open = activeConnection.getStore()

  if (open) return fn(open)

  const connection: PoolClient = await getPool().connect()

  try {
    await connection.query('BEGIN')
    const result = await activeConnection.run(connection, () => fn(connection))
    await connection.query('COMMIT')

    connection.release()

    return result
  } catch (error) {
    // A failed ROLLBACK must not replace the error that caused it: on a Worker
    // the connection is often already broken, and its complaint says
    // nothing about what actually went wrong.
    await connection.query('ROLLBACK').catch(() => {})
    // `release(error)` is pg's signal to destroy the client rather than hand a
    // connection in an unknown state back to the pool.
    connection.release(error instanceof Error ? error : new Error(String(error)))

    throw error
  }
}
