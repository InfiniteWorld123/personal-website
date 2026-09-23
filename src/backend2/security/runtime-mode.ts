/**
 * Whether Backend2 is running as the production site.
 *
 * `NODE_ENV` alone is not enough. The build only freezes `process.env.NODE_ENV`
 * where the code spells it out literally; everywhere Backend2 reads it through
 * an `environment` object it is looked up at run time, and the Cloudflare
 * Worker does not set it. There, every "refuse in production" rule — a missing
 * `AUTH_V2_SECRET`, a missing Turnstile secret, the owner fence's second layer
 * — would quietly behave as development.
 *
 * `import.meta.env.PROD` is replaced by Vite at build time, so a production
 * build answers `true` however the Worker's variables are set. Tests, `vite
 * dev` and the `bun` scripts are not production builds and still decide by
 * `NODE_ENV`, which is what their tests set.
 */
const BUILT_FOR_PRODUCTION: boolean = (() => {
  try {
    return import.meta.env?.PROD === true
  } catch {
    return false
  }
})()

export const isProductionEnvironment = (environment: Record<string, string | undefined>): boolean =>
  BUILT_FOR_PRODUCTION || environment.NODE_ENV === 'production'
