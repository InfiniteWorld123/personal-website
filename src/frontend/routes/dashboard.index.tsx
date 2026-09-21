import { createFileRoute } from '@tanstack/react-router'
import { OverviewPage } from '#/frontend/pages/dashboard/overview/OverviewPage'

export const Route = createFileRoute('/dashboard/')({
  component: OverviewPage,
})
