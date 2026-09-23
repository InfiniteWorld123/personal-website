import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import { AlertTriangle, Check, CheckCheck, CornerDownRight, Loader2, Reply, Search, Send, Trash2, User, X } from 'lucide-react'
import {
  BLOG_AUTHOR_NAME,
  BLOG_STATE_WORDS,
  COMMENT_LIMITS,
  type CommentAuthor,
  OWNER_COMMENT_PAGE,
  type OwnerComment,
  normalizeCommentText,
} from '#/backend2/contracts/blog.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardMark } from '#/frontend/dashboard/DashboardMark'
import { DashboardPage, StatusChip } from '#/frontend/dashboard/primitives'
import { BlogDialog, ConfirmDialog, DialogAlert, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import { dashAgo } from '#/frontend/features/blog-v2/blog-time'
import {
  useArticles,
  useCommentThread,
  useComments,
  useDeleteComment,
  useMarkCommentsSeen,
  useReplyToComment,
} from '#/frontend/features/blog-v2/queries'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { BlogHead, EmptyState, LoadFailure, Pager, RowSkeleton } from './blog-parts'

/**
 * Every comment, newest first — the Blog's second tab.
 *
 * `docs/v2/blog.md`: comments publish immediately, there is no approval queue,
 * and the Dashboard is the only place new ones are announced. So this is an
 * activity list rather than an inbox: a new comment is marked until the owner
 * says they have seen it, and every row opens the conversation around it —
 * what it answers, and how much hangs below it — before a reply or a delete.
 */

/** Approved choice 2A: the generic visitor label. The Dashboard is English. */
const VISITOR = 'Guest'

const who = (author: CommentAuthor) => (author === 'owner' ? BLOG_AUTHOR_NAME : VISITOR)

function Avatar({ author }: { author: CommentAuthor }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-[30px] shrink-0 place-items-center overflow-hidden rounded-[9px]',
        author === 'owner' ? 'bg-[var(--dash-slab)] text-[var(--dash-slab-ink)]' : 'bg-[var(--dash-chip)] text-[var(--dash-quiet)]',
      )}
    >
      {author === 'owner' ? <DashboardMark size={16} /> : <User className="size-[15px]" />}
    </span>
  )
}

/** Where the comment is, and whether a visitor can see it there. */
function Visibility({ comment }: { comment: OwnerComment }) {
  if (comment.post.state !== 'published' && comment.post.state !== 'published_with_pending_changes') {
    return <StatusChip tone="outline" className="h-5 px-2 text-[10.5px]">{BLOG_STATE_WORDS[comment.post.state].label} · hidden</StatusChip>
  }

  if (!comment.post.commentsEnabled) {
    return <StatusChip tone="outline" className="h-5 px-2 text-[10.5px]">Comments off · hidden</StatusChip>
  }

  return null
}

