import { createFileRoute } from '@tanstack/react-router'
import { InboxSettingsPage } from '#/frontend/pages/admin/inbox/InboxSettingsPage'

export const Route = createFileRoute('/admin/inbox/settings')({ component: InboxSettingsPage })
