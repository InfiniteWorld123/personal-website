import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelBody, PanelNote } from '#/frontend/components/admin/Panel'
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
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
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
  adminProjectQuery,
  adminProjectsQuery,
  useDeleteProject,
  useReorderProjects,
} from '#/frontend/features/projects/project-queries'
import { usePrefetch } from '#/frontend/lib/prefetch'
import type { AdminProjectListItem } from '#/shared/types/project.types'

/**
 * The case studies, as a table on one panel.
 *
 * The seven columns are the seven facts he needs before he opens anything:
 * where the project sits in the order, what it is called, whether it is
 * finished, whether visitors can see it, which of the three languages are
 * written, and how many images it carries.
 */

/**
 * How tall the placeholder table stands.
 *
 * The page size is twenty, but this list is a portfolio: it holds the handful
 * of case studies on /work, and a twenty-row grey wall standing in for four
 * projects is a bigger jump than the one it was meant to prevent. Six rows is
 * the shape this page actually arrives in.
 */
const SKELETON_ROWS = 6

/** The same table, not yet arrived: seven columns at the real row height. */
function RowsSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-border/60 hover:bg-transparent">
          <TableHead className="w-24 px-5 text-start">Order</TableHead>
          <TableHead className="px-5 text-start">Project</TableHead>
          <TableHead className="px-5 text-start">Status</TableHead>
          <TableHead className="px-5 text-start">Visibility</TableHead>
          <TableHead className="px-5 text-start">Languages</TableHead>
          <TableHead className="px-5 text-end">Images</TableHead>
          <TableHead className="w-32 px-5" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <TableRow className="border-border/60 hover:bg-transparent" key={index}>
            <TableCell className="px-5 py-3.5">
              <div className="flex items-center gap-1">
                <Skeleton className="size-8 rounded-md" />
                <Skeleton className="size-8 rounded-md" />
              </div>
            </TableCell>
            {/* 16 + 8 + 12 is the height of a `text-sm` name over a `text-xs`
                slug, so the row stands exactly as tall empty as it does full. */}
            <TableCell className="px-5 py-3.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-24" />
            </TableCell>
            <TableCell className="px-5 py-3.5">
              <Skeleton className="h-5 w-16 rounded-full" />
            </TableCell>
            <TableCell className="px-5 py-3.5">
              <Skeleton className="h-5 w-20 rounded-full" />
            </TableCell>
            <TableCell className="px-5 py-3.5">
              <div className="flex gap-1">
                <Skeleton className="h-5 w-9 rounded-full" />
                <Skeleton className="h-5 w-9 rounded-full" />
                <Skeleton className="h-5 w-9 rounded-full" />
              </div>
            </TableCell>
            <TableCell className="px-5 py-3.5">
              <Skeleton className="ms-auto h-3.5 w-6" />
            </TableCell>
            <TableCell className="px-5 py-3.5">
              {/* `size="sm"` is `h-7`; the placeholder is the same button. */}
              <div className="flex justify-end gap-1">
                <Skeleton className="h-7 w-12 rounded-md" />
                <Skeleton className="h-7 w-16 rounded-md" />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function ProjectsPage({ search }: { search: ProjectSearch }) {
  const navigate = useNavigate({ from: '/admin/projects/' })
  const prefetch = usePrefetch()
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
    <AdminPage>
      <PageHeader
        title="Projects"
        description={
          <>
            The case studies on <span className="font-medium">/work</span>. Published projects are
            live in all three languages.
          </>
        }
        actions={
          // Nothing to warm: /admin/projects/new renders an empty form and
          // runs no query. The router already preloads the route code itself.
          <Button asChild className="rounded-full" size="sm">
            <Link to="/admin/projects/new">
              <PlusIcon aria-hidden="true" />
              New project
            </Link>
          </Button>
        }
      />

      {/* The filters are controls, not content: they sit on their own panel so
          the inputs read as objects on the ground rather than holes in it. */}
      <Panel>
        <PanelBody className="pt-6">
          <ProjectFilterBar search={search} />
        </PanelBody>
      </Panel>

      {projects.isPending ? (
        <Panel className="overflow-hidden">
          <SkeletonScreen label="Loading projects">
            <RowsSkeleton />
          </SkeletonScreen>
        </Panel>
      ) : projects.isError ? (
        <Panel className="overflow-hidden">
          <PanelNote tone="error">
            <p>The project list could not be loaded. {(projects.error as Error).message}</p>
            <Button type="button" variant="outline" onClick={() => void projects.refetch()}>
              Try again
            </Button>
          </PanelNote>
        </Panel>
      ) : items.length === 0 ? (
        <Panel className="overflow-hidden">
          <PanelNote>
            <p className="text-foreground text-sm font-medium">
              {hasActiveFilters(search) ? 'No project matches these filters.' : 'No projects yet.'}
            </p>
            <p className="max-w-sm text-sm">
              {hasActiveFilters(search)
                ? 'Clear the filters to see everything again.'
                : 'The first project you add here appears on the public work page once it is published.'}
            </p>
            {hasActiveFilters(search) ? null : (
              <Button asChild variant="outline">
                <Link to="/admin/projects/new">Add the first project</Link>
              </Button>
            )}
          </PanelNote>
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="w-24 px-5 text-start">Order</TableHead>
                <TableHead className="px-5 text-start">Project</TableHead>
                <TableHead className="px-5 text-start">Status</TableHead>
                <TableHead className="px-5 text-start">Visibility</TableHead>
                <TableHead className="px-5 text-start">Languages</TableHead>
                <TableHead className="px-5 text-end">Images</TableHead>
                <TableHead className="w-32 px-5" />
              </TableRow>
            </TableHeader>
            {/*
              `motion-reduce:transition-none` on each row rather than
              `motion-safe:transition-colors`: the shared `TableRow` already
              carries an unguarded `transition-colors`, and that primitive is
              not this page's to edit. Switching the transition off under
              `prefers-reduced-motion` is the only way to honour the setting
              from out here, and it ends at the same place.
            */}
            <TableBody>
              {items.map((project, index) => (
                <TableRow
                  className="border-border/60 hover:bg-accent/50 motion-reduce:transition-none"
                  key={project.id}
                >
                  <TableCell className="px-5 py-3.5">
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

                  <TableCell className="px-5 py-3.5">
                    <Link
                      to="/admin/projects/$id"
                      params={{ id: project.id }}
                      // The editor's own request, sent while the pointer is
                      // still on the name.
                      {...prefetch(adminProjectQuery(project.id))}
                      className="focus-visible:ring-ring rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {project.displayName}
                    </Link>
                    <p className="text-muted-foreground text-xs">/{project.slug}</p>
                  </TableCell>

                  <TableCell className="px-5 py-3.5">
                    <ProjectStatusBadge status={project.status} />
                  </TableCell>

                  <TableCell className="px-5 py-3.5">
                    <PublishStateBadge isPublished={project.isPublished} />
                  </TableCell>

                  <TableCell className="px-5 py-3.5">
                    <div className="flex gap-1">
                      {project.languages.map((language) => (
                        <Badge key={language} variant="outline" className="uppercase">
                          {language}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>

                  <TableCell className="px-5 py-3.5 text-end tabular-nums">
                    {project.imageCount}
                  </TableCell>

                  <TableCell className="px-5 py-3.5">
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to="/admin/projects/$id"
                          params={{ id: project.id }}
                          {...prefetch(adminProjectQuery(project.id))}
                        >
                          Edit
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => {
                          remove.reset()
                          setPendingDelete(project)
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
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
              className="rounded-full"
              disabled={projects.data.page <= 1}
              // The page either side, fetched on the way to the button.
              {...prefetch(adminProjectsQuery({ ...filter, page: Math.max(1, filter.page - 1) }))}
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
              className="rounded-full"
              disabled={projects.data.page >= projects.data.pageCount}
              {...prefetch(adminProjectsQuery({ ...filter, page: filter.page + 1 }))}
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
          {remove.isError ? (
            <p role="alert" className="text-destructive text-sm">
              The project could not be deleted. {(remove.error as Error).message}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                // The dialog stays open until the server confirms. Closing it
                // first showed the row vanishing on a failure that never
                // happened, and nothing else would ever have caught it.
                event.preventDefault()
                if (pendingDelete) {
                  remove.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) })
                }
              }}
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPage>
  )
}
