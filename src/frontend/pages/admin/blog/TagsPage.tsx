import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon, PlusIcon } from 'lucide-react'
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
import { ApiRequestError } from '#/frontend/api/response'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/frontend/components/ui/table'
import { toFilterInput } from '#/frontend/features/blog/post-filters'
import {
  adminPostsQuery,
  adminTagsQuery,
  useDeleteTag,
  useSaveTag,
} from '#/frontend/features/blog/post-queries'
import { slugify } from '#/frontend/features/blog/post-form-values'
import { usePrefetch } from '#/frontend/lib/prefetch'
import type { AdminTag } from '#/shared/types/post.types'
import { POST_LANGUAGES, type PostLanguage } from '#/shared/validation/post.validation'

const LANGUAGE_LABELS: Record<PostLanguage, string> = {
  de: 'German',
  en: 'English',
  ar: 'Arabic',
}

type Draft = {
  id: string | null
  slug: string
  names: Record<PostLanguage, string>
}

const emptyDraft = (): Draft => ({
  id: null,
  slug: '',
  names: { de: '', en: '', ar: '' },
})

const toDraft = (tag: AdminTag): Draft => ({
  id: tag.id,
  slug: tag.slug,
  names: { ...tag.names },
})

const HEAD_CLASS = 'text-muted-foreground h-11 px-5 text-xs font-medium tracking-wide text-start'
const CELL_CLASS = 'px-5 py-3.5 align-middle'
const ROW_CLASS =
  'border-border/60 hover:bg-accent/50 motion-safe:transition-colors motion-reduce:transition-none'

/**
 * The columns are the languages plus three fixed ones, so both the table and
 * its skeleton count them from `POST_LANGUAGES`. Adding a fourth language
 * should widen the placeholder by itself, without anyone remembering to.
 */
function TagsTableHeader() {
  return (
    <TableHeader>
      <TableRow className="border-border/60 hover:bg-transparent">
        <TableHead className={HEAD_CLASS}>Slug</TableHead>
        {POST_LANGUAGES.map((language) => (
          <TableHead className={HEAD_CLASS} key={language}>
            {LANGUAGE_LABELS[language]}
          </TableHead>
        ))}
        <TableHead className={`${HEAD_CLASS} text-end`}>Posts</TableHead>
        <TableHead className={`${HEAD_CLASS} w-32`} />
      </TableRow>
    </TableHeader>
  )
}