function CommentRow({
  comment,
  onOpen,
  onSeen,
  onDelete,
  seeing,
}: {
  comment: OwnerComment
  onOpen: () => void
  onSeen: () => void
  onDelete: () => void
  seeing: boolean
}) {
  const navigate = useNavigate()

  return (
    <li
      className={cn(
        'flex items-start gap-3 border-b border-[var(--dash-line)] px-4 py-3 last:border-0',
        comment.isNew && 'bg-[color-mix(in_srgb,var(--dash-blue-tint)_60%,transparent)]',
      )}
    >
      <Avatar author={comment.author} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[var(--dash-quiet)]">
          {comment.isNew ? (
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--dash-blue-ink)]">
              <span className="size-[7px] rounded-full bg-[var(--dash-brand)]" aria-hidden="true" />
              New
            </span>
          ) : null}
          <span className="font-semibold text-[var(--dash-ink)]">{who(comment.author)}</span>
          <time dateTime={comment.createdAt} title={new Date(comment.createdAt).toLocaleString('en-GB')}>
            {dashAgo(comment.createdAt)}
          </time>
          <span aria-hidden="true">·</span>
          <span className="min-w-0 truncate">
            on{' '}
            <button
              type="button"
              className="font-medium text-[var(--dash-ink)] hover:text-[var(--dash-brand)] hover:underline"
              onClick={() => void navigate({ to: '/dashboard/blog/$postId', params: { postId: comment.post.id } })}
            >
              {comment.post.title}
            </button>
          </span>
          <Visibility comment={comment} />
        </div>

        <p className="mt-1 text-[13px] leading-relaxed break-words whitespace-pre-wrap [unicode-bidi:plaintext]" dir="auto">
          {comment.body}
        </p>

        {comment.parent ? (
          <p
            className="mt-1.5 truncate border-s-2 border-[var(--dash-line)] ps-2 text-[11.5px] text-[var(--dash-quiet)] [unicode-bidi:plaintext]"
            dir="auto"
          >
            In reply to {comment.parent.author === 'owner' ? 'you' : VISITOR}: {comment.parent.excerpt}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-1">
          <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12px]" onClick={onOpen}>
            <Reply className="size-3.5" aria-hidden="true" />
            Reply
          </button>
          <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12px]" onClick={onOpen}>
            Conversation{comment.replyCount ? ` · ${comment.replyCount} ${comment.replyCount === 1 ? 'reply' : 'replies'}` : ''}
          </button>
          {comment.isNew ? (
            <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12px]" onClick={onSeen} disabled={seeing}>
              <Check className="size-3.5" aria-hidden="true" />
              Seen
            </button>
          ) : null}
          <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12px] text-[var(--dash-red-ink)]" onClick={onDelete}>
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete
          </button>
        </div>
      </div>
    </li>
  )
}

/* ------------------------------------------------------ the conversation */

