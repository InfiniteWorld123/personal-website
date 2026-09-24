import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Eye, X } from 'lucide-react'
import {
  type Language,
  LANGUAGES,
  LANGUAGE_WORDS,
  type ProjectState,
  type PublicImage,
  PUBLIC_TYPE_WORDS,
} from '#/backend2/contracts/project.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { getContent } from '#/frontend/content'
import { CaseStudyView } from '#/frontend/features/projects/CaseStudyView'
import { useProjectPreview } from '#/frontend/features/projects/queries'
import { cn } from '#/frontend/lib/utils'
import { LoadFailure } from './project-parts'

/**
 * The saved draft, as a visitor will receive it.
 *
 * What is shown comes from the server, built by the same projection the
 * public route uses — so a hidden client name or a private link is absent
 * here for the same reason it will be absent on the website, not because
 * this screen remembered to hide it. Only the one language asked for arrives.
 *
 * What it is not, and says so: a pixel copy of the public project page. The
 * content, the order and what is hidden are exact; the website draws the same
 * content in its own design.
 *
 * The small words around the content — the two link buttons and the
 * technology heading — are the public site's own, read from its content in
 * the language being previewed, so an Arabic preview does not show English
 * buttons a visitor will never see. The project type uses the owner's
 * approved public words (`PUBLIC_TYPE_WORDS`).
 */

/** Which of three honest sentences the header should carry. */
const liveness = (state: ProjectState): { text: string; live: boolean } => {
  if (state === 'published') return { text: 'This is what visitors see now', live: true }

  if (state === 'published_with_pending_changes') {
    return { text: 'Not live — visitors still see the published version', live: false }
  }

  return { text: 'Not on the website', live: false }
}

function Figure({ image, className }: { image: PublicImage; className?: string }) {
  return (
    <figure className={className}>
      <img
        src={image.url}
        alt={image.alt}
        width={image.width ?? undefined}
        height={image.height ?? undefined}
        loading="lazy"
        className="h-auto w-full rounded-[12px] border border-[var(--dash-line)] bg-[var(--dash-furniture)] object-cover"
      />
      {image.alt === '' ? (
        <figcaption className="mt-1.5 text-[11.5px] font-medium text-[var(--dash-red-ink)]">
          This image has no description in this language yet.
        </figcaption>
      ) : null}
    </figure>
  )
}

/** A gap the owner should see, drawn so it cannot be mistaken for content. */
function Missing({ children }: { children: React.ReactNode }) {
  return <span className="text-[var(--dash-quiet)] italic">{children}</span>
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <span className="dash-skeleton h-3 w-24 rounded" />
      <span className="dash-skeleton h-9 w-2/3 rounded" />
      <span className="dash-skeleton h-4 w-full rounded" />
      <span className="dash-skeleton h-4 w-5/6 rounded" />
      <span className="dash-skeleton mt-2 aspect-[16/9] w-full rounded-[12px]" />
    </div>
  )
}

