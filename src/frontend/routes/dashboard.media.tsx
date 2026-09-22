import { createFileRoute } from '@tanstack/react-router'
import { MediaPage } from '#/frontend/pages/dashboard/media/MediaPage'

export const Route = createFileRoute('/dashboard/media')({
  head: () => ({
    meta: [
      { title: 'Media · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: MediaPage,
})
