import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { PlusIcon, TagsIcon } from 'lucide-react'
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
import { PostFilterBar } from '#/frontend/features/blog/PostFilterBar'
import { hasActiveFilters, toFilterInput, type PostSearch } from '#/frontend/features/blog/post-filters'
import { adminPostsQuery, useDeletePost } from '#/frontend/features/blog/post-queries'
import type { AdminPostListItem } from '#/shared/types/post.types'

export function PostsPage({ search }: { search: PostSearch }) {
  const navigate = useNavigate({ from: '/admin/blog/' })
  const filter = toFilterInput(search)
  const posts = useQuery(adminPostsQuery(filter))
  const remove = useDeletePost()
  const [pendingDelete, setPendingDelete] = useState<AdminPostListItem | null>(null)

  const items = posts.data?.items ?? []

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Blog</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            The articles on <span className="font-medium">/blog</span>. Published posts are live in
            all three languages.
          </p>
        </div>

        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/admin/blog/tags">
              <TagsIcon aria-hidden="true" />
              Tags
            </Link>
          </Button>
          <Button asChild>
            <Link to="/admin/blog/new">
              <PlusIcon aria-hidden="true" />
              New post
            </Link>
          </Button>
        </div>
      </div>

      <PostFilterBar search={search} />

      {posts.isPending ? (
        <p className="text-muted-foreground py-12 text-center text-sm">Loading posts…</p>
      ) : posts.isError ? (
        <div className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="text-destructive text-sm">
            The post list could not be loaded. {(posts.error as Error).message}
          </p>
          <Button type="button" variant="outline" onClick={() => void posts.refetch()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="border-border flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm font-medium">
            {hasActiveFilters(search) ? 'No post matches these filters.' : 'Nothing written yet.'}
          </p>
          <p className="text-muted-foreground max-w-sm text-sm">
            {hasActiveFilters(search)
              ? 'Clear the filters to see everything again.'
              : 'The first article you write here appears on the public blog once it is published.'}
          </p>
          {hasActiveFilters(search) ? null : (
            <Button asChild variant="outline">
              <Link to="/admin/blog/new">Write the first post</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Post</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Languages</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((post) => (
                <TableRow key={post.id}>
                  <TableCell>
                    <Link
                      to="/admin/blog/$id"
                      params={{ id: post.id }}
                      className="font-medium hover:underline"
                    >
                      {post.displayTitle}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      /{post.slug}
                      {post.projectSlug ? ` · about ${post.projectSlug}` : ''}
                    </p>
                  </TableCell>

                  <TableCell>
                    <Badge variant={post.isPublished ? 'default' : 'outline'}>
                      {post.isPublished ? 'Published' : 'Draft'}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-muted-foreground text-sm tabular-nums" dir="ltr">
                    {post.publishedOn ?? '—'}
                  </TableCell>

                  <TableCell>
                    <div className="flex gap-1">
                      {post.languages.map((language) => (
                        <Badge key={language} variant="outline" className="uppercase">
                          {language}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {post.tags.map((tag) => (
                        <Badge key={tag.slug} variant="secondary">
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/admin/blog/$id" params={{ id: post.id }}>
                          Edit
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setPendingDelete(post)}
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

      {posts.data && posts.data.pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            Page {posts.data.page} of {posts.data.pageCount} · {posts.data.total} posts
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={posts.data.page <= 1}
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
              disabled={posts.data.page >= posts.data.pageCount}
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
            <AlertDialogTitle>Delete “{pendingDelete?.displayTitle}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The post and its three translations are removed. This cannot be undone.
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
              Delete post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
