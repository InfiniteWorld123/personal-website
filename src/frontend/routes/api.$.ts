import { createFileRoute } from '@tanstack/react-router'
import { handleApiRequest } from '#/backend/app'

const handle = ({ request }: { request: Request }) => handleApiRequest(request)

export const Route = createFileRoute('/api/$')({
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
