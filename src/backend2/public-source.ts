import { isDatabaseConfigured } from './db/client'

/**
 * Which backend a public page reads: the legacy one, or Backend2.
 *
 * `docs/v2/public-cutover.md` moves the public site one module at a time, and
 * each move must be undoable without shipping old code again. So the choice is
 * a server setting, read on every request:
 *
 *   PUBLIC_V2_MODULES=content,services
 *
 * A module that is not listed stays on the legacy backend — which is also the
 * answer everywhere when the variable is unset, so nothing changes on the live
 * site until the owner approves a step and the setting is added. A listed
 * module still falls back to legacy when no V2 database is configured, because
 * a page that cannot reach its data is worse than yesterday's page.
 */

export const PUBLIC_V2_MODULES = ['content', 'services', 'projects', 'blog', 'booking', 'contact', 'assistant'] as const

export type PublicModule = (typeof PUBLIC_V2_MODULES)[number]

type Env = Record<string, string | undefined>

export const publicV2Modules = (environment: Env = process.env): ReadonlySet<PublicModule> => {
  const listed = (environment.PUBLIC_V2_MODULES ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name): name is PublicModule => (PUBLIC_V2_MODULES as readonly string[]).includes(name))

  return new Set(listed)
}

export const readsFromV2 = (module: PublicModule, environment: Env = process.env): boolean =>
  publicV2Modules(environment).has(module) && isDatabaseConfigured(environment)
