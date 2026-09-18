import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { PlusIcon, TagsIcon } from 'lucide-react'
import { useState } from 'react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelNote } from '#/frontend/components/admin/Panel'
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
import { PostFilterBar } from '#/frontend/features/blog/PostFilterBar'
import { hasActiveFilters, toFilterInput, type PostSearch } from '#/frontend/features/blog/post-filters'
import {
  adminPostQuery,
  adminPostsQuery,
  adminTagsQuery,
  postProjectsQuery,
  useDeletePost,
} from '#/frontend/features/blog/post-queries'
import { usePrefetch } from '#/frontend/lib/prefetch'
import { cn } from '#/frontend/lib/utils'
import type { AdminPostListItem } from '#/shared/types/post.types'
import { POST_PAGE_SIZE } from '#/shared/validation/post.validation'

/**
 * The head cells and the body cells share one measurement, because the
 * skeleton below renders the *same* header: if the two drifted apart, the
 * columns would shift the moment the first row arrived, which is the one
 * thing a skeleton exists to prevent.
 */
const HEAD_CLASS = 'text-muted-foreground h-11 px-5 text-xs font-medium tracking-wide text-start'
const CELL_CLASS = 'px-5 py-3.5 align-middle'
const ROW_CLASS =
  'border-border/60 hover:bg-accent/50 motion-safe:transition-colors motion-reduce:transition-none'

/** The six columns, written once so the table and its skeleton cannot disagree. */
function PostsTableHeader() {
  return (
    <TableHeader>
      <TableRow className="border-border/60 hover:bg-transparent">
        <TableHead className={HEAD_CLASS}>Post</TableHead>
        <TableHead className={HEAD_CLASS}>Visibility</TableHead>
        <TableHead className={HEAD_CLASS}>Date</TableHead>
        <TableHead className={HEAD_CLASS}>Languages</TableHead>
        <TableHead className={HEAD_CLASS}>Tags</TableHead>
        <TableHead className={`${HEAD_CLASS} w-32`} />
      </TableRow>
    </TableHeader>
  )
}

/**
 * The list as it will be, one page of it.
 *
 * The row count is `POST_PAGE_SIZE` rather than a comfortable handful: the
 * page holds twenty, and a skeleton that draws six and then grows to twenty is
 * a jump the reader pays for twice.
 */