function TagsSkeleton() {
  return (
    <SkeletonScreen label="Loading tags">
      <Table>
        <TagsTableHeader />
        <TableBody>
          {Array.from({ length: 5 }, (_, index) => (
            <TableRow className="border-border/60" key={index}>
              <TableCell className={CELL_CLASS}>
                <Skeleton className="h-3 w-20" />
              </TableCell>
              {POST_LANGUAGES.map((language) => (
                <TableCell className={CELL_CLASS} key={language}>
                  <Skeleton className="h-3.5 w-24" />
                </TableCell>
              ))}
              <TableCell className={CELL_CLASS}>
                <div className="flex justify-end">
                  <Skeleton className="h-3.5 w-6" />
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

/**
 * Tags are small enough to edit in place: a row is the tag, and opening one
 * turns it into the same three-language form the "new tag" button opens.
 */
export function TagsPage() {
  const prefetch = usePrefetch()
  const tags = useQuery(adminTagsQuery())
  const save = useSaveTag()
  const remove = useDeleteTag()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AdminTag | null>(null)

  const submit = async () => {
    if (!draft) return
    setErrorMessage(null)

    try {
      await save.mutateAsync({
        id: draft.id,
        input: { slug: draft.slug.trim(), names: draft.names },
      })
      setDraft(null)
    } catch (error) {
      setErrorMessage(
        error instanceof ApiRequestError ? error.message : 'Something went wrong while saving.',
      )
    }
  }

  return (
    <AdminPage>
      <PageHeader
        back={
          <Button asChild className="w-fit rounded-full" variant="ghost" size="sm">
            {/* The list this page was reached from, on its default filters. */}
            <Link to="/admin/blog" {...prefetch(adminPostsQuery(toFilterInput({})), adminTagsQuery())}>
              <ArrowLeftIcon aria-hidden="true" />
              All posts
            </Link>
          </Button>
        }
        title="Tags"
        description="What the blog archive filters by. A tag reaches the reader, so it is written in all three languages."
        actions={
          <Button
            className="rounded-full"
            size="sm"
            type="button"
            onClick={() => {
              setErrorMessage(null)
              setDraft(emptyDraft())
            }}
          >
            <PlusIcon aria-hidden="true" />
            New tag
          </Button>
        }
      />

      {draft ? (
        <Panel>
          <PanelBody className="flex flex-col gap-4 pt-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="tag-slug">URL slug</Label>
                <Input
                  id="tag-slug"
                  dir="ltr"
                  value={draft.slug}
                  placeholder="seo"
                  onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
                  onBlur={() =>
                    // Filled from the English name only while it is still empty,
                    // because changing it later breaks every link to the archive.
                    setDraft((current) =>
                      current && current.slug.trim() === ''
                        ? { ...current, slug: slugify(current.names.en) }
                        : current,
                    )
                  }
                />
              </div>

              {POST_LANGUAGES.map((language) => (
                <div key={language} className="flex flex-col gap-2">
                  <Label htmlFor={`tag-${language}`}>{LANGUAGE_LABELS[language]} name</Label>
                  <Input
                    id={`tag-${language}`}
                    dir={language === 'ar' ? 'rtl' : 'ltr'}
                    value={draft.names[language]}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        names: {
                          ...draft.names,
                          [language]: event.target.value,
                        },
                      })
                    }
                  />
                </div>
              ))}
            </div>

            {errorMessage ? (
              <p role="alert" className="text-destructive text-sm">
                {errorMessage}
              </p>
            ) : null}

            <div className="flex items-center gap-3">
              <Button
                className="rounded-full"
                type="button"
                disabled={save.isPending}
                onClick={() => void submit()}
              >
                {save.isPending ? 'Saving…' : draft.id ? 'Save tag' : 'Create tag'}
              </Button>
              <Button
                className="rounded-full"
                type="button"
                variant="ghost"
                onClick={() => setDraft(null)}
              >
                Cancel
              </Button>
            </div>
          </PanelBody>
        </Panel>
      ) : null}

      <Panel className="overflow-hidden">
        {tags.isPending ? (
          <TagsSkeleton />
        ) : tags.isError ? (
          <PanelNote tone="error">
            <p>The tags could not be loaded. {(tags.error as Error).message}</p>
            <Button
              className="rounded-full"
              type="button"
              variant="outline"
              onClick={() => void tags.refetch()}
            >
              Try again
            </Button>
          </PanelNote>
        ) : (tags.data ?? []).length === 0 ? (
          <PanelNote>
            <p className="text-foreground text-sm font-medium">No tags yet.</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              Posts can be published without one; tags are what makes a growing archive navigable.
            </p>
          </PanelNote>
        ) : (
          <Table>
            <TagsTableHeader />
            <TableBody>
              {(tags.data ?? []).map((tag) => (
                <TableRow className={ROW_CLASS} key={tag.id}>
                  <TableCell className={`${CELL_CLASS} font-mono text-xs`} dir="ltr">
                    {tag.slug}
                  </TableCell>
                  {POST_LANGUAGES.map((language) => (
                    <TableCell className={CELL_CLASS} key={language}>
                      {tag.names[language]}
                    </TableCell>
                  ))}
                  <TableCell className={`${CELL_CLASS} text-end tabular-nums`}>
                    {tag.postCount}
                  </TableCell>
                  <TableCell className={CELL_CLASS}>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-full"
                        onClick={() => {
                          setErrorMessage(null)
                          setDraft(toDraft(tag))
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive rounded-full"
                        onClick={() => {
                          remove.reset()
                          setPendingDelete(tag)
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

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the “{pendingDelete?.names.en}” tag?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && pendingDelete.postCount > 0
                ? `It is removed from ${pendingDelete.postCount} post${pendingDelete.postCount === 1 ? '' : 's'}. The posts themselves are kept.`
                : 'No post carries it.'}{' '}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.isError ? (
            <p role="alert" className="text-destructive text-sm">
              The tag could not be deleted. {(remove.error as Error).message}
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
              Delete tag
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPage>
  )
}
