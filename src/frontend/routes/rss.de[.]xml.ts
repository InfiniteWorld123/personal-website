import { createFileRoute } from '@tanstack/react-router'
import { buildFeedResponse } from '#/frontend/features/blog/server/rss-feed'

export const Route = createFileRoute('/rss/de.xml')({
  server: { handlers: { GET: () => buildFeedResponse('de') } },
})