function PostsSkeleton() {
  return (
    <SkeletonScreen label="Loading posts">
      <Table>
        <PostsTableHeader />
        <TableBody>
          {Array.from({ length: POST_PAGE_SIZE }, (_, index) => (
            <TableRow className="border-border/60" key={index}>
              <TableCell className={CELL_CLASS}>
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="mt-2 h-3 w-32" />
              </TableCell>
              <TableCell className={CELL_CLASS}>
                <Skeleton className="h-5 w-20 rounded-full" />
              </TableCell>
              <TableCell className={CELL_CLASS}>
                <Skeleton className="h-3.5 w-24" />
              </TableCell>
              <TableCell className={CELL_CLASS}>
                <div className="flex gap-1">
                  <Skeleton className="h-5 w-9 rounded-full" />
                  <Skeleton className="h-5 w-9 rounded-full" />
                  <Skeleton className="h-5 w-9 rounded-full" />
                </div>
              </TableCell>
              <TableCell className={CELL_CLASS}>
                <div className="flex gap-1">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
              </TableCell>
              <TableCell className={CELL_CLASS}>
                <div className="flex justify-end gap-1">
                  <Skeleton className="h-7 w-12 rounded-full" />
                  <Skeleton className="h-7 w-16 rounded-full" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SkeletonScreen>
  )
}

export function PostsPage({ search }: { search: PostSearch }) {
  const navigate = useNavigate({ from: '/admin/blog/' })
  const prefetch = usePrefetch()
  const filter = toFilterInput(search)
  const posts = useQuery({ ...adminPostsQuery(filter), placeholderData: keepPreviousData })
  const remove = useDeletePost()
  const [pendingDelete, setPendingDelete] = useState<AdminPostListItem | null>(null)

  const items = posts.data?.items ?? []

  /** What the editor mounts with: the post itself, plus both option lists. */
  const editorQueries = (id: string) =>
    prefetch(adminPostQuery(id), adminTagsQuery(), postProjectsQuery())

  /** The blank editor needs no post — only the two lists it offers to pick from. */
  const newPostQueries = prefetch(adminTagsQuery(), postProjectsQuery())

  return (
    <AdminPage>
      <PageHeader
        title="Blog"
        description={
          <>
            The articles on <span className="font-medium">/blog</span>. Published posts are live in all
            three languages.
          </>
        }
        actions={
          <>
            <Button asChild className="rounded-full" size="sm" variant="outline">
              <Link to="/admin/blog/tags" {...prefetch(adminTagsQuery())}>
                <TagsIcon aria-hidden="true" />
                Tags
              </Link>
            </Button>
            <Button asChild className="rounded-full" size="sm">
              <Link to="/admin/blog/new" {...newPostQueries}>
                <PlusIcon aria-hidden="true" />
                New post
              </Link>
            </Button>
          </>
        }
      />

      <PostFilterBar search={search} />

      {/*
        Narrowing a list is not loading it. While a new filter or the next page
        is in flight the rows already on screen stay, dimmed, instead of the
        whole table collapsing into twenty grey lines and back — the skeleton
        is for the first load, when there is genuinely nothing to keep.
      */}
      <Panel
        aria-busy={posts.isPlaceholderData}
        className={cn(
          'overflow-hidden motion-safe:transition-opacity motion-safe:duration-200',
          posts.isPlaceholderData && 'opacity-60',
        )}
      >
        {posts.isPending ? (
          <PostsSkeleton />
        ) : posts.isError ? (
          <PanelNote tone="error">
            <p>The post list could not be loaded. {(posts.error as Error).message}</p>
            <Button
              className="rounded-full"
              type="button"
              variant="outline"
              onClick={() => void posts.refetch()}
            >
              Try again
            </Button>
          </PanelNote>
        ) : items.length === 0 ? (
          <PanelNote>
            <p className="text-foreground text-sm font-medium">
              {hasActiveFilters(search) ? 'No post matches these filters.' : 'Nothing written yet.'}
            </p>
            <p className="text-muted-foreground max-w-sm text-sm">
              {hasActiveFilters(search)
                ? 'Clear the filters to see everything again.'
                : 'The first article you write here appears on the public blog once it is published.'}
            </p>
            {hasActiveFilters(search) ? null : (
              <Button asChild className="rounded-full" variant="outline">
                <Link to="/admin/blog/new" {...newPostQueries}>
                  Write the first post
                </Link>
              </Button>
            )}
          </PanelNote>
        ) : (
          <Table>
            <PostsTableHeader />
            <TableBody>
              {items.map((post) => (
                <TableRow className={ROW_CLASS} key={post.id}>
                  <TableCell className={CELL_CLASS}>
                    <Link
                      to="/admin/blog/$id"
                      params={{ id: post.id }}
                      // The article this row opens, fetched while the pointer
                      // is still on it — with the tag and project lists the
                      // form underneath cannot render without.
                      {...editorQueries(post.id)}
                      className="focus-visible:ring-ring rounded-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {post.displayTitle}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      /{post.slug}
                      {post.projectSlug ? ` · about ${post.projectSlug}` : ''}
                    </p>
                  </TableCell>

                  <TableCell className={CELL_CLASS}>
                    <Badge variant={post.isPublished ? 'default' : 'outline'}>
                      {post.isPublished ? 'Published' : 'Draft'}
                    </Badge>
                  </TableCell>

                  <TableCell
                    className={`${CELL_CLASS} text-muted-foreground text-sm tabular-nums`}
                    dir="ltr"
                  >
                    {post.publishedOn ?? '—'}
                  </TableCell>

                  <TableCell className={CELL_CLASS}>
                    <div className="flex gap-1">
                      {post.languages.map((language) => (
                        <Badge key={language} variant="outline" className="uppercase">
                          {language}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>

                  <TableCell className={CELL_CLASS}>
                    <div className="flex flex-wrap gap-1">
                      {post.tags.map((tag) => (
                        <Badge key={tag.slug} variant="secondary">
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>

                  <TableCell className={CELL_CLASS}>
                    <div className="flex justify-end gap-1">
                      <Button asChild className="rounded-full" variant="ghost" size="sm">
                        <Link to="/admin/blog/$id" params={{ id: post.id }} {...editorQueries(post.id)}>
                          Edit
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive rounded-full"
                        onClick={() => {
                          remove.reset()
                          setPendingDelete(post)
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
        )}
      </Panel>

      {posts.data && posts.data.pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            Page {posts.data.page} of {posts.data.pageCount} · {posts.data.total} posts
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="bg-panel rounded-full"
              disabled={posts.data.page <= 1}
              // The page either side of this one, warmed on hover: paging is
              // the one navigation here whose destination is known exactly.
              {...prefetch(
                adminPostsQuery({
                  ...filter,
                  page: Math.max(1, filter.page - 1),
                }),
              )}
              onClick={() =>
                void navigate({
                  search: (previous) => ({
                    ...previous,
                    page: Math.max(1, (previous.page ?? 1) - 1) || undefined,
                  }),
                })
              }
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              className="bg-panel rounded-full"
              disabled={posts.data.page >= posts.data.pageCount}
              {...prefetch(adminPostsQuery({ ...filter, page: filter.page + 1 }))}
              onClick={() =>
                void navigate({
                  search: (previous) => ({
                    ...previous,
                    page: (previous.page ?? 1) + 1,
                  }),
                })
              }
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.displayTitle}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The post and its three translations are removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.isError ? (
            <p role="alert" className="text-destructive text-sm">
              The post could not be deleted. {(remove.error as Error).message}
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
                  remove.mutate(pendingDelete.id, {
                    onSuccess: () => setPendingDelete(null),
                  })
                }
              }}
            >
              Delete post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPage>
  )
}
