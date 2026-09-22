import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import * as v from 'valibot'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ImagePlus,
  Link2,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import type { MediaAsset } from '#/backend2/contracts/media.contract'
import {
  type Language,
  LANGUAGES,
  LANGUAGE_WORDS,
  type OwnerProject,
  PROJECT_LIMITS,
  type ProjectDraftInput,
  ProjectDraftSchema,
  type ProjectLink,
  STATE_WORDS,
  publishBlockers,
} from '#/backend2/contracts/project.contract'
import type { RichTextDoc } from '#/backend2/contracts/rich-text.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage } from '#/frontend/dashboard/primitives'
import { CaseStudyEditor } from '#/frontend/features/projects/CaseStudyEditor'
import { MediaPicker } from '#/frontend/features/media/MediaPicker'
import {
  useArchive,
  useDeleteProject,
  useDiscardPending,
  useProject,
  usePublish,
  useRestore,
  useSaveDraft,
  useUnpublish,
} from '#/frontend/features/projects/queries'
import { cn } from '#/frontend/lib/utils'
import { LoadFailure, StateBadge } from './project-parts'

/**
 * One project, on one page.
 *
 * Grouped sections down a column with the publish checklist beside them —
 * both approved in the Design Lab, and both for the same reason: fixing one
 * Arabic word should not mean walking through a wizard, and what blocks
 * publication has to stay visible while you fix it.
 *
 * The screen repeats one fact wherever it can: **saving does not change what
 * visitors see.** It is in the banner, on the button, and in the panel that
 * puts the live version beside the saved one.
 */

const SECTIONS = [
  { id: 'basics', label: 'Basics' },
  { id: 'content', label: 'Content' },
  { id: 'story', label: 'Case study' },
  { id: 'images', label: 'Images' },
  { id: 'links', label: 'Links & technology' },
] as const

const emptyAlt = (): Record<Language, string> => ({ de: '', en: '', ar: '' })

/**
 * The form's values — the draft with the case studies taken out.
 *
 * Not a style choice. `RichTextDoc` is a recursive union, and TanStack Form
 * infers a path type for every reachable field: put a document in the values
 * and that inference walks the recursion until `tsc` exhausts its heap, which
 * is exactly what happened. The three documents are held in their own state
 * and merged back in on save.
 *
 * It is also the more honest shape. A case study is edited as one document by
 * one editor; there is no per-field validation for the form to do inside it.
 */
type FormValues = Omit<ProjectDraftInput, 'texts'> & {
  texts: Record<Language, { name: string; categoryLabel: string; summary: string }>
}

type CaseStudies = Record<Language, RichTextDoc | null>

const toFormValues = (project: OwnerProject): FormValues => ({
  slug: project.draft.slug,
  type: project.draft.type,
  workStatus: project.draft.workStatus,
  clientName: project.draft.clientName,
  showClientName: project.draft.showClientName,
  tech: project.draft.tech,
  links: project.draft.links,
  texts: {
    de: strip(project.draft.texts.de),
    en: strip(project.draft.texts.en),
    ar: strip(project.draft.texts.ar),
  },
  cover: project.draft.cover
    ? { mediaId: project.draft.cover.mediaId, alt: project.draft.cover.alt }
    : null,
  gallery: project.draft.gallery.map((image) => ({ mediaId: image.mediaId, alt: image.alt })),
})

const strip = (texts: { name: string; categoryLabel: string; summary: string }) => ({
  name: texts.name,
  categoryLabel: texts.categoryLabel,
  summary: texts.summary,
})

/**
 * What the form holds before the project has arrived.
 *
 * Real values rather than `null`: hooks run on the first render, before the
 * query has answered and before the loading branch below returns — and a form
 * handed `null` cannot read a path out of it. The screen rendered nothing at
 * all until this existed, which is a worse failure than a slow one because it
 * looks like a blank page rather than an error.
 */
const emptyFormValues = (): FormValues => ({
  slug: '',
  type: 'client',
  workStatus: 'in_progress',
  clientName: null,
  showClientName: false,
  tech: [],
  links: [],
  texts: {
    de: { name: '', categoryLabel: '', summary: '' },
    en: { name: '', categoryLabel: '', summary: '' },
    ar: { name: '', categoryLabel: '', summary: '' },
  },
  cover: null,
  gallery: [],
})

