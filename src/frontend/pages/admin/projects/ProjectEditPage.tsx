import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelNote } from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import { ProjectForm } from '#/frontend/features/projects/ProjectForm'
import { toFilterInput } from '#/frontend/features/projects/project-filters'
import {
  emptyProjectForm,
  toFormValues,
  toWriteInput,
  type ProjectFormValues,
} from '#/frontend/features/projects/project-form-values'
import {
  adminProjectQuery,
  adminProjectsQuery,
  useSaveProject,
} from '#/frontend/features/projects/project-queries'
import { usePrefetch } from '#/frontend/lib/prefetch'

/**
 * The form standing where it will stand: five panels of the heights they
 * actually come in, with the tab strip already drawn inside the second — so
 * when the project lands nothing under the pointer moves.
 */
function FormSkeleton() {
  return (
    <SkeletonScreen className="flex flex-col gap-6" label="Loading project">
      {/* Project — two rows of paired fields. */}
      <Panel className="flex flex-col gap-4 p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-64" />
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="flex flex-col gap-2" key={index}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
        </div>
      </Panel>

      {/* Case study — the language tabs and the long copy under them. */}
      <Panel className="flex flex-col gap-4 p-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-72" />
        <div className="mt-2 flex gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        {Array.from({ length: 3 }, (_, index) => (
          <div className="flex flex-col gap-2" key={index}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
        ))}
      </Panel>

      {/* Technology. */}
      <Panel className="flex flex-col gap-4 p-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-56" />
        <Skeleton className="mt-2 h-9 w-full rounded-md" />
      </Panel>

      {/* Images. */}
      <Panel className="flex flex-col gap-4 p-6">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-80" />
        <Skeleton className="mt-2 h-32 w-full rounded-md" />
      </Panel>

      {/* Visibility. */}
      <Panel className="flex flex-col gap-4 p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-72" />
        <div className="mt-2 flex items-center gap-3">
          <Skeleton className="h-5 w-9 rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
      </Panel>
    </SkeletonScreen>
  )
}

/** One page for both, because creating and editing differ only in the payload. */
export function ProjectEditPage({ id }: { id: string | null }) {
  const navigate = useNavigate()
  const prefetch = usePrefetch()
  const save = useSaveProject(id)
  const project = useQuery({ ...adminProjectQuery(id ?? ''), enabled: id !== null })

  const submit = async (values: ProjectFormValues) => {
    const saved = await save.mutateAsync(toWriteInput(values))

    await navigate({ to: '/admin/projects' })

    return saved
  }

  const cancel = () => void navigate({ to: '/admin/projects' })

  return (
    <AdminPage width="narrow">
      <PageHeader
        back={
          <Button asChild variant="ghost" size="sm" className="-ms-2 w-fit rounded-full">
            {/* The list he came from, warmed before he turns back to it. The
                filters live in the URL and the URL he is going to has none, so
                this warms the key that page will actually ask for. */}
            <Link to="/admin/projects" {...prefetch(adminProjectsQuery(toFilterInput({})))}>
              <ArrowLeftIcon aria-hidden="true" />
              All projects
            </Link>
          </Button>
        }
        title={id ? 'Edit project' : 'New project'}
      />

      {id === null ? (
        <ProjectForm
          initialValues={emptyProjectForm()}
          isNew
          isSaving={save.isPending}
          onSubmit={submit}
          onCancel={cancel}
        />
      ) : project.isPending ? (
        <FormSkeleton />
      ) : project.isError ? (
        <Panel className="overflow-hidden">
          <PanelNote tone="error">
            <p>This project could not be loaded. {(project.error as Error).message}</p>
            <Button type="button" variant="outline" onClick={() => void project.refetch()}>
              Try again
            </Button>
          </PanelNote>
        </Panel>
      ) : (
        <ProjectForm
          // Remounts when a different project is opened, so the form starts
          // from that project's values instead of keeping the previous ones.
          key={project.data.id}
          initialValues={toFormValues(project.data)}
          isNew={false}
          isSaving={save.isPending}
          onSubmit={submit}
          onCancel={cancel}
        />
      )}
    </AdminPage>
  )
}
