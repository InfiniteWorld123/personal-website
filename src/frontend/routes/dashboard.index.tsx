import { createFileRoute } from '@tanstack/react-router'
import { OverviewPage } from '#/frontend/pages/dashboard/OverviewPage'

export const Route = createFileRoute('/dashboard/')({
  head: () => ({ meta: [{ title: 'Dashboard · Yaman Warda' }] }),
  component: function OverviewRoute() {
    const { authSession } = Route.useRouteContext()

    return <OverviewPage name={authSession.user.name} />
  },
})