const toCaseStudies = (project: OwnerProject): CaseStudies => ({
  de: project.draft.texts.de.caseStudy,
  en: project.draft.texts.en.caseStudy,
  ar: project.draft.texts.ar.caseStudy,
})

/** The two halves put back together, in the shape the API and the rules want. */
const toDraft = (values: FormValues, caseStudies: CaseStudies): ProjectDraftInput => ({
  ...values,
  texts: {
    de: { ...values.texts.de, caseStudy: caseStudies.de },
    en: { ...values.texts.en, caseStudy: caseStudies.en },
    ar: { ...values.texts.ar, caseStudy: caseStudies.ar },
  },
})

/* ------------------------------------------------------------------ fields */

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string
  title: string
  note?: string
  children: React.ReactNode
}) {
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
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p
          id={`${id}-error`}
          className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--dash-red-ink)]"
        >
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

/** One image plus the three descriptions publication will ask for. */
function ImageRow({
  url,
  alt,
  onAlt,
  onRemove,
  onReplace,
  index,
}: {
  url: string
  alt: Record<Language, string>
  onAlt: (language: Language, value: string) => void
  onRemove: () => void
  onReplace?: () => void
  index?: number
}) {
  return (
    <li className="flex flex-col gap-2.5 rounded-[10px] border border-[var(--dash-line)] p-2.5 sm:flex-row">
      <img
        src={url}
        alt=""
        loading="lazy"
        className="h-20 w-28 shrink-0 rounded-[8px] border border-[var(--dash-line)] object-cover"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[11px] font-semibold text-[var(--dash-quiet)]">
          Describe this picture, in each language
        </p>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {LANGUAGES.map((language) => (
            <label key={language} className="flex items-center gap-1.5">
              <span
                className={cn(
                  'w-7 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-bold uppercase',
                  alt[language].trim() === ''
                    ? 'bg-[var(--dash-red-tint)] text-[var(--dash-red-ink)]'
                    : 'bg-[var(--dash-chip)] text-[var(--dash-quiet)]',
                )}
              >
                {language}
              </span>
              <input
                className="dash-field h-8 min-w-0 flex-1 px-2 text-[12px]"
                dir={language === 'ar' ? 'rtl' : 'ltr'}
                value={alt[language]}
                maxLength={PROJECT_LIMITS.altText}
                aria-label={`${LANGUAGE_WORDS[language]} description${index === undefined ? '' : ` for gallery image ${index + 1}`}`}
                onChange={(event) => onAlt(language, event.target.value)}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 gap-2 sm:flex-col">
        {onReplace ? (
          <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12px]" onClick={onReplace}>
            Change
          </button>
        ) : null}
        <button
          type="button"
          className="dash-btn dash-btn-ghost h-8 px-2"
          onClick={onRemove}
          aria-label={index === undefined ? 'Remove the cover image' : `Remove gallery image ${index + 1}`}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------ screen */

export function ProjectEditorPage() {
  const { projectId } = useParams({ from: '/dashboard/projects/$projectId' })
  const navigate = useNavigate()

  const project = useProject(projectId)
  const save = useSaveDraft()
  const publish = usePublish()
  const unpublish = useUnpublish()
  const discard = useDiscardPending()
  const archive = useArchive()
  const restore = useRestore()
  const remove = useDeleteProject()

  const [language, setLanguage] = useState<Language>('de')
  const [caseStudies, setCaseStudies] = useState<CaseStudies>({ de: null, en: null, ar: null })
  const [failure, setFailure] = useState<string | null>(null)
  const [blockers, setBlockers] = useState<string[] | null>(null)
  const [picking, setPicking] = useState<'cover' | 'gallery' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const announce = useRef<HTMLParagraphElement>(null)

  const data = project.data

  const form = useForm({
    defaultValues: data ? toFormValues(data) : emptyFormValues(),
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      /*
       * The same schema the server enforces, so the editor refuses exactly
       * what the API would. Issues are mapped back to their dot paths, which
       * is how an over-long Arabic summary lands under the Arabic field
       * rather than at the top of the page.
       */
      onDynamic: ({ value }) => {
        const parsed = v.safeParse(ProjectDraftSchema, toDraft(value, caseStudies))

        if (parsed.success) return undefined

        const fields: Record<string, string> = {}

        for (const issue of parsed.issues) {
          const path = v.getDotPath(issue)

          if (path && !fields[path]) fields[path] = issue.message
        }

        return {
          fields,
          form: Object.keys(fields).length === 0 ? parsed.issues[0]?.message : undefined,
        }
      },
    },
    onSubmitInvalid: () => {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      })
    },
    onSubmit: async ({ value }) => {
      await persist(toDraft(value, caseStudies))
    },
  })

  const values = useStore(form.store, (store) => store.values)

  /*
   * Fill the form from the server's version — but only when that version is
   * actually new.
   *
   * Keyed on the revision rather than on `data`, and that is the whole point.
   * React Query hands back a fresh object on every refetch, including the one
   * it does when the window regains focus; resetting on each of those threw
   * away whatever was half-typed. Caught by typing into this screen while the
   * automation moved focus, and watching a sentence disappear.
   *
   * The revision changes only when the server wrote something — a save, a
   * publish, a discard — which is exactly when the form should be refilled.
   */
  const applied = useRef<string | null>(null)

  useEffect(() => {
    if (!data) return

    const version = `${data.id}:${data.draftRevision}`

    if (applied.current === version) return

    applied.current = version
    form.reset(toFormValues(data))
    setCaseStudies(toCaseStudies(data))
  }, [data, form])

  if (project.isPending) {
    return (
      <DashboardPage className="gap-4">
        <div className="dash-skeleton h-9 w-56 rounded" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-4">
            <div className="dash-skeleton h-56 rounded-[12px]" />
            <div className="dash-skeleton h-72 rounded-[12px]" />
          </div>
          <div className="dash-skeleton h-64 rounded-[12px]" />
        </div>
      </DashboardPage>
    )
  }

  if (project.isError || !data) {
    const missing = project.error instanceof ApiRequestError && project.error.status === 404

    return (
      <DashboardPage>
        <section className="dash-panel">
          <LoadFailure
            title={missing ? 'That project does not exist' : 'This project could not be loaded'}
            message={
              missing
                ? 'It may have been deleted. The list will show what is still there.'
                : 'The server did not answer. Nothing has been changed.'
            }
            onRetry={() =>
              missing ? void navigate({ to: '/dashboard/projects' }) : void project.refetch()
            }
          />
        </section>
      </DashboardPage>
    )
  }

  /* ------------------------------------------------------------- actions */

  const failureText = (caught: unknown, fallback: string): string =>
    caught instanceof ApiRequestError ? caught.message : fallback

  const persist = async (value: ProjectDraftInput): Promise<OwnerProject> => {
    setFailure(null)
    setBlockers(null)

    const saved = await save.mutateAsync({ id: projectId, draftRevision: data.draftRevision, ...value })

    if (announce.current) announce.current.textContent = 'Draft saved'

    return saved
  }

  const handleSave = async () => {
    try {
      await form.handleSubmit()
    } catch (caught) {
      setFailure(failureText(caught, 'That could not be saved. Your text is still here.'))
    }
  }

  /**
   * Publish saves first.
   *
   * The server validates the *draft*, so publishing unsaved edits would
   * publish the previous text and quietly leave the new words behind. One
   * button, two calls, in the order that makes the result match what is on
   * screen.
   */
  const handlePublish = async () => {
    setFailure(null)
    setBlockers(null)

    try {
      const saved = await persist(toDraft(form.state.values, caseStudies))

      const published = await publish.mutateAsync({
        id: saved.id,
        draftRevision: saved.draftRevision,
      })

      if (announce.current) {
        announce.current.textContent =
          published.state === 'published' ? 'Published' : 'Saved'
      }
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.code === 'VALIDATION_ERROR') {
        const details = caught.details as { missing?: string[] } | undefined

        setBlockers(details?.missing ?? [caught.message])

        return
      }

      setFailure(failureText(caught, 'That could not be published. Nothing on the site changed.'))
    }
  }

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setFailure(null)
    setBlockers(null)

    try {
      await action()
    } catch (caught) {
      setFailure(failureText(caught, fallback))
    }
  }

  /*
   * Subscribed, not read.
   *
   * `form.state.values` is a snapshot: reading it in the render body does not
   * make this component re-render when a field changes, so the checklist and
   * the title stayed on their first values while the fields filled up — the
   * editor said "the web address is empty" under a web address. `useStore`
   * subscribes, and only these three places need it.
   */
  const state = data.state
  const pending = data.hasPendingChanges
  const live = data.published
  const checklist = blockers ?? publishBlockers(toDraft(values, caseStudies))
  const busy =
    save.isPending || publish.isPending || unpublish.isPending || discard.isPending

  /* -------------------------------------------------------------- render */

  return (
    <DashboardPage className="gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="dash-btn dash-btn-ghost h-9 px-2"
          onClick={() => void navigate({ to: '/dashboard/projects' })}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Projects
        </button>

        <span className="flex min-w-0 items-center gap-2.5">
          <h1 className="dash-title truncate text-[20px]">
            {values.texts.en.name || values.texts.de.name || 'Untitled project'}
          </h1>
          <StateBadge state={state} />
        </span>

        <span className="ms-auto flex items-center gap-2">
          <button
            type="button"
            className="dash-btn dash-btn-quiet h-9"
            onClick={() => void handleSave()}
            disabled={busy}
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Save draft
          </button>
        </span>
      </header>

      <p className="text-[12px] text-[var(--dash-quiet)]">{STATE_WORDS[state].meaning}</p>

      {pending ? (
        <p className="dash-panel flex items-start gap-2.5 border-[var(--dash-brand)] p-3 text-[12.5px]">
          <span
            className="mt-[5px] size-2 shrink-0 rounded-full bg-[var(--dash-brand)]"
            aria-hidden="true"
          />
          <span>
            <strong className="font-semibold">Your changes are saved but not published.</strong>{' '}
            <span className="text-[var(--dash-quiet)]">
              The website still shows the version you published before. It changes when you press
              Publish update — not before.
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
        onSubmit={(event) => {
          event.preventDefault()
          void handleSave()
        }}
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <div className="flex min-w-0 flex-col gap-4">
          <nav aria-label="Sections" className="flex flex-wrap gap-1.5">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="dash-btn dash-btn-quiet h-8 px-2.5 text-[12px]"
              >
                {section.label}
              </a>
            ))}
          </nav>

          {/* ------------------------------------------------------ basics */}
          <Section id="basics" title="Basics">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <form.Field name="slug">
                {(field) => (
                  <Field
                    id="project-slug"
                    label="Web address"
                    hint={`yamanwarda.de/work/${field.state.value || '…'}`}
                    error={field.state.meta.errors[0] as string | undefined}
                  >
                    <input
                      id="project-slug"
                      className="dash-field dash-num h-9 px-3 text-[13px]"
                      value={field.state.value}
                      aria-invalid={field.state.meta.errors.length > 0 || undefined}
                      aria-describedby="project-slug-hint"
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </Field>
                )}
              </form.Field>

              <form.Field name="type">
                {(field) => (
                  <Field
                    id="project-type"
                    label="Type"
                    hint="Visitors see this, so a demo is never shown as client work."
                  >
                    <select
                      id="project-type"
                      className="dash-field h-9 px-2.5 text-[13px]"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value as ProjectDraftInput['type'])
                      }
                    >
                      <option value="client">Client</option>
                      <option value="personal">Personal</option>
                      <option value="demo">Demo</option>
                    </select>
                  </Field>
                )}
              </form.Field>

              <form.Field name="workStatus">
                {(field) => (
                  <Field id="project-status" label="Work status">
                    <select
                      id="project-status"
                      className="dash-field h-9 px-2.5 text-[13px]"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value as ProjectDraftInput['workStatus'])
                      }
                    >
                      <option value="in_progress">In progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </Field>
                )}
              </form.Field>

              <form.Field name="clientName">
                {(field) => (
                  <Field
                    id="project-client"
                    label="Client name"
                    hint="Stored privately unless you tick the box below."
                    error={field.state.meta.errors[0] as string | undefined}
                  >
                    <input
                      id="project-client"
                      className="dash-field h-9 px-3 text-[13px]"
                      value={field.state.value ?? ''}
                      maxLength={PROJECT_LIMITS.clientName}
                      aria-invalid={field.state.meta.errors.length > 0 || undefined}
                      onChange={(event) => field.handleChange(event.target.value || null)}
                      onBlur={field.handleBlur}
                    />
                  </Field>
                )}
              </form.Field>
            </div>

            <form.Field name="showClientName">
              {(field) => (
                <label className="mt-3.5 flex items-start gap-2.5 text-[12.5px]">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    checked={field.state.value}
                    onChange={(event) => field.handleChange(event.target.checked)}
                  />
                  <span>
                    Show the client’s name on the public page
                    <span className="block text-[11.5px] text-[var(--dash-quiet)]">
                      Off by default. A name you store is never a name you publish.
                    </span>
                  </span>
                </label>
              )}
            </form.Field>
          </Section>

          {/* ----------------------------------------------------- content */}
          <Section
            id="content"
            title="Content"
            note="The name and summary are needed in all three languages before you can publish. The category label is optional."
          >
            <div
              role="tablist"
              aria-label="Language"
              className="mb-4 flex gap-1 border-b border-[var(--dash-line)]"
            >
              {LANGUAGES.map((code) => {
                const texts = values.texts[code]
                const done = texts.name.trim() !== '' && texts.summary.trim() !== ''

                return (
                  <button
                    key={code}
                    type="button"
                    role="tab"
                    aria-selected={language === code}
                    onClick={() => setLanguage(code)}
                    className={cn(
                      '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-[12.5px] font-semibold',
                      language === code
                        ? 'border-[var(--dash-brand)] text-[var(--dash-brand)]'
                        : 'border-transparent text-[var(--dash-quiet)] hover:text-[var(--dash-ink)]',
                    )}
                  >
                    {LANGUAGE_WORDS[code]}
                    {done ? (
                      <Check className="size-3.5 text-[var(--dash-live)]" aria-label="complete" />
                    ) : (
                      <span
                        className="size-1.5 rounded-full bg-[var(--dash-red)]"
                        aria-label="incomplete"
                      />
                    )}
                  </button>
                )
              })}
            </div>

            {/* `key` remounts for the new language: one set of fields stands
                in for three, so the values have to change with the tab. */}
            <div key={language} dir={language === 'ar' ? 'rtl' : 'ltr'} className="grid gap-3.5">
              <form.Field name={`texts.${language}.name`}>
                {(field) => (
                  <Field
                    id={`name-${language}`}
                    label="Project name"
                    error={field.state.meta.errors[0] as string | undefined}
                  >
                    <input
                      id={`name-${language}`}
                      className="dash-field h-9 px-3 text-[13px]"
                      value={field.state.value}
                      maxLength={PROJECT_LIMITS.name}
                      aria-invalid={field.state.meta.errors.length > 0 || undefined}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </Field>
                )}
              </form.Field>

              <form.Field name={`texts.${language}.categoryLabel`}>
                {(field) => (
                  <Field
                    id={`category-${language}`}
                    label="Short category label"
                    hint="Optional. Sits above the name on the public page."
                    error={field.state.meta.errors[0] as string | undefined}
                  >
                    <input
                      id={`category-${language}`}
                      className="dash-field h-9 px-3 text-[13px]"
                      value={field.state.value}
                      maxLength={PROJECT_LIMITS.categoryLabel}
                      aria-invalid={field.state.meta.errors.length > 0 || undefined}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </Field>
                )}
              </form.Field>

              <form.Field name={`texts.${language}.summary`}>
                {(field) => (
                  <Field
                    id={`summary-${language}`}
                    label="Card summary"
                    hint={`${field.state.value.length} of ${PROJECT_LIMITS.summary} characters`}
                    error={field.state.meta.errors[0] as string | undefined}
                  >
                    <textarea
                      id={`summary-${language}`}
                      rows={3}
                      className="dash-field px-3 py-2 text-[13px]"
                      value={field.state.value}
                      maxLength={PROJECT_LIMITS.summary}
                      aria-invalid={field.state.meta.errors.length > 0 || undefined}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </Field>
                )}
              </form.Field>
            </div>
          </Section>

          {/* --------------------------------------------------- case study */}
          <Section
            id="story"
            title="Case study"
            note={`Optional, and optional per language. You are writing the ${LANGUAGE_WORDS[language]} version.`}
          >
            <CaseStudyEditor
              value={caseStudies[language]}
              language={language}
              label={`Case study in ${LANGUAGE_WORDS[language]}`}
              onChange={(doc) => setCaseStudies((previous) => ({ ...previous, [language]: doc }))}
            />
          </Section>

          {/* -------------------------------------------------------- images */}
          <Section
            id="images"
            title="Images"
            note="Every image comes from your Media library. Uploading inside the picker adds it to Media first, then selects it here."
          >
            <form.Field name="cover">
              {(field) => (
                <div className="mb-4">
                  <p className="mb-2 text-[12px] font-semibold">Cover</p>
                  {field.state.value ? (
                    <ul>
                      <ImageRow
                        url={`/api/v2/owner/media/files/${field.state.value.mediaId}/content`}
                        alt={field.state.value.alt}
                        onAlt={(code, text) =>
                          field.handleChange({
                            mediaId: field.state.value!.mediaId,
                            alt: { ...field.state.value!.alt, [code]: text },
                          })
                        }
                        onReplace={() => setPicking('cover')}
                        onRemove={() => field.handleChange(null)}
                      />
                    </ul>
                  ) : (
                    <button
                      type="button"
                      className="flex h-20 w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--dash-line)] text-[12.5px] font-semibold text-[var(--dash-quiet)] hover:border-[var(--dash-brand)] hover:text-[var(--dash-brand)]"
                      onClick={() => setPicking('cover')}
                    >
                      <ImagePlus className="size-4" aria-hidden="true" />
                      Choose a cover from Media
                    </button>
                  )}
                </div>
              )}
            </form.Field>

            <form.Field name="gallery" mode="array">
              {(field) => (
                <div>
                  <p className="mb-2 text-[12px] font-semibold">
                    Gallery{' '}
                    <span className="font-normal text-[var(--dash-quiet)]">
                      ({field.state.value.length} of {PROJECT_LIMITS.gallery})
                    </span>
                  </p>

                  {field.state.value.length > 0 ? (
                    <ul className="mb-2 flex flex-col gap-2">
                      {field.state.value.map((image, index) => (
                        <ImageRow
                          key={`${image.mediaId}-${index}`}
                          index={index}
                          url={`/api/v2/owner/media/files/${image.mediaId}/content`}
                          alt={image.alt}
                          onAlt={(code, text) => {
                            const next = [...field.state.value]

                            next[index] = { ...image, alt: { ...image.alt, [code]: text } }
                            field.handleChange(next)
                          }}
                          onRemove={() =>
                            field.handleChange(field.state.value.filter((_, at) => at !== index))
                          }
                        />
                      ))}
                    </ul>
                  ) : null}

                  <button
                    type="button"
                    className="dash-btn dash-btn-quiet h-8 text-[12px]"
                    disabled={field.state.value.length >= PROJECT_LIMITS.gallery}
                    onClick={() => setPicking('gallery')}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    Add from Media
                  </button>
                </div>
              )}
            </form.Field>
          </Section>

          {/* --------------------------------------------- links & technology */}
          <Section id="links" title="Links & technology">
            <form.Field name="links" mode="array">
              {(field) => (
                <div className="flex flex-col gap-2.5">
                  {field.state.value.map((link, index) => {
                    const update = (patch: Partial<ProjectLink>) => {
                      const next = [...field.state.value]

                      next[index] = { ...link, ...patch }
                      field.handleChange(next)
                    }

                    return (
                      <div
                        key={index}
                        className="flex flex-wrap items-center gap-2.5 rounded-[9px] border border-[var(--dash-line)] p-2.5"
                      >
                        <Link2
                          className="size-4 shrink-0 text-[var(--dash-quiet)]"
                          aria-hidden="true"
                        />
                        <select
                          className="dash-field h-8 w-28 shrink-0 px-2 text-[12px]"
                          value={link.kind}
                          aria-label={`Link ${index + 1} kind`}
                          onChange={(event) =>
                            update({ kind: event.target.value as ProjectLink['kind'] })
                          }
                        >
                          <option value="website">Website</option>
                          <option value="source">Source code</option>
                          <option value="other">Other</option>
                        </select>
                        <input
                          className="dash-field h-8 min-w-0 flex-1 px-2.5 text-[12px]"
                          value={link.url}
                          placeholder="https://…"
                          aria-label={`Link ${index + 1} address`}
                          onChange={(event) => update({ url: event.target.value })}
                        />
                        <label className="flex shrink-0 items-center gap-1.5 text-[11.5px]">
                          <input
                            type="checkbox"
                            className="size-3.5"
                            checked={link.isPublic}
                            onChange={(event) => update({ isPublic: event.target.checked })}
                          />
                          {link.isPublic ? 'Visible' : 'Private'}
                        </label>
                        <button
                          type="button"
                          className="dash-btn dash-btn-ghost h-8 px-2"
                          aria-label={`Remove link ${index + 1}`}
                          onClick={() =>
                            field.handleChange(field.state.value.filter((_, at) => at !== index))
                          }
                        >
                          <X className="size-3.5" aria-hidden="true" />
                        </button>

                        {link.isPublic && link.kind === 'other' ? (
                          <div className="grid w-full gap-1.5 sm:grid-cols-3">
                            {LANGUAGES.map((code) => (
                              <input
                                key={code}
                                className="dash-field h-8 px-2 text-[12px]"
                                dir={code === 'ar' ? 'rtl' : 'ltr'}
                                placeholder={`${code.toUpperCase()} label`}
                                value={link.labels[code]}
                                aria-label={`Link ${index + 1} ${LANGUAGE_WORDS[code]} label`}
                                onChange={(event) =>
                                  update({ labels: { ...link.labels, [code]: event.target.value } })
                                }
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}

                  <button
                    type="button"
                    className="dash-btn dash-btn-quiet h-8 w-fit text-[12px]"
                    onClick={() =>
                      field.handleChange([
                        ...field.state.value,
                        { kind: 'other', url: '', isPublic: false, labels: emptyAlt() },
                      ])
                    }
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    Add a link
                  </button>
                </div>
              )}
            </form.Field>

            <form.Field name="tech">
              {(field) => (
                <div className="mt-4">
                  <p className="mb-2 text-[12px] font-semibold">Technology</p>
                  <div className="flex flex-wrap gap-1.5">
                    {field.state.value.map((name, index) => (
                      <span
                        key={`${name}-${index}`}
                        className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--dash-chip)] px-2.5 text-[11.5px] font-semibold"
                      >
                        {name}
                        <button
                          type="button"
                          aria-label={`Remove ${name}`}
                          onClick={() =>
                            field.handleChange(field.state.value.filter((_, at) => at !== index))
                          }
                        >
                          <X className="size-3 opacity-60 hover:opacity-100" aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                    <input
                      className="dash-field h-7 w-28 px-2 text-[11.5px]"
                      placeholder="Add…"
                      aria-label="Add a technology"
                      disabled={field.state.value.length >= PROJECT_LIMITS.techCount}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return

                        event.preventDefault()

                        const value = event.currentTarget.value.trim()

                        if (value === '' || field.state.value.includes(value)) return

                        field.handleChange([...field.state.value, value])
                        event.currentTarget.value = ''
                      }}
                    />
                  </div>
                </div>
              )}
            </form.Field>
          </Section>
        </div>

        {/* -------------------------------------------------------- the side */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
          {live ? (
            <div className="dash-panel overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-[var(--dash-line)] rtl:divide-x-reverse">
                <div className="p-3">
                  <p className="dash-eyebrow-quiet flex items-center gap-1.5">
                    <span
                      className="size-1.5 rounded-full bg-[var(--dash-live)]"
                      aria-hidden="true"
                    />
                    VISITORS SEE
                  </p>
                  <p className="mt-2 text-[12.5px] leading-snug font-medium">
                    {live.texts[language].name || '—'}
                  </p>
                  <p className="mt-1 line-clamp-3 text-[11.5px] text-[var(--dash-quiet)]">
                    {live.texts[language].summary}
                  </p>
                </div>
                <div className={cn('p-3', pending && 'bg-[var(--dash-blue-tint)]')}>
                  <p className="dash-eyebrow">YOU SAVED</p>
                  <p className="mt-2 text-[12.5px] leading-snug font-medium">
                    {values.texts[language].name || '—'}
                  </p>
                  <p className="mt-1 line-clamp-3 text-[11.5px] text-[var(--dash-quiet)]">
                    {values.texts[language].summary}
                  </p>
                </div>
              </div>
              {pending ? (
                <p className="border-t border-[var(--dash-line)] px-3 py-2 text-[11.5px] text-[var(--dash-quiet)]">
                  Nothing on the right is on the website yet.
                </p>
              ) : null}
            </div>
          ) : null}

          {checklist.length > 0 ? (
            <div className="dash-panel border-[var(--dash-red)] p-3.5">
              <p className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--dash-red-ink)]">
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                {checklist.length} {checklist.length === 1 ? 'thing' : 'things'} to finish first
              </p>
              {blockers ? (
                <p className="mt-1.5 text-[11.5px] text-[var(--dash-quiet)]">
                  Nothing was published and nothing was lost. The version on the website is
                  untouched.
                </p>
              ) : null}
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {checklist.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[12px]">
                    <X
                      className="mt-[3px] size-3 shrink-0 text-[var(--dash-red-ink)]"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="dash-panel p-3.5">
              <p className="text-[12.5px] font-semibold">Ready to publish</p>
              <ul className="mt-2.5 flex flex-col gap-1.5 text-[12px] text-[var(--dash-quiet)]">
                {['Web address', 'All three languages', 'Alternative text on every image'].map(
                  (item) => (
                    <li key={item} className="flex items-center gap-2">
                      <Check
                        className="size-3.5 shrink-0 text-[var(--dash-live)]"
                        aria-hidden="true"
                      />
                      {item}
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="dash-btn dash-btn-primary w-full"
              disabled={busy || checklist.length > 0 || state === 'archived'}
              onClick={() => void handlePublish()}
            >
              {publish.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Publishing…
                </>
              ) : live ? (
                'Publish update'
              ) : (
                'Publish'
              )}
            </button>

            {pending ? (
              <button
                type="button"
                className="dash-btn dash-btn-ghost w-full"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => discard.mutateAsync({ id: projectId, draftRevision: data.draftRevision }),
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
                onClick={() =>
                  void run(() => unpublish.mutateAsync(projectId), 'That could not be taken down.')
                }
              >
                Take off the website
              </button>
            ) : null}
          </div>

          <div className="dash-panel p-3.5">
            <p className="text-[12.5px] font-semibold">Put away or delete</p>
            <p className="mt-1 text-[11.5px] text-[var(--dash-quiet)]">
              Archiving keeps everything and hides it. Deleting cannot be undone — your images
              stay in Media either way.
            </p>

            <div className="mt-2.5 flex flex-col gap-2">
              {state === 'archived' ? (
                <button
                  type="button"
                  className="dash-btn dash-btn-quiet w-full h-8 text-[12px]"
                  onClick={() =>
                    void run(
                      () => restore.mutateAsync(projectId),
                      'That project could not be restored.',
                    )
                  }
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  className="dash-btn dash-btn-quiet w-full h-8 text-[12px]"
                  onClick={() =>
                    void run(
                      () => archive.mutateAsync(projectId),
                      'That project could not be archived.',
                    )
                  }
                >
                  Archive
                </button>
              )}

              {confirmDelete ? (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="confirm-delete" className="text-[11.5px]">
                    Type <code className="dash-num font-semibold">{projectId}</code> to confirm.
                  </label>
                  <input
                    id="confirm-delete"
                    className="dash-field h-8 px-2 text-[11px]"
                    value={deleteText}
                    onChange={(event) => setDeleteText(event.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="dash-btn dash-tone-red h-8 flex-1 text-[12px]"
                      disabled={deleteText !== projectId || remove.isPending}
                      onClick={() =>
                        void run(async () => {
                          await remove.mutateAsync({ id: projectId, confirm: deleteText })
                          await navigate({ to: '/dashboard/projects' })
                        }, 'That project could not be deleted.')
                      }
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
                </div>
              ) : (
                <button
                  type="button"
                  className="dash-btn dash-btn-ghost h-8 w-full text-[12px] text-[var(--dash-red-ink)]"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete permanently
                </button>
              )}
            </div>
          </div>
        </aside>
      </form>

      <p ref={announce} role="status" aria-live="polite" className="sr-only" />

      <MediaPicker
        open={picking !== null}
        onClose={() => setPicking(null)}
        kind="image"
        title={picking === 'cover' ? 'Choose a cover image' : 'Add an image to the gallery'}
        description="Uploading here adds the file to your Media library first, then selects it."
        onChoose={(asset: MediaAsset) => {
          if (picking === 'cover') {
            form.setFieldValue('cover', { mediaId: asset.id, alt: emptyAlt() })
          } else {
            form.setFieldValue('gallery', (previous) => [
              ...previous,
              { mediaId: asset.id, alt: emptyAlt() },
            ])
          }

          setPicking(null)
        }}
      />

    </DashboardPage>
  )
}