function ConversationDialog({
  commentId,
  onClose,
  onDelete,
}: {
  commentId: string
  onClose: () => void
  onDelete: () => void
}) {
  const thread = useCommentThread(commentId)
  const reply = useReplyToComment()
  const [failure, setFailure] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { body: '' },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const text = normalizeCommentText(value.body)

        if (text === '') return { fields: { body: 'Write the reply before sending it' } }
        if (text.length > COMMENT_LIMITS.body) {
          return { fields: { body: `A reply is at most ${COMMENT_LIMITS.body.toLocaleString('en')} characters` } }
        }

        return undefined
      },
    },
    onSubmitInvalid: () => {
      window.requestAnimationFrame(() => document.getElementById('conversation-reply')?.focus())
    },
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        await reply.mutateAsync({ id: commentId, body: value.body })

        const post = thread.data?.comment.post
        const visible = post && (post.state === 'published' || post.state === 'published_with_pending_changes') && post.commentsEnabled

        notify.success(visible ? 'Reply posted — visitors see it now' : 'Reply saved — it shows when the article and its comments are public')
        onClose()
      } catch (caught) {
        setFailure(caught instanceof ApiRequestError ? caught.message : 'The reply could not be sent. Your text is still here.')
      }
    },
  })

  const data = thread.data
  const comment = data?.comment
  const post = comment?.post
  const hidden = post
    ? post.state !== 'published' && post.state !== 'published_with_pending_changes'
      ? 'the article is not live — hidden from visitors'
      : !post.commentsEnabled
        ? 'comments are off — hidden from visitors'
        : 'visible to visitors'
    : ''
  const depth = data ? data.ancestors.length : 0
  const tooDeep = comment ? comment.level >= COMMENT_LIMITS.depth : false

  return (
    <BlogDialog labelledBy="conversation-title" describedBy="conversation-where" size="lg" onClose={onClose}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <DialogTitle id="conversation-title">Conversation</DialogTitle>
          <p id="conversation-where" className="mt-0.5 text-[12.5px] text-[var(--dash-quiet)]">
            {post ? (
              <>
                On “{post.title}” · {hidden}
              </>
            ) : (
              'Loading…'
            )}
          </p>
        </div>
        <button type="button" className="dash-btn dash-btn-ghost size-8 p-0" aria-label="Close" onClick={onClose}>
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {thread.isError ? (
        <LoadFailure
          title={thread.error instanceof ApiRequestError && thread.error.status === 404 ? 'That comment is not there any more' : 'The conversation could not be loaded'}
          message="It may have been deleted with the comment it answered. Nothing else changed."
          retryLabel="Close"
          onRetry={onClose}
        />
      ) : !data || !comment ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading the conversation">
          <span className="dash-skeleton h-3 w-40 rounded" />
          <span className="dash-skeleton h-12 w-full rounded" />
        </div>
      ) : (
        <>
          <ol className="flex max-h-[45vh] flex-col overflow-y-auto" aria-label="The conversation above this comment">
            {data.ancestors.map((entry, index) => (
              <li key={entry.id} className="relative py-2 text-[12.5px] leading-relaxed" style={{ paddingInlineStart: `${index * 16 + 14}px` }}>
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 w-0.5 bg-[var(--dash-line)]"
                  style={{ insetInlineStart: `${index * 16 + 4}px` }}
                />
                <span className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-[var(--dash-quiet)]">
                  <span className="font-semibold text-[var(--dash-ink)]">{who(entry.author)}</span>
                  <span>{dashAgo(entry.createdAt)}</span>
                </span>
                <span className="mt-0.5 block break-words whitespace-pre-wrap [unicode-bidi:plaintext]" dir="auto">
                  {entry.body}
                </span>
              </li>
            ))}
            <li
              className="mt-1 rounded-[10px] border border-[var(--dash-brand)] bg-[var(--dash-blue-tint)] px-3 py-2.5"
              style={{ marginInlineStart: `${depth * 16}px` }}
              aria-current="true"
            >
              <span className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-[var(--dash-quiet)]">
                <span className="font-semibold text-[var(--dash-ink)]">{who(comment.author)}</span>
                <span>{dashAgo(comment.createdAt)}</span>
                {comment.isNew ? <StatusChip tone="blue" className="h-5 px-2 text-[10.5px]">new</StatusChip> : null}
              </span>
              <span className="mt-1 block text-[13px] leading-relaxed break-words whitespace-pre-wrap [unicode-bidi:plaintext]" dir="auto">
                {comment.body}
              </span>
            </li>
          </ol>
          {data.descendantCount ? (
            <p className="flex items-center gap-1.5 text-[12px] text-[var(--dash-quiet)]" style={{ marginInlineStart: `${depth * 16 + 14}px` }}>
              <CornerDownRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
              {data.descendantCount} {data.descendantCount === 1 ? 'reply' : 'replies'} below this comment
            </p>
          ) : null}

          {tooDeep ? (
            <p className="rounded-lg bg-[var(--dash-furniture)] px-3 py-2 text-[12.5px] text-[var(--dash-quiet)]">
              This conversation is {COMMENT_LIMITS.depth} levels deep, the most a reply can go. Answer an earlier comment instead.
            </p>
          ) : (
            <form
              noValidate
              className="flex flex-col gap-1.5"
              onSubmit={(event) => {
                event.preventDefault()
                void form.handleSubmit()
              }}
            >
              <form.Field name="body">
                {(field) => {
                  const error = field.state.meta.errors[0] as string | undefined

                  return (
                    <>
                      <label htmlFor="conversation-reply" className="text-[12px] font-semibold">
                        Your reply, as {BLOG_AUTHOR_NAME}
                      </label>
                      <textarea
                        id="conversation-reply"
                        rows={3}
                        dir="auto"
                        className="dash-field px-3 py-2 text-[13px]"
                        value={field.state.value}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? 'conversation-reply-error' : 'conversation-reply-hint'}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        // It appears only once the conversation has loaded, after the
                        // dialog has placed focus — so it takes focus as it arrives.
                        autoFocus
                      />
                      {error ? (
                        <p id="conversation-reply-error" className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--dash-red-ink)]">
                          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                          {error}
                        </p>
                      ) : (
                        <p id="conversation-reply-hint" className="text-[11.5px] text-[var(--dash-quiet)]">
                          Shown with your name and an “Author” mark. Links are fine in your own replies.
                        </p>
                      )}
                    </>
                  )
                }}
              </form.Field>

              {failure ? <DialogAlert>{failure}</DialogAlert> : null}

              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <button type="button" className="dash-btn dash-tone-red h-8 text-[12px]" onClick={onDelete}>
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  {data.descendantCount ? 'Delete with replies…' : 'Delete…'}
                </button>
                <span className="flex gap-2">
                  <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>
                    Close
                  </button>
                  <form.Subscribe selector={(state) => state.isSubmitting}>
                    {(submitting) => (
                      <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting}>
                        {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />}
                        {submitting ? 'Sending…' : 'Reply'}
                      </button>
                    )}
                  </form.Subscribe>
                </span>
              </div>
            </form>
          )}

          {tooDeep ? (
            <div className="flex justify-between gap-2">
              <button type="button" className="dash-btn dash-tone-red h-8 text-[12px]" onClick={onDelete}>
                <Trash2 className="size-3.5" aria-hidden="true" />
                {data.descendantCount ? 'Delete with replies…' : 'Delete…'}
              </button>
              <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>
                Close
              </button>
            </div>
          ) : null}
        </>
      )}
    </BlogDialog>
  )
}

