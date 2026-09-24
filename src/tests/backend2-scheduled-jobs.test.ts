import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStore, createTestDatabase } from './helpers/backend2-db'
import { blogHarness } from './helpers/backend2-blog'

/**
 * Backend2's periodic jobs as the Worker's Cron Trigger runs them
 * (`src/backend2/jobs/`), against a real PostgreSQL inside this process.
 *
 * What is under test: every job runs, one failing job cannot stop the others,
 * nothing happens without a V2 database, a tick with nothing due changes
 * nothing, a second tick redoes nothing — and the in-process hand-off from
 * the Nitro plugin cannot be triggered from outside the isolate.
 */
process.env.DATABASE_URL = 'postgres://legacy.invalid/legacy'
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
delete process.env.BACKEND2_OWNER_AUTH

const { createAppForTest, handleApiV2Request } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { useMediaStoreForTest } = await import('#/backend2/media/store')
const { runScheduledJobs, SCHEDULED_JOBS, redactForLog } = await import('#/backend2/jobs/scheduled')
const { createScheduledHandoff, SCHEDULED_HANDOFF_HEADER, SCHEDULED_HANDOFF_PATH } = await import(
  '#/backend2/jobs/handoff'
)
const plugin = (await import('#/backend2/jobs/cloudflare-scheduled.plugin')).default
const contract = await import('#/backend2/contracts/blog.contract')

type ScheduledJob = (typeof SCHEDULED_JOBS)[number]

const database = await createTestDatabase()
const app = createAppForTest()
const { makePublishable, schedule } = blogHarness({ database, app, runWithDb })
let storage = createMemoryStore()

beforeEach(async () => {
  await database.reset()
  storage = createMemoryStore()
  useMediaStoreForTest(storage.store)
})

afterEach(() => {
  useMediaStoreForTest(undefined)
  vi.restoreAllMocks()
})

afterAll(async () => {
  useMediaStoreForTest(undefined)
  await database.close()
})

/* ---------------------------------------------------------------- plumbing */

const DAY = 24 * 60 * 60 * 1000

/** The most recent `:00` — the tick on which the hourly jobs run too. */
const hourlyTick = (): Date => {
  const now = new Date()

  now.setUTCMinutes(0, 0, 0)

  return now
}

const quarterPastTick = (): Date => new Date(hourlyTick().getTime() - 45 * 60 * 1000)

const run = (now: Date, options?: Parameters<typeof runScheduledJobs>[1]) =>
  runWithDb(database.db, () => runScheduledJobs(now, options))

const quiet = () => ({
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
})

