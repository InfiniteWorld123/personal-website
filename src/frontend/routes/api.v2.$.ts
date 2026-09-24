import { createFileRoute } from '@tanstack/react-router'
import { handleApiV2Request } from '#/backend2/app'

/** Where Backend2 answers: the site's only API. Any other `/api/...` address is a 404. */
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