/** Before deleting, the size of the branch — read from the server, not guessed from the row. */
function DeleteCommentDialog({ commentId, onClose }: { commentId: string; onClose: () => void }) {
  const thread = useCommentThread(commentId)
  const remove = useDeleteComment()
  const below = thread.data?.descendantCount ?? 0

  return (
    <ConfirmDialog
      title={below ? `Delete this comment and its ${below} ${below === 1 ? 'reply' : 'replies'}?` : 'Delete this comment?'}
      confirmLabel={below ? `Delete ${below + 1} comments` : 'Delete comment'}
      busyLabel="Deleting…"
      danger
      disabled={!thread.data}
      onClose={onClose}
      onConfirm={async () => {
        try {
          const result = await remove.mutateAsync(commentId)

          notify.success(result.deleted === 1 ? 'Comment deleted' : `${result.deleted} comments deleted`)
          onClose()
        } catch (caught) {
          throw caught instanceof ApiRequestError ? caught : new Error('The comment could not be deleted.')
        }
      }}
    >
      <p>
        {below
          ? 'A reply cannot stay without the comment it answers, so the whole branch goes. Visitors stop seeing it at once. This cannot be undone.'
          : 'Visitors stop seeing it at once. This cannot be undone.'}
      </p>
      {thread.data ? (
        <p className="truncate border-s-2 border-[var(--dash-line)] ps-2 text-[12px] [unicode-bidi:plaintext]" dir="auto">
          {thread.data.comment.body}
        </p>
      ) : thread.isError ? (
        <p className="text-[12px] text-[var(--dash-red-ink)]">That comment could not be loaded — it may already be gone.</p>
      ) : (
        <span className="dash-skeleton block h-4 w-full rounded" aria-hidden="true" />
      )}
    </ConfirmDialog>
  )
}

/* -------------------------------------------------------------- the page */

