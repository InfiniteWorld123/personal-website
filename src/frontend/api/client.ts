import { treaty } from '@elysia/eden'

import type { App } from '#/backend/app'

/**
 * Typed API client. Browser-only by design: server-side code talks to services
 * directly instead of making an HTTP round trip to itself.
 */
export function api() {
  if (typeof window === 'undefined') {
    throw new Error('The browser API client cannot run during server rendering')
  }

  return treaty<App>(window.location.origin).api
}
