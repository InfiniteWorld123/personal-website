import { useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CircleAlert,
  CircleCheck,
  Earth,
  Eye,
  EyeOff,
  ImageIcon,
  Images,
  Info,
  Loader2,
  Lock,
  MessageSquare,
  MessageSquareText,
  PenLine,
  RotateCcw,
  Snowflake,
  Trash2,
  X,
} from 'lucide-react'
import {
  BLOG_LIMITS,
  BLOG_STATE_WORDS,
  type BlogPublishIssue,
  LANGUAGES,
  type Language,
  type OwnerBlogPost,
  blogDisplayTitle,
  blogPublishIssues,
  canonicalBlogDraft,
  isBlogBodyEmpty,
} from '#/backend2/contracts/blog.contract'
import { LANGUAGE_WORDS } from '#/backend2/contracts/project.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage } from '#/frontend/dashboard/primitives'
import { BlogBodyEditor } from '#/frontend/features/blog-v2/BlogBodyEditor'
import { BlogDialog, ConfirmDialog, DialogActions, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import type { PreviewVersion } from '#/frontend/features/blog-v2/api'
import {
  type BlogBodies,
  type BlogFormValues,
  bodyErrors,
  completeLanguages,
  draftPatch,
  fieldErrors,
  fieldTarget,
  firstField,
  issuesByField,
  languageNeedsAttention,
  orderedIssues,
  payloadToDraft,
  slugSuggestion,
  toBodies,
  toDraft,
  toFormValues,
} from '#/frontend/features/blog-v2/blog-form'
import { berlinLong, berlinShort, dashAgo, dashDate } from '#/frontend/features/blog-v2/blog-time'
import {
  useArticle,
  useArticleComments,
  useArticleSlugCheck,
  useDeleteArticle,
  useDiscardArticleChanges,
  usePublishArticle,
  useSaveArticle,
  useTags,
  useUnpublishArticle,
} from '#/frontend/features/blog-v2/queries'
import { MediaPicker } from '#/frontend/features/media/MediaPicker'
import { ownerImageUrl } from '#/frontend/features/projects/CaseStudyEditor'
import { useProjects } from '#/frontend/features/projects/queries'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { BlogPreview } from './BlogPreview'
import { LoadFailure, StateBadge } from './blog-parts'
import { ScheduleDialog } from './ScheduleDialog'

/**
 * One article, on one page — the editor approved in the Design Lab.
 *
 * Shared settings first (address, tags, project, cover), then the three
 * languages, with the publication checklist beside them. Above it all, the
 * three versions of the article drawn side by side — the draft the owner
 * edits, the frozen schedule, and what visitors read — because the whole
 * point of this screen is that saving changes only the first one.
 *
 * Saving is manual; there is no autosave. Publish, Schedule and Preview save
 * first, in the same click (approved choice 5A). Saving is checked for shape
 * only; publishing is checked against the publication rules, and their
 * sentences appear next to the fields they are about.
 */

const LANGUAGE_LABEL: Record<Language, string> = { de: 'DE', en: 'EN', ar: 'AR' }

type Working = 'save' | 'publish' | 'schedule' | 'preview' | null
type Dialog =
  | { kind: 'schedule' }
  | { kind: 'preview'; version: PreviewVersion }
  | { kind: 'unpublish' }
  | { kind: 'discard' }
  | { kind: 'delete' }
  | { kind: 'cover' }
  | null

/** The page around a field: its label, its message and its hint, said the same way everywhere. */
function Field({
  id,
  label,
  hint,
  error,
  counter,
  children,
}: {
  id: string
  label: React.ReactNode
  hint?: React.ReactNode
  error?: string
  counter?: { value: number; max: number }
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[12px] font-semibold">
          {label}
        </label>
        {counter ? (
          <span className={cn('dash-num text-[11px]', counter.value > counter.max ? 'font-semibold text-[var(--dash-red-ink)]' : 'text-[var(--dash-quiet)]')}>
            {counter.value} / {counter.max}
          </span>
        ) : null}
      </span>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--dash-red-ink)]">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[11.5px] text-[var(--dash-quiet)]">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

const describedBy = (id: string, error?: string, hint?: boolean) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined)

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="dash-panel scroll-mt-4 p-4 sm:p-5" aria-labelledby={`${id}-title`}>
      <div className="mb-3.5">
        <h2 id={`${id}-title`} className="text-sm font-semibold">
          {title}
        </h2>
        {note ? <p className="mt-1 text-[12px] text-[var(--dash-quiet)]">{note}</p> : null}
      </div>
      {children}
    </section>
  )
}

/* ------------------------------------------------ the three versions, drawn */

