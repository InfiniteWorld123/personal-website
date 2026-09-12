import { createFileRoute } from '@tanstack/react-router'
import { buildFeedResponse } from '#/frontend/features/blog/server/rss-feed'

export const Route = createFileRoute('/rss/ar.xml')({
  server: { handlers: { GET: () => buildFeedResponse('ar') } },
})
