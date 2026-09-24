import { revalidateLogic, useForm } from '@tanstack/react-form'
import {
  ArrowLeft,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  MessageSquare,
  Reply,
  User,
} from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { PublicComment } from '#/backend2/contracts/blog.contract'
import { BrandMark } from '#/frontend/components/layout/public/BrandMark'
import { Button } from '#/frontend/components/ui/button'
import type { Language } from '#/frontend/i18n/language'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { formatPostDate } from '#/frontend/lib/format'
import { cn } from '#/frontend/lib/utils'
import { BlogRequestError, fetchComments, fetchReplies, postComment } from './blog-v2-api'
import {
  type BlogV2Words,
  type CommentRefusalWord,
  blogV2Words,
  fillWord,
  formatCount,
  pluralWord,
  timeAgo,
} from './blog-v2-words'
import { commentLengthProblem } from './comment-text'

/**
 * The public comment section of a Backend2 article, as the owner approved it
 * in the Blog Design Lab (`docs/v2/blog.md`): the form above the comments
 * (4A), "Gast / Guest / زائر" beside a visitor (2A), replies indented up to
 * five levels — three on a phone — and then "Continue this conversation" (3A),
 * one conversation per article across its three languages (7A).
 *
 * Everything is read in bounded pages, never as a whole tree: threads newest
 * first, ten at a time; each comment's direct replies oldest first, three at
 * a time, fetched when that comment is drawn. Visitor text is rendered as
 * text — React escapes it — and never as markup.
 */

const ROOT_PAGE = 10
const REPLY_PAGE = 3

type Branch = { ids: string[]; cursor: string | null; status: 'loading' | 'ready' | 'error' }

type Thread = {
  comments: Record<string, PublicComment>
  roots: Branch
  children: Record<string, Branch | undefined>
}

const emptyThread = (): Thread => ({
  comments: {},
  roots: { ids: [], cursor: null, status: 'loading' },
  children: {},
})

const addAll = (known: Record<string, PublicComment>, items: PublicComment[]) => {
  const next = { ...known }

  for (const item of items) next[item.id] = item

  return next
}

/** A branch grown by one page, skipping anything already shown (a reply posted here). */
const grow = (branch: Branch | undefined, items: PublicComment[], cursor: string | null): Branch => {
  const ids = branch?.ids ?? []
  const fresh = items.map((item) => item.id).filter((id) => !ids.includes(id))

  return { ids: [...ids, ...fresh], cursor, status: 'ready' }
}

/** Five levels on a desktop, three on a phone, before a branch folds (3A). */
const useFoldLevel = (): number => {
  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(max-width: 699px)')
    const update = () => setNarrow(query.matches)

    update()
    query.addEventListener('change', update)

    return () => query.removeEventListener('change', update)
  }, [])

  return narrow ? 3 : 5
}

