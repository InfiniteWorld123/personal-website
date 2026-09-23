import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import { AlertTriangle, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import {
  LANGUAGES,
  TAG_LIMITS,
  TAG_PAGE_SIZE,
  type OwnerBlogTag,
} from '#/backend2/contracts/blog.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage } from '#/frontend/dashboard/primitives'
import { BlogDialog, ConfirmDialog, DialogActions, DialogAlert, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import { TAG_LANGUAGE_WORDS, type TagFormValues, tagErrors, tagSlugSuggestion } from '#/frontend/features/blog-v2/blog-form'
import { useArticles, useCreateTag, useDeleteTag, useSaveTag, useTags } from '#/frontend/features/blog-v2/queries'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { BlogHead, EmptyState, LoadFailure, Pager, RowSkeleton, StateBadge } from './blog-parts'

/**
 * The tag manager — the Blog's third tab.
 *
 * `docs/v2/blog.md`: tags, not categories; a curated set named in all three
 * languages; no thin landing pages. A tag an article carries cannot be
 * deleted — the server refuses, and the refusal names the articles, so the
 * owner knows where to take it off first.
 */

/* ---------------------------------------------------------------- the form */

function TagDialog({ tag, onClose }: { tag: OwnerBlogTag | null; onClose: () => void }) {
  const create = useCreateTag()
  const save = useSaveTag()
  const [failure, setFailure] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  // The address follows the English name until the owner types their own.
  const [slugTouched, setSlugTouched] = useState(tag !== null)

  const form = useForm({
    defaultValues: {
      names: tag ? { ...tag.names } : { de: '', en: '', ar: '' },
      slug: tag?.slug ?? '',
    } satisfies TagFormValues as TagFormValues,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields = tagErrors(value)

        return Object.keys(fields).length === 0 ? undefined : { fields }
      },
    },
    onSubmitInvalid: () => {
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('#tag-form [aria-invalid="true"]')?.focus())
    },
    onSubmit: async ({ value }) => {
      setFailure(null)
      setServerErrors({})

      const input = {
        names: { de: value.names.de.trim(), en: value.names.en.trim(), ar: value.names.ar.trim() },
        slug: value.slug.trim() || tagSlugSuggestion(value.names),
      }

      try {
        if (tag) {
          await save.mutateAsync({ id: tag.id, ...input })
          notify.success('Tag saved — renamed everywhere at once')
        } else {
          await create.mutateAsync(input)
          notify.success('Tag created')
        }

        onClose()
      } catch (caught) {
        const message = caught instanceof ApiRequestError ? caught.message : 'The tag could not be saved.'
        const issues = caught instanceof ApiRequestError ? (caught.details as { issues?: Array<{ field?: string; message: string }> } | undefined)?.issues : undefined
        const fields: Record<string, string> = {}

        for (const issue of issues ?? []) {
          if (issue.field === 'slug') fields.slug = issue.message
          const name = /^names\.(de|en|ar)$/.exec(issue.field ?? '')

          if (name) fields[`names.${name[1]}`] = issue.message
        }

        // A taken name or address is a conflict, said in a sentence; put it under the field it is about.
        if (caught instanceof ApiRequestError && caught.code === 'NAME_TAKEN') {
          const language = / in (DE|EN|AR)$/.exec(message)?.[1]?.toLowerCase()

          if (language) fields[`names.${language}`] = message
        } else if (caught instanceof ApiRequestError && caught.status === 409 && /address/i.test(message)) {
          fields.slug = message
        }

        setServerErrors(fields)
        setFailure(Object.keys(fields).length > 0 ? null : message)
        window.requestAnimationFrame(() => document.querySelector<HTMLElement>('#tag-form [aria-invalid="true"]')?.focus())
      }
    },
  })

  return (
    <BlogDialog labelledBy="tag-dialog-title" describedBy="tag-dialog-lead" onClose={onClose}>
      <form
        id="tag-form"
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <DialogTitle id="tag-dialog-title">{tag ? 'Edit tag' : 'New tag'}</DialogTitle>
        <p id="tag-dialog-lead" className="text-[13px] text-[var(--dash-quiet)]">
          {tag && tag.articleCount > 0
            ? `On ${tag.articleCount} ${tag.articleCount === 1 ? 'article' : 'articles'}. A new name shows everywhere at once — it does not wait for Publish update.`
            : 'Readers filter the blog by it. Name it in all three languages.'}
        </p>

        {LANGUAGES.map((code) => (
          <form.Field key={code} name={`names.${code}`}>
            {(field) => {
              const error = (field.state.meta.errors[0] as string | undefined) ?? serverErrors[`names.${code}`]
              const id = `tag-name-${code}`

              return (
                <div className="flex flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <label htmlFor={id} className="text-[12px] font-semibold">
                      Name ({TAG_LANGUAGE_WORDS[code]})
                    </label>
                    <span className="dash-num text-[11px] text-[var(--dash-quiet)]">
                      {field.state.value.length} / {TAG_LIMITS.name}
                    </span>
                  </span>
                  <input
                    id={id}
                    className={cn('dash-field h-9 px-3 text-[13px]', code === 'ar' && 'font-[family-name:var(--font-arabic)]')}
                    dir={code === 'ar' ? 'rtl' : 'ltr'}
                    lang={code}
                    maxLength={TAG_LIMITS.name + 10}
                    value={field.state.value}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                    onChange={(event) => {
                      field.handleChange(event.target.value)
                      setServerErrors(({ [`names.${code}`]: _gone, ...rest }) => rest)
                    }}
                    onBlur={field.handleBlur}
                    data-autofocus={code === 'en' ? true : undefined}
                  />
                  {error ? (
                    <p id={`${id}-error`} className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--dash-red-ink)]">
                      <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                      {error}
                    </p>
                  ) : null}
                </div>
              )
            }}
          </form.Field>
        ))}

        <form.Subscribe selector={(state) => state.values.names}>
          {(names) => (
            <form.Field name="slug">
              {(field) => {
                const error = (field.state.meta.errors[0] as string | undefined) ?? serverErrors.slug
                const shown = slugTouched ? field.state.value : tagSlugSuggestion(names)

                return (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="tag-slug" className="text-[12px] font-semibold">
                      Filter address
                    </label>
                    <input
                      id="tag-slug"
                      className="dash-field dash-num h-9 px-3 text-[13px]"
                      dir="ltr"
                      spellCheck={false}
                      autoComplete="off"
                      maxLength={TAG_LIMITS.slug + 10}
                      value={shown}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? 'tag-slug-error' : 'tag-slug-hint'}
                      onChange={(event) => {
                        setSlugTouched(true)
                        field.handleChange(event.target.value.toLowerCase())
                        setServerErrors(({ slug: _gone, ...rest }) => rest)
                      }}
                      onBlur={field.handleBlur}
                    />
                    {error ? (
                      <p id="tag-slug-error" className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--dash-red-ink)]">
                        <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                        {error}
                      </p>
                    ) : (
                      <p id="tag-slug-hint" className="text-[11.5px] text-[var(--dash-quiet)]">
                        Used as <span className="dash-num">?tag={shown || '…'}</span> on the blog. Suggested from the English name.
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
                {submitting ? 'Saving…' : tag ? 'Save tag' : 'Create tag'}
              </button>
            )}
          </form.Subscribe>
        </DialogActions>
      </form>
    </BlogDialog>
  )
}

