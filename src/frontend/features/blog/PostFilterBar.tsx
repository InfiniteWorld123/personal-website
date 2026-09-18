import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/frontend/components/ui/select'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import { adminTagsQuery } from './post-queries'
import { hasActiveFilters, type PostSearch } from './post-filters'

/** Long enough not to navigate on every keystroke, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 250

export function PostFilterBar({ search }: { search: PostSearch }) {
  const navigate = useNavigate({ from: '/admin/blog/' })
  const tags = useQuery(adminTagsQuery())
  const [term, setTerm] = useState(search.search ?? '')

  // The URL is the source of truth: a back button or a cleared filter has to
  // reach the input, not only the other way round.
  useEffect(() => setTerm(search.search ?? ''), [search.search])

  useEffect(() => {
    const current = search.search ?? ''
    if (term === current) return

    const timeout = setTimeout(() => {
      void navigate({
        search: (previous) => ({
          ...previous,
          search: term || undefined,
          page: undefined,
        }),
        replace: true,
      })
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timeout)
  }, [term, search.search, navigate])

  /** Any filter change returns to page one; page four of the old list is gone. */
  const update = (patch: Partial<PostSearch>) => {
    void navigate({
      search: (previous) => ({ ...previous, ...patch, page: undefined }),
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-56 flex-1 flex-col gap-2">
        <Label htmlFor="post-search">Search</Label>
        <div className="relative">
          <SearchIcon
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          />
          <Input
            id="post-search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Title, summary, or slug"
            className="bg-panel ps-9"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="post-published">Visibility</Label>
        <Select
          value={search.published ?? 'all'}
          onValueChange={(value) =>
            update({
              published: value === 'all' ? undefined : (value as 'published' | 'draft'),
            })
          }
        >
          <SelectTrigger id="post-published" className="bg-panel w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Published and drafts</SelectItem>
            <SelectItem value="published">Published only</SelectItem>
            <SelectItem value="draft">Drafts only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/*
        A select with nothing in it and a select that has not arrived look
        identical, and the second one silently drops the tag the URL is
        already filtering by. So while the tags are in flight the control
        stands as its own shape rather than as an empty menu.
      */}
      {tags.isPending ? (
        <SkeletonScreen className="flex flex-col gap-2" label="Loading the tags">
          <Skeleton className="h-3.5 w-8" />
          <Skeleton className="h-8 w-44 rounded-lg" />
        </SkeletonScreen>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="post-tag">Tag</Label>
          <Select
            value={search.tag ?? 'all'}
            onValueChange={(value) => update({ tag: value === 'all' ? undefined : value })}
          >
            <SelectTrigger id="post-tag" className="bg-panel w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any tag</SelectItem>
              {(tags.data ?? []).map((tag) => (
                <SelectItem key={tag.id} value={tag.slug}>
                  {tag.names.en || tag.slug}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {hasActiveFilters(search) ? (
        <Button
          type="button"
          variant="ghost"
          className="rounded-full"
          onClick={() =>
            void navigate({
              search: {
                search: undefined,
                published: undefined,
                tag: undefined,
                page: undefined,
              },
            })
          }
        >
          <XIcon aria-hidden="true" />
          Clear filters
        </Button>
      ) : null}
    </div>
  )
}
