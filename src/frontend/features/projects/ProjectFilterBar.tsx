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
import { PROJECT_STATUSES } from '#/shared/validation/project.validation'
import { hasActiveFilters, type ProjectSearch } from './project-filters'

/** Long enough not to navigate on every keystroke, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 250

export function ProjectFilterBar({ search }: { search: ProjectSearch }) {
  const navigate = useNavigate({ from: '/admin/projects/' })
  const [term, setTerm] = useState(search.search ?? '')

  // The URL is the source of truth: a back button or a cleared filter has to
  // reach the input, not only the other way round.
  useEffect(() => setTerm(search.search ?? ''), [search.search])

  useEffect(() => {
    const current = search.search ?? ''
    if (term === current) return

    const timeout = setTimeout(() => {
      void navigate({
        search: (previous) => ({ ...previous, search: term || undefined, page: undefined }),
        replace: true,
      })
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timeout)
  }, [term, search.search, navigate])

  /** Any filter change returns to page one; page four of the old list is gone. */
  const update = (patch: Partial<ProjectSearch>) => {
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: undefined }) })
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-56 flex-1 flex-col gap-2">
        <Label htmlFor="project-search">Search</Label>
        <div className="relative">
          <SearchIcon
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          />
          <Input
            id="project-search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Name, summary, or slug"
            className="ps-9"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="project-status">Status</Label>
        <Select
          value={search.status ?? 'all'}
          onValueChange={(value) =>
            update({ status: value === 'all' ? undefined : (value as (typeof PROJECT_STATUSES)[number]) })
          }
        >
          <SelectTrigger id="project-status" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="building">In progress</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="project-published">Visibility</Label>
        <Select
          value={search.published ?? 'all'}
          onValueChange={(value) =>
            update({ published: value === 'all' ? undefined : (value as 'published' | 'draft') })
          }
        >
          <SelectTrigger id="project-published" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Published and drafts</SelectItem>
            <SelectItem value="published">Published only</SelectItem>
            <SelectItem value="draft">Drafts only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="project-tech">Technology</Label>
        <Input
          id="project-tech"
          defaultValue={search.tech ?? ''}
          onBlur={(event) => update({ tech: event.target.value.trim() || undefined })}
          placeholder="Stripe"
          className="w-40"
        />
      </div>

      {hasActiveFilters(search) ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            void navigate({
              search: { search: undefined, status: undefined, published: undefined, tech: undefined, page: undefined },
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
