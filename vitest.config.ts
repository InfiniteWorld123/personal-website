import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Unit tests do not need to start Nitro or the development devtools server.
export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./tsconfig.json'] })],
  test: {
    include: ['src/tests/**/*.test.{ts,tsx}'],
    // A two-core CI runner is far slower than a laptop: the PGlite suites and
    // the sign-in hashing tests pass everywhere but brush 5 s there.
    ...(process.env.CI ? { testTimeout: 30_000, hookTimeout: 60_000 } : {}),
  },
})
