import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon, PlusIcon } from 'lucide-react'
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
import { ApiRequestError } from '#/frontend/api/response'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/frontend/components/ui/table'
import { adminTagsQuery, useDeleteTag, useSaveTag } from '#/frontend/features/blog/post-queries'
import { slugify } from '#/frontend/features/blog/post-form-values'
import type { AdminTag } from '#/shared/types/post.types'
import { POST_LANGUAGES, type PostLanguage } from '#/shared/validation/post.validation'

const LANGUAGE_LABELS: Record<PostLanguage, string> = {
  de: 'German',
  en: 'English',
  ar: 'Arabic',
}

type Draft = { id: string | null; slug: string; names: Record<PostLanguage, string> }

const emptyDraft = (): Draft => ({ id: null, slug: '', names: { de: '', en: '', ar: '' } })

const toDraft = (tag: AdminTag): Draft => ({ id: tag.id, slug: tag.slug, names: { ...tag.names } })

/**
 * Tags are small enough to edit in place: a row is the tag, and opening one
 * turns it into the same three-language form the "new tag" button opens.
 */
export function TagsPage() {
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link to="/admin/blog">
            <ArrowLeftIcon aria-hidden="true" />
            All posts
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              What the blog archive filters by. A tag reaches the reader, so it is written in all
              three languages.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setErrorMessage(null)
              setDraft(emptyDraft())
            }}
          >
            <PlusIcon aria-hidden="true" />
            New tag
          </Button>
        </div>
      </div>

      {draft ? (
        <div className="border-border flex flex-col gap-4 rounded-lg border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
                      names: { ...draft.names, [language]: event.target.value },
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
            <Button type="button" disabled={save.isPending} onClick={() => void submit()}>
              {save.isPending ? 'Saving…' : draft.id ? 'Save tag' : 'Create tag'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {tags.isPending ? (
        <p className="text-muted-foreground py-12 text-center text-sm">Loading tags…</p>
      ) : tags.isError ? (
        <div className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="text-destructive text-sm">
            The tags could not be loaded. {(tags.error as Error).message}
          </p>
          <Button type="button" variant="outline" onClick={() => void tags.refetch()}>
            Try again
          </Button>
        </div>
      ) : (tags.data ?? []).length === 0 ? (
        <div className="border-border rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm font-medium">No tags yet.</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Posts can be published without one; tags are what makes a growing archive navigable.
          </p>
        </div>
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Slug</TableHead>
                {POST_LANGUAGES.map((language) => (
                  <TableHead key={language}>{LANGUAGE_LABELS[language]}</TableHead>
                ))}
                <TableHead className="text-end">Posts</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tags.data ?? []).map((tag) => (
                <TableRow key={tag.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">
                    {tag.slug}
                  </TableCell>
                  {POST_LANGUAGES.map((language) => (
                    <TableCell key={language}>{tag.names[language]}</TableCell>
                  ))}
                  <TableCell className="text-end tabular-nums">{tag.postCount}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
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
                        className="text-destructive"
                        onClick={() => setPendingDelete(tag)}
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

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
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
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) remove.mutate(pendingDelete.id)
                setPendingDelete(null)
              }}
            >
              Delete tag
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