function VersionsStrip({
  article,
  unsaved,
  onPreview,
}: {
  article: OwnerBlogPost
  unsaved: boolean
  onPreview: (version: PreviewVersion) => void
}) {
  const schedule = article.schedule
  const live = article.published !== null
  const late = article.publicationDelay
  const card = 'relative flex min-w-0 flex-col gap-[3px] rounded-[10px] border px-3 py-2.5 text-start'
  const kicker = 'flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em]'

  return (
    <div role="group" aria-label="The three versions of this article" className="grid gap-1.5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
      <div className={cn(card, 'border-[var(--dash-line)] bg-[var(--dash-surface)]')}>
        <span className={cn(kicker, 'text-[var(--dash-quiet)]')}>
          <PenLine className="size-3" aria-hidden="true" />
          DRAFT · YOU EDIT
        </span>
        <span className="truncate text-[12.5px] font-semibold">{unsaved ? 'Unsaved changes' : `Saved ${dashAgo(article.updatedAt)}`}</span>
        <span className={cn('text-[11px] leading-snug', unsaved ? 'font-semibold text-[var(--dash-red-ink)]' : 'text-[var(--dash-quiet)]')}>
          {unsaved ? 'Only on this screen until you press Save.' : 'Private. Saving never reaches visitors.'}
        </span>
      </div>

      <span className="grid h-3.5 place-items-center text-[var(--dash-quiet)] md:h-auto" aria-hidden="true">
        <ArrowRight className="size-3.5 rotate-90 md:rotate-0 rtl:md:-scale-x-100" />
      </span>

      {schedule ? (
        <button
          type="button"
          className={cn(card, 'border-[color-mix(in_srgb,var(--dash-brand)_55%,var(--dash-line))] bg-[var(--dash-surface)] hover:border-[var(--dash-brand)]')}
          onClick={() => onPreview('scheduled')}
          title="Preview the frozen version"
        >
          <span className={cn(kicker, 'text-[var(--dash-blue-ink)]')}>
            <Snowflake className="size-3" aria-hidden="true" />
            SCHEDULED · FROZEN
          </span>
          <span className="truncate text-[12.5px] font-semibold">{berlinShort(new Date(schedule.publishAt))} Berlin</span>
          <span className={cn('text-[11px] leading-snug', schedule.matchesDraft ? 'text-[var(--dash-quiet)]' : 'font-semibold text-[var(--dash-blue-ink)]')}>
            {schedule.matchesDraft ? 'Exactly your saved draft.' : 'Your draft has changed since — the frozen version stays as it was.'}
          </span>
          <Eye className="absolute end-2.5 top-2.5 size-3.5 text-[var(--dash-quiet)]" aria-hidden="true" />
        </button>
      ) : (
        <div className={cn(card, 'border-dashed border-[var(--dash-line)]')}>
          <span className={cn(kicker, 'text-[var(--dash-quiet)]')}>
            <CalendarClock className="size-3" aria-hidden="true" />
            SCHEDULED
          </span>
          <span className="truncate text-[12.5px] font-medium text-[var(--dash-quiet)]">
            {article.firstPublishedAt ? 'Only for a first publication' : 'Not scheduled'}
          </span>
          <span className="text-[11px] leading-snug text-[var(--dash-quiet)]">
            {article.firstPublishedAt ? 'Updates go out with Publish update.' : 'Optional: choose a time in Berlin.'}
          </span>
        </div>
      )}

      <span className="grid h-3.5 place-items-center text-[var(--dash-quiet)] md:h-auto" aria-hidden="true">
        <ArrowRight className="size-3.5 rotate-90 md:rotate-0 rtl:md:-scale-x-100" />
      </span>

      {live ? (
        <button
          type="button"
          className={cn(card, 'border-[color-mix(in_srgb,var(--dash-live)_55%,var(--dash-line))] bg-[var(--dash-surface)] hover:border-[var(--dash-live)]')}
          onClick={() => onPreview('published')}
          title="Preview what visitors see"
        >
          <span className={cn(kicker, 'text-[var(--dash-live)]')}>
            <span className="size-1.5 rounded-full bg-[var(--dash-live)]" aria-hidden="true" />
            LIVE · VISITORS SEE
          </span>
          <span className="truncate text-[12.5px] font-semibold">
            Since {article.firstPublishedAt ? dashDate(article.firstPublishedAt) : '—'}
            {article.contentUpdatedAt ? ` · updated ${dashDate(article.contentUpdatedAt)}` : ''}
          </span>
          <span className={cn('text-[11px] leading-snug', article.hasPendingChanges ? 'font-semibold text-[var(--dash-blue-ink)]' : 'text-[var(--dash-quiet)]')}>
            {article.hasPendingChanges
              ? 'Your saved draft differs — Publish update sends it.'
              : late
                ? `Went live ${late.minutesLate} min after its scheduled time.`
                : 'Same as your saved draft.'}
          </span>
          <Eye className="absolute end-2.5 top-2.5 size-3.5 text-[var(--dash-quiet)]" aria-hidden="true" />
        </button>
      ) : (
        <div className={cn(card, 'border-dashed border-[var(--dash-line)]')}>
          <span className={cn(kicker, 'text-[var(--dash-quiet)]')}>
            <Earth className="size-3" aria-hidden="true" />
            LIVE
          </span>
          <span className="truncate text-[12.5px] font-medium text-[var(--dash-quiet)]">
            {article.firstPublishedAt ? 'Taken down' : 'Not published'}
          </span>
          <span className="text-[11px] leading-snug text-[var(--dash-quiet)]">
            {article.firstPublishedAt
              ? `Kept privately with ${article.counts.reads.toLocaleString('en')} reads and its comments.`
              : 'Visitors cannot see anything yet.'}
          </span>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ the checklist */

function Checklist({
  issues,
  attempted,
  onGo,
}: {
  issues: BlogPublishIssue[]
  attempted: boolean
  onGo: (issue: BlogPublishIssue) => void
}) {
  if (issues.length === 0) {
    return (
      <div className="dash-panel p-3.5">
        <p className="flex items-center gap-2 text-[12.5px] font-semibold">
          <CircleCheck className="size-4 text-[var(--dash-live)]" aria-hidden="true" />
          Ready to publish in all three languages
        </p>
        <ul className="mt-2.5 flex flex-col gap-1.5 text-[12px] text-[var(--dash-quiet)]">
          {['Title, summary and article in DE, EN and AR', 'Every picture described'].map((line) => (
            <li key={line} className="flex items-center gap-2">
              <Check className="size-3.5 shrink-0 text-[var(--dash-live)]" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className={cn('dash-panel p-3.5', attempted && 'border-[var(--dash-red)]')} role={attempted ? 'alert' : undefined}>
      <p className={cn('flex items-center gap-2 text-[12.5px] font-semibold', attempted && 'text-[var(--dash-red-ink)]')}>
        <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
        {issues.length} {issues.length === 1 ? 'thing' : 'things'} before publishing
      </p>
      {attempted ? (
        <p className="mt-1.5 text-[11.5px] text-[var(--dash-quiet)]">Nothing was published, and nothing on the website changed.</p>
      ) : null}
      <ul className="mt-2.5 flex flex-col gap-0.5">
        {issues.map((issue, index) => (
          <li key={`${issue.field}-${index}`}>
            <button
              type="button"
              className="flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-start text-[12px] hover:bg-[var(--dash-hover)] hover:underline"
              onClick={() => onGo(issue)}
            >
              <X className="mt-[3px] size-3 shrink-0 text-[var(--dash-red-ink)]" aria-hidden="true" />
              <span>{issue.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* --------------------------------------------------------------- readers */

function ReadersPanel({ article }: { article: OwnerBlogPost }) {
  const navigate = useNavigate()
  const comments = useArticleComments()
  const on = article.commentsEnabled

  const flip = async () => {
    try {
      await comments.mutateAsync({ id: article.id, enabled: !on })
      notify.success(on ? 'Comments switched off — visitors no longer see them or the form' : 'Comments switched on — they are visible again')
    } catch {
      // The global notice has already said it; the switch stays where the server left it.
    }
  }

  return (
    <div className="dash-panel flex flex-col gap-2.5 p-3.5">
      <p className="flex items-center gap-2 text-[12.5px] font-semibold">
        <MessageSquareText className="size-4" aria-hidden="true" />
        Readers
      </p>
      <dl className="grid grid-cols-3 gap-1.5">
        {(
          [
            ['reads', article.counts.reads],
            ['likes', article.counts.likes],
            [article.counts.newComments ? `${article.counts.newComments} new` : 'comments', article.counts.comments],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-col-reverse gap-px rounded-[9px] bg-[var(--dash-furniture)] px-2.5 py-2">
            <dt className="text-[10.5px] text-[var(--dash-quiet)]">{label}</dt>
            <dd className="dash-num text-[15px] font-bold">{value.toLocaleString('en')}</dd>
          </div>
        ))}
      </dl>

      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={comments.isPending}
        onClick={() => void flip()}
        className="flex items-start gap-2.5 rounded-md text-start text-[12.5px] leading-normal disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className={cn(
            'relative mt-px h-5 w-9 shrink-0 rounded-full border transition-colors',
            on ? 'border-transparent bg-[var(--dash-brand)]' : 'border-[var(--dash-line)] bg-[var(--dash-chip)]',
          )}
        >
          <span
            className={cn(
              'absolute top-[2px] size-3.5 rounded-full bg-[var(--dash-surface)] shadow-sm transition-transform',
              on ? 'start-[2px] translate-x-4 rtl:-translate-x-4' : 'start-[2px]',
            )}
          />
        </span>
        <span>
          <span className="font-semibold">Comments {on ? 'on' : 'off'}</span>
          <span className="block text-[11.5px] text-[var(--dash-quiet)]">
            Takes effect immediately — not with Publish. Off hides the comments and the form; nothing is deleted.
          </span>
        </span>
      </button>

      {article.counts.comments ? (
        <button
          type="button"
          className="dash-btn dash-btn-quiet h-8 w-fit text-[12px]"
          onClick={() => void navigate({ to: '/dashboard/blog/comments', search: { post: article.id } })}
        >
          <MessageSquare className="size-3.5" aria-hidden="true" />
          Open its comments
        </button>
      ) : null}
      <p className="text-[11.5px] text-[var(--dash-quiet)]">Reads and likes count visits, not people. Nothing about a reader is stored.</p>
    </div>
  )
}

/* ------------------------------------------------------------- delete */

function DeleteArticleDialog({ article, onDeleted, onClose }: { article: OwnerBlogPost; onDeleted: () => Promise<void>; onClose: () => void }) {
  const remove = useDeleteArticle()
  const title = blogDisplayTitle(article.draft.texts, 'en')
  const [typed, setTyped] = useState('')
  const count = article.counts.comments

  return (
    <ConfirmDialog
      title="Delete this article permanently?"
      confirmLabel="Delete permanently"
      busyLabel="Deleting…"
      danger
      disabled={typed.trim() !== title}
      onClose={onClose}
      onConfirm={async () => {
        try {
          await remove.mutateAsync(article.id)
        } catch (caught) {
          throw caught instanceof ApiRequestError ? caught : new Error('The article could not be deleted.')
        }

        await onDeleted()
      }}
    >
      <p>
        It goes in all three languages, with its {count} {count === 1 ? 'comment' : 'comments'}, {article.counts.reads.toLocaleString('en')}{' '}
        reads and {article.counts.likes.toLocaleString('en')} likes.
        {article.published ? ' Its address stops working at once.' : ''} The pictures stay in Media. This cannot be undone.
      </p>
      <label htmlFor="delete-article-title" className="text-[12px] text-[var(--dash-ink)]">
        Type the title to confirm: <code className="rounded bg-[var(--dash-chip)] px-1 font-semibold">{title}</code>
      </label>
      <input
        id="delete-article-title"
        className="dash-field h-9 px-3 text-[13px]"
        autoComplete="off"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        data-autofocus
      />
    </ConfirmDialog>
  )
}

/* -------------------------------------------------------------- the editor */

function ArticleEditor({
  article,
  initialLanguage,
  onRefetch,
}: {
  article: OwnerBlogPost
  initialLanguage: Language
  /** Reads the article again — after a conflict, to learn whether someone else saved. */
  onRefetch: () => Promise<unknown>
}) {
  const navigate = useNavigate()
  const save = useSaveArticle()
  const publish = usePublishArticle()
  const unpublish = useUnpublishArticle()
  const discard = useDiscardArticleChanges()
  const tags = useTags({ pageSize: 100 })
  const projects = useProjects({ pageSize: 50, language: 'en' })

  const [language, setLanguage] = useState<Language>(initialLanguage)
  const [bodies, setBodies] = useState<BlogBodies>(() => toBodies(article.draft))
  const [epoch, setEpoch] = useState(0)
  const [publishAttempted, setPublishAttempted] = useState(false)
  const [working, setWorking] = useState<Working>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [changedElsewhere, setChangedElsewhere] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [focusTarget, setFocusTarget] = useState<{ field: string; image?: number } | null>(null)
  const [seoOpen, setSeoOpen] = useState<Record<Language, boolean>>(() => ({
    de: Boolean(article.draft.texts.de.seoTitle || article.draft.texts.de.seoDescription),
    en: Boolean(article.draft.texts.en.seoTitle || article.draft.texts.en.seoDescription),
    ar: Boolean(article.draft.texts.ar.seoTitle || article.draft.texts.ar.seoDescription),
  }))
  const leaving = useRef(false)
  const announce = useRef<HTMLParagraphElement>(null)

  const bodiesRef = useRef(bodies)
  bodiesRef.current = bodies
  const articleRef = useRef(article)
  articleRef.current = article

  const serverDraft = useMemo(() => payloadToDraft(article.draft), [article.draft])
  const serverCanonical = useMemo(() => canonicalBlogDraft(serverDraft), [serverDraft])

  /**
   * The version the owner's edits are based on. A save sends its revision, so
   * a second tab's save in between is a 409 rather than a silent overwrite.
   */
  const base = useRef({
    version: `${article.id}:${article.draftRevision}`,
    revision: article.draftRevision,
    draft: serverDraft,
    canonical: serverCanonical,
  })
  /** What the last save sent, to recognise its own answer. */
  const sent = useRef<string | null>(null)

  const form = useForm({
    defaultValues: toFormValues(article.draft),
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields = saveErrors(value, bodiesRef.current)

        return Object.keys(fields).length === 0 ? undefined : { fields }
      },
    },
    onSubmitInvalid: ({ value }) => {
      const field = firstField(Object.keys(saveErrors(value, bodiesRef.current)))

      if (field) goTo({ field })
    },
    onSubmit: async () => {
      await persistAndSay()
    },
  })

  const values = useStore(form.store, (state) => state.values)
  const submitted = useStore(form.store, (state) => state.submissionAttempts > 0)

  const localDraft = useMemo(() => toDraft(values, bodies), [values, bodies])
  const localCanonical = useMemo(() => canonicalBlogDraft(localDraft), [localDraft])
  const unsaved = localCanonical !== serverCanonical
  const unsavedRef = useRef(unsaved)
  unsavedRef.current = unsaved
  const localRef = useRef(localCanonical)
  localRef.current = localCanonical

  /** Take a version from the server as what is on screen. */
  const adopt = (next: OwnerBlogPost) => {
    const draft = payloadToDraft(next.draft)

    form.reset(toFormValues(next.draft))
    setBodies(toBodies(next.draft))
    setEpoch((value) => value + 1)
    base.current = {
      version: `${next.id}:${next.draftRevision}`,
      revision: next.draftRevision,
      draft,
      canonical: canonicalBlogDraft(draft),
    }
    sent.current = null
    setChangedElsewhere(false)
  }

  /*
   * A new revision from the server. Our own save's answer is simply accepted —
   * even if the owner typed more while it travelled. A change made somewhere
   * else is taken quietly when nothing here is unsaved, and otherwise asked
   * about: the owner's typing is never replaced without their say.
   */
  useEffect(() => {
    const version = `${article.id}:${article.draftRevision}`

    if (base.current.version === version) return

    if (serverCanonical === localRef.current || serverCanonical === sent.current) {
      base.current = { version, revision: article.draftRevision, draft: serverDraft, canonical: serverCanonical }
      setChangedElsewhere(false)

      return
    }

    if (localRef.current === base.current.canonical) {
      adopt(article)

      return
    }

    setChangedElsewhere(true)
  }, [article, serverCanonical, serverDraft])

  /* The unsaved-change warning (docs/v2/blog.md): leaving with work that is
     not saved asks first, inside the app and on closing the tab. Staying on
     this article's own address — a new `#` or `?` — is not leaving: the
     editor stays mounted and nothing is lost. */
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      unsavedRef.current && !leaving.current && current.pathname !== next.pathname,
    enableBeforeUnload: () => unsavedRef.current && !leaving.current,
    withResolver: true,
  })

  /* ------------------------------------------------------------ focusing */

  const goTo = (target: { field: string; image?: number }) => {
    const place = fieldTarget(target.field)

    if (!place) return
    if (place.language && place.language !== language) setLanguage(place.language)

    const seo = /^texts\.(de|en|ar)\.(seoTitle|seoDescription)$/.exec(target.field)

    if (seo) setSeoOpen((open) => ({ ...open, [seo[1] as Language]: true }))

    setFocusTarget(target)
  }

  useEffect(() => {
    if (!focusTarget) return

    let frames = 0
    let handle = 0

    // The field may be in a language tab that is only now mounting, and a
    // picture's description only appears once the editor has drawn it.
    const attempt = () => {
      const place = fieldTarget(focusTarget.field)
      let element = place ? document.getElementById(place.id) : null

      if (focusTarget.image !== undefined && element) {
        const wrapper = element.closest('[data-body-editor]') ?? document
        const inputs = wrapper.querySelectorAll<HTMLElement>('[data-alt-input]')

        element = inputs[focusTarget.image] ?? element
      }

      if (element) {
        element.focus({ preventScroll: true })
        element.scrollIntoView({ block: 'center', behavior: 'smooth' })
        setFocusTarget(null)

        return
      }

      frames += 1
      if (frames < 30) handle = window.requestAnimationFrame(attempt)
      else setFocusTarget(null)
    }

    handle = window.requestAnimationFrame(attempt)

    return () => window.cancelAnimationFrame(handle)
  }, [focusTarget, language, epoch])

  /** A checklist line, or the first issue after a refused Publish. */
  const goToIssue = (issue: BlogPublishIssue) => {
    const image = /image (\d+) in the article/.exec(issue.message)?.[1]

    goTo({ field: issue.field, image: image ? Number(image) - 1 : undefined })
  }

  /* -------------------------------------------------------------- actions */

  const failureText = (caught: unknown, fallback: string) => (caught instanceof ApiRequestError ? caught.message : fallback)

  /** A refusal that means "someone else saved first": look again, so the banner can offer Reload. */
  const onConflict = (caught: unknown) => {
    if (caught instanceof ApiRequestError && caught.status === 409) void onRefetch()
  }

  /** Save what is on screen, if anything differs. Throws with the server's sentence. */
  const persist = async (): Promise<OwnerBlogPost> => {
    const next = toDraft(form.state.values, bodiesRef.current)
    const patch = draftPatch(base.current.draft, next)

    if (Object.keys(patch).length === 0) return articleRef.current

    sent.current = canonicalBlogDraft(next)

    return save.mutateAsync({ id: article.id, draftRevision: base.current.revision, ...patch })
  }

  const savedMessage = (saved: OwnerBlogPost) =>
    saved.published
      ? 'Saved. Visitors still see what was published.'
      : saved.schedule
        ? 'Saved. The scheduled version stays as it was frozen.'
        : 'Draft saved'

  const persistAndSay = async () => {
    setWorking('save')
    setFailure(null)

    try {
      const saved = await persist()

      notify.success(savedMessage(saved))
      if (announce.current) announce.current.textContent = 'Saved'
    } catch (caught) {
      setFailure(failureText(caught, 'That could not be saved. Your text is still here.'))
      onConflict(caught)
    } finally {
      setWorking(null)
    }
  }

  const handleSave = () => {
    if (working) return

    void form.handleSubmit()
  }

  /**
   * The gate Publish, Schedule and Preview share (approved choice 5A): shape
   * first, then save what is on screen, then — for Publish and Schedule — the
   * publication rules on what is now saved. Answers the saved article, or
   * null when the owner has something to fix first.
   */
  const saveFirst = async (checkPublication: boolean): Promise<OwnerBlogPost | null> => {
    const shape = saveErrors(form.state.values, bodiesRef.current)

    if (Object.keys(shape).length > 0) {
      await form.handleSubmit()

      return null
    }

    let saved = articleRef.current

    if (unsavedRef.current) saved = await persist()

    if (!checkPublication) return saved

    const issues = orderedIssues(blogPublishIssues(toDraft(form.state.values, bodiesRef.current)))

    if (issues.length > 0) {
      setPublishAttempted(true)
      setFailure(`Not published yet: ${issues.length} ${issues.length === 1 ? 'thing' : 'things'} to finish. Nothing on the website changed.`)
      goToIssue(issues[0]!)

      return null
    }

    return saved
  }

  const handlePublish = async () => {
    if (working) return

    setWorking('publish')
    setFailure(null)

    try {
      const ready = await saveFirst(true)

      if (!ready) return

      const wasLive = ready.published !== null

      await publish.mutateAsync({ id: ready.id, draftRevision: ready.draftRevision })
      setPublishAttempted(false)
      notify.success(wasLive ? 'Update published. Visitors see it now.' : 'Published. The article is live in all three languages.')
      if (announce.current) announce.current.textContent = 'Published'
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.code === 'VALIDATION_ERROR') setPublishAttempted(true)

      setFailure(failureText(caught, 'That could not be published. Nothing on the website changed.'))
      onConflict(caught)
    } finally {
      setWorking(null)
    }
  }

  const handleSchedule = async () => {
    if (working) return

    if (article.schedule) {
      setDialog({ kind: 'schedule' })

      return
    }

    setWorking('schedule')
    setFailure(null)

    try {
      const ready = await saveFirst(true)

      if (ready) setDialog({ kind: 'schedule' })
    } catch (caught) {
      setFailure(failureText(caught, 'Your changes could not be saved, so nothing was scheduled.'))
      onConflict(caught)
    } finally {
      setWorking(null)
    }
  }

  const handlePreview = async (version: PreviewVersion = 'draft') => {
    if (working) return

    if (version !== 'draft') {
      setDialog({ kind: 'preview', version })

      return
    }

    setWorking('preview')
    setFailure(null)

    try {
      const ready = await saveFirst(false)

      if (ready) setDialog({ kind: 'preview', version })
    } catch (caught) {
      setFailure(failureText(caught, 'Your changes could not be saved, so the preview would show the older version.'))
      onConflict(caught)
    } finally {
      setWorking(null)
    }
  }

  /* -------------------------------------------------------------- derived */

  const state = article.state
  const live = article.published !== null
  const scheduled = article.schedule !== null
  const locked = article.slugLocked
  const busy = working !== null || save.isPending || publish.isPending || unpublish.isPending || discard.isPending
  const nothingNew = live && !unsaved && !article.hasPendingChanges
  const canSchedule = !scheduled && article.firstPublishedAt === null

  const issues = useMemo(() => orderedIssues(blogPublishIssues(localDraft)), [localDraft])
  const shape = submitted ? saveErrors(values, bodies) : {}
  const publishErrors = publishAttempted ? issuesByField(issues) : {}
  const errorFor = (field: string): string | undefined => shape[field] ?? publishErrors[field]
  const errorsShown = { ...publishErrors, ...shape }
  const complete = completeLanguages(localDraft)
  const texts = values.texts[language]
  const rtl = language === 'ar'
  const inputClass = cn('dash-field px-3 text-[13px]', rtl && 'font-[family-name:var(--font-arabic)]')
  const invalidImageCount = publishAttempted
    ? issues.filter((issue) => issue.field === `texts.${language}.body` && /image \d+/.test(issue.message)).length
    : 0
  /** Under the article: a limit it breaks, that it is empty, or how many pictures still need words. */
  const bodyError =
    shape[`texts.${language}.body`] ??
    (!publishAttempted
      ? undefined
      : isBlogBodyEmpty(bodies[language])
        ? publishErrors[`texts.${language}.body`]
        : invalidImageCount > 0
          ? `${invalidImageCount} ${invalidImageCount === 1 ? 'picture needs' : 'pictures need'} a description in ${LANGUAGE_WORDS[language]}`
          : undefined)

  /* ---------------------------------------------------------- the address */

  const slug = values.slug.trim()
  const slugShapeOk = slug !== '' && fieldErrors(values).slug === undefined
  const [debouncedSlug, setDebouncedSlug] = useState(slug)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSlug(slug), 350)

    return () => window.clearTimeout(timer)
  }, [slug])

  const slugCheck = useArticleSlugCheck(debouncedSlug, article.id, !locked && slugShapeOk && debouncedSlug === slug)
  const suggestion = slugSuggestion(values)
  const slugTaken = slugCheck.data?.available === false && debouncedSlug === slug
  const slugError = errorFor('slug') ?? (slugTaken ? (slugCheck.data?.reason ?? 'Another article already uses this address') : undefined)

  /* --------------------------------------------------------------- buttons */

  const primary = scheduled ? (
    <button type="button" className="dash-btn dash-btn-primary" disabled={busy} onClick={() => void handleSchedule()}>
      <CalendarClock className="size-4" aria-hidden="true" />
      Change schedule…
    </button>
  ) : (
    <button
      type="button"
      className="dash-btn dash-btn-primary"
      disabled={busy || nothingNew}
      title={nothingNew ? 'Nothing new to publish — visitors already see this version' : undefined}
      onClick={() => void handlePublish()}
    >
      {working === 'publish' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {working === 'publish' ? 'Publishing…' : live ? 'Publish update' : state === 'unpublished' ? 'Publish again' : 'Publish'}
    </button>
  )

  const scheduleButton = canSchedule ? (
    <button type="button" className="dash-btn dash-btn-quiet" disabled={busy} onClick={() => void handleSchedule()}>
      {working === 'schedule' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CalendarClock className="size-4" aria-hidden="true" />}
      Schedule…
    </button>
  ) : null

  const saveButton = (
    <button type="button" className="dash-btn dash-btn-quiet" disabled={busy || !unsaved} onClick={handleSave}>
      {working === 'save' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {working === 'save' ? 'Saving…' : 'Save'}
    </button>
  )

  const previewButton = (className?: string, iconOnly = false) => (
    <button
      type="button"
      className={cn('dash-btn dash-btn-ghost', className)}
      disabled={busy}
      aria-label={iconOnly ? 'Preview' : undefined}
      title={unsaved ? 'Saves your changes, then shows how the article will look to visitors' : 'Shows how the article will look to visitors'}
      onClick={() => void handlePreview('draft')}
    >
      {working === 'preview' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      {iconOnly ? null : 'Preview'}
    </button>
  )

  const projectOptions = projects.data?.items ?? []
  const currentProject = article.draft.project
  const chosenProject = projectOptions.find((project) => project.id === values.projectId)
  const chosenIsLive = chosenProject
    ? chosenProject.state === 'published' || chosenProject.state === 'published_with_pending_changes'
    : currentProject?.id === values.projectId
      ? currentProject.isLive
      : true

  const tagOptions = [...(tags.data?.items ?? [])]

  for (const tag of article.draft.tags) {
    if (!tagOptions.some((option) => option.id === tag.id)) {
      tagOptions.push({ id: tag.id, slug: tag.slug, names: tag.names, articleCount: 0, liveArticleCount: 0, createdAt: '', updatedAt: '' })
    }
  }

  /* ---------------------------------------------------------------- render */

  return (
    <DashboardPage className="gap-4 pb-24 lg:pb-6">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" className="dash-btn dash-btn-ghost h-9 px-2" onClick={() => void navigate({ to: '/dashboard/blog' })}>
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          Articles
        </button>

        {/* On a phone the title takes a line of its own rather than shrinking to a letter. */}
        <span className="order-last flex min-w-0 basis-full items-center gap-2.5 sm:order-none sm:flex-1 sm:basis-auto">
          <h1 className="dash-title truncate text-[20px]">{blogDisplayTitle(localDraft.texts, 'en')}</h1>
          <StateBadge state={state} />
        </span>

        <span className="ms-auto flex flex-wrap items-center gap-2 sm:ms-0">
          <span role="status" className="text-[11.5px]">
            {unsaved ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--dash-red-ink)]">
                <span className="size-[7px] rounded-full bg-[var(--dash-red)]" aria-hidden="true" />
                Unsaved changes
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[var(--dash-quiet)]">
                <Check className="size-3.5" aria-hidden="true" />
                All changes saved
              </span>
            )}
          </span>
          <span className="hidden items-center gap-2 lg:flex">
            {previewButton()}
            {saveButton}
            {scheduleButton}
            {primary}
          </span>
        </span>
      </header>

      <p className="text-[12px] text-[var(--dash-quiet)]">{BLOG_STATE_WORDS[state].meaning}</p>

      {changedElsewhere ? (
        <div role="alert" className="dash-panel flex flex-wrap items-center gap-3 border-[var(--dash-red)] p-3 text-[12.5px]">
          <span className="size-2 shrink-0 rounded-full bg-[var(--dash-red)]" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <strong className="font-semibold">This article was changed somewhere else</strong> — in another tab or window. Reload to see the newer
            version; your unsaved changes on this screen will be replaced.
          </span>
          <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12px]" onClick={() => adopt(article)}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Reload
          </button>
        </div>
      ) : failure ? (
        <div role="alert" className="dash-panel flex items-start gap-3 border-[var(--dash-red)] p-3 text-[12.5px]">
          <span className="mt-[5px] size-2 shrink-0 rounded-full bg-[var(--dash-red)]" aria-hidden="true" />
          <span className="min-w-0 flex-1">{failure}</span>
          <button type="button" className="dash-btn dash-btn-ghost size-7 p-0" aria-label="Dismiss" onClick={() => setFailure(null)}>
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <VersionsStrip article={article} unsaved={unsaved} onPreview={(version) => void handlePreview(version)} />

      {article.schedule ? (
        <p className="dash-panel flex items-start gap-2.5 p-3 text-[12.5px]">
          <span className="mt-[5px] size-2 shrink-0 rounded-full bg-[var(--dash-brand)]" aria-hidden="true" />
          <span>
            Scheduled for <strong className="font-semibold">{berlinLong(new Date(article.schedule.publishAt))}</strong> (Berlin). It publishes the
            version frozen when you scheduled it. Saving now changes only your draft
            {article.schedule.matchesDraft ? '' : ' — and your draft already differs from the frozen version'}.
          </span>
        </p>
      ) : null}

      {article.publicationDelay && live ? (
        <p className="dash-panel flex items-start gap-2.5 p-3 text-[12.5px]">
          <span className="mt-[5px] size-2 shrink-0 rounded-full bg-[var(--dash-red)]" aria-hidden="true" />
          <span>
            This article was scheduled for {berlinLong(new Date(article.publicationDelay.scheduledFor))} and went live{' '}
            {article.publicationDelay.minutesLate} minutes later, once the server could publish it. It was published once; nothing else changed.
          </span>
        </p>
      ) : null}

      {state === 'unpublished' ? (
        <p className="dash-panel flex items-start gap-2.5 p-3 text-[12.5px]">
          <span className="mt-[5px] size-2 shrink-0 rounded-full bg-[var(--dash-quiet)]" aria-hidden="true" />
          <span>
            Taken down. Visitors get “page not found”. Publish again to bring it back with the same address, date, comments and counts.
          </span>
        </p>
      ) : null}

      <form
        id="article-editor"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          handleSave()
        }}
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <div className="flex min-w-0 flex-col gap-4">
          {/* Buttons, not `#` links: the page scrolls, and the address stays the article's. */}
          <nav aria-label="Sections" className="flex flex-wrap gap-1.5">
            {[
              ['article-basics', 'Address & tags'],
              ['article-cover', 'Cover'],
              ['article-content', 'Article'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="dash-btn dash-btn-quiet h-8 px-2.5 text-[12px]"
                onClick={() => document.getElementById(id!)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* ---------------------------------------------------- basics */}
          <Section id="article-basics" title="Address, tags and project" note="Shared by all three languages.">
            <div className="flex flex-col gap-4">
              <form.Field name="slug">
                {(field) => (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor="blog-slug" className="text-[12px] font-semibold">
                      Web address
                    </label>
                    <div
                      className={cn(
                        'flex items-center overflow-hidden rounded-[9px] border bg-[var(--dash-input)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--dash-blue)]',
                        slugError ? 'border-[var(--dash-red)]' : 'border-[var(--dash-line)]',
                        locked && 'bg-[var(--dash-furniture)]',
                      )}
                    >
                      <span className="dash-num ps-3 pe-0.5 text-[12px] whitespace-nowrap text-[var(--dash-quiet)]" dir="ltr">
                        yamanwarda.de/{language}/blog/
                      </span>
                      <input
                        id="blog-slug"
                        className="dash-num h-9 min-w-0 flex-1 border-0 bg-transparent pe-3 text-[13px] outline-none disabled:text-[var(--dash-quiet)]"
                        dir="ltr"
                        value={field.state.value}
                        maxLength={BLOG_LIMITS.slug}
                        spellCheck={false}
                        autoComplete="off"
                        disabled={locked}
                        aria-invalid={slugError ? true : undefined}
                        aria-describedby={slugError ? 'blog-slug-error' : 'blog-slug-hint'}
                        onChange={(event) => field.handleChange(event.target.value.toLowerCase())}
                        onBlur={field.handleBlur}
                      />
                      {locked ? (
                        <span className="px-2.5 text-[var(--dash-quiet)]" title="Fixed">
                          <Lock className="size-3.5" aria-label="Fixed" />
                        </span>
                      ) : null}
                    </div>
                    {slugError ? (
                      <p id="blog-slug-error" className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--dash-red-ink)]">
                        <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                        {slugError}
                      </p>
                    ) : (
                      <div id="blog-slug-hint" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px]" aria-live="polite">
                        {locked ? (
                          <span className="text-[var(--dash-quiet)]">Fixed since it was first scheduled or published — a published link must keep working.</span>
                        ) : slug === '' ? (
                          <>
                            <span className="text-[var(--dash-quiet)]">One address for all three languages. Needed before publishing.</span>
                            {suggestion ? (
                              <button type="button" className="dash-btn dash-btn-quiet h-7 px-2 text-[11.5px]" onClick={() => field.handleChange(suggestion)}>
                                Use “{suggestion}”
                              </button>
                            ) : null}
                          </>
                        ) : slugCheck.data?.available && debouncedSlug === slug ? (
                          <span className="flex items-center gap-1.5 font-medium text-[var(--dash-live)]">
                            <Check className="size-3.5" aria-hidden="true" />
                            This address is free
                          </span>
                        ) : slugShapeOk ? (
                          <span className="text-[var(--dash-quiet)]">Checking…</span>
                        ) : (
                          <span className="text-[var(--dash-quiet)]">Lowercase letters, numbers and hyphens. It stays the same in all three languages.</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </form.Field>

              <form.Field name="tagIds">
                {(field) => {
                  const chosen = field.state.value
                  const full = chosen.length >= BLOG_LIMITS.tagsPerArticle

                  return (
                    <div className="flex flex-col gap-1.5">
                      <span id="blog-tags-label" className="text-[12px] font-semibold">
                        Tags
                      </span>
                      {tagOptions.length === 0 ? (
                        <p className="text-[12px] text-[var(--dash-quiet)]">
                          {tags.isPending ? 'Loading tags…' : tags.isError ? 'The tags could not be loaded.' : 'No tags yet.'}
                        </p>
                      ) : (
                        <div role="group" aria-labelledby="blog-tags-label" className="flex flex-wrap gap-1.5">
                          {tagOptions.map((tag) => {
                            const on = chosen.includes(tag.id)

                            return (
                              <button
                                key={tag.id}
                                type="button"
                                aria-pressed={on}
                                disabled={!on && full}
                                onClick={() => field.handleChange(on ? chosen.filter((id) => id !== tag.id) : [...chosen, tag.id])}
                                className={cn(
                                  'inline-flex h-[30px] items-center gap-1.5 rounded-[8px] border px-2.5 text-[12px] font-semibold disabled:opacity-50',
                                  on
                                    ? 'border-[var(--dash-brand)] bg-[var(--dash-blue-tint)] text-[var(--dash-blue-ink)]'
                                    : 'border-[var(--dash-line)] bg-[var(--dash-input)] text-[var(--dash-quiet)] hover:text-[var(--dash-ink)]',
                                )}
                              >
                                {on ? <Check className="size-3" aria-hidden="true" /> : null}
                                {tag.names.en}
                              </button>
                            )
                          })}
                        </div>
                      )}
                      <p className="text-[11.5px] text-[var(--dash-quiet)]">
                        Up to {BLOG_LIMITS.tagsPerArticle}. Readers filter the blog by them.{' '}
                        <button
                          type="button"
                          className="font-semibold text-[var(--dash-brand)] hover:underline"
                          onClick={() => void navigate({ to: '/dashboard/blog/tags' })}
                        >
                          Manage tags
                        </button>
                      </p>
                    </div>
                  )
                }}
              </form.Field>

              <form.Field name="projectId">
                {(field) => (
                  <Field
                    id="blog-project"
                    label="About a project"
                    hint={
                      projects.isError
                        ? 'Your projects could not be loaded. The article keeps the one it has.'
                        : field.state.value && !chosenIsLive
                          ? 'This project is private: visitors will see the link only once the project is live.'
                          : 'Optional. Shown under the article while the project is live.'
                    }
                  >
                    <select
                      id="blog-project"
                      className="dash-field h-9 px-2.5 text-[13px]"
                      value={field.state.value}
                      aria-describedby="blog-project-hint"
                      onChange={(event) => field.handleChange(event.target.value)}
                    >
                      <option value="">No project</option>
                      {currentProject && !projectOptions.some((project) => project.id === currentProject.id) ? (
                        <option value={currentProject.id}>
                          {currentProject.name}
                          {currentProject.isLive ? '' : ' (private)'}
                        </option>
                      ) : null}
                      {projectOptions.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.displayName}
                          {project.state === 'published' || project.state === 'published_with_pending_changes' ? '' : ' (private)'}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </form.Field>
            </div>
          </Section>

          {/* ----------------------------------------------------- cover */}
          <Section
            id="article-cover"
            title="Cover image"
            note="One picture for all three languages, chosen from the shared Media library. Optional."
          >
            <form.Field name="cover">
              {(field) => {
                const cover = field.state.value
                const missingAlt = LANGUAGES.filter((code) => errorFor(`cover.alt.${code}`))

                return (
                  <div className="flex flex-col gap-3">
                    <div
                      className={cn(
                        'grid aspect-video max-h-[260px] w-full place-items-center overflow-hidden rounded-[10px] border text-center text-[12px] text-[var(--dash-quiet)]',
                        cover ? 'border-[var(--dash-line)]' : 'border-dashed border-[var(--dash-line)] bg-[var(--dash-furniture)] p-3',
                      )}
                    >
                      {cover ? (
                        <img src={ownerImageUrl(cover.mediaId)} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="flex flex-col items-center gap-1.5">
                          <ImageIcon className="size-5" aria-hidden="true" />
                          No cover yet
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12px]" onClick={() => setDialog({ kind: 'cover' })}>
                        <Images className="size-3.5" aria-hidden="true" />
                        {cover ? 'Replace from Media' : 'Choose from Media'}
                      </button>
                      {cover ? (
                        <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12px]" onClick={() => field.handleChange(null)}>
                          <X className="size-3.5" aria-hidden="true" />
                          Remove cover
                        </button>
                      ) : null}
                    </div>

                    {cover ? (
                      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
                        <legend className="mb-1.5 p-0 text-[12px] font-semibold">
                          Alternative text <span className="font-normal text-[var(--dash-quiet)]">— what the picture shows, for people who cannot see it</span>
                        </legend>
                        {LANGUAGES.map((code) => {
                          const error = errorFor(`cover.alt.${code}`)

                          return (
                            <div key={code} className="flex items-center gap-2">
                              <span
                                aria-hidden="true"
                                className={cn(
                                  'w-8 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-bold uppercase',
                                  error ? 'bg-[var(--dash-red-tint)] text-[var(--dash-red-ink)]' : 'bg-[var(--dash-chip)] text-[var(--dash-quiet)]',
                                )}
                              >
                                {code}
                              </span>
                              <input
                                id={`blog-cover-alt-${code}`}
                                className={cn('dash-field h-9 min-w-0 flex-1 px-3 text-[13px]', code === 'ar' && 'font-[family-name:var(--font-arabic)]')}
                                dir={code === 'ar' ? 'rtl' : 'ltr'}
                                lang={code}
                                maxLength={BLOG_LIMITS.altText}
                                value={cover.alt[code]}
                                aria-label={`Cover alternative text, ${LANGUAGE_WORDS[code]}`}
                                aria-invalid={error ? true : undefined}
                                aria-describedby={error ? 'blog-cover-alt-error' : undefined}
                                onChange={(event) => field.handleChange({ ...cover, alt: { ...cover.alt, [code]: event.target.value } })}
                              />
                            </div>
                          )
                        })}
                        {missingAlt.length > 0 ? (
                          <p id="blog-cover-alt-error" className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--dash-red-ink)]">
                            <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                            {errorFor(`cover.alt.${missingAlt[0]}`)?.startsWith('At most')
                              ? errorFor(`cover.alt.${missingAlt[0]}`)
                              : 'Needed in all three languages before publishing'}
                          </p>
                        ) : null}
                      </fieldset>
                    ) : (
                      <p className="flex items-start gap-2 rounded-[9px] border border-[var(--dash-line)] bg-[var(--dash-furniture)] px-3 py-2 text-[12px] leading-normal text-[var(--dash-quiet)]">
                        <Info className="mt-0.5 size-3.5 shrink-0 text-[var(--dash-blue-ink)]" aria-hidden="true" />
                        No cover: the article card on the blog shows no picture, and social networks show none when the link is shared. A cover is
                        optional.
                      </p>
                    )}
                  </div>
                )
              }}
            </form.Field>
          </Section>

          {/* --------------------------------------------------- content */}
          <Section
            id="article-content"
            title="The article, in three languages"
            note="Each language has its own text, pictures and search wording. Publishing needs a title, a summary and the article in all three."
          >
            <div role="tablist" aria-label="Language" className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-[var(--dash-line)]">
              {LANGUAGES.map((code) => {
                const attention = languageNeedsAttention(code, errorsShown)

                return (
                  <button
                    key={code}
                    type="button"
                    role="tab"
                    id={`article-tab-${code}`}
                    aria-selected={language === code}
                    aria-controls="article-language-panel"
                    onClick={() => setLanguage(code)}
                    className={cn(
                      '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-[12.5px] font-semibold whitespace-nowrap',
                      language === code
                        ? 'border-[var(--dash-brand)] text-[var(--dash-brand)]'
                        : 'border-transparent text-[var(--dash-quiet)] hover:text-[var(--dash-ink)]',
                    )}
                  >
                    {LANGUAGE_WORDS[code]}
                    {attention ? (
                      <span className="size-1.5 rounded-full bg-[var(--dash-red)]" role="img" aria-label="needs attention" />
                    ) : complete.includes(code) ? (
                      <Check className="size-3.5 text-[var(--dash-live)]" aria-label="complete" />
                    ) : null}
                  </button>
                )
              })}
            </div>

            <div
              id="article-language-panel"
              role="tabpanel"
              aria-labelledby={`article-tab-${language}`}
              key={`${language}-${epoch}`}
              lang={language}
              className="grid gap-4"
            >
              <form.Field name={`texts.${language}.title`}>
                {(field) => {
                  const id = `blog-${language}-title`
                  const error = errorFor(`texts.${language}.title`)

                  return (
                    <Field id={id} label="Title" error={error} counter={{ value: field.state.value.trim().length, max: BLOG_LIMITS.title }}>
                      <input
                        id={id}
                        className={cn(inputClass, 'h-9')}
                        dir={rtl ? 'rtl' : 'ltr'}
                        maxLength={BLOG_LIMITS.title + 20}
                        value={field.state.value}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={describedBy(id, error)}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                      />
                    </Field>
                  )
                }}
              </form.Field>

              <form.Field name={`texts.${language}.summary`}>
                {(field) => {
                  const id = `blog-${language}-summary`
                  const error = errorFor(`texts.${language}.summary`)

                  return (
                    <Field
                      id={id}
                      label="Summary"
                      hint="Shown on the article card, under the title, and in the RSS feed."
                      error={error}
                      counter={{ value: field.state.value.trim().length, max: BLOG_LIMITS.summary }}
                    >
                      <textarea
                        id={id}
                        rows={3}
                        className={cn(inputClass, 'py-2')}
                        dir={rtl ? 'rtl' : 'ltr'}
                        maxLength={BLOG_LIMITS.summary + 40}
                        value={field.state.value}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={describedBy(id, error, true)}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                      />
                    </Field>
                  )
                }}
              </form.Field>

              <div data-body-editor="">
                <BlogBodyEditor
                  key={`${language}-${epoch}`}
                  id={`blog-${language}-body`}
                  value={bodies[language]}
                  language={language}
                  attempted={publishAttempted}
                  error={bodyError}
                  onChange={(doc) => setBodies((previous) => ({ ...previous, [language]: doc }))}
                />
              </div>

              <details
                className="rounded-[10px] border border-[var(--dash-line)] px-3.5 py-3"
                open={seoOpen[language]}
                onToggle={(event) => {
                  const open = event.currentTarget.open

                  setSeoOpen((previous) => (previous[language] === open ? previous : { ...previous, [language]: open }))
                }}
              >
                <summary className="cursor-pointer text-[12.5px] font-semibold">
                  Search appearance ({LANGUAGE_LABEL[language]}) <span className="font-normal text-[var(--dash-quiet)]">— optional</span>
                </summary>
                <div className="mt-3 grid gap-3">
                  <form.Field name={`texts.${language}.seoTitle`}>
                    {(field) => {
                      const id = `blog-${language}-seo-title`
                      const error = errorFor(`texts.${language}.seoTitle`)

                      return (
                        <Field
                          id={id}
                          label="Search title"
                          hint="Empty uses the title."
                          error={error}
                          counter={{ value: field.state.value.trim().length, max: BLOG_LIMITS.seoTitle }}
                        >
                          <input
                            id={id}
                            className={cn(inputClass, 'h-9')}
                            dir={rtl ? 'rtl' : 'ltr'}
                            maxLength={BLOG_LIMITS.seoTitle + 20}
                            value={field.state.value}
                            placeholder={texts.title}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={describedBy(id, error, true)}
                            onChange={(event) => field.handleChange(event.target.value)}
                          />
                        </Field>
                      )
                    }}
                  </form.Field>
                  <form.Field name={`texts.${language}.seoDescription`}>
                    {(field) => {
                      const id = `blog-${language}-seo-description`
                      const error = errorFor(`texts.${language}.seoDescription`)

                      return (
                        <Field
                          id={id}
                          label="Search description"
                          hint="Empty uses the summary."
                          error={error}
                          counter={{ value: field.state.value.trim().length, max: BLOG_LIMITS.seoDescription }}
                        >
                          <textarea
                            id={id}
                            rows={2}
                            className={cn(inputClass, 'py-2')}
                            dir={rtl ? 'rtl' : 'ltr'}
                            maxLength={BLOG_LIMITS.seoDescription + 40}
                            value={field.state.value}
                            placeholder={texts.summary}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={describedBy(id, error, true)}
                            onChange={(event) => field.handleChange(event.target.value)}
                          />
                        </Field>
                      )
                    }}
                  </form.Field>

                  <div
                    className="flex flex-col gap-0.5 rounded-[10px] border border-[var(--dash-line)] bg-[var(--dash-input)] px-3.5 py-3"
                    dir={rtl ? 'rtl' : 'ltr'}
                    aria-label="How a search result could look"
                  >
                    <span className="text-[12px] text-[var(--dash-quiet)]" dir="ltr">
                      yamanwarda.de › {language} › blog › {slug || '…'}
                    </span>
                    <span className="text-[17px] leading-snug text-[#1a0dab] dark:text-[#99c3ff]">
                      {texts.seoTitle.trim() || texts.title.trim() || 'Title'}
                    </span>
                    <span className="text-[13px] text-[var(--dash-quiet)]">
                      {(() => {
                        const text =
                          texts.seoDescription.trim() || texts.summary.trim() || 'The summary is used here until you write a search description.'

                        return text.length > 160 ? `${text.slice(0, 157)}…` : text
                      })()}
                    </span>
                  </div>
                </div>
              </details>
            </div>
          </Section>
        </div>

        {/* -------------------------------------------------------- the side */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start" aria-label="Publishing">
          <Checklist issues={issues} attempted={publishAttempted} onGo={goToIssue} />

          <ReadersPanel article={article} />

          {state === 'published_with_pending_changes' ? (
            <div className="dash-panel p-3.5">
              <p className="text-[12.5px] font-semibold">Saved changes not published</p>
              <p className="mt-1 text-[11.5px] text-[var(--dash-quiet)]">
                Visitors still read the version from {article.publishedAt ? dashDate(article.publishedAt) : 'before'}.
              </p>
              <button type="button" className="dash-btn dash-btn-quiet mt-2.5 h-8 text-[12px]" disabled={busy} onClick={() => setDialog({ kind: 'discard' })}>
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Discard saved changes…
              </button>
            </div>
          ) : null}

          <div className="dash-panel p-3.5">
            {live ? (
              <>
                <p className="text-[12.5px] font-semibold">Take down</p>
                <p className="mt-1 text-[11.5px] text-[var(--dash-quiet)]">
                  Removes it from the blog, the feed and the sitemap. Its text, comments, reads and likes stay here; publishing again brings everything
                  back.
                </p>
                <button type="button" className="dash-btn dash-btn-quiet mt-2.5 h-8 text-[12px]" disabled={busy} onClick={() => setDialog({ kind: 'unpublish' })}>
                  <EyeOff className="size-3.5" aria-hidden="true" />
                  Take down…
                </button>
              </>
            ) : null}
            <p className={cn('text-[12.5px] font-semibold', live && 'mt-4')}>Delete permanently</p>
            <p className="mt-1 text-[11.5px] text-[var(--dash-quiet)]">
              The article in all three languages, its comments and its counts. The pictures stay in Media.
            </p>
            <button
              type="button"
              className="dash-btn dash-btn-ghost mt-2.5 h-8 text-[12px] text-[var(--dash-red-ink)]"
              disabled={busy}
              onClick={() => setDialog({ kind: 'delete' })}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Delete…
            </button>
          </div>
        </aside>
      </form>

      {/* Below the two-column width the actions stay within reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-[var(--dash-line)] bg-[var(--dash-surface)]/95 px-4 py-2.5 backdrop-blur lg:hidden">
        {previewButton('shrink-0 px-2.5', true)}
        <span className="flex flex-1 gap-2 [&>*]:flex-1">
          {saveButton}
          {scheduleButton}
          {primary}
        </span>
      </div>

      <p ref={announce} role="status" aria-live="polite" className="sr-only" />

      <MediaPicker
        open={dialog?.kind === 'cover'}
        onClose={() => setDialog(null)}
        onChoose={(asset) => {
          // A new picture needs a new description: the old one described the old picture.
          form.setFieldValue('cover', { mediaId: asset.id, alt: { de: '', en: '', ar: '' } })
          setDialog(null)
        }}
        kind="image"
        title="Choose a cover"
        description="It is added to your Media library first, then used as this article's cover."
      />

      {dialog?.kind === 'schedule' ? (
        <ScheduleDialog
          article={article}
          unsaved={unsaved}
          onClose={() => setDialog(null)}
          onPublishNow={() => handlePublish()}
        />
      ) : null}

      {dialog?.kind === 'preview' ? (
        <BlogPreview
          articleId={article.id}
          revision={article.draftRevision}
          versions={['draft', ...(article.schedule ? (['scheduled'] as const) : []), ...(live ? (['published'] as const) : [])]}
          initialVersion={dialog.version}
          initialLanguage={language}
          unsaved={unsaved}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.kind === 'unpublish' ? (
        <ConfirmDialog
          title="Take this article down?"
          confirmLabel="Take down"
          busyLabel="Taking down…"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            try {
              await unpublish.mutateAsync(article.id)
            } catch (caught) {
              throw caught instanceof ApiRequestError ? caught : new Error('It could not be taken down.')
            }

            notify.success('Taken down. Visitors now get “page not found”.')
            setDialog(null)
          }}
        >
          <p>
            It leaves the blog, the feed and the sitemap at once, and its comments are hidden with it. Its text, comments, reads and likes stay here —
            publishing again brings all of it back, under the same address and date.
          </p>
        </ConfirmDialog>
      ) : null}

      {dialog?.kind === 'discard' ? (
        <ConfirmDialog
          title="Discard your saved changes?"
          confirmLabel="Discard changes"
          busyLabel="Discarding…"
          danger
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            let next: OwnerBlogPost

            try {
              next = await discard.mutateAsync({ id: article.id, draftRevision: base.current.revision })
            } catch (caught) {
              throw caught instanceof ApiRequestError ? caught : new Error('The changes could not be discarded.')
            }

            adopt(next)
            notify.success('Changes discarded — the draft matches the live article')
            setDialog(null)
          }}
        >
          <p>
            Your draft goes back to exactly what visitors see now. The changes cannot be recovered.
            {unsaved ? ' Your unsaved changes on this screen go too.' : ''}
          </p>
        </ConfirmDialog>
      ) : null}

      {dialog?.kind === 'delete' ? (
        <DeleteArticleDialog
          article={article}
          onClose={() => setDialog(null)}
          onDeleted={async () => {
            leaving.current = true
            notify.success('Deleted. The pictures are still in Media.')
            await navigate({ to: '/dashboard/blog' })
          }}
        />
      ) : null}

      {blocker.status === 'blocked' ? (
        <BlogDialog labelledBy="leave-title" describedBy="leave-text" role="alertdialog" size="sm" onClose={() => blocker.reset()}>
          <DialogTitle id="leave-title">Leave without saving?</DialogTitle>
          <p id="leave-text" className="text-[13px] text-[var(--dash-quiet)]">
            Your changes to this article are only on this screen. Leaving throws them away; what is saved and what is live stay as they are.
          </p>
          <DialogActions>
            <button type="button" className="dash-btn dash-btn-quiet" onClick={() => blocker.proceed()}>
              Leave without saving
            </button>
            <button type="button" className="dash-btn dash-btn-primary" onClick={() => blocker.reset()} data-autofocus>
              Keep editing
            </button>
          </DialogActions>
        </BlogDialog>
      ) : null}
    </DashboardPage>
  )
}

/** Everything Save refuses, keyed by field: the form's own limits and the bodies'. */
const saveErrors = (values: BlogFormValues, bodies: BlogBodies): Record<string, string> => {
  const errors = fieldErrors(values)
  const body = bodyErrors(toDraft(values, bodies))

  for (const language of LANGUAGES) {
    if (body[language]) errors[`texts.${language}.body`] = body[language]!
  }

  if (body.article) errors['texts.en.body'] ??= body.article

  return errors
}

/* --------------------------------------------------------------- the page */

export function BlogEditorPage() {
  const { postId } = useParams({ from: '/dashboard/blog/$postId' })
  const search = useSearch({ from: '/dashboard/blog/$postId' })
  const navigate = useNavigate()
  const article = useArticle(postId)

  if (article.isPending) {
    return (
      <DashboardPage className="gap-4">
        <div className="dash-skeleton h-9 w-64 rounded" />
        <div className="dash-skeleton h-20 w-full rounded-[12px]" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-4">
            <div className="dash-skeleton h-48 rounded-[12px]" />
            <div className="dash-skeleton h-96 rounded-[12px]" />
          </div>
          <div className="dash-skeleton h-64 rounded-[12px]" />
        </div>
      </DashboardPage>
    )
  }

  if (article.isError || !article.data) {
    const missing = article.error instanceof ApiRequestError && article.error.status === 404

    return (
      <DashboardPage>
        <section className="dash-panel">
          <LoadFailure
            title={missing ? 'This article does not exist' : 'This article could not be loaded'}
            message={missing ? 'It may have been deleted. The list shows what is still there.' : 'The server did not answer. Nothing has been changed.'}
            retryLabel={missing ? 'Back to articles' : 'Try again'}
            onRetry={() => (missing ? void navigate({ to: '/dashboard/blog' }) : void article.refetch())}
          />
        </section>
      </DashboardPage>
    )
  }

  return (
    <ArticleEditor
      key={postId}
      article={article.data}
      initialLanguage={search.language ?? 'en'}
      onRefetch={() => article.refetch()}
    />
  )
}
