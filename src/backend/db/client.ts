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

/**
 * The process-wide pool. Better Auth needs a real `pg.Pool`, and the CLI
 * entry points need something they can close; application code does not.
 */
export const getPool = (): Pool => (sharedPool ??= new Pool({ connectionString: env.DATABASE_URL }))

/** Closes the shared pool. For CLI entry points only — never during a request. */
export const closePool = async (): Promise<void> => {
  await sharedPool?.end()
  sharedPool = undefined
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
 */
export const withTransaction = async <T>(fn: (db: Db) => Promise<T>): Promise<T> => {
  const connection: PoolClient = await getPool().connect()

  try {
    await connection.query('BEGIN')
    const result = await activeConnection.run(connection, () => fn(connection))
    await connection.query('COMMIT')

    return result
  } catch (error) {
    await connection.query('ROLLBACK')
    throw error
  } finally {
    connection.release()
  }
}
