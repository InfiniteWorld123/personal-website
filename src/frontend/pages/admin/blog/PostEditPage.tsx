import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelBody, PanelHeader, PanelNote } from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import { PostForm } from '#/frontend/features/blog/PostForm'
import { toFilterInput } from '#/frontend/features/blog/post-filters'
import {
  emptyPostBodies,
  emptyPostForm,
  toFormValues,
  toPostBodies,
  toWriteInput,
  type PostBodies,
  type PostFormValues,
} from '#/frontend/features/blog/post-form-values'
import {
  adminPostQuery,
  adminPostsQuery,
  adminTagsQuery,
  useSavePost,
} from '#/frontend/features/blog/post-queries'
import { usePrefetch } from '#/frontend/lib/prefetch'
import { POST_LANGUAGES } from '#/shared/validation/post.validation'

/** A label over a control: the pair every field in this form is made of. */
function FieldSkeleton({ control = 'h-8', hint = false }: { control?: string; hint?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className={`${control} rounded-lg`} />
      {hint ? <Skeleton className="h-3 w-4/5" /> : null}
    </div>
  )
}

function PanelHeadSkeleton({ width = 'w-20' }: { width?: string }) {
  return (
    <PanelHeader className="flex-col items-start gap-2">
      <Skeleton className={`h-4 ${width}`} />
      <Skeleton className="h-3 w-64 max-w-full" />
    </PanelHeader>
  )
}

/**
 * The editor before the post arrives.
 *
 * Every block stands at the height the real one occupies — including the
 * article body, which is 22rem of editor by the stylesheet's own rule. A
 * shorter placeholder would let the page grow by a screenful the moment the
 * request came back, and the writing surface is precisely the thing you do
 * not want jumping under the cursor.
 */
function PostFormSkeleton() {
  return (
    <SkeletonScreen className="flex flex-col gap-6" label="Loading post">
      <Panel>
        <PanelHeadSkeleton />
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          <FieldSkeleton hint />
          <FieldSkeleton hint />
          <div className="sm:col-span-2">
            <FieldSkeleton hint />
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeadSkeleton />
        <PanelBody className="flex flex-col gap-4">
          <div className="flex gap-0.5">
            {POST_LANGUAGES.map((language) => (
              <Skeleton className="h-8 w-24 rounded-lg" key={language} />
            ))}
          </div>
          <FieldSkeleton />
          <FieldSkeleton control="h-[4.5rem]" hint />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-16" />
            <div className="border-border overflow-hidden rounded-lg border">
              <div className="border-border flex flex-wrap items-center gap-0.5 border-b p-2">
                {Array.from({ length: 12 }, (_, index) => (
                  <Skeleton className="size-8 rounded-md" key={index} />
                ))}
              </div>
              <Skeleton className="m-4 h-[20rem] rounded-md" />
            </div>
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeadSkeleton width="w-28" />
        <PanelBody className="grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <FieldSkeleton />
          </div>
          <FieldSkeleton />
          <FieldSkeleton />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeadSkeleton />
        <PanelBody className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-7 w-28 rounded-full" />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeadSkeleton />
        <PanelBody className="flex items-center gap-3">
          <Skeleton className="h-5 w-9 rounded-full" />
          <Skeleton className="h-3.5 w-20" />
        </PanelBody>
      </Panel>

      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
    </SkeletonScreen>
  )
}

/** One page for both, because writing and editing differ only in the payload. */
export function PostEditPage({ id }: { id: string | null }) {
  const navigate = useNavigate()
  const prefetch = usePrefetch()
  const save = useSavePost(id)
  const post = useQuery({ ...adminPostQuery(id ?? ''), enabled: id !== null })

  const submit = async (values: PostFormValues, bodies: PostBodies) => {
    const saved = await save.mutateAsync(toWriteInput(values, bodies))

    await navigate({ to: '/admin/blog' })

    return saved
  }

  const cancel = () => void navigate({ to: '/admin/blog' })

  return (
    <AdminPage width="narrow">
      <PageHeader
        back={
          <Button asChild className="w-fit rounded-full" variant="ghost" size="sm">
            {/* Where Cancel and a finished save both land, on its default filters. */}
            <Link to="/admin/blog" {...prefetch(adminPostsQuery(toFilterInput({})), adminTagsQuery())}>
              <ArrowLeftIcon aria-hidden="true" />
              All posts
            </Link>
          </Button>
        }
        title={id ? 'Edit post' : 'New post'}
      />

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
        <PostFormSkeleton />
      ) : post.isError ? (
        <Panel>
          <PanelNote tone="error">
            <p>This post could not be loaded. {(post.error as Error).message}</p>
            <Button
              className="rounded-full"
              type="button"
              variant="outline"
              onClick={() => void post.refetch()}
            >
              Try again
            </Button>
          </PanelNote>
        </Panel>
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
    </AdminPage>
  )
}
