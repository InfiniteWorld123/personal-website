import { useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams } from '@tanstack/react-router'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Check, Eye, Loader2, Plus, Trash2, X } from 'lucide-react'
import { LANGUAGE_WORDS } from '#/backend2/contracts/project.contract'
import {
  LANGUAGES,
  type Language,
  type OwnerService,
  SERVICE_LIMITS,
  canonicalServiceDraft,
  completeServiceLanguages,
  publicPriceOf,
  publishBlockers,
  serviceDisplayName,
  slugify,
} from '#/backend2/contracts/service.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage } from '#/frontend/dashboard/primitives'
import {
  useDeleteService,
  useDiscardPending,
  usePatchService,
  usePublishService,
  useService,
  useSlugCheck,
  useUnpublishService,
} from '#/frontend/features/services/queries'
import {
  type ServiceFormValues,
  blockerTarget,
  deleteConfirmation,
  emptyFormValues,
  fieldErrors,
  priceSummary,
  toDraft,
  toFormValues,
} from '#/frontend/features/services/service-form'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { BodyView, LoadFailure, PriceText, StateBadge, stateMeaning } from './service-parts'
import { ServicePreview } from './ServicePreview'

/**
 * One service, on one page — the approved Projects editor pattern (answer 2a):
 * grouped sections down a column, the publication checklist beside them, one
 * tab per language.
 *
 * The screen keeps saying one thing: saving does not change what visitors
 * see. The banner, the button name and the "Visitors see / You saved" panel
 * all say it, and the rule itself is on the server.
 */

const SECTIONS = [
  { id: 'service-basics', label: 'Basics' },
  { id: 'service-price', label: 'Price' },
  { id: 'service-content', label: 'Content' },
] as const

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="dash-panel scroll-mt-4 p-4 sm:p-5">
      <div className="mb-3.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {note ? <p className="mt-1 text-[12px] text-[var(--dash-quiet)]">{note}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: React.ReactNode
  hint?: React.ReactNode
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-semibold">
        {label}
      </label>
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

const described = (id: string, error?: string, hint?: boolean) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined)

const firstError = (errors: unknown): string | undefined => {
  const first = Array.isArray(errors) ? errors[0] : undefined

  return typeof first === 'string' ? first : undefined
}

