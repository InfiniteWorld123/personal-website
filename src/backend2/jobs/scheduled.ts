import { sweepChallenges } from '../auth/challenges'
import { sweepRateLimits } from '../auth/rate-limit'
import { sweepSessions } from '../auth/session'
import { isDatabaseConfigured, withRequestScope } from '../db/client'
import { resolveMediaStore } from '../media/store'
import { purgeExpiredConversations } from '../modules/assistant/assistant.service'
import { publishDuePosts } from '../modules/blog/post.due'
import { sendDueReminders } from '../modules/booking/appointment.service'
import { runBilling } from '../modules/invoices/subscription.billing'
import { sweepPendingObjects } from '../modules/media/media.service'

/**
 * Backend2's periodic jobs, in one place, for the Worker's Cron Trigger.
 *
 * Every job here already existed as its own `bun run db2:…` command and is
 * idempotent: each claims or locks what it works on, so running it every few
 * minutes — or twice at once — does each piece of work exactly once, and with
 * nothing due it changes nothing. This file only decides *when* each runs and
 * makes sure one failure cannot stop the others.
 *
 * Cadence. The Cron Trigger fires every few minutes (`docs/v2/public-cutover.md`
 * §"Scheduled jobs"). The time-sensitive jobs — a scheduled article going live,
 * a visitor's reminder — run on every tick. The housekeeping jobs run once an
 * hour, on the tick whose scheduled minute is `:00`; they have no deadline
 * finer than that, and running them less often keeps each tick cheap.
 *
 * Nothing runs unless the V2 database is configured.
 */

export type JobOutcome = {
  /** Counts only — never ids, keys, names or addresses, which are client data. */
  counts: Record<string, number>
  /** Items the job took but could not finish; they are retried next time. */
  failures?: number
  /** Why the job decided not to run in this environment. */
  skipped?: string
}

export type ScheduledJob = {
  name: string
  cadence: 'every-tick' | 'hourly'
  run: (now: Date) => Promise<JobOutcome>
}

export type JobResult = {
  job: string
  status: 'ok' | 'partial' | 'failed' | 'skipped'
  ms: number
  counts?: Record<string, number>
  failures?: number
  reason?: string
  error?: string
}

export type ScheduledRunSummary = {
  scheduledTime: string
  skipped?: 'v2-database-not-configured'
  results: JobResult[]
}

export const SCHEDULED_JOBS: readonly ScheduledJob[] = [
  {
    // docs/v2/blog.md: a schedule goes live on time with no visitor traffic.
    name: 'blog.publish-due',
    cadence: 'every-tick',
    run: async (now) => {
      const { published, failed } = await publishDuePosts({ now })

      return { counts: { published: published.length }, failures: failed }
    },
  },
  {
    // docs/v2/booking.md: one visitor reminder at the configured time.
    name: 'booking.send-reminders',
    cadence: 'every-tick',
    run: async (now) => {
      const { sent, failed } = await sendDueReminders(now)

      return { counts: { sent }, failures: failed }
    },
  },
  {
    // docs/v2/invoices.md: subscription periods, due card charges and retries,
    // prepared reminders. Test mode unless INVOICES_LIVE_ENABLED=true.
    name: 'invoices.run-billing',
    cadence: 'hourly',
    run: async () => {
      const summary = await runBilling()

      return {
        counts: {
          subscriptions: summary.subscriptions,
          periodsDecided: summary.periodsDecided,
          draftsCreated: summary.draftsCreated,
          invoicesIssued: summary.invoicesIssued,
          chargesAttempted: summary.chargesAttempted,
          chargesFailed: summary.chargesFailed,
          noticesPrepared: summary.noticesPrepared,
        },
        failures: summary.errors.length,
      }
    },
  },
  {
    // docs/v2/ai-assistant.md: the owner's retention setting; `manual` deletes nothing.
    name: 'assistant.purge',
    cadence: 'hourly',
    run: async (): Promise<JobOutcome> => {
      const { mode, deleted } = await purgeExpiredConversations()

      return mode === 'manual' ? { counts: {}, skipped: 'retention is manual' } : { counts: { deleted } }
    },
  },
  {
    // docs/v2/media.md: finishes interrupted deletions only (24 h grace).
    // Never deletes a file simply because nothing uses it.
    name: 'media.sweep-pending',
    cadence: 'hourly',
    run: async (now): Promise<JobOutcome> => {
      const store = await resolveMediaStore()

      if (!store) return { counts: {}, skipped: 'no media storage in this environment' }

      const { removed, failed } = await sweepPendingObjects({ store, now })

      return { counts: { removed: removed.length }, failures: failed.length }
    },
  },
  {
    // Spent sign-in challenges, long-closed rate-limit windows (also written by
    // public comments and the assistant) and long-dead sessions. The sign-in
    // paths still sweep too; this keeps the tables small between sign-ins.
    name: 'auth.housekeeping',
    cadence: 'hourly',
    run: async () => {
      await sweepChallenges()
      await sweepRateLimits()
      await sweepSessions()

      return { counts: {} }
    },
  },
]