export function PostComments({ slug, initialCount }: { slug: string; initialCount: number }) {
  const { language } = useLanguage()
  const words = blogV2Words(language)
  const foldAt = useFoldLevel()
  const headingId = useId()
  const [thread, setThread] = useState<Thread>(emptyThread)
  const [total, setTotal] = useState(initialCount)
  const [enabled, setEnabled] = useState(true)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const loading = useRef(new Set<string>())

  const loadRoots = useCallback(
    async (more: boolean) => {
      if (loading.current.has('root')) return
      loading.current.add('root')

      setThread((current) => ({ ...current, roots: { ...current.roots, status: 'loading' } }))

      try {
        const page = await fetchComments(slug, {
          cursor: more ? (thread.roots.cursor ?? '') : '',
          limit: ROOT_PAGE,
        })

        setEnabled(page.enabled)
        setTotal(page.total)
        setThread((current) => ({
          ...current,
          comments: addAll(current.comments, page.items),
          roots: grow(more ? current.roots : undefined, page.items, page.nextCursor),
        }))
      } catch {
        setThread((current) => ({ ...current, roots: { ...current.roots, status: 'error' } }))
      } finally {
        loading.current.delete('root')
      }
    },
    [slug, thread.roots.cursor],
  )

  const loadReplies = useCallback(
    async (parentId: string) => {
      if (loading.current.has(parentId)) return
      loading.current.add(parentId)

      const branch = thread.children[parentId]

      setThread((current) => ({
        ...current,
        children: {
          ...current.children,
          [parentId]: { ids: current.children[parentId]?.ids ?? [], cursor: branch?.cursor ?? null, status: 'loading' },
        },
      }))

      try {
        const page = await fetchReplies(slug, parentId, { cursor: branch?.cursor ?? '', limit: REPLY_PAGE })

        setThread((current) => ({
          ...current,
          comments: addAll(current.comments, page.items),
          children: {
            ...current.children,
            [parentId]: grow(current.children[parentId], page.items, page.nextCursor),
          },
        }))
      } catch {
        setThread((current) => ({
          ...current,
          children: {
            ...current.children,
            [parentId]: { ...(current.children[parentId] ?? { ids: [], cursor: null }), status: 'error' },
          },
        }))
      } finally {
        loading.current.delete(parentId)
      }
    },
    [slug, thread.children],
  )

  useEffect(() => {
    void loadRoots(false)
    // The first page only, once per article.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  /** A comment or reply the server accepted: shown at once, where it belongs. */
  const onPosted = (comment: PublicComment) => {
    setTotal((count) => count + 1)
    setFresh(comment.id)

    setThread((current) => {
      const comments = addAll(current.comments, [comment])

      if (!comment.parentId) {
        return { ...current, comments, roots: { ...current.roots, ids: [comment.id, ...current.roots.ids] } }
      }

      const parent = current.comments[comment.parentId]
      const branch = current.children[comment.parentId]

      if (parent) comments[parent.id] = { ...parent, replyCount: parent.replyCount + 1 }

      return {
        ...current,
        comments,
        children: {
          ...current.children,
          [comment.parentId]: {
            ids: [...(branch?.ids ?? []), comment.id],
            cursor: branch?.cursor ?? null,
            status: 'ready',
          },
        },
      }
    })

    if (comment.parentId) setReplyTo(null)

    window.setTimeout(() => {
      document.getElementById(`cmt-${comment.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 80)
  }

  // Switched off by the owner after the page was drawn: the section goes.
  if (!enabled) return null

  const who = (comment: PublicComment) => (comment.author === 'owner' ? 'Yaman Warda' : words.guest)

  const ancestors = (id: string): PublicComment[] => {
    const trail: PublicComment[] = []
    let parentId = thread.comments[id]?.parentId ?? null

    while (parentId && thread.comments[parentId]) {
      trail.unshift(thread.comments[parentId]!)
      parentId = thread.comments[parentId]!.parentId
    }

    return trail
  }

  const item = (id: string, level: number) => (
    <CommentItem
      key={id}
      id={id}
      level={level}
      thread={thread}
      words={words}
      language={language}
      slug={slug}
      foldAt={foldAt}
      replyTo={replyTo}
      fresh={fresh}
      who={who}
      onReplyTo={setReplyTo}
      onFocus={(target) => {
        setFocus(target)
        setReplyTo(null)
      }}
      onLoadReplies={loadReplies}
      onPosted={onPosted}
    />
  )

  const focused = focus ? thread.comments[focus] : undefined

  let list: React.ReactNode

  if (focused) {
    list = (
      <>
        <div className="cmt-focus">
          <button type="button" className="cmt-link" onClick={() => setFocus(null)}>
            <ArrowLeft aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
            {words.back}
          </button>
          <div className="cmt-trail">
            {ancestors(focused.id).map((ancestor) => (
              <p key={ancestor.id} dir="auto">
                <b>{who(ancestor)}:</b> {ancestor.body}
              </p>
            ))}
          </div>
        </div>
        <div className="cmt-list">{item(focused.id, 1)}</div>
      </>
    )
  } else if (thread.roots.ids.length > 0) {
    list = (
      <>
        <div className="cmt-list">{thread.roots.ids.map((id) => item(id, 1))}</div>
        {thread.roots.cursor ? (
          <div className="cmt-more-roots">
            <Button
              variant="outline"
              className="rounded-full px-6"
              disabled={thread.roots.status === 'loading'}
              onClick={() => void loadRoots(true)}
            >
              {words.more}
            </Button>
          </div>
        ) : null}
      </>
    )
  } else if (thread.roots.status === 'loading') {
    list = (
      <p className="cmt-status" role="status">
        {words.loading}
      </p>
    )
  } else if (thread.roots.status === 'error') {
    list = (
      <div className="cmt-load-error" role="alert">
        <p className="cmt-status" style={{ marginTop: 0 }}>
          {words.commentsError}
        </p>
        <Button variant="outline" className="rounded-full px-5" onClick={() => void loadRoots(false)}>
          {words.retry}
        </Button>
      </div>
    )
  } else {
    list = <p className="cmt-empty">{words.empty}</p>
  }

  return (
    <section className="cmts" aria-labelledby={headingId}>
      <div className="cmts-head">
        <h2 className="cmts-title" id={headingId}>
          {words.title}
        </h2>
        <span className="cmts-count">{pluralWord(words.count, total, language)}</span>
      </div>

      {focused ? null : <CommentForm slug={slug} parent={null} words={words} language={language} onPosted={onPosted} />}

      {list}

      {/* A failed "load more" keeps what is shown and says so beside the button. */}
      {thread.roots.ids.length > 0 && thread.roots.status === 'error' && !focused ? (
        <p className="cmt-status" role="alert">
          {words.commentsError}
        </p>
      ) : null}
    </section>
  )
}

function CommentItem({
  id,
  level,
  thread,
  words,
  language,
  slug,
  foldAt,
  replyTo,
  fresh,
  who,
  onReplyTo,
  onFocus,
  onLoadReplies,
  onPosted,
}: {
  id: string
  level: number
  thread: Thread
  words: BlogV2Words
  language: Language
  slug: string
  foldAt: number
  replyTo: string | null
  fresh: string | null
  who: (comment: PublicComment) => string
  onReplyTo: (id: string | null) => void
  onFocus: (id: string) => void
  onLoadReplies: (id: string) => Promise<void>
  onPosted: (comment: PublicComment) => void
}) {
  const comment = thread.comments[id]
  const branch = thread.children[id]
  const folded = Boolean(comment && level >= foldAt && comment.replyCount > 0)
  const shouldLoad = Boolean(comment && !folded && comment.replyCount > 0 && !branch)

  // The first replies of a drawn comment, fetched when it is drawn — one page.
  useEffect(() => {
    if (shouldLoad) void onLoadReplies(id)
  }, [shouldLoad, id, onLoadReplies])

  if (!comment) return null

  const owner = comment.author === 'owner'
  const name = who(comment)
  const replying = replyTo === comment.id
  const shown = branch?.ids ?? []
  const remaining = Math.max(0, comment.replyCount - shown.length)

  return (
    <article className={cn('cmt', fresh === comment.id && 'cmt-is-new')} id={`cmt-${comment.id}`}>
      <div className="cmt-row">
        <span className={cn('cmt-avatar', owner && 'is-owner')} aria-hidden="true">
          {owner ? <BrandMark size={15} /> : <User className="size-[15px]" />}
        </span>
        <div className="cmt-main">
          <div className="cmt-meta">
            <span className="cmt-who">{name}</span>
            {owner ? <span className="cmt-badge">{words.author}</span> : null}
            <time dateTime={comment.createdAt} title={formatPostDate(comment.createdAt.slice(0, 10), language)}>
              {timeAgo(comment.createdAt, language)}
            </time>
          </div>
          <p className="cmt-body" dir="auto">
            {comment.body}
          </p>
          <div className="cmt-actions">
            <button
              type="button"
              className="cmt-link"
              aria-expanded={replying}
              onClick={() => onReplyTo(replying ? null : comment.id)}
            >
              <Reply aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
              {words.reply}
            </button>
          </div>
          {replying ? (
            <CommentForm
              slug={slug}
              parent={comment}
              parentName={name}
              words={words}
              language={language}
              onPosted={onPosted}
              onCancel={() => onReplyTo(null)}
            />
          ) : null}
        </div>
      </div>

      {folded ? (
        <div className="cmt-replies">
          <button type="button" className="cmt-continue" onClick={() => onFocus(comment.id)}>
            <MessageSquare aria-hidden="true" className="size-3.5" />
            {words.continueThread} · {formatCount(comment.replyCount, language)}
          </button>
        </div>
      ) : shown.length > 0 || remaining > 0 ? (
        <div className="cmt-replies">
          {shown.map((childId) => (
            <CommentItem
              key={childId}
              id={childId}
              level={level + 1}
              thread={thread}
              words={words}
              language={language}
              slug={slug}
              foldAt={foldAt}
              replyTo={replyTo}
              fresh={fresh}
              who={who}
              onReplyTo={onReplyTo}
              onFocus={onFocus}
              onLoadReplies={onLoadReplies}
              onPosted={onPosted}
            />
          ))}
          {remaining > 0 ? (
            <button
              type="button"
              className="cmt-continue is-solid"
              disabled={branch?.status === 'loading'}
              onClick={() => void onLoadReplies(comment.id)}
            >
              <ChevronDown aria-hidden="true" className="size-3.5" />
              {pluralWord(words.showReplies, remaining, language)}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

/**
 * The comment form: quiet until the first attempt, then checking as the
 * reader types (`revalidateLogic`, the repository's form rule). The browser
 * checks only what it can know — empty, too long — and the server decides
 * the rest; its refusal is shown in the same place, in the reader's language,
 * with the text left in the box to fix and send again.
 */
function CommentForm({
  slug,
  parent,
  parentName,
  words,
  language,
  onPosted,
  onCancel,
}: {
  slug: string
  parent: PublicComment | null
  parentName?: string
  words: BlogV2Words
  language: Language
  onPosted: (comment: PublicComment) => void
  onCancel?: () => void
}) {
  const baseId = useId()
  const fieldId = `${baseId}-body`
  const [serverReason, setServerReason] = useState<CommentRefusalWord | null>(null)
  const [posted, setPosted] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)

  const form = useForm({
    defaultValues: { body: '', website: '' },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const problem = commentLengthProblem(value.body)

        return problem ? { fields: { body: problem } } : undefined
      },
    },
    onSubmitInvalid: () => {
      window.requestAnimationFrame(() => textarea.current?.focus())
    },
    onSubmit: async ({ value, formApi }) => {
      setServerReason(null)
      setPosted(false)

      try {
        const comment = await postComment(slug, {
          body: value.body,
          parentId: parent?.id ?? null,
          website: value.website,
        })

        formApi.reset()
        if (!parent) setPosted(true)
        onPosted(comment)
      } catch (error) {
        setServerReason(error instanceof BlogRequestError ? error.reason : 'server')
        window.requestAnimationFrame(() => textarea.current?.focus())
      }
    },
  })

  return (
    <form
      className={cn('cmt-form', parent && 'is-reply')}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <form.Field name="body">
        {(field) => {
          const local = field.state.meta.errors[0] as CommentRefusalWord | undefined
          const reason = local ?? serverReason

          return (
            <>
              <label className="cmt-label" htmlFor={fieldId}>
                {parent ? fillWord(words.replyLabel, { who: parentName ?? words.guest }) : words.label}
              </label>
              <textarea
                ref={textarea}
                id={fieldId}
                name="body"
                className="cmt-textarea"
                dir="auto"
                value={field.state.value}
                aria-invalid={reason ? true : undefined}
                aria-describedby={reason ? `${baseId}-error` : `${baseId}-hint`}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  // The server's refusal was about the text as it was; once it
                  // changes, the reader is fixing it.
                  if (serverReason) setServerReason(null)
                  if (posted) setPosted(false)
                }}
                autoFocus={Boolean(parent)}
              />
              {reason ? (
                <p id={`${baseId}-error`} className="cmt-error" role="alert">
                  <CircleAlert aria-hidden="true" className="size-3.5" />
                  {words.refuse[reason] ?? words.refuse.rejected}
                </p>
              ) : (
                <p id={`${baseId}-hint`} className="cmt-hint">
                  {words.hint}
                </p>
              )}
              {posted ? (
                <p className="cmt-notice is-ok" role="status">
                  <CircleCheck aria-hidden="true" className="size-[15px]" />
                  {words.posted}
                </p>
              ) : null}
            </>
          )
        }}
      </form.Field>

      {/* The hidden field: a person never sees it; a script that fills every field does. */}
      <form.Field name="website">
        {(field) => (
          <div className="hp" aria-hidden="true">
            <label htmlFor={`${baseId}-website`}>Website</label>
            <input
              id={`${baseId}-website`}
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </form.Field>

      <div className="cmt-foot">
        <form.Subscribe selector={(state) => state.values.body.length}>
          {(length) => <CharCount length={length} words={words} language={language} />}
        </form.Subscribe>
        <span className="cmt-foot-actions">
          {parent && onCancel ? (
            <Button type="button" variant="outline" className="rounded-full px-5" onClick={onCancel}>
              {words.cancel}
            </Button>
          ) : null}
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(submitting) => (
              <Button
                type="submit"
                disabled={submitting}
                aria-disabled={submitting || undefined}
                className="rounded-full bg-primary px-6 text-primary-foreground"
              >
                {submitting ? words.posting : parent ? words.postReply : words.post}
              </Button>
            )}
          </form.Subscribe>
        </span>
      </div>
    </form>
  )
}

function CharCount({ length, words, language }: { length: number; words: BlogV2Words; language: Language }) {
  return (
    <span className={cn('cmt-chars', length > 3000 && 'is-over')} aria-hidden="true">
      {fillWord(words.chars, { count: formatCount(length, language) })}
    </span>
  )
}
