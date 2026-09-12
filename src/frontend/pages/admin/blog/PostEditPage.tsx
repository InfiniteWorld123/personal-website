import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { PostForm } from '#/frontend/features/blog/PostForm'
import {
  emptyPostBodies,
  emptyPostForm,
  toFormValues,
  toPostBodies,
  toWriteInput,
  type PostBodies,
  type PostFormValues,
} from '#/frontend/features/blog/post-form-values'
import { adminPostQuery, useSavePost } from '#/frontend/features/blog/post-queries'

/** One page for both, because writing and editing differ only in the payload. */
export function PostEditPage({ id }: { id: string | null }) {
  const navigate = useNavigate()
  const save = useSavePost(id)
  const post = useQuery({ ...adminPostQuery(id ?? ''), enabled: id !== null })

  const submit = async (values: PostFormValues, bodies: PostBodies) => {
    const saved = await save.mutateAsync(toWriteInput(values, bodies))

    await navigate({ to: '/admin/blog' })

    return saved
  }

  const cancel = () => void navigate({ to: '/admin/blog' })

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link to="/admin/blog">
            <ArrowLeftIcon aria-hidden="true" />
            All posts
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{id ? 'Edit post' : 'New post'}</h1>
      </div>

      {id === null ? (
        <PostForm
          initialValues={emptyPostForm()}
          initialBodies={emptyPostBodies()}
          isNew
          isSaving={save.isPending}
          onSubmit={submit}
          onCancel={cancel}
        />
      ) : post.isPending ? (
        <p className="text-muted-foreground py-12 text-center text-sm">Loading post…</p>
      ) : post.isError ? (
        <div className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="text-destructive text-sm">
            This post could not be loaded. {(post.error as Error).message}
          </p>
          <Button type="button" variant="outline" onClick={() => void post.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <PostForm
          // Remounts when a different post is opened, so the form — and the
          // three editors inside it — start from that post's values.
          key={post.data.id}
          initialValues={toFormValues(post.data)}
          initialBodies={toPostBodies(post.data)}
          isNew={false}
          isSaving={save.isPending}
          onSubmit={submit}
          onCancel={cancel}
        />
      )}
    </div>
  )
}
