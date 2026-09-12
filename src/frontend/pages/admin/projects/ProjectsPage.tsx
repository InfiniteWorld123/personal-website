import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/frontend/components/ui/alert-dialog'
import { Badge } from '#/frontend/components/ui/badge'
import { Button } from '#/frontend/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/frontend/components/ui/table'
import { ProjectFilterBar } from '#/frontend/features/projects/ProjectFilterBar'
import { PublishStateBadge, ProjectStatusBadge } from '#/frontend/features/projects/ProjectStatusBadge'
import { hasActiveFilters, toFilterInput, type ProjectSearch } from '#/frontend/features/projects/project-filters'
import {
  adminProjectsQuery,
  useDeleteProject,
  useReorderProjects,
} from '#/frontend/features/projects/project-queries'
import type { AdminProjectListItem } from '#/shared/types/project.types'

export function ProjectsPage({ search }: { search: ProjectSearch }) {
  const navigate = useNavigate({ from: '/admin/projects/' })
  const filter = toFilterInput(search)
  const projects = useQuery(adminProjectsQuery(filter))
  const reorder = useReorderProjects()
  const remove = useDeleteProject()
  const [pendingDelete, setPendingDelete] = useState<AdminProjectListItem | null>(null)

  const items = projects.data?.items ?? []

  /**
   * Order is a property of the whole list, so it can only be edited while the
   * whole list is on screen. Moving row two above row one inside a filtered
   * page would silently reorder rows the owner cannot see.
   */
  const canReorder = !hasActiveFilters(search) && (projects.data?.pageCount ?? 1) === 1

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= items.length) return

    const ordered = [...items]
    const [moved] = ordered.splice(index, 1)
    if (moved) ordered.splice(target, 0, moved)

    reorder.mutate(ordered.map((project) => project.id))
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            The case studies on <span className="font-medium">/work</span>. Published projects are
            live in all three languages.
          </p>
        </div>

        <Button asChild>
          <Link to="/admin/projects/new">
            <PlusIcon aria-hidden="true" />
            New project
          </Link>
        </Button>
      </div>

      <ProjectFilterBar search={search} />

      {projects.isPending ? (
        <p className="text-muted-foreground py-12 text-center text-sm">Loading projects…</p>
      ) : projects.isError ? (
        <div className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="text-destructive text-sm">
            The project list could not be loaded. {(projects.error as Error).message}
          </p>
          <Button type="button" variant="outline" onClick={() => void projects.refetch()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="border-border flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm font-medium">
            {hasActiveFilters(search) ? 'No project matches these filters.' : 'No projects yet.'}
          </p>
          <p className="text-muted-foreground max-w-sm text-sm">
            {hasActiveFilters(search)
              ? 'Clear the filters to see everything again.'
              : 'The first project you add here appears on the public work page once it is published.'}
          </p>
          {hasActiveFilters(search) ? null : (
            <Button asChild variant="outline">
              <Link to="/admin/projects/new">Add the first project</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Order</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Languages</TableHead>
                <TableHead className="text-end">Images</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((project, index) => (
                <TableRow key={project.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${project.displayName} up`}
                        disabled={!canReorder || index === 0 || reorder.isPending}
                        onClick={() => move(index, -1)}
                      >
                        <ChevronUpIcon aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${project.displayName} down`}
                        disabled={!canReorder || index === items.length - 1 || reorder.isPending}
                        onClick={() => move(index, 1)}
                      >
                        <ChevronDownIcon aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Link
                      to="/admin/projects/$id"
                      params={{ id: project.id }}
                      className="font-medium hover:underline"
                    >
                      {project.displayName}
                    </Link>
                    <p className="text-muted-foreground text-xs">/{project.slug}</p>
                  </TableCell>

                  <TableCell>
                    <ProjectStatusBadge status={project.status} />
                  </TableCell>

                  <TableCell>
                    <PublishStateBadge isPublished={project.isPublished} />
                  </TableCell>

                  <TableCell>
                    <div className="flex gap-1">
                      {project.languages.map((language) => (
                        <Badge key={language} variant="outline" className="uppercase">
                          {language}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>

                  <TableCell className="text-end tabular-nums">{project.imageCount}</TableCell>

                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/admin/projects/$id" params={{ id: project.id }}>
                          Edit
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setPendingDelete(project)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!canReorder && items.length > 1 ? (
        <p className="text-muted-foreground text-xs">
          Ordering is available on the unfiltered list, where every project is visible at once.
        </p>
      ) : null}

      {projects.data && projects.data.pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            Page {projects.data.page} of {projects.data.pageCount} · {projects.data.total} projects
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={projects.data.page <= 1}
              onClick={() =>
                void navigate({
                  search: (previous) => ({ ...previous, page: Math.max(1, (previous.page ?? 1) - 1) || undefined }),
                })
              }
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={projects.data.page >= projects.data.pageCount}
              onClick={() =>
                void navigate({ search: (previous) => ({ ...previous, page: (previous.page ?? 1) + 1 }) })
              }
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.displayName}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The project, its three translations, its images, and its technologies are removed.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) remove.mutate(pendingDelete.id)
                setPendingDelete(null)
              }}
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