/* ------------------------------------------------------------ delete */

/**
 * A tag on articles cannot go. Instead of a delete that fails, the owner gets
 * the articles that carry it — read from the article list with this tag as
 * its filter, so the answer is the server's and it is bounded.
 */
function TagInUseDialog({ tag, onClose }: { tag: OwnerBlogTag; onClose: () => void }) {
  const navigate = useNavigate()
  const users = useArticles({ tag: tag.id, pageSize: 10, sort: 'updated', language: 'en' })
  const total = users.data?.total ?? tag.articleCount

  return (
    <BlogDialog labelledBy="tag-in-use-title" describedBy="tag-in-use-text" role="alertdialog" size="sm" onClose={onClose}>
      <DialogTitle id="tag-in-use-title">“{tag.names.en}” is still in use</DialogTitle>
      <p id="tag-in-use-text" className="text-[13px] text-[var(--dash-quiet)]">
        It is on {total} {total === 1 ? 'article' : 'articles'}. Remove it there first — a draft, a scheduled version or the live one
        would otherwise lose a tag nobody asked it to lose.
      </p>
      {users.data ? (
        <ul className="flex flex-col gap-1.5">
          {users.data.items.map((article) => (
            <li key={article.id} className="flex items-center gap-2 text-[12.5px]">
              <StateBadge state={article.state} />
              <button
                type="button"
                className="min-w-0 truncate text-start font-medium hover:text-[var(--dash-brand)] hover:underline"
                onClick={() => void navigate({ to: '/dashboard/blog/$postId', params: { postId: article.id } })}
              >
                {article.displayTitle}
              </button>
            </li>
          ))}
          {users.data.total > users.data.items.length ? (
            <li className="text-[12px] text-[var(--dash-quiet)]">…and {users.data.total - users.data.items.length} more</li>
          ) : null}
        </ul>
      ) : users.isError ? (
        <p className="text-[12px] text-[var(--dash-quiet)]">The list of articles could not be loaded.</p>
      ) : (
        <span className="dash-skeleton block h-10 w-full rounded" aria-hidden="true" />
      )}
      <DialogActions>
        <button type="button" className="dash-btn dash-btn-primary" onClick={onClose} data-autofocus>
          OK
        </button>
      </DialogActions>
    </BlogDialog>
  )
}

