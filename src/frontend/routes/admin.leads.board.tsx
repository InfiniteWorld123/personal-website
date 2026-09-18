import { createFileRoute } from '@tanstack/react-router'
import { BoardPage } from '#/frontend/pages/admin/leads/BoardPage'

/** The same deals as the list, read column by column. A tab, not a home. */
export const Route = createFileRoute('/admin/leads/board')({
  component: BoardPage,
})
