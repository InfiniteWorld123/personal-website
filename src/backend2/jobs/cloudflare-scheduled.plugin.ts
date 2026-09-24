import { createScheduledHandoff, discardScheduledHandoff } from './handoff'

/**
 * Nitro runtime plugin: the Worker's Cron Trigger → Backend2's jobs.
 *
 * Registered in `vite.config.ts`. On the `cloudflare-module` preset Nitro
 * turns the Worker's `scheduled` event into the `cloudflare:scheduled` hook;
 * on every other runtime (Node, `vite dev`) the hook simply never fires.
 *
 * Nitro's own `scheduledTasks` was not used: it writes `triggers.crons` into
 * the generated `wrangler.json`, which the live Worker is deployed from, and
 * adding a cron to the live site is an owner decision for the cutover. Here
 * the build output stays unchanged; only a Worker whose config declares a cron
 * (today: the V2 preview) ever receives the event.
 *
 * Deliberately imports nothing from Backend2 except the tiny hand-off: the
 * jobs run inside the server bundle that already contains them (see
 * `handoff.ts`), so the Worker does not carry Backend2 twice.
 *
 * Kept free of `nitro` imports (`definePlugin` is the identity function) so the
 * test suite can load it without Nitro's virtual modules.
 */

type ScheduledEvent = {
  controller: { scheduledTime: number; cron: string }
  env: unknown
}

type NitroAppLike = {
  fetch: (request: Request) => Response | Promise<Response>
  hooks?: {
    hook: (name: 'cloudflare:scheduled', handler: (event: ScheduledEvent) => Promise<void>) => unknown
  }
}

/** Cheap first check, so a Worker without V2 never even loads the server bundle. */
const hasV2Database = (env: unknown): boolean => {
  const url = (env as Record<string, unknown> | null | undefined)?.DATABASE_URL_V2

  return typeof url === 'string' && url.trim() !== ''
}

export const handleScheduledEvent = async (nitroApp: NitroAppLike, event: ScheduledEvent): Promise<void> => {
  const { scheduledTime, cron } = event.controller

  if (!hasV2Database(event.env)) {
    console.log(JSON.stringify({ event: 'backend2.scheduled', cron, status: 'skipped', reason: 'v2-database-not-configured' }))

    return
  }

  const request = createScheduledHandoff(scheduledTime)

  try {
    const response = await nitroApp.fetch(request)

    if (!response.ok) {
      console.error(JSON.stringify({ event: 'backend2.scheduled', cron, status: 'handoff-failed', httpStatus: response.status }))
    }

    // Drain the body so the in-process response is not left open.
    await response.body?.cancel().catch(() => {})
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'backend2.scheduled',
        cron,
        status: 'handoff-failed',
        error: error instanceof Error ? error.name : 'Error',
      }),
    )
  } finally {
    discardScheduledHandoff(request)
  }
}

export default function backend2ScheduledPlugin(nitroApp: NitroAppLike): void {
  nitroApp.hooks?.hook('cloudflare:scheduled', (event) => handleScheduledEvent(nitroApp, event))
}
