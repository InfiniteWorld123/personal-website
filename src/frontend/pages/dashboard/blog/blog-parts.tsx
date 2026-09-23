import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { BLOG_STATE_WORDS, type BlogState, LANGUAGES, type Language } from '#/backend2/contracts/blog.contract'
import { PageHead, StatusChip, type Tone } from '#/frontend/dashboard/primitives'
import { useArticles, useNewCommentCount, useTags } from '#/frontend/features/blog-v2/queries'
import { cn } from '#/frontend/lib/utils'

/**
 * The small pieces the Blog screens share, so no two of them can describe
 * one article differently. The same tones as Projects and Services, plus
 * "Scheduled", which only an article has.
 */

const STATE_TONE: Record<BlogState, Tone> = {
  draft: 'outline',
  scheduled: 'blue',
  published: 'blue',
  published_with_pending_changes: 'ink',
  unpublished: 'grey',
}

export function StateBadge({ state, className }: { state: BlogState; className?: string }) {
  return (
    <StatusChip tone={STATE_TONE[state]} className={className}>
      {state === 'published' ? <span className="size-1.5 rounded-full bg-[var(--dash-live)]" aria-hidden="true" /> : null}
      {state === 'scheduled' ? <Clock className="size-3" aria-hidden="true" /> : null}
      {BLOG_STATE_WORDS[state].label}
    </StatusChip>
  )
}

/** Struck through when missing: publication needs all three. */
export function LanguageTicks({ complete, className }: { complete: Language[]; className?: string }) {
  const missing = LANGUAGES.filter((language) => !complete.includes(language))

  return (
    <span
      className={cn('flex items-center gap-1', className)}
      role="img"
      aria-label={
        missing.length === 0
          ? 'Complete in all three languages'
          : `Still missing: ${missing.map((language) => language.toUpperCase()).join(', ')}`
      }
    >
      {LANGUAGES.map((language) => (
        <span
          key={language}
          aria-hidden="true"
          className={cn(
            'grid h-[18px] w-[22px] place-items-center rounded text-[10px] font-bold uppercase',
            complete.includes(language)
              ? 'bg-[var(--dash-blue-tint)] text-[var(--dash-blue-ink)]'
              : 'bg-[var(--dash-chip)] text-[var(--dash-quiet)] line-through opacity-70',
          )}
        >
          {language}
        </span>
      ))}
    </span>
  )
}

export function RowSkeleton() {
  return (
    <li className="flex items-center gap-3 border-b border-[var(--dash-line)] px-4 py-3 last:border-0">
      <span className="dash-skeleton h-12 w-[76px] shrink-0 rounded-[8px]" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="dash-skeleton h-3.5 w-48 max-w-full rounded" />
        <span className="dash-skeleton h-2.5 w-64 max-w-full rounded" />
      </span>
      <span className="dash-skeleton hidden h-6 w-24 rounded sm:block" />
    </li>
  )
}

export function LoadFailure({
  title,
  message,
  onRetry,
  retryLabel = 'Try again',
}: {
  title: string
  message: string
  onRetry: () => void
  retryLabel?: string
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 p-8">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="max-w-[52ch] text-[13px] text-[var(--dash-quiet)]">{message}</p>
      <button type="button" className="dash-btn dash-btn-quiet" onClick={onRetry}>
        {retryLabel}
      </button>
    </div>
  )
}

/** An empty list says why, and what to do next. */
export function EmptyState({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 p-8">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="max-w-[56ch] text-[13px] text-[var(--dash-quiet)]">{children}</p>
      {action}
    </div>
  )
}

/** Pages of a server-paginated list. The server clamps a page past the end; the caller follows it. */
export function Pager({
  page,
  pageCount,
  onPage,
  previous = 'Previous',
  next = 'Next',
}: {
  page: number
  pageCount: number
  onPage: (page: number) => void
  previous?: string
  next?: string
}) {
  if (pageCount <= 1) return null

  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-[12px]">
      <span className="text-[var(--dash-quiet)]">
        Page <span className="dash-num font-semibold text-[var(--dash-ink)]">{page}</span> of{' '}
        <span className="dash-num font-semibold text-[var(--dash-ink)]">{pageCount}</span>
      </span>
      <span className="flex gap-2">
        <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12px]" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
          {previous}
        </button>
        <button
          type="button"
          className="dash-btn dash-btn-quiet h-8 text-[12px]"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          {next}
          <ChevronRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
        </button>
      </span>
    </nav>
  )
}

/** A count on a tab or in the sidebar. Blue when it asks for attention, grey when it only informs. */
export function CountBadge({ count, quiet = false, label }: { count: number; quiet?: boolean; label?: string }) {
  return (
    <span
      className={cn(
        'dash-num grid h-[18px] min-w-5 place-items-center rounded-md px-1.5 text-[10.5px] font-bold',
        quiet ? 'bg-[var(--dash-chip)] text-[var(--dash-quiet)]' : 'bg-[var(--dash-brand)] text-white',
      )}
      title={label}
    >
      {count}
      {label ? <span className="sr-only"> {label}</span> : null}
    </span>
  )
}

export type BlogTab = 'articles' | 'comments' | 'tags'

const TAB_WORDS: Record<BlogTab, { title: string; description: string; to: string }> = {
  articles: {
    title: 'Articles',
    description: 'Write in one language, publish in three. Saving never changes what visitors read.',
    to: '/dashboard/blog',
  },
  comments: {
    title: 'Comments',
    description: 'Every comment is public the moment it is posted. Answer, or remove a whole branch.',
    to: '/dashboard/blog/comments',
  },
  tags: {
    title: 'Tags',
    description: 'A curated set, named in all three languages. A tag an article carries cannot be deleted.',
    to: '/dashboard/blog/tags',
  },
}

/**
 * The top of the Blog: its name, the tab's own sentence, and the three tabs
 * (approved choice 1A — comments and tags live inside Blog). The tabs are
 * links, so each one has an address, Back works, and the comments count is
 * visible from wherever the owner is in the Blog.
 */
export function BlogHead({ tab, actions }: { tab: BlogTab; actions?: React.ReactNode }) {
  const articles = useArticles({ pageSize: 1 })
  const tags = useTags({ pageSize: 1 })
  const fresh = useNewCommentCount()
  const counts: Record<BlogTab, { count: number | undefined; quiet: boolean; label: string }> = {
    articles: { count: articles.data?.total, quiet: true, label: 'articles' },
    comments: { count: fresh.data, quiet: false, label: 'new' },
    tags: { count: tags.data?.total, quiet: true, label: 'tags' },
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHead eyebrow="BLOG" title={TAB_WORDS[tab].title} description={TAB_WORDS[tab].description} actions={actions} />

      <nav aria-label="Blog" className="-mb-1 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-[var(--dash-line)]">
        {(Object.keys(TAB_WORDS) as BlogTab[]).map((key) => {
          const { count, quiet, label } = counts[key]

          return (
            <Link
              key={key}
              to={TAB_WORDS[key].to}
              aria-current={key === tab ? 'page' : undefined}
              className={cn(
                '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap',
                key === tab
                  ? 'border-[var(--dash-brand)] text-[var(--dash-brand)]'
                  : 'border-transparent text-[var(--dash-quiet)] hover:text-[var(--dash-ink)]',
              )}
            >
              {TAB_WORDS[key].title}
              {count ? <CountBadge count={count} quiet={quiet} label={label} /> : null}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