/* -------------------------------------------------------------- the page */

export function BlogTagsPage() {
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<OwnerBlogTag | 'new' | null>(null)
  const [deleting, setDeleting] = useState<OwnerBlogTag | null>(null)
  const [inUse, setInUse] = useState<OwnerBlogTag | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(text.trim())
      setPage(1)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [text])

  const tags = useTags({ page, pageSize: TAG_PAGE_SIZE.default, search: debounced })
  const remove = useDeleteTag()

  const data = tags.data
  const items = data?.items ?? []

  useEffect(() => {
    if (data && data.page !== page) setPage(data.page)
  }, [data, page])

  return (
    <DashboardPage className="gap-5">
      <BlogHead
        tab="tags"
        actions={
          <button type="button" className="dash-btn dash-btn-primary" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden="true" />
            New tag
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Search tags</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--dash-quiet)]" aria-hidden="true" />
          <input
            className="dash-field h-9 w-full ps-9 pe-3 text-[13px]"
            placeholder="Search names or addresses…"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        {data ? (
          <span className="ms-auto hidden text-[11.5px] text-[var(--dash-quiet)] sm:inline">
            <span className="dash-num">{data.total}</span> {data.total === 1 ? 'tag' : 'tags'}
          </span>
        ) : null}
      </div>

      <section className="dash-panel overflow-hidden">
        {tags.isError && !data ? (
          <LoadFailure title="The tags could not be loaded" message="The server did not answer. Nothing was changed." onRetry={() => void tags.refetch()} />
        ) : !data ? (
          <ul aria-busy="true" aria-label="Loading tags">
            {Array.from({ length: 3 }, (_, index) => (
              <RowSkeleton key={index} />
            ))}
          </ul>
        ) : items.length === 0 ? (
          debounced ? (
            <EmptyState title="No tag matches">The search looks at all three names and the address.</EmptyState>
          ) : (
            <EmptyState
              title="No tags yet"
              action={
                <button type="button" className="dash-btn dash-btn-primary" onClick={() => setEditing('new')}>
                  <Plus className="size-4" aria-hidden="true" />
                  New tag
                </button>
              }
            >
              Create a few tags readers can filter by. Keep the set small — a tag with one article is not worth a filter.
            </EmptyState>
          )
        ) : (
          <ul aria-busy={tags.isFetching} aria-label="Tags">
            {items.map((tag) => (
              <li
                key={tag.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-[var(--dash-line)] px-4 py-3 last:border-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13.5px] font-semibold">{tag.names.en}</span>
                  <span className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11.5px] text-[var(--dash-quiet)]">
                    <span lang="de">DE {tag.names.de}</span>
                    <span>
                      AR{' '}
                      <bdi lang="ar" dir="rtl" className="font-[family-name:var(--font-arabic)]">
                        {tag.names.ar}
                      </bdi>
                    </span>
                    <span className="dash-num">?tag={tag.slug}</span>
                  </span>
                  <span className="dash-num text-[11.5px] text-[var(--dash-quiet)]">
                    {tag.articleCount
                      ? `On ${tag.articleCount} ${tag.articleCount === 1 ? 'article' : 'articles'} · ${tag.liveArticleCount} live`
                      : 'Not used yet — can be deleted'}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12px]" onClick={() => setEditing(tag)}>
                    <Pencil className="size-3.5" aria-hidden="true" />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="dash-btn dash-btn-ghost size-8 p-0"
                    aria-label={`Delete ${tag.names.en}`}
                    title="Delete"
                    onClick={() => (tag.articleCount > 0 ? setInUse(tag) : setDeleting(tag))}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data ? <Pager page={data.page} pageCount={data.pageCount} onPage={setPage} /> : null}

      {editing ? <TagDialog tag={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}

      {inUse ? <TagInUseDialog tag={inUse} onClose={() => setInUse(null)} /> : null}

      {deleting ? (
        <ConfirmDialog
          title={`Delete the tag “${deleting.names.en}”?`}
          confirmLabel="Delete tag"
          busyLabel="Deleting…"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await remove.mutateAsync(deleting.id)
              notify.success('Tag deleted')
              setDeleting(null)
            } catch (caught) {
              // An article took the tag in the meantime: show which, instead of a bare refusal.
              if (caught instanceof ApiRequestError && caught.code === 'TAG_IN_USE') {
                setInUse(deleting)
                setDeleting(null)

                return
              }

              throw caught instanceof ApiRequestError ? caught : new Error('The tag could not be deleted.')
            }
          }}
        >
          <p>No article carries it, so nothing else changes.</p>
        </ConfirmDialog>
      ) : null}
    </DashboardPage>
  )
}
