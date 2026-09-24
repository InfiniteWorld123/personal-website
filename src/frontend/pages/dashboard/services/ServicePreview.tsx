import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Eye, X } from 'lucide-react'
import { LANGUAGE_WORDS } from '#/backend2/contracts/project.contract'
import { LANGUAGES, type Language, type ServiceState } from '#/backend2/contracts/service.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { getContent } from '#/frontend/content'
import { useServicePreview } from '#/frontend/features/services/queries'
import { PRICE_WORDS } from '#/frontend/features/services/service-display'
import { cn } from '#/frontend/lib/utils'
import { BodyView, LoadFailure, PriceText } from './service-parts'

/**
 * The saved draft, as a visitor will receive it.
 *
 * The content comes from the server, built by the same projection the public
 * route uses, so the price terms and the fallbacks cannot differ from the
 * real page. It is not a pixel copy of the public service page, which draws
 * the same content in its own design. The words around the content are the
 * public site's, in the language being previewed.
 */

const liveness = (state: ServiceState): { text: string; live: boolean } => {
  if (state === 'published') return { text: 'This is what visitors see now', live: true }
  if (state === 'published_with_pending_changes') {
    return { text: 'Not live — visitors still see the published version', live: false }
  }

  return { text: 'Not on the website', live: false }
}

function Missing({ children }: { children: React.ReactNode }) {
  return <span className="text-[var(--dash-quiet)] italic">{children}</span>
}

export function ServicePreview({
  serviceId,
  revision,
  state,
  initialLanguage,
  onClose,
}: {
  serviceId: string
  revision: number
  state: ServiceState
  initialLanguage: Language
  onClose: () => void
}) {
  const [language, setLanguage] = useState<Language>(initialLanguage)
  const preview = useServicePreview({ id: serviceId, language, revision })
  const closeButton = useRef<HTMLButtonElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const opener = document.activeElement

    closeButton.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }

    document.addEventListener('keydown', onKey)

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
  const words = PRICE_WORDS[language]
  const eyebrow = getContent(language).home.services.eyebrow

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
        aria-labelledby="service-preview-title"
        className="dash-panel flex w-full max-w-[64rem] flex-col overflow-hidden shadow-[var(--dash-shadow)] max-sm:rounded-none"
      >
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--dash-line)] px-4 py-3">
          <span className="flex items-center gap-2">
            <Eye className="size-4 text-[var(--dash-brand)]" aria-hidden="true" />
            <h2 id="service-preview-title" className="text-sm font-semibold">
              Preview
            </h2>
          </span>

          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold',
              status.live ? 'dash-tone-blue' : 'dash-tone-grey',
            )}
          >
            {status.live ? <span className="size-1.5 rounded-full bg-[var(--dash-live)]" aria-hidden="true" /> : null}
            {status.text}
          </span>

          <div role="group" aria-label="Language" className="ms-auto flex rounded-[9px] border border-[var(--dash-line)] p-0.5">
            {LANGUAGES.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={language === code}
                onClick={() => setLanguage(code)}
                className={cn(
                  'h-7 rounded-[7px] px-2.5 text-[12px] font-semibold',
                  language === code ? 'bg-[var(--dash-brand)] text-white' : 'text-[var(--dash-quiet)] hover:text-[var(--dash-ink)]',
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
          Your saved draft, with exactly the words and the price visitors get after you publish. The website shows the
          same content in its own design.
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--dash-canvas)]">
          <article
            dir={language === 'ar' ? 'rtl' : 'ltr'}
            lang={language}
            aria-busy={preview.isFetching}
            className="mx-auto w-full max-w-[52rem] px-5 py-8 sm:px-8 sm:py-10"
          >
            {preview.isError && !page ? (
              <LoadFailure
                title={
                  preview.error instanceof ApiRequestError && preview.error.status === 404
                    ? 'That service does not exist any more'
                    : 'The preview could not be loaded'
                }
                message="Nothing was changed. Close the preview and try again."
                onRetry={() => void preview.refetch()}
              />
            ) : !page ? (
              <div className="flex flex-col gap-4" aria-hidden="true">
                <span className="dash-skeleton h-3 w-24 rounded" />
                <span className="dash-skeleton h-9 w-2/3 rounded" />
                <span className="dash-skeleton h-4 w-full rounded" />
              </div>
            ) : (
              <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_17rem]">
                <div className="flex min-w-0 flex-col gap-5">
                  <p className="dash-eyebrow">{eyebrow.toUpperCase()}</p>
                  <h1
                    className="dash-title text-[30px] sm:text-[38px]"
                    style={language === 'ar' ? { fontFamily: 'var(--font-arabic)', letterSpacing: 0, lineHeight: 1.3 } : undefined}
                  >
                    {page.name || <Missing>No name in {LANGUAGE_WORDS[language]} yet</Missing>}
                  </h1>
                  <p className="text-[16px] leading-relaxed">
                    {page.summary || <Missing>No short description in {LANGUAGE_WORDS[language]} yet</Missing>}
                  </p>

                  <section className="flex flex-col gap-2">
                    <h2 className="text-[13px] font-semibold">{words.includes}</h2>
                    {page.included.length > 0 ? (
                      <ul className="flex list-disc flex-col gap-1 ps-5 text-[14px] marker:text-[var(--dash-brand)]">
                        {page.included.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[13px]">
                        <Missing>Nothing listed as included in {LANGUAGE_WORDS[language]} yet</Missing>
                      </p>
                    )}
                  </section>

                  {page.body ? <BodyView text={page.body} language={language} /> : null}
                </div>

                <aside className="dash-panel flex h-fit flex-col gap-3 p-4 md:sticky md:top-0">
                  <p className="text-[12px] font-semibold text-[var(--dash-quiet)]">{words.price}</p>
                  <PriceText price={page.price} language={language} withCaption className="text-[22px]" />
                  <span className="dash-btn dash-btn-primary w-full" aria-hidden="true">
                    {words.cta}
                    <ArrowRight className="size-4 rtl:-scale-x-100" />
                  </span>
                  <p className="text-[11px] text-[var(--dash-quiet)]">
                    Search result: {page.seo.title} — {page.seo.description}
                  </p>
                </aside>
              </div>
            )}
          </article>
        </div>
      </div>
    </div>
  )
}
