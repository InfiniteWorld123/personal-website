import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import {
  AlertTriangle,
  CalendarClock,
  Eye,
  Heart,
  ImageIcon,
  Loader2,
  MessageSquare,
  MessageSquareOff,
  Plus,
  Search,
  TriangleAlert,
} from 'lucide-react'
import {
  BLOG_LIMITS,
  BLOG_PAGE_SIZE,
  type BlogListSort,
  type BlogListState,
  LANGUAGES,
  type Language,
  type OwnerBlogListItem,
} from '#/backend2/contracts/blog.contract'
import { LANGUAGE_WORDS } from '#/backend2/contracts/project.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage } from '#/frontend/dashboard/primitives'
import { BlogDialog, DialogActions, DialogAlert, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import { berlinShort, dashAgo, dashDate } from '#/frontend/features/blog-v2/blog-time'
import { useArticles, useCreateArticle, useTags } from '#/frontend/features/blog-v2/queries'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { BlogHead, EmptyState, LanguageTicks, LoadFailure, Pager, RowSkeleton, StateBadge } from './blog-parts'

/**
 * Every article, newest edit first — the Blog's first tab.
 *
 * Server-paginated like every V2 list, with search, state, tag and sort on
 * the server too. The row says what the owner needs before opening an
 * article: its state, when it goes or went live, whether its schedule ran
 * late, whether comments are off, how it is read, and whether any comment is
 * new.
 */

const STATE_FILTERS: Array<{ value: BlogListState; label: string }> = [
  { value: 'all', label: 'All states' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Live' },
  { value: 'pending', label: 'Live · edited' },
  { value: 'unpublished', label: 'Taken down' },
]

const SORTS: Array<{ value: BlogListSort; label: string }> = [
  { value: 'updated', label: 'Recently edited' },
  { value: 'published', label: 'Newest published' },
  { value: 'created', label: 'Recently created' },
]

function ArticleRow({ item, onOpen }: { item: OwnerBlogListItem; onOpen: () => void }) {
  const fresh = item.counts.newComments
  const late = item.publicationDelay && item.state !== 'scheduled' ? item.publicationDelay.minutesLate : 0

  return (
    <li className="flex items-center gap-3 border-b border-[var(--dash-line)] px-4 py-3 last:border-0">
      <span className="grid aspect-[16/10] w-[76px] shrink-0 place-items-center overflow-hidden rounded-[8px] bg-[var(--dash-chip)] text-[var(--dash-quiet)]">
        {item.coverUrl ? (
          <img src={item.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-[18px]" aria-hidden="true" />
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <button
          type="button"
          onClick={onOpen}
          className="max-w-full truncate text-start text-[13.5px] font-semibold hover:text-[var(--dash-brand)] hover:underline"
        >
          {item.displayTitle}
        </button>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--dash-quiet)]">
          <span className="dash-num">/{item.slug || '—'}</span>
          <span aria-hidden="true">·</span>
          {item.schedule ? (
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--dash-blue-ink)]">
              <CalendarClock className="size-3" aria-hidden="true" />
              Goes live {berlinShort(new Date(item.schedule.publishAt))} Berlin
            </span>
          ) : item.firstPublishedAt ? (
            <span>Published {dashDate(item.firstPublishedAt)}</span>
          ) : (
            <span>Edited {dashAgo(item.updatedAt)}</span>
          )}
          {late ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-semibold text-[var(--dash-red-ink)]" title="The schedule ran late">
                <TriangleAlert className="size-3" aria-hidden="true" />
                {late} min late
              </span>
            </>
          ) : null}
          {!item.commentsEnabled ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <MessageSquareOff className="size-3" aria-hidden="true" />
                Comments off
              </span>
            </>
          ) : null}
          <StateBadge state={item.state} className="lg:hidden" />
        </span>
      </span>

      <span
        className="hidden shrink-0 items-center gap-3 text-[11.5px] text-[var(--dash-quiet)] md:flex"
        aria-label={`${item.counts.reads} reads, ${item.counts.likes} likes, ${item.counts.comments} comments${fresh ? `, ${fresh} new` : ''}`}
      >
        <span className="dash-num inline-flex items-center gap-1" title="Reads" aria-hidden="true">
          <Eye className="size-3.5" />
          {item.counts.reads.toLocaleString('en')}
        </span>
        <span className="dash-num inline-flex items-center gap-1" title="Likes" aria-hidden="true">
          <Heart className="size-3.5" />
          {item.counts.likes.toLocaleString('en')}
        </span>
        <span
          className={cn('dash-num inline-flex items-center gap-1', fresh > 0 && 'font-bold text-[var(--dash-blue-ink)]')}
          title={fresh ? `${fresh} new` : 'Comments'}
          aria-hidden="true"
        >
          <MessageSquare className="size-3.5" />
          {item.counts.comments}
          {fresh ? <span className="size-[7px] rounded-full bg-[var(--dash-brand)]" /> : null}
        </span>
      </span>

      <LanguageTicks complete={item.languagesComplete} className="hidden shrink-0 xl:flex" />

      <span className="hidden w-[7.5rem] shrink-0 lg:block">
        <StateBadge state={item.state} />
      </span>
    </li>
  )
}

