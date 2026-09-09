import { createFileRoute } from '@tanstack/react-router'
import { OverviewPage } from '#/frontend/pages/admin/overview/OverviewPage'

export const Route = createFileRoute('/admin/')({ component: OverviewPage })