export const isHourlyTick = (now: Date): boolean => now.getUTCMinutes() === 0

/**
 * Keeps secrets out of logs: a connection string's credentials and anything
 * shaped like an API key are replaced before a message is written anywhere.
 */
export const redactForLog = (text: string): string =>
  text
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/giu, '$1<redacted>@')
    .replace(/\b(?:sk|rk|pk|whsec)_(?:live|test)?_?[A-Za-z0-9]{8,}/gu, '<redacted>')
    .replace(/\bre_[A-Za-z0-9_]{16,}/gu, '<redacted>')
    .slice(0, 300)

const errorText = (error: unknown): string =>
  redactForLog(error instanceof Error ? `${error.name}: ${error.message}` : String(error))

const log = (entry: Record<string, unknown>, level: 'info' | 'error' = 'info'): void => {
  const line = JSON.stringify({ event: 'backend2.scheduled', ...entry })

  if (level === 'error') console.error(line)
  else console.log(line)
}

const runOne = async (job: ScheduledJob, now: Date): Promise<JobResult> => {
  const startedAt = Date.now()

  try {
    const outcome = await job.run(now)
    const ms = Date.now() - startedAt

    if (outcome.skipped) return { job: job.name, status: 'skipped', ms, reason: outcome.skipped }

    const failures = outcome.failures ?? 0

    return {
      job: job.name,
      status: failures > 0 ? 'partial' : 'ok',
      ms,
      counts: outcome.counts,
      ...(failures > 0 ? { failures } : {}),
    }
  } catch (error) {
    return { job: job.name, status: 'failed', ms: Date.now() - startedAt, error: errorText(error) }
  }
}

/**
 * Runs every job due at `now`, one after another.
 *
 * Sequential on purpose: a Worker may hold only six sockets at once, and the
 * jobs share one short-lived connection pool (`withRequestScope`). A job that
 * throws is recorded as `failed` and the next one still runs.
 */
export const runScheduledJobs = async (
  now: Date,
  options: {
    jobs?: readonly ScheduledJob[]
    environment?: Record<string, string | undefined>
  } = {},
): Promise<ScheduledRunSummary> => {
  const scheduledTime = now.toISOString()

  if (!isDatabaseConfigured(options.environment)) {
    log({ scheduledTime, status: 'skipped', reason: 'v2-database-not-configured' })

    return { scheduledTime, skipped: 'v2-database-not-configured', results: [] }
  }

  const hourly = isHourlyTick(now)
  const due = (options.jobs ?? SCHEDULED_JOBS).filter((job) => job.cadence === 'every-tick' || hourly)

  return withRequestScope(async () => {
    const results: JobResult[] = []

    for (const job of due) {
      const result = await runOne(job, now)

      results.push(result)
      log({ scheduledTime, ...result }, result.status === 'failed' || result.status === 'partial' ? 'error' : 'info')
    }

    log({
      scheduledTime,
      summary: true,
      hourly,
      ran: results.length,
      failed: results.filter((result) => result.status === 'failed').length,
    })

    return { scheduledTime, results }
  })
}