/* ----------------------------------------------------------- new article */

function NewArticleDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const create = useCreateArticle()
  const [failure, setFailure] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { language: 'en' as Language, title: '' },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) =>
        value.title.trim().length > BLOG_LIMITS.title
          ? { fields: { title: `A title is at most ${BLOG_LIMITS.title} characters` } }
          : undefined,
    },
    onSubmitInvalid: () => {
      window.requestAnimationFrame(() => document.getElementById('new-article-title')?.focus())
    },
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        const article = await create.mutateAsync({ title: value.title.trim(), language: value.language })

        notify.success('Draft created — only you can see it')
        await navigate({
          to: '/dashboard/blog/$postId',
          params: { postId: article.id },
          search: { language: value.language },
        })
      } catch (caught) {
        setFailure(caught instanceof ApiRequestError ? caught.message : 'The draft could not be created. Try again.')
      }
    },
  })

  return (
    <BlogDialog labelledBy="new-article-heading" describedBy="new-article-lead" onClose={onClose}>
      <form
        noValidate
        className="flex flex-col gap-3.5"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <DialogTitle id="new-article-heading">New article</DialogTitle>
        <p id="new-article-lead" className="text-[13px] text-[var(--dash-quiet)]">
          A private draft. Write in one language first; the other two are needed only when you publish.
        </p>

        <form.Field name="language">
          {(field) => (
            <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className="mb-1.5 p-0 text-[12px] font-semibold">Written in</legend>
              <div className="flex w-fit rounded-[9px] border border-[var(--dash-line)] p-0.5">
                {LANGUAGES.map((code) => (
                  <label
                    key={code}
                    className={cn(
                      'flex h-8 cursor-pointer items-center rounded-[7px] px-3 text-[12.5px] font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--dash-blue)]',
                      field.state.value === code
                        ? 'bg-[var(--dash-brand)] text-white'
                        : 'text-[var(--dash-quiet)] hover:text-[var(--dash-ink)]',
                    )}
                  >
                    <input
                      type="radio"
                      name="new-article-language"
                      className="sr-only"
                      checked={field.state.value === code}
                      onChange={() => field.handleChange(code)}
                    />
                    {LANGUAGE_WORDS[code]}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.language}>
          {(language) => (
            <form.Field name="title">
              {(field) => {
                const error = field.state.meta.errors[0] as string | undefined

                return (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="new-article-title" className="text-[12px] font-semibold">
                      Working title <span className="font-normal text-[var(--dash-quiet)]">— optional</span>
                    </label>
                    <input
                      id="new-article-title"
                      className={cn('dash-field h-9 px-3 text-[13px]', language === 'ar' && 'font-[family-name:var(--font-arabic)]')}
                      dir={language === 'ar' ? 'rtl' : 'ltr'}
                      lang={language}
                      maxLength={BLOG_LIMITS.title + 20}
                      value={field.state.value}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? 'new-article-title-error' : 'new-article-title-hint'}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      data-autofocus
                    />
                    {error ? (
                      <p id="new-article-title-error" className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--dash-red-ink)]">
                        <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                        {error}
                      </p>
                    ) : (
                      <p id="new-article-title-hint" className="text-[11.5px] text-[var(--dash-quiet)]">
                        {language === 'ar'
                          ? 'An Arabic title suggests no web address — you choose one later.'
                          : 'The web address is suggested from it; you can change it until you publish.'}
                      </p>
                    )}
                  </div>
                )
              }}
            </form.Field>
          )}
        </form.Subscribe>

        {failure ? <DialogAlert>{failure}</DialogAlert> : null}

        <DialogActions>
          <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(submitting) => (
              <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {submitting ? 'Creating…' : 'Create draft'}
              </button>
            )}
          </form.Subscribe>
        </DialogActions>
      </form>
    </BlogDialog>
  )
}

/* -------------------------------------------------------------- the page */