const rowCounts = async (): Promise<Record<string, number>> => {
  const { rows } = await database.db.query(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename LIKE 'v2\\_%' AND tablename <> 'v2_schema_migrations'
      ORDER BY tablename`,
  )
  const counts: Record<string, number> = {}

  for (const { tablename } of rows) {
    counts[tablename] = Number((await database.db.query(`SELECT count(*)::int AS n FROM ${tablename}`)).rows[0].n)
  }

  return counts
}

const byJob = (results: Array<{ job: string }>) => Object.fromEntries(results.map((result) => [result.job, result]))

/** An article scheduled for tomorrow, then moved before the tick the test runs as. */
const dueArticle = async (): Promise<string> => {
  const id = await makePublishable('scheduled-article')
  const tomorrow = contract.instantToBerlinWallTime(new Date(Date.now() + DAY)).date
  const scheduled = await schedule(id, { date: tomorrow, time: '09:30' })

  expect(scheduled.status, JSON.stringify(scheduled.body)).toBe(200)

  await database.db.query(`UPDATE v2_blog_posts SET scheduled_for = now() - interval '2 hours' WHERE id = $1`, [id])

  return id
}

/** A key whose deletion a crash interrupted a day and more ago. */
const interruptedDeletion = async (key = 'v2/2026/09/orphan.png') => {
  await storage.store.put({ key, body: new Uint8Array([1, 2, 3]), contentType: 'image/png' })
  await database.db.query(
    `INSERT INTO v2_media_pending_objects (storage_key, purpose, created_at)
     VALUES ($1, 'delete', now() - interval '25 hours')`,
    [key],
  )
}

/* ---------------------------------------------------------------- the run */

describe('runScheduledJobs', () => {
  it('runs every job on the hourly tick and changes nothing when nothing is due', async () => {
    quiet()
    const before = await rowCounts()

    const summary = await run(hourlyTick())
    const results = byJob(summary.results)

    expect(Object.keys(results)).toEqual(SCHEDULED_JOBS.map((job) => job.name))
    expect(results['blog.publish-due']).toMatchObject({ status: 'ok', counts: { published: 0 } })
    expect(results['booking.send-reminders']).toMatchObject({ status: 'ok', counts: { sent: 0 } })
    expect(results['invoices.run-billing']).toMatchObject({ status: 'ok', counts: { subscriptions: 0, chargesAttempted: 0 } })
    expect(results['assistant.purge']).toMatchObject({ status: 'skipped', reason: 'retention is manual' })
    expect(results['media.sweep-pending']).toMatchObject({ status: 'ok', counts: { removed: 0 } })
    expect(results['auth.housekeeping']).toMatchObject({ status: 'ok' })
    expect(await rowCounts()).toEqual(before)
  })

  it('runs only the time-sensitive jobs between the hourly ticks', async () => {
    quiet()

    const summary = await run(quarterPastTick())

    expect(summary.results.map((result) => result.job)).toEqual(['blog.publish-due', 'booking.send-reminders'])
  })

  it('does the work that is due, once — a second tick finds nothing left', async () => {
    quiet()
    const articleId = await dueArticle()
    await interruptedDeletion()
    await database.db.query(
      `INSERT INTO v2_assistant_settings (id, enabled, retention_mode, retention_days) VALUES (1, false, 'days', 30)`,
    )
    await database.db.query(
      `INSERT INTO v2_assistant_conversations (token_hash, language, last_message_at)
       VALUES ($1, 'en', now() - interval '40 days'), ($2, 'en', now() - interval '2 days')`,
      ['a'.repeat(64), 'b'.repeat(64)],
    )

    const first = byJob((await run(hourlyTick())).results)

    expect(first['blog.publish-due']).toMatchObject({ status: 'ok', counts: { published: 1 } })
    expect(first['media.sweep-pending']).toMatchObject({ status: 'ok', counts: { removed: 1 } })
    expect(first['assistant.purge']).toMatchObject({ status: 'ok', counts: { deleted: 1 } })

    const post = (await database.db.query('SELECT scheduled_for, published_at FROM v2_blog_posts WHERE id = $1', [articleId])).rows[0]
    expect(post.scheduled_for).toBeNull()
    expect(post.published_at).not.toBeNull()
    expect(storage.objects.size).toBe(0)
    expect((await database.db.query('SELECT count(*)::int AS n FROM v2_assistant_conversations')).rows[0].n).toBe(1)

    const second = byJob((await run(hourlyTick())).results)

    expect(second['blog.publish-due']).toMatchObject({ counts: { published: 0 } })
    expect(second['media.sweep-pending']).toMatchObject({ counts: { removed: 0 } })
    expect(second['assistant.purge']).toMatchObject({ counts: { deleted: 0 } })
  })

  it('keeps going when a job fails, and keeps secrets out of the log', async () => {
    const { error, log } = quiet()
    const ran: string[] = []
    const jobs: ScheduledJob[] = [
      {
        name: 'broken',
        cadence: 'every-tick',
        run: async () => {
          ran.push('broken')
          throw new Error('connect failed for postgres://owner:hunter2-secret@db.example/v2 with sk_test_abcdefgh12345678')
        },
      },
      {
        name: 'partial',
        cadence: 'every-tick',
        run: async () => {
          ran.push('partial')

          return { counts: { done: 2 }, failures: 1 }
        },
      },
      {
        name: 'fine',
        cadence: 'every-tick',
        run: async () => {
          ran.push('fine')

          return { counts: { done: 1 } }
        },
      },
    ]

    const summary = await run(quarterPastTick(), { jobs })

    expect(ran).toEqual(['broken', 'partial', 'fine'])
    expect(summary.results.map((result) => result.status)).toEqual(['failed', 'partial', 'ok'])
    expect(summary.results[0].error).toContain('<redacted>')

    const written = [...error.mock.calls, ...log.mock.calls].flat().join('\n')

    expect(written).not.toContain('hunter2-secret')
    expect(written).not.toContain('sk_test_abcdefgh12345678')
    // One structured line per job, plus the summary.
    expect(written.split('\n').filter((line) => line.includes('"backend2.scheduled"'))).toHaveLength(4)
  })

  it('does nothing at all without a V2 database', async () => {
    quiet()
    const job = { name: 'never', cadence: 'every-tick' as const, run: vi.fn(async () => ({ counts: {} })) }

    const noUrl = await run(hourlyTick(), { jobs: [job], environment: {} })
    const sameAsLegacy = await run(hourlyTick(), {
      jobs: [job],
      environment: { DATABASE_URL: 'postgres://same/db', DATABASE_URL_V2: 'postgres://same/db' },
    })

    expect(noUrl).toMatchObject({ skipped: 'v2-database-not-configured', results: [] })
    expect(sameAsLegacy).toMatchObject({ skipped: 'v2-database-not-configured', results: [] })
    expect(job.run).not.toHaveBeenCalled()
  })

  it('redacts credentials and keys from any text it logs', () => {
    expect(redactForLog('postgresql://u:p@host/db')).toBe('postgresql://<redacted>@host/db')
    expect(redactForLog('key sk_live_1234567890abcdef and re_abcdefghijklmnopqrstu')).toBe('key <redacted> and <redacted>')
  })
})

/* ------------------------------------------------------ the Worker's cron */

describe('the cloudflare:scheduled hook', () => {
  type Hook = (event: { controller: { scheduledTime: number; cron: string }; env: unknown }) => Promise<void>

  const install = () => {
    let hook: Hook | undefined
    const fetch = vi.fn((request: Request) => handleApiV2Request(request))

    plugin({
      fetch,
      hooks: {
        hook: (name: string, handler: Hook) => {
          expect(name).toBe('cloudflare:scheduled')
          hook = handler
        },
      },
    })

    expect(hook).toBeDefined()

    return { hook: hook!, fetch }
  }

  it('hands the tick to Backend2, which runs the jobs', async () => {
    quiet()
    await interruptedDeletion()
    const { hook, fetch } = install()

    await runWithDb(database.db, () =>
      hook({ controller: { scheduledTime: hourlyTick().getTime(), cron: '*/5 * * * *' }, env: { DATABASE_URL_V2: 'postgres://v2.invalid/v2' } }),
    )

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(storage.objects.size).toBe(0)
    expect((await database.db.query('SELECT count(*)::int AS n FROM v2_media_pending_objects')).rows[0].n).toBe(0)
  })

  it('does not even wake the server bundle on a Worker without a V2 database', async () => {
    quiet()
    const { hook, fetch } = install()

    await hook({ controller: { scheduledTime: Date.now(), cron: '*/5 * * * *' }, env: {} })

    expect(fetch).not.toHaveBeenCalled()
  })

  it('cannot be triggered from outside: a guessed or replayed token is just "Route not found"', async () => {
    quiet()
    await interruptedDeletion()

    const guessed = await runWithDb(database.db, () =>
      handleApiV2Request(
        new Request(`https://example.com${SCHEDULED_HANDOFF_PATH}`, {
          headers: { [SCHEDULED_HANDOFF_HEADER]: 'f'.repeat(64) },
        }),
      ),
    )

    expect(guessed.status).toBe(404)
    expect(storage.objects.size).toBe(1)

    const genuine = createScheduledHandoff(hourlyTick().getTime())
    const replay = genuine.clone()

    expect((await runWithDb(database.db, () => handleApiV2Request(genuine))).status).toBe(200)
    expect(storage.objects.size).toBe(0)

    await interruptedDeletion('v2/2026/09/second.png')

    expect((await runWithDb(database.db, () => handleApiV2Request(replay))).status).toBe(404)
    expect(storage.objects.size).toBe(1)
  })
})
