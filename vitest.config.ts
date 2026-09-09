import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Unit tests do not need to start Nitro or the development devtools server.
export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./tsconfig.json'] })],
  test: { include: ['src/tests/**/*.test.{ts,tsx}'] },
})