export function BlogArticlesPage() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [state, setState] = useState<BlogListState>('all')
  const [tag, setTag] = useState('all')
  const [sort, setSort] = useState<BlogListSort>('updated')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const liveRegion = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search.trim())
      setPage(1)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [search])

  const articles = useArticles({
    page,
    pageSize: BLOG_PAGE_SIZE.default,
    search: debounced,
    state,
    tag,
    sort,
    language: 'en',
  })
  const tags = useTags({ pageSize: 100 })

  const data = articles.data
  const items = data?.items ?? []
  const filtering = debounced !== '' || state !== 'all' || tag !== 'all'

  // The server clamps a page past the end; follow it.
  useEffect(() => {
    if (data && data.page !== page) setPage(data.page)
  }, [data, page])

  useEffect(() => {
    if (data && liveRegion.current) {
      liveRegion.current.textContent = `${data.total} ${data.total === 1 ? 'article' : 'articles'}`
    }
  }, [data])

  const clearFilters = () => {
    setSearch('')
    setDebounced('')
    setState('all')
    setTag('all')
    setPage(1)
  }

  return (
    <DashboardPage className="gap-5">
      <BlogHead
        tab="articles"
        actions={
          <button type="button" className="dash-btn dash-btn-primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden="true" />
            New article
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Search articles</span>
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--dash-quiet)]"
            aria-hidden="true"
          />
          <input
            className="dash-field h-9 w-full ps-9 pe-3 text-[13px]"
            placeholder="Search titles, summaries, addresses…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <label>
          <span className="sr-only">Filter by state</span>
          <select
            className="dash-field h-9 px-2.5 text-[13px]"
            value={state}
            onChange={(event) => {
              setState(event.target.value as BlogListState)
              setPage(1)
            }}
          >
            {STATE_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">Filter by tag</span>
          <select
            className="dash-field h-9 max-w-[12rem] px-2.5 text-[13px]"
            value={tag}
            onChange={(event) => {
              setTag(event.target.value)
              setPage(1)
            }}
          >
            <option value="all">All tags</option>
            {(tags.data?.items ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.names.en}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">Sort</span>
          <select
            className="dash-field h-9 px-2.5 text-[13px]"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as BlogListSort)
              setPage(1)
            }}
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {data ? (
          <span className="ms-auto hidden text-[11.5px] text-[var(--dash-quiet)] sm:inline">
            <span className="dash-num">{data.total}</span> {data.total === 1 ? 'article' : 'articles'}
          </span>
        ) : null}
      </div>

      <section className="dash-panel overflow-hidden">
        {articles.isError && !data ? (
          <LoadFailure
            title="The articles could not be loaded"
            message="The server did not answer. Nothing was changed."
            onRetry={() => void articles.refetch()}
          />
        ) : !data ? (
          <ul aria-busy="true" aria-label="Loading articles">
            {Array.from({ length: 4 }, (_, index) => (
              <RowSkeleton key={index} />
            ))}
          </ul>
        ) : items.length === 0 ? (
          filtering ? (
            <EmptyState
              title="No article matches"
              action={
                <button type="button" className="dash-btn dash-btn-quiet" onClick={clearFilters}>
                  Clear the filters
                </button>
              }
            >
              Nothing matches these filters. The search looks at addresses, titles and summaries in all three languages.
            </EmptyState>
          ) : (
            <EmptyState
              title="No articles yet"
              action={
                <button type="button" className="dash-btn dash-btn-primary" onClick={() => setCreating(true)}>
                  <Plus className="size-4" aria-hidden="true" />
                  Write your first article
                </button>
              }
            >
              Start with one language — you can add the other two before you publish. Nothing is public until you press
              Publish.
            </EmptyState>
          )
        ) : (
          <ul aria-busy={articles.isFetching} aria-label="Articles">
            {items.map((item) => (
              <ArticleRow
                key={item.id}
                item={item}
                onOpen={() => void navigate({ to: '/dashboard/blog/$postId', params: { postId: item.id } })}
              />
            ))}
          </ul>
        )}
      </section>

      {articles.isError && data ? (
        <p role="alert" className="dash-tone-red rounded-lg px-3 py-2 text-[12.5px]">
          The list could not be refreshed. What you see may be out of date.
        </p>
      ) : null}

      <p ref={liveRegion} role="status" aria-live="polite" className="sr-only" />

      {data ? <Pager page={data.page} pageCount={data.pageCount} onPage={setPage} /> : null}

      {creating ? <NewArticleDialog onClose={() => setCreating(false)} /> : null}
    </DashboardPage>
  )
}
