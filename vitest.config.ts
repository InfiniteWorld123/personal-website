import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Unit tests do not need to start Nitro or the development devtools server.
export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./tsconfig.json'] })],
  test: {
    include: ['src/tests/**/*.test.{ts,tsx}'],
    // The PGlite suites and the sign-in hashing tests pass everywhere but
    // brush the 5 s default on a two-core CI runner, or on a laptop busy with
    // a second test run — the gapless-numbering race test most of all.
    testTimeout: process.env.CI ? 30_000 : 15_000,
    hookTimeout: process.env.CI ? 60_000 : 30_000,
  },
})
