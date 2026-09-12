import { Badge } from '#/frontend/components/ui/badge'
import type { ProjectStatus } from '#/shared/validation/project.validation'

const LABELS: Record<ProjectStatus, string> = { live: 'Live', building: 'In progress' }

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge variant={status === 'live' ? 'default' : 'outline'}>{LABELS[status]}</Badge>
}

export function PublishStateBadge({ isPublished }: { isPublished: boolean }) {
  return (
    <Badge variant={isPublished ? 'secondary' : 'ghost'}>{isPublished ? 'Published' : 'Draft'}</Badge>
  )
}
