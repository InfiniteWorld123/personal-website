import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

/**
 * Refuses to build a site whose forms cannot work.
 *
 * `VITE_TURNSTILE_SITE_KEY` is baked into the client bundle at build time. If
 * it is missing, `TurnstileWidget` falls back to an empty key in production,
 * renders "the security check was blocked", and never even asks Cloudflare —
 * so the contact form, the booking form **and the admin login** are all dead,
 * on a site that otherwise looks perfectly healthy. That is exactly what was
 * deployed on 18 Sep 2026, when the line had gone missing from `.env`.
 *
 * Nothing said so. A build that cannot produce a working form should not
 * finish quietly, so this one stops.
 */
const requireTurnstileSiteKey = () => ({
  name: 'require-turnstile-site-key',
  apply: 'build' as const,
  // `loadEnv`, not `process.env`: Vite reads `.env` into `import.meta.env` and
  // never into the process, so a guard reading the process would refuse every
  // build — including the correct ones.
  config(_config: unknown, { mode }: { mode: string }) {
    const key = loadEnv(mode, process.cwd(), 'VITE_').VITE_TURNSTILE_SITE_KEY ?? ''

    if (key.trim() !== '') return

    throw new Error(
      'VITE_TURNSTILE_SITE_KEY is missing. Without it every form on the built ' +
        'site — contact, booking and the admin login — fails before it can ask ' +
        'Cloudflare. Add it to .env (the public site key from the Turnstile ' +
        'dashboard) and build again.',
    )
  },
})

const config = defineConfig({
  plugins: [
    requireTurnstileSiteKey(),
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart({
      router: {
        entry: 'frontend/config/router.tsx',
        routesDirectory: 'frontend/routes',
        generatedRouteTree: 'frontend/config/routeTree.gen.ts',
      },
    }),
    viteReact(),
  ],
})

export default config
