import { createFileRoute } from '@tanstack/react-router'
import { ComposePage } from '#/frontend/pages/admin/inbox/ComposePage'

export const Route = createFileRoute('/admin/inbox/new')({ component: ComposePage })