/** The editor's "What is included" list: one input per line. */
function IncludedList({
  language,
  items,
  errors,
  onChange,
}: {
  language: Language
  items: string[]
  errors: Record<string, string>
  onChange: (items: string[]) => void
}) {
  const list = useRef<HTMLDivElement>(null)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)

  useEffect(() => {
    if (focusIndex === null) return
    list.current?.querySelector<HTMLInputElement>(`[data-index="${focusIndex}"]`)?.focus()
    setFocusIndex(null)
  }, [focusIndex, items.length])

  const insertAfter = (index: number) => {
    const next = [...items]

    next.splice(index + 1, 0, '')
    onChange(next)
    setFocusIndex(index + 1)
  }
  const remove = (index: number) => {
    onChange(items.filter((_, at) => at !== index))
    setFocusIndex(Math.max(0, index - 1))
  }
  const swap = (index: number, other: number) => {
    const next = [...items]

    ;[next[index], next[other]] = [next[other]!, next[index]!]
    onChange(next)
    setFocusIndex(other)
  }
  const filled = items.filter((item) => item.trim() !== '').length

  return (
    <div ref={list} className="flex flex-col gap-1.5">
      <span id={`included-label-${language}`} className="text-[12px] font-semibold">
        What is included
      </span>
      {items.length === 0 ? (
        <p className="text-[11.5px] text-[var(--dash-quiet)]">
          Nothing listed yet. Publishing needs at least one line in every language.
        </p>
      ) : (
        <ol aria-labelledby={`included-label-${language}`} className="flex flex-col gap-1.5">
          {items.map((item, index) => {
            const id = `service-${language}-included-${index}`
            const error = errors[`texts.${language}.included[${index}]`]

            return (
              <li key={index} className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5">
                  <span className="dash-num w-5 shrink-0 text-center text-[11px] text-[var(--dash-quiet)]" aria-hidden="true">
                    {index + 1}
                  </span>
                  <input
                    id={id}
                    data-index={index}
                    className="dash-field h-[34px] min-w-0 flex-1 px-3 text-[13px]"
                    value={item}
                    maxLength={SERVICE_LIMITS.includedItem + 20}
                    aria-label={`Included line ${index + 1}`}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                    onChange={(event) => onChange(items.map((value, at) => (at === index ? event.target.value : value)))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        if (items.length < SERVICE_LIMITS.includedCount) insertAfter(index)
                      }
                      if (event.key === 'Backspace' && item === '' && items.length > 1) {
                        event.preventDefault()
                        remove(index)
                      }
                    }}
                  />
                  <button type="button" className="dash-btn dash-btn-ghost size-8 p-0" aria-label={`Move line ${index + 1} up`} disabled={index === 0} onClick={() => swap(index, index - 1)}>
                    <ArrowUp className="size-3.5" aria-hidden="true" />
                  </button>
                  <button type="button" className="dash-btn dash-btn-ghost size-8 p-0" aria-label={`Move line ${index + 1} down`} disabled={index === items.length - 1} onClick={() => swap(index, index + 1)}>
                    <ArrowDown className="size-3.5" aria-hidden="true" />
                  </button>
                  <button type="button" className="dash-btn dash-btn-ghost size-8 p-0" aria-label={`Remove line ${index + 1}`} onClick={() => remove(index)}>
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </span>
                {error ? (
                  <p id={`${id}-error`} className="ms-7 text-[11.5px] font-medium text-[var(--dash-red-ink)]">
                    {error}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
      <span className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          className="dash-btn dash-btn-quiet h-8 text-[12px]"
          disabled={items.length >= SERVICE_LIMITS.includedCount}
          onClick={() => insertAfter(items.length - 1)}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Add a line
        </button>
        <span className="text-[11.5px] text-[var(--dash-quiet)]">
          {filled} of {SERVICE_LIMITS.includedCount} · Enter adds the next line
        </span>
      </span>
    </div>
  )
}

export function ServiceEditorPage() {
  const { serviceId } = useParams({ from: '/dashboard/services/$serviceId' })
  const navigate = useNavigate()

  const service = useService(serviceId)
  const patch = usePatchService()
  const publish = usePublishService()
  const unpublish = useUnpublishService()
  const discard = useDiscardPending()
  const remove = useDeleteService()

  const [language, setLanguage] = useState<Language>('de')
  const [priceLanguage, setPriceLanguage] = useState<Language | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [serverBlockers, setServerBlockers] = useState<string[] | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [showBody, setShowBody] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [focusTarget, setFocusTarget] = useState<string | null>(null)
  const announce = useRef<HTMLParagraphElement>(null)
  const leaving = useRef(false)

  const data = service.data

  const form = useForm({
    defaultValues: data ? toFormValues(data.draft) : emptyFormValues(),
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields = fieldErrors(value)

        return Object.keys(fields).length === 0 ? undefined : { fields }
      },
    },
    onSubmitInvalid: ({ value }) => {
      // The first problem may sit in another language's tab: open it first.
      const key = Object.keys(fieldErrors(value))[0]
      const tab = key?.match(/^texts\.(de|en|ar)\./)?.[1] as Language | undefined

      if (tab) setLanguage(tab)
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('#service-editor [aria-invalid="true"]')?.focus()
      })
    },
    onSubmit: async ({ value }) => {
      await persist(value)
      notify.success('Draft saved')
    },
  })

  const values = useStore(form.store, (store) => store.values)

  /* Refill only when the server's version is actually new — keyed on the
     revision, so a refetch on window focus never wipes half-typed text. */
  const applied = useRef<string | null>(null)

  useEffect(() => {
    if (!data) return

    const version = `${data.id}:${data.draftRevision}`

    if (applied.current === version) return

    applied.current = version
    form.reset(toFormValues(data.draft))
  }, [data, form])

  const draft = useMemo(() => toDraft(values), [values])
  const unsaved = data ? canonicalServiceDraft(draft) !== canonicalServiceDraft(data.draft) : false
  const unsavedRef = useRef(false)
  unsavedRef.current = unsaved

  /* The unsaved-change warning (docs/v2/services.md): leaving with work that
     is not saved asks first, inside the app and on closing the tab. */
  const blocker = useBlocker({
    shouldBlockFn: () => unsavedRef.current && !leaving.current,
    enableBeforeUnload: () => unsavedRef.current && !leaving.current,
    withResolver: true,
  })

  const slug = draft.slug
  const slugValid = slug !== '' && fieldErrors(values).slug === undefined
  const [debouncedSlug, setDebouncedSlug] = useState(slug)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSlug(slug), 350)

    return () => window.clearTimeout(timer)
  }, [slug])

  const slugCheck = useSlugCheck(debouncedSlug, serviceId, slugValid && debouncedSlug === slug)

  useEffect(() => {
    if (!focusTarget) return

    const element = document.getElementById(focusTarget)

    if (element) {
      element.focus()
      element.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    setFocusTarget(null)
  }, [focusTarget, language])

  if (service.isPending) {
    return (
      <DashboardPage className="gap-4">
        <div className="dash-skeleton h-9 w-56 rounded" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-4">
            <div className="dash-skeleton h-48 rounded-[12px]" />
            <div className="dash-skeleton h-72 rounded-[12px]" />
          </div>
          <div className="dash-skeleton h-64 rounded-[12px]" />
        </div>
      </DashboardPage>
    )
  }

  if (service.isError || !data) {
    const missing = service.error instanceof ApiRequestError && service.error.status === 404

    return (
      <DashboardPage>
        <section className="dash-panel">
          <LoadFailure
            title={missing ? 'That service does not exist' : 'This service could not be loaded'}
            message={missing ? 'It may have been deleted. The list shows what is still there.' : 'The server did not answer. Nothing has been changed.'}
            retryLabel={missing ? 'Back to Services' : 'Try again'}
            onRetry={() => (missing ? void navigate({ to: '/dashboard/services' }) : void service.refetch())}
          />
        </section>
      </DashboardPage>
    )
  }

  /* ------------------------------------------------------------ actions */

  const failureText = (caught: unknown, fallback: string) => (caught instanceof ApiRequestError ? caught.message : fallback)

  const persist = async (value: ServiceFormValues): Promise<OwnerService> => {
    setFailure(null)
    setServerBlockers(null)

    const next = toDraft(value)
    const saved = await patch.mutateAsync({
      id: serviceId,
      draftRevision: data.draftRevision,
      slug: next.slug,
      featured: next.featured,
      price: next.price,
      texts: next.texts,
    })

    if (announce.current) announce.current.textContent = 'Draft saved'

    return saved
  }

  const hasFieldErrors = () => Object.keys(fieldErrors(form.state.values)).length > 0

  const handleSave = async () => {
    try {
      await form.handleSubmit()
    } catch (caught) {
      setFailure(failureText(caught, 'That could not be saved. Your text is still here.'))
    }
  }

  /** Saves first when there is something to save, so what goes live is what is on screen. */
  const saveIfNeeded = async (): Promise<OwnerService | null> => {
    if (!unsaved) return data

    if (hasFieldErrors()) {
      await form.handleSubmit()

      return null
    }

    return persist(form.state.values)
  }

  const handlePublish = async () => {
    setFailure(null)
    setServerBlockers(null)

    try {
      const saved = await saveIfNeeded()

      if (!saved) return

      const wasLive = saved.published !== null
      const result = await publish.mutateAsync({ id: saved.id, draftRevision: saved.draftRevision })

      notify.success(wasLive ? 'Update published — visitors see it now' : 'Published — visitors see it now')
      if (announce.current) announce.current.textContent = result.state === 'published' ? 'Published' : 'Saved'
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.code === 'VALIDATION_ERROR') {
        const details = caught.details as { missing?: string[] } | undefined

        if (details?.missing?.length) {
          setServerBlockers(details.missing)

          return
        }
      }

      setFailure(failureText(caught, 'That could not be published. Nothing on the site changed.'))
    }
  }

  const handlePreview = async () => {
    setFailure(null)

    try {
      const saved = await saveIfNeeded()

      if (saved) setPreviewing(true)
    } catch (caught) {
      setFailure(failureText(caught, 'Your changes could not be saved, so the preview would show the older version.'))
    }
  }

  const run = async (action: () => Promise<unknown>, done: string, fallback: string) => {
    setFailure(null)
    setServerBlockers(null)

    try {
      await action()
      notify.success(done)
    } catch (caught) {
      setFailure(failureText(caught, fallback))
    }
  }

  const handleDelete = async () => {
    setFailure(null)

    try {
      await remove.mutateAsync(serviceId)
      leaving.current = true
      notify.success('Deleted for ever')
      await navigate({ to: '/dashboard/services' })
    } catch (caught) {
      setFailure(failureText(caught, 'That service could not be deleted.'))
    }
  }

  /* ------------------------------------------------------------- derived */

  const state = data.state
  const live = data.published
  const checklist = serverBlockers ?? publishBlockers(draft)
  const nothingNew = state === 'published' && !unsaved
  const busy = patch.isPending || publish.isPending || unpublish.isPending || discard.isPending || remove.isPending
  const publishLabel = live ? 'Publish update' : state === 'unpublished' ? 'Publish again' : 'Publish'
  const complete = completeServiceLanguages(draft.texts).filter((code) => {
    if (!(draft.price.promotion.active && (draft.price.mode === 'fixed' || draft.price.mode === 'from'))) return true

    return draft.texts[code].promotionLabel !== ''
  })
  const priced = values.mode === 'fixed' || values.mode === 'from'
  const previewLanguage = priceLanguage ?? language
  const suggestion = slugify(values.texts.en.name || values.texts.de.name || '')
  const confirmWord = deleteConfirmation(data)
  const texts = values.texts[language]
  const rtl = language === 'ar'
  const fieldClass = cn('dash-field px-3 text-[13px]', rtl && 'font-[family-name:var(--font-arabic)]')

  const renderPublishButton = (className: string) => (
    <button
      type="button"
      className={cn('dash-btn dash-btn-primary', className)}
      disabled={busy || checklist.length > 0 || nothingNew}
      onClick={() => void handlePublish()}
    >
      {publish.isPending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Publishing…
        </>
      ) : (
        publishLabel
      )}
    </button>
  )

  /* -------------------------------------------------------------- render */

  return (
    <DashboardPage className="gap-4 pb-24 lg:pb-6">
      <header className="flex flex-wrap items-center gap-3">
        <button type="button" className="dash-btn dash-btn-ghost h-9 px-2" onClick={() => void navigate({ to: '/dashboard/services' })}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Services
        </button>

        <span className="flex min-w-0 items-center gap-2.5">
          <h1 className="dash-title truncate text-[20px]">{serviceDisplayName(draft.texts, 'en')}</h1>
          <StateBadge state={state} />
        </span>

        <span className="ms-auto hidden items-center gap-2 sm:flex">
          {unsaved ? <span className="text-[11.5px] text-[var(--dash-quiet)]">Unsaved changes</span> : null}
          <button
            type="button"
            className="dash-btn dash-btn-quiet h-9"
            onClick={() => void handlePreview()}
            disabled={busy}
            title={unsaved ? 'Saves your changes, then shows how the service will look to visitors' : 'Shows how the service will look to visitors'}
          >
            <Eye className="size-4" aria-hidden="true" />
            Preview
          </button>
          <button type="button" className="dash-btn dash-btn-quiet h-9" onClick={() => void handleSave()} disabled={busy}>
            {patch.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Save draft
          </button>
        </span>
      </header>

      <p className="text-[12px] text-[var(--dash-quiet)]">{stateMeaning(state)}</p>

      {state === 'published_with_pending_changes' ? (
        <p className="dash-panel flex items-start gap-2.5 border-[var(--dash-brand)] p-3 text-[12.5px]">
          <span className="mt-[5px] size-2 shrink-0 rounded-full bg-[var(--dash-brand)]" aria-hidden="true" />
          <span>
            <strong className="font-semibold">Your changes are saved but not published.</strong>{' '}
            <span className="text-[var(--dash-quiet)]">
              The website still shows the version you published before. It changes when you press Publish update — not before.
            </span>
          </span>
        </p>
      ) : null}

      {failure ? (
        <p role="alert" className="dash-tone-red rounded-lg px-3 py-2 text-[12.5px]">
          {failure}
        </p>
      ) : null}

      <form
        id="service-editor"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void handleSave()
        }}
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <div className="flex min-w-0 flex-col gap-4">
          <nav aria-label="Sections" className="flex flex-wrap gap-1.5">
            {SECTIONS.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="dash-btn dash-btn-quiet h-8 px-2.5 text-[12px]">
                {section.label}
              </a>
            ))}
          </nav>

          {/* ------------------------------------------------------ basics */}
          <Section id="service-basics" title="Basics">
            <div className="flex flex-col gap-3.5">
              <form.Field name="slug">
                {(field) => {
                  const error = firstError(field.state.meta.errors)

                  return (
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label htmlFor="service-slug" className="text-[12px] font-semibold">
                        Web address
                      </label>
                      <div
                        className={cn(
                          'flex items-center overflow-hidden rounded-[9px] border bg-[var(--dash-input)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--dash-blue)]',
                          error ? 'border-[var(--dash-red)]' : 'border-[var(--dash-line)]',
                        )}
                      >
                        <span className="dash-num ps-3 pe-0.5 text-[12px] whitespace-nowrap text-[var(--dash-quiet)]">
                          yamanwarda.de/de/services/
                        </span>
                        <input
                          id="service-slug"
                          className="dash-num h-9 min-w-0 flex-1 border-0 bg-transparent pe-3 text-[13px] outline-none"
                          value={field.state.value}
                          maxLength={SERVICE_LIMITS.slug}
                          spellCheck={false}
                          autoComplete="off"
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? 'service-slug-error' : 'service-slug-hint'}
                          onChange={(event) => field.handleChange(event.target.value.toLowerCase())}
                          onBlur={field.handleBlur}
                        />
                      </div>
                      {error ? (
                        <p id="service-slug-error" className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--dash-red-ink)]">
                          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                          {error}
                        </p>
                      ) : (
                        <div id="service-slug-hint" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px]" aria-live="polite">
                          {slug === '' ? (
                            <>
                              <span className="text-[var(--dash-quiet)]">One address for all three languages. Needed before publishing.</span>
                              {suggestion ? (
                                <button type="button" className="dash-btn dash-btn-quiet h-7 px-2 text-[11.5px]" onClick={() => field.handleChange(suggestion)}>
                                  Use “{suggestion}”
                                </button>
                              ) : null}
                            </>
                          ) : slugCheck.data?.available === false ? (
                            <span className="flex items-center gap-1.5 font-medium text-[var(--dash-red-ink)]">
                              <X className="size-3.5" aria-hidden="true" />
                              {slugCheck.data.reason ?? 'Another service already uses that web address'}
                            </span>
                          ) : slugCheck.data?.available ? (
                            <span className="flex items-center gap-1.5 font-medium text-[var(--dash-live)]">
                              <Check className="size-3.5" aria-hidden="true" />
                              Available
                            </span>
                          ) : (
                            <span className="text-[var(--dash-quiet)]">Checking…</span>
                          )}
                        </div>
                      )}
                      {live && slug !== '' && slug !== live.slug ? (
                        <p className="text-[12px] text-[var(--dash-quiet)]">
                          After you publish the update, the old address <strong className="text-[var(--dash-ink)]">/{live.slug}</strong> keeps working and sends visitors here.
                        </p>
                      ) : null}
                    </div>
                  )
                }}
              </form.Field>

              <form.Field name="featured">
                {(field) => (
                  <label className="flex items-start gap-2.5 text-[12.5px]">
                    <input
                      id="service-featured"
                      type="checkbox"
                      className="mt-0.5 size-4"
                      checked={field.state.value}
                      onChange={(event) => field.handleChange(event.target.checked)}
                    />
                    <span>
                      Show on the homepage
                      <span className="block text-[11.5px] text-[var(--dash-quiet)]">
                        Starred services appear on the homepage in the same order as your list.
                        {live ? ' On a live service this changes the homepage when you publish the update.' : ''}
                      </span>
                    </span>
                  </label>
                )}
              </form.Field>
            </div>
          </Section>

          {/* ------------------------------------------------------- price */}
          <Section id="service-price" title="Price" note="How the price is shown on the website. Nothing here charges anyone or creates an invoice.">
            <div className="flex flex-col gap-3.5">
              <form.Field name="mode">
                {(field) => (
                  <fieldset className="m-0 grid gap-2 border-0 p-0 sm:grid-cols-3">
                    <legend className="mb-2 p-0 text-[12px] font-semibold">How is the price shown?</legend>
                    {(
                      [
                        ['fixed', 'Fixed price', 'One exact amount'],
                        ['from', 'Starting from', 'The lowest price, e.g. “ab 990 €”'],
                        ['quote', 'On request', 'No number is shown'],
                      ] as const
                    ).map(([mode, label, note]) => (
                      <label
                        key={mode}
                        className={cn(
                          'flex cursor-pointer items-start gap-2.5 rounded-[10px] border bg-[var(--dash-input)] px-3 py-2.5',
                          field.state.value === mode ? 'border-[var(--dash-brand)] bg-[var(--dash-blue-tint)]' : 'border-[var(--dash-line)]',
                        )}
                      >
                        <input
                          id={`service-mode-${mode}`}
                          type="radio"
                          name="service-mode"
                          className="mt-0.5 size-4"
                          checked={field.state.value === mode}
                          onChange={() => field.handleChange(mode)}
                        />
                        <span>
                          <span className="block text-[13px] font-semibold">{label}</span>
                          <span className="block text-[11.5px] text-[var(--dash-quiet)]">{note}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}
              </form.Field>

              {priced ? (
                <>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <form.Field name="amount">
                      {(field) => {
                        const error = firstError(field.state.meta.errors)

                        return (
                          <Field id="service-amount" label="Price in euros" hint="Write 990 or 49,90" error={error}>
                            <span className="relative">
                              <input
                                id="service-amount"
                                className="dash-field dash-num h-9 w-full ps-3 pe-8 text-[13px]"
                                inputMode="decimal"
                                placeholder="990"
                                value={field.state.value}
                                aria-invalid={error ? true : undefined}
                                aria-describedby={described('service-amount', error, true)}
                                onChange={(event) => field.handleChange(event.target.value)}
                                onBlur={field.handleBlur}
                              />
                              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--dash-quiet)]" aria-hidden="true">
                                €
                              </span>
                            </span>
                          </Field>
                        )
                      }}
                    </form.Field>

                    <form.Field name="period">
                      {(field) => (
                        <Field id="service-period" label="Paid" hint="A label for visitors — nothing is billed automatically.">
                          <select
                            id="service-period"
                            className="dash-field h-9 px-2.5 text-[13px]"
                            value={field.state.value}
                            aria-describedby="service-period-hint"
                            onChange={(event) => field.handleChange(event.target.value as ServiceFormValues['period'])}
                          >
                            <option value="">Choose…</option>
                            <option value="one_time">One-time</option>
                            <option value="monthly">Per month</option>
                            <option value="yearly">Per year</option>
                          </select>
                        </Field>
                      )}
                    </form.Field>
                  </div>

                  <form.Field name="promoOn">
                    {(field) => (
                      <label className="flex items-start gap-2.5 text-[12.5px]">
                        <input
                          id="service-promo-on"
                          type="checkbox"
                          className="mt-0.5 size-4"
                          checked={field.state.value}
                          onChange={(event) => field.handleChange(event.target.checked)}
                        />
                        <span>
                          Show a lower offer price
                          <span className="block text-[11.5px] text-[var(--dash-quiet)]">
                            You switch the offer on and off yourself. It has no end date and no code.
                          </span>
                        </span>
                      </label>
                    )}
                  </form.Field>

                  {values.promoOn ? (
                    <div className="flex flex-col gap-3 rounded-[10px] border border-[var(--dash-line)] bg-[var(--dash-furniture)] p-3">
                      <form.Field name="promo">
                        {(field) => {
                          const error = firstError(field.state.meta.errors)

                          return (
                            <Field id="service-promo" label="Offer price in euros" hint="Must be lower than the normal price" error={error}>
                              <span className="relative max-w-[14rem]">
                                <input
                                  id="service-promo"
                                  className="dash-field dash-num h-9 w-full ps-3 pe-8 text-[13px]"
                                  inputMode="decimal"
                                  placeholder="790"
                                  value={field.state.value}
                                  aria-invalid={error ? true : undefined}
                                  aria-describedby={described('service-promo', error, true)}
                                  onChange={(event) => field.handleChange(event.target.value)}
                                  onBlur={field.handleBlur}
                                />
                                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--dash-quiet)]" aria-hidden="true">
                                  €
                                </span>
                              </span>
                            </Field>
                          )
                        }}
                      </form.Field>

                      <div className="flex flex-col gap-1.5">
                        <span className="text-[12px] font-semibold">Short label, in each language</span>
                        <div className="grid gap-1.5 sm:grid-cols-3">
                          {LANGUAGES.map((code) => (
                            <form.Field key={code} name={`texts.${code}.promotionLabel`}>
                              {(field) => (
                                <label className="flex items-center gap-1.5">
                                  <span
                                    className={cn(
                                      'w-7 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-bold uppercase',
                                      field.state.value.trim() === ''
                                        ? 'bg-[var(--dash-red-tint)] text-[var(--dash-red-ink)]'
                                        : 'bg-[var(--dash-chip)] text-[var(--dash-quiet)]',
                                    )}
                                  >
                                    {code}
                                  </span>
                                  <input
                                    id={`service-label-${code}`}
                                    className="dash-field h-8 min-w-0 flex-1 px-2 text-[12px]"
                                    dir={code === 'ar' ? 'rtl' : 'ltr'}
                                    lang={code}
                                    maxLength={SERVICE_LIMITS.promotionLabel}
                                    value={field.state.value}
                                    placeholder={{ de: 'Startangebot', en: 'Launch offer', ar: 'عرض الإطلاق' }[code]}
                                    aria-label={`${LANGUAGE_WORDS[code]} offer label`}
                                    onChange={(event) => field.handleChange(event.target.value)}
                                  />
                                </label>
                              )}
                            </form.Field>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : values.mode === 'quote' ? (
                <p className="text-[12px] text-[var(--dash-quiet)]">
                  Visitors see “Preis auf Anfrage”. A number, a period and an offer are not used — they are cleared when you save.
                </p>
              ) : (
                <p className="text-[12px] text-[var(--dash-quiet)]">Choose one of the three. Publishing needs it.</p>
              )}

              <div className="flex flex-col gap-2 rounded-[10px] border border-dashed border-[var(--dash-line)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="dash-eyebrow-quiet">HOW VISITORS SEE IT</span>
                  <span role="group" aria-label="Preview language" className="ms-auto flex gap-1">
                    {LANGUAGES.map((code) => (
                      <button
                        key={code}
                        type="button"
                        aria-pressed={previewLanguage === code}
                        onClick={() => setPriceLanguage(code)}
                        className={cn(
                          'h-6 rounded-md px-2 text-[11px] font-bold',
                          previewLanguage === code ? 'bg-[var(--dash-brand)] text-white' : 'text-[var(--dash-quiet)]',
                        )}
                      >
                        {code.toUpperCase()}
                      </button>
                    ))}
                  </span>
                </div>
                <PriceText
                  price={publicPriceOf(draft.price, draft.texts[previewLanguage].promotionLabel)}
                  language={previewLanguage}
                  className="text-[17px]"
                />
              </div>
            </div>
          </Section>

          {/* ----------------------------------------------------- content */}
          <Section
            id="service-content"
            title="Content"
            note="A name, a short description and at least one included line are needed in all three languages before you can publish. The rest is optional."
          >
            <div role="tablist" aria-label="Language" className="mb-4 flex gap-1 overflow-x-auto border-b border-[var(--dash-line)]">
              {LANGUAGES.map((code) => (
                <button
                  key={code}
                  type="button"
                  role="tab"
                  aria-selected={language === code}
                  onClick={() => setLanguage(code)}
                  className={cn(
                    '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-[12.5px] font-semibold whitespace-nowrap',
                    language === code
                      ? 'border-[var(--dash-brand)] text-[var(--dash-brand)]'
                      : 'border-transparent text-[var(--dash-quiet)] hover:text-[var(--dash-ink)]',
                  )}
                >
                  {LANGUAGE_WORDS[code]}
                  {complete.includes(code) ? (
                    <Check className="size-3.5 text-[var(--dash-live)]" aria-label="complete" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-[var(--dash-red)]" aria-label="incomplete" role="img" />
                  )}
                </button>
              ))}
            </div>

            <div key={language} dir={rtl ? 'rtl' : 'ltr'} lang={language} className="grid gap-3.5">
              <form.Field name={`texts.${language}.name`}>
                {(field) => {
                  const error = firstError(field.state.meta.errors)

                  return (
                    <Field id={`service-${language}-name`} label="Name" error={error}>
                      <input
                        id={`service-${language}-name`}
                        className={cn(fieldClass, 'h-9')}
                        maxLength={SERVICE_LIMITS.name}
                        value={field.state.value}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={described(`service-${language}-name`, error)}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                      />
                    </Field>
                  )
                }}
              </form.Field>

              <form.Field name={`texts.${language}.summary`}>
                {(field) => {
                  const error = firstError(field.state.meta.errors)

                  return (
                    <Field
                      id={`service-${language}-summary`}
                      label="Short description"
                      hint={`On cards and in search results · ${field.state.value.length} of ${SERVICE_LIMITS.summary}`}
                      error={error}
                    >
                      <textarea
                        id={`service-${language}-summary`}
                        rows={3}
                        className={cn(fieldClass, 'py-2')}
                        maxLength={SERVICE_LIMITS.summary}
                        value={field.state.value}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={described(`service-${language}-summary`, error, true)}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                      />
                    </Field>
                  )
                }}
              </form.Field>

              <form.Field name={`texts.${language}.included`}>
                {(field) => (
                  <IncludedList
                    language={language}
                    items={field.state.value}
                    errors={form.state.submissionAttempts > 0 ? fieldErrors(values) : {}}
                    onChange={(items) => field.handleChange(items)}
                  />
                )}
              </form.Field>

              <form.Field name={`texts.${language}.body`}>
                {(field) => (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`service-${language}-body`} className="text-[12px] font-semibold">
                      Longer description <span className="font-normal text-[var(--dash-quiet)]">— optional</span>
                    </label>
                    <textarea
                      id={`service-${language}-body`}
                      rows={9}
                      className={cn(fieldClass, 'py-2 leading-relaxed')}
                      maxLength={SERVICE_LIMITS.body}
                      value={field.state.value}
                      aria-describedby={`service-${language}-body-help`}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                    <p id={`service-${language}-body-help`} dir="ltr" className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-[var(--dash-quiet)]">
                      <span>Empty line = new paragraph</span>
                      <span>
                        <code className="rounded bg-[var(--dash-chip)] px-1 text-[var(--dash-ink)]">- </code> at the start = a list line
                      </span>
                      <span>
                        Short line ending in <code className="rounded bg-[var(--dash-chip)] px-1 text-[var(--dash-ink)]">:</code> = small heading
                      </span>
                      <span className="dash-num">
                        {field.state.value.length} of {SERVICE_LIMITS.body}
                      </span>
                    </p>
                    <span>
                      <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12px]" aria-expanded={showBody} onClick={() => setShowBody(!showBody)}>
                        <Eye className="size-3.5" aria-hidden="true" />
                        {showBody ? 'Hide how it looks' : 'Show how it looks'}
                      </button>
                    </span>
                    {showBody ? (
                      <div className="rounded-[10px] border border-dashed border-[var(--dash-line)] p-3">
                        <BodyView text={field.state.value} language={language} />
                      </div>
                    ) : null}
                  </div>
                )}
              </form.Field>

              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold">
                  In search results{' '}
                  <span className="font-normal text-[var(--dash-quiet)]">— optional; the name and short description are used when empty</span>
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  <form.Field name={`texts.${language}.seoTitle`}>
                    {(field) => (
                      <input
                        id={`service-${language}-seo-title`}
                        className={cn(fieldClass, 'h-9')}
                        maxLength={SERVICE_LIMITS.seoTitle}
                        value={field.state.value}
                        placeholder={texts.name || 'Search title'}
                        aria-label="Search title"
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                    )}
                  </form.Field>
                  <form.Field name={`texts.${language}.seoDescription`}>
                    {(field) => (
                      <input
                        id={`service-${language}-seo-description`}
                        className={cn(fieldClass, 'h-9')}
                        maxLength={SERVICE_LIMITS.seoDescription}
                        value={field.state.value}
                        placeholder={texts.summary ? `${texts.summary.slice(0, 60)}…` : 'Search description'}
                        aria-label="Search description"
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                    )}
                  </form.Field>
                </div>
                <div className="flex flex-col gap-0.5 rounded-[10px] border border-[var(--dash-line)] bg-[var(--dash-input)] px-3.5 py-3" aria-label="How a search result could look">
                  <span className="text-[12px] text-[var(--dash-quiet)]" dir="ltr">
                    yamanwarda.de › {language} › services › {slug || '…'}
                  </span>
                  <span className="text-[17px] leading-snug text-[#1a0dab] dark:text-[#99c3ff]">
                    {(texts.seoTitle.trim() || texts.name.trim() || 'Untitled service') + ' · Yaman Warda'}
                  </span>
                  <span className="text-[13px] text-[var(--dash-quiet)]">
                    {texts.seoDescription.trim() || texts.summary.trim() || 'No description yet.'}
                  </span>
                </div>
              </div>
            </div>
          </Section>
        </div>

        {/* -------------------------------------------------------- the side */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
          {live ? (
            <div className="dash-panel overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-[var(--dash-line)] rtl:divide-x-reverse">
                <div className="p-3">
                  <p className="dash-eyebrow-quiet flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-[var(--dash-live)]" aria-hidden="true" />
                    VISITORS SEE
                  </p>
                  <p className="mt-2 text-[12.5px] leading-snug font-medium">{live.texts[language].name || '—'}</p>
                  <p className="mt-1 text-[11.5px] text-[var(--dash-quiet)]">
                    {priceSummary(live.price)}
                    {live.featured ? ' · ★ homepage' : ''}
                  </p>
                </div>
                <div className={cn('p-3', state === 'published_with_pending_changes' && 'bg-[var(--dash-blue-tint)]')}>
                  <p className="dash-eyebrow">YOU SAVED</p>
                  <p className="mt-2 text-[12.5px] leading-snug font-medium">{data.draft.texts[language].name || '—'}</p>
                  <p className="mt-1 text-[11.5px] text-[var(--dash-quiet)]">
                    {priceSummary(data.draft.price)}
                    {data.draft.featured ? ' · ★ homepage' : ''}
                  </p>
                </div>
              </div>
              {state === 'published_with_pending_changes' ? (
                <p className="border-t border-[var(--dash-line)] px-3 py-2 text-[11.5px] text-[var(--dash-quiet)]">
                  Nothing on the right is on the website yet.
                </p>
              ) : null}
            </div>
          ) : null}

          {checklist.length > 0 ? (
            <div className="dash-panel border-[var(--dash-red)] p-3.5" role={serverBlockers ? 'alert' : undefined}>
              <p className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--dash-red-ink)]">
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                {checklist.length} {checklist.length === 1 ? 'thing' : 'things'} to finish first
              </p>
              {serverBlockers ? (
                <p className="mt-1.5 text-[11.5px] text-[var(--dash-quiet)]">
                  Nothing was published and nothing was lost. The version on the website is untouched.
                </p>
              ) : null}
              <ul className="mt-2.5 flex flex-col gap-0.5">
                {checklist.map((item) => {
                  const target = blockerTarget(item)

                  return (
                    <li key={item}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-start text-[12px] hover:bg-[var(--dash-hover)] hover:underline disabled:hover:no-underline"
                        disabled={!target}
                        onClick={() => {
                          if (!target) return
                          if (target.language) setLanguage(target.language)
                          setFocusTarget(target.id)
                        }}
                      >
                        <X className="mt-[3px] size-3 shrink-0 text-[var(--dash-red-ink)]" aria-hidden="true" />
                        <span>{item}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : (
            <div className="dash-panel p-3.5">
              <p className="text-[12.5px] font-semibold">Ready to publish</p>
              <ul className="mt-2.5 flex flex-col gap-1.5 text-[12px] text-[var(--dash-quiet)]">
                {['Web address', 'Price', 'All three languages'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="size-3.5 shrink-0 text-[var(--dash-live)]" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {renderPublishButton('w-full')}
            {nothingNew ? (
              <p className="text-center text-[11.5px] text-[var(--dash-quiet)]">
                Nothing new to publish — visitors already see this version.
              </p>
            ) : null}

            {state === 'published_with_pending_changes' ? (
              <button
                type="button"
                className="dash-btn dash-btn-ghost w-full"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => discard.mutateAsync({ id: serviceId, draftRevision: data.draftRevision }),
                    'Changes discarded — the draft matches the website again',
                    'Those changes could not be discarded.',
                  )
                }
              >
                Discard my changes
              </button>
            ) : null}

            {live ? (
              <button
                type="button"
                className="dash-btn dash-btn-quiet w-full"
                disabled={busy}
                onClick={() => void run(() => unpublish.mutateAsync(serviceId), 'Taken off the website — kept here, private', 'That could not be taken down.')}
              >
                Take off the website
              </button>
            ) : null}
          </div>

          <div className="dash-panel p-3.5">
            <p className="text-[12.5px] font-semibold">Delete</p>
            <p className="mt-1 text-[11.5px] text-[var(--dash-quiet)]">
              Deleting cannot be undone. The service leaves the website at once, and its web addresses become free for another service.
            </p>

            <div className="mt-2.5 flex flex-col gap-2">
              {confirmDelete ? (
                <>
                  <label htmlFor="service-confirm-delete" className="text-[11.5px]">
                    Type <code className="rounded bg-[var(--dash-chip)] px-1 font-semibold">{confirmWord}</code> to confirm.
                  </label>
                  <input
                    id="service-confirm-delete"
                    className="dash-field h-8 px-2 text-[12px]"
                    autoComplete="off"
                    value={deleteText}
                    onChange={(event) => setDeleteText(event.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="dash-btn dash-tone-red h-8 flex-1 text-[12px]"
                      disabled={deleteText.trim() !== confirmWord || remove.isPending}
                      onClick={() => void handleDelete()}
                    >
                      Delete for ever
                    </button>
                    <button
                      type="button"
                      className="dash-btn dash-btn-ghost h-8 text-[12px]"
                      onClick={() => {
                        setConfirmDelete(false)
                        setDeleteText('')
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="dash-btn dash-btn-ghost h-8 w-full text-[12px] text-[var(--dash-red-ink)]"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Delete permanently
                </button>
              )}
            </div>
          </div>
        </aside>
      </form>

      {/* Below the two-column width the actions stay within reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-[var(--dash-line)] bg-[var(--dash-surface)]/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <button type="button" className="dash-btn dash-btn-quiet" aria-label="Preview" disabled={busy} onClick={() => void handlePreview()}>
          <Eye className="size-4" aria-hidden="true" />
        </button>
        <button type="button" className="dash-btn dash-btn-quiet flex-1" disabled={busy} onClick={() => void handleSave()}>
          {patch.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Save draft
        </button>
        {renderPublishButton('flex-1')}
      </div>

      <p ref={announce} role="status" aria-live="polite" className="sr-only" />

      {previewing ? (
        <ServicePreview
          serviceId={serviceId}
          revision={service.data?.draftRevision ?? data.draftRevision}
          state={service.data?.state ?? state}
          initialLanguage={language}
          onClose={() => setPreviewing(false)}
        />
      ) : null}

      {blocker.status === 'blocked' ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(8,12,24,.55)] p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="leave-title" aria-describedby="leave-text" className="dash-panel flex w-full max-w-[26rem] flex-col gap-2 p-5 shadow-[var(--dash-shadow)]">
            <h2 id="leave-title" className="text-[15px] font-semibold">
              Leave without saving?
            </h2>
            <p id="leave-text" className="text-[13px] text-[var(--dash-quiet)]">
              Your changes on this page are not saved yet. If you leave now, they are lost. Nothing on the website changes either way.
            </p>
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <button type="button" className="dash-btn dash-btn-quiet" onClick={() => blocker.proceed()}>
                Leave without saving
              </button>
              <button type="button" className="dash-btn dash-btn-primary" autoFocus onClick={() => blocker.reset()}>
                Keep editing
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardPage>
  )
}
