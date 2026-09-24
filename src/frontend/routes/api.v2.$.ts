import { createFileRoute } from '@tanstack/react-router'
import { handleApiV2Request } from '#/backend2/app'

/**
 * Where Backend2 answers. Since the legacy `/api/$` was removed (24 Sep 2026)
 * this is the site's only API; any other `/api/...` address is a 404.
 */
const handle = ({ request }: { request: Request }) => handleApiV2Request(request)

export const Route = createFileRoute('/api/v2/$')({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      PUT: handle,
      DELETE: handle,
      PATCH: handle,
    },
  },
})
