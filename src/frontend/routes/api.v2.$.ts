import { createFileRoute } from '@tanstack/react-router'
import { handleApiV2Request } from '#/backend2/app'

/**
 * Where Backend2 answers.
 *
 * A route of its own rather than a branch inside `/api/$`: the legacy API and
 * the V2 API share no code, no database and no error module, and they should
 * not share an entry point either. `/api/$` and everything under it is
 * untouched.
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