export function ProjectPreview({
  projectId,
  revision,
  state,
  initialLanguage,
  onClose,
}: {
  projectId: string
  /** The saved draft's revision, so a fresh save means a fresh preview. */
  revision: number
  state: ProjectState
  initialLanguage: Language
  onClose: () => void
}) {
  const [language, setLanguage] = useState<Language>(initialLanguage)
  const preview = useProjectPreview({ id: projectId, language, revision, enabled: true })

  const closeButton = useRef<HTMLButtonElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Focus moves into the dialog on open and back to the button that opened it
  // on close; Escape closes. `closeRef` keeps this from re-running — and
  // bouncing focus — every time the parent renders a new `onClose`.
  useEffect(() => {
    const opener = document.activeElement

    closeButton.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }

    document.addEventListener('keydown', onKey)

    // The editor behind must not scroll while the preview is on top of it.
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  const status = liveness(state)
  const page = preview.data
  const rtl = language === 'ar'
  const words = getContent(language).work

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-[rgba(8,12,24,.55)] sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-preview-title"
        className="dash-panel flex w-full max-w-[64rem] flex-col overflow-hidden shadow-[var(--dash-shadow)] max-sm:rounded-none"
      >
        {/* The frame around the page: which draft this is, and where it is not. */}
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--dash-line)] px-4 py-3">
          <span className="flex items-center gap-2">
            <Eye className="size-4 text-[var(--dash-brand)]" aria-hidden="true" />
            <h2 id="project-preview-title" className="text-sm font-semibold">
              Preview
            </h2>
          </span>

          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold',
              status.live ? 'dash-tone-blue' : 'dash-tone-grey',
            )}
          >
            {status.live ? (
              <span className="size-1.5 rounded-full bg-[var(--dash-live)]" aria-hidden="true" />
            ) : null}
            {status.text}
          </span>

          <div
            role="group"
            aria-label="Language"
            className="ms-auto flex rounded-[9px] border border-[var(--dash-line)] p-0.5"
          >
            {LANGUAGES.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={language === code}
                onClick={() => setLanguage(code)}
                className={cn(
                  'h-7 rounded-[7px] px-2.5 text-[12px] font-semibold',
                  language === code
                    ? 'bg-[var(--dash-brand)] text-white'
                    : 'text-[var(--dash-quiet)] hover:text-[var(--dash-ink)]',
                )}
              >
                {LANGUAGE_WORDS[code]}
              </button>
            ))}
          </div>

          <button
            ref={closeButton}
            type="button"
            className="dash-btn dash-btn-ghost size-8 p-0"
            onClick={onClose}
            aria-label="Close the preview"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <p className="border-b border-[var(--dash-line)] bg-[var(--dash-furniture)] px-4 py-2 text-[11.5px] text-[var(--dash-quiet)]">
          Your saved draft, with exactly the words, images, links and order visitors will get
          after you publish — and without anything that stays private. The website shows the
          same content in its own design.
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--dash-canvas)]">
          <article
            dir={rtl ? 'rtl' : 'ltr'}
            lang={language}
            aria-busy={preview.isFetching}
            className="mx-auto w-full max-w-[46rem] px-5 py-8 sm:px-8 sm:py-10"
          >
            {preview.isError && !page ? (
              <LoadFailure
                title={
                  preview.error instanceof ApiRequestError && preview.error.status === 404
                    ? 'That project does not exist any more'
                    : 'The preview could not be loaded'
                }
                message="Nothing was changed. Close the preview and try again."
                onRetry={() => void preview.refetch()}
              />
            ) : !page ? (
              <PageSkeleton />
            ) : (
              <>
                <p className="dash-eyebrow">
                  {(page.categoryLabel ?? PUBLIC_TYPE_WORDS[language][page.type]).toUpperCase()}
                </p>

                <h1 className="dash-title mt-2 text-[30px] sm:text-[38px]">
                  {page.name || <Missing>No name in {LANGUAGE_WORDS[language]} yet</Missing>}
                </h1>

                <p className="mt-3 flex flex-wrap gap-x-2 text-[12.5px] text-[var(--dash-quiet)]">
                  <span>{PUBLIC_TYPE_WORDS[language][page.type]}</span>
                  <span aria-hidden="true">·</span>
                  {/* The public site's own approved words for a finished or unfinished project. */}
                  <span>{getContent(language).work.status[page.workStatus === 'completed' ? 'live' : 'building']}</span>
                  {page.client ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{page.client.name}</span>
                    </>
                  ) : null}
                </p>

                <p className="mt-5 text-[16px] leading-relaxed">
                  {page.summary || (
                    <Missing>No summary in {LANGUAGE_WORDS[language]} yet</Missing>
                  )}
                </p>

                {page.website || page.source ? (
                  <p className="mt-5 flex flex-wrap gap-2">
                    {page.website ? (
                      <a
                        href={page.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="dash-btn dash-btn-primary h-9"
                      >
                        {words.visit}
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    ) : null}
                    {page.source ? (
                      <a
                        href={page.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="dash-btn dash-btn-quiet h-9"
                      >
                        {words.source}
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    ) : null}
                  </p>
                ) : null}

                {page.cover ? <Figure image={page.cover} className="mt-7" /> : null}

                <section className="mt-8">
                  {page.caseStudy ? (
                    <CaseStudyView doc={page.caseStudy} />
                  ) : (
                    <p className="text-[13px]">
                      <Missing>
                        No case study in {LANGUAGE_WORDS[language]}. The page is published
                        without one — that is allowed.
                      </Missing>
                    </p>
                  )}
                </section>

                {page.gallery.length > 0 ? (
                  <section className="mt-8 grid gap-3 sm:grid-cols-2">
                    {page.gallery.map((image, index) => (
                      <Figure key={`${image.url}-${index}`} image={image} />
                    ))}
                  </section>
                ) : null}

                {page.tech.length > 0 ? (
                  <h2 className="mt-8 text-[13px] font-semibold">{words.detail.stack}</h2>
                ) : null}

                {page.tech.length > 0 ? (
                  <ul className="mt-2.5 flex flex-wrap gap-1.5">
                    {page.tech.map((name) => (
                      <li
                        key={name}
                        className="rounded-md bg-[var(--dash-chip)] px-2.5 py-1 text-[12px] font-semibold"
                      >
                        {name}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {page.otherLinks.length > 0 ? (
                  <p className="mt-6 text-[12px]">
                    <Missing>
                      {page.otherLinks.length === 1
                        ? 'One more link is set to visible, but'
                        : `${page.otherLinks.length} more links are set to visible, but`}{' '}
                      the public page does not show extra links yet.
                    </Missing>
                  </p>
                ) : null}
              </>
            )}
          </article>
        </div>
      </div>
    </div>
  )
}
