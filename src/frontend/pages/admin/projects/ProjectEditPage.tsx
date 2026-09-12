import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { ProjectForm } from '#/frontend/features/projects/ProjectForm'
import {
  emptyProjectForm,
  toFormValues,
  toWriteInput,
  type ProjectFormValues,
} from '#/frontend/features/projects/project-form-values'
import { adminProjectQuery, useSaveProject } from '#/frontend/features/projects/project-queries'

/** One page for both, because creating and editing differ only in the payload. */
export function ProjectEditPage({ id }: { id: string | null }) {
  const navigate = useNavigate()
  const save = useSaveProject(id)
  const project = useQuery({ ...adminProjectQuery(id ?? ''), enabled: id !== null })

  const submit = async (values: ProjectFormValues) => {
    const saved = await save.mutateAsync(toWriteInput(values))

    await navigate({ to: '/admin/projects' })

    return saved
  }

  const cancel = () => void navigate({ to: '/admin/projects' })

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link to="/admin/projects">
            <ArrowLeftIcon aria-hidden="true" />
            All projects
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {id ? 'Edit project' : 'New project'}
        </h1>
      </div>

      {id === null ? (
        <ProjectForm
          initialValues={emptyProjectForm()}
          isNew
          isSaving={save.isPending}
          onSubmit={submit}
          onCancel={cancel}
        />
      ) : project.isPending ? (
        <p className="text-muted-foreground py-12 text-center text-sm">Loading project…</p>
      ) : project.isError ? (
        <div className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="text-destructive text-sm">
            This project could not be loaded. {(project.error as Error).message}
          </p>
          <Button type="button" variant="outline" onClick={() => void project.refetch()}>
            Try again
          </Button>
        </div>
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
    </div>
  )
}