export function BlogCommentsPage() {
  const search = useSearch({ from: '/dashboard/blog/comments' })
  const navigate = useNavigate({ from: '/dashboard/blog/comments' })

  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const liveRegion = useRef<HTMLParagraphElement>(null)

  const status = search.status ?? 'all'
  const postId = search.post

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(text.trim())
      setPage(1)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [text])

  const comments = useComments({ page, pageSize: OWNER_COMMENT_PAGE.default, status, postId, search: debounced })
  // The article filter offers the most recently edited articles; the one in
  // the address is kept even when it is older than those.
  const articles = useArticles({ pageSize: 50, sort: 'updated', language: 'en' })
  const seen = useMarkCommentsSeen()

  const data = comments.data
  const items = data?.items ?? []
  const filtering = debounced !== '' || status !== 'all' || postId !== undefined
  const options = articles.data?.items ?? []
  const selectedMissing = postId !== undefined && !options.some((option) => option.id === postId)

  useEffect(() => {
    if (data && data.page !== page) setPage(data.page)
  }, [data, page])

  const say = (message: string) => {
    if (liveRegion.current) liveRegion.current.textContent = message
  }

  const markSeen = async (input: { ids?: string[]; all?: boolean }, message: string) => {
    try {
      await seen.mutateAsync(input)
      say(message)
      if (input.all) notify.success(message)
    } catch {
      // The global notice has already said it.
    }
  }

  const setFilter = (next: { status?: 'new'; post?: string }) => {
    setPage(1)
    void navigate({ search: next, replace: true })
  }

  return (
    <DashboardPage className="gap-5">
      <BlogHead
        tab="comments"
        actions={
          data && data.newTotal > 0 ? (
            <button
              type="button"
              className="dash-btn dash-btn-quiet"
              disabled={seen.isPending}
              onClick={() => void markSeen({ all: true }, 'All comments marked as seen')}
            >
              <CheckCheck className="size-4" aria-hidden="true" />
              Mark all as seen
            </button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Which comments" className="flex rounded-[9px] border border-[var(--dash-line)] p-0.5">
          {(
            [
              ['all', 'All'],
              ['new', `New${data?.newTotal ? ` (${data.newTotal})` : ''}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => setFilter({ status: value === 'new' ? 'new' : undefined, post: postId })}
              className={cn(
                'h-8 rounded-[7px] px-3 text-[12.5px] font-semibold',
                status === value ? 'bg-[var(--dash-brand)] text-white' : 'text-[var(--dash-quiet)] hover:text-[var(--dash-ink)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <label>
          <span className="sr-only">Article</span>
          <select
            className="dash-field h-9 max-w-[16rem] px-2.5 text-[13px]"
            value={postId ?? ''}
            onChange={(event) => setFilter({ status: status === 'new' ? 'new' : undefined, post: event.target.value || undefined })}
          >
            <option value="">All articles</option>
            {selectedMissing ? <option value={postId}>{items[0]?.post.title ?? 'The chosen article'}</option> : null}
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.displayTitle}
              </option>
            ))}
          </select>
        </label>

        <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Search comments</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--dash-quiet)]" aria-hidden="true" />
          <input
            className="dash-field h-9 w-full ps-9 pe-3 text-[13px]"
            placeholder="Search the text…"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>

        {data ? (
          <span className="ms-auto hidden text-[11.5px] text-[var(--dash-quiet)] sm:inline">
            <span className="dash-num">{data.total}</span> {data.total === 1 ? 'comment' : 'comments'}
          </span>
        ) : null}
      </div>

      <section className="dash-panel overflow-hidden">
        {comments.isError && !data ? (
          <LoadFailure
            title="The comments could not be loaded"
            message="The server did not answer. Nothing was changed."
            onRetry={() => void comments.refetch()}
          />
        ) : !data ? (
          <ul aria-busy="true" aria-label="Loading comments">
            {Array.from({ length: 3 }, (_, index) => (
              <RowSkeleton key={index} />
            ))}
          </ul>
        ) : items.length === 0 ? (
          status === 'new' && debounced === '' ? (
            <EmptyState title="Nothing new">
              You have seen every comment. New ones appear here the moment a visitor posts them — nothing is emailed.
            </EmptyState>
          ) : filtering ? (
            <EmptyState
              title="No comment matches"
              action={
                <button
                  type="button"
                  className="dash-btn dash-btn-quiet"
                  onClick={() => {
                    setText('')
                    setDebounced('')
                    setFilter({})
                  }}
                >
                  Clear the filters
                </button>
              }
            >
              Nothing matches these filters. The search looks at the text of every comment.
            </EmptyState>
          ) : (
            <EmptyState title="No comments yet">
              When visitors comment on a live article, their comments appear here at once. Nothing is emailed.
            </EmptyState>
          )
        ) : (
          <ul aria-busy={comments.isFetching} aria-label="Comments">
            {items.map((comment) => (
              <CommentRow
                key={comment.id}
                comment={comment}
                seeing={seen.isPending}
                onOpen={() => setOpen(comment.id)}
                onSeen={() => void markSeen({ ids: [comment.id] }, 'Marked as seen')}
                onDelete={() => setDeleting(comment.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <p ref={liveRegion} role="status" aria-live="polite" className="sr-only" />

      {data ? <Pager page={data.page} pageCount={data.pageCount} onPage={setPage} previous="Newer" next="Older" /> : null}

      {open ? (
        <ConversationDialog
          commentId={open}
          onClose={() => setOpen(null)}
          onDelete={() => {
            setDeleting(open)
            setOpen(null)
          }}
        />
      ) : null}

      {deleting ? <DeleteCommentDialog commentId={deleting} onClose={() => setDeleting(null)} /> : null}
    </DashboardPage>
  )
}
