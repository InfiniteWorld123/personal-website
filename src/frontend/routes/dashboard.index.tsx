import { createFileRoute } from '@tanstack/react-router'
import { OverviewPage } from '#/frontend/pages/dashboard/OverviewPage'

export const Route = createFileRoute('/dashboard/')({
  head: () => ({ meta: [{ title: 'Dashboard · Yaman Warda' }] }),
  component: OverviewPage,
})
