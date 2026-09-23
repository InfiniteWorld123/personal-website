import { useEffect, useRef, useState } from 'react'
import { Eye, X } from 'lucide-react'
import { BLOG_AUTHOR_NAME, LANGUAGES, type Language } from '#/backend2/contracts/blog.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { BlogBodyView } from '#/frontend/features/blog-v2/BlogBodyView'
import type { PreviewVersion } from '#/frontend/features/blog-v2/api'
import { useArticlePreview } from '#/frontend/features/blog-v2/queries'
import { cn } from '#/frontend/lib/utils'
import { LoadFailure } from './blog-parts'

/**
 * Any version of the article, as a visitor will receive it — in each language.
 *
 * The content comes from the server, built by the same projection the public
 * blog will use, so the fallbacks, the tags and the linked project cannot
 * differ from the real page. It is private: there is no link to share, and
 * the pictures come through the owner's own route. The public blog is not
 * connected to Backend2 yet, so this is the content in the site's words, not
 * a pixel copy of the page.
 */

/** The public words, as approved with the Design Lab on 23 Sep 2026. */
const WORDS: Record<Language, { readingTime: string; updated: string; aboutProject: string; seeProject: string; locale: string }> = {
  de: {
    readingTime: '{minutes} Min. Lesezeit',
    updated: 'Aktualisiert am {date}',
    aboutProject: 'Dieser Artikel handelt von {project}.',
    seeProject: 'Zum Projekt',
    locale: 'de-DE',
  },
  en: {
    readingTime: '{minutes} min read',
    updated: 'Updated {date}',
    aboutProject: 'This article is about {project}.',
    seeProject: 'See the project',
    locale: 'en-GB',
  },
  ar: {
    readingTime: 'قراءة {minutes} دقيقة',
    updated: 'حُدّث في {date}',
    aboutProject: 'هذا المقال عن {project}.',
    seeProject: 'انتقل إلى المشروع',
    locale: 'ar',
  },
}

const VERSION_WORDS: Record<PreviewVersion, string> = {
  draft: 'Saved draft',
  scheduled: 'Scheduled',
  published: 'Live',
}

const LANGUAGE_LABEL: Record<Language, string> = { de: 'DE', en: 'EN', ar: 'AR' }

const publicDate = (iso: string, language: Language) =>
  new Intl.DateTimeFormat(WORDS[language].locale, { day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'latn' }).format(
    new Date(iso),
  )

function Missing({ children }: { children: React.ReactNode }) {
  return <span className="text-[var(--dash-quiet)] italic">{children}</span>
}

export function BlogPreview({
  articleId,
  revision,
  versions,
  initialVersion,
  initialLanguage,
  unsaved,
  onClose,
}: {
  articleId: string
  revision: number
  versions: PreviewVersion[]
  initialVersion: PreviewVersion
  initialLanguage: Language
  /** The owner has typed since the last save; the preview shows what is saved. */
  unsaved: boolean
  onClose: () => void
}) {
  const [version, setVersion] = useState<PreviewVersion>(versions.includes(initialVersion) ? initialVersion : 'draft')
  const [language, setLanguage] = useState<Language>(initialLanguage)
  const preview = useArticlePreview({ id: articleId, language, version, revision })
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
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  const page = preview.data
  const words = WORDS[language]
  const rtl = language === 'ar'

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
        aria-labelledby="article-preview-title"
        className="dash-panel flex w-full max-w-[64rem] flex-col overflow-hidden shadow-[var(--dash-shadow)] max-sm:rounded-none"
      >
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--dash-line)] px-4 py-3">
          <span className="flex items-center gap-2">
            <Eye className="size-4 text-[var(--dash-brand)]" aria-hidden="true" />
            <h2 id="article-preview-title" className="text-sm font-semibold">
              Preview
            </h2>
          </span>

          {versions.length > 1 ? (
            <div role="group" aria-label="Version" className="flex rounded-[9px] border border-[var(--dash-line)] p-0.5">
              {versions.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={version === key}
                  onClick={() => setVersion(key)}
                  className={cn(
                    'h-7 rounded-[7px] px-2.5 text-[12px] font-semibold',
                    version === key ? 'bg-[var(--dash-brand)] text-white' : 'text-[var(--dash-quiet)] hover:text-[var(--dash-ink)]',
                  )}
                >
                  {VERSION_WORDS[key]}
                </button>
              ))}
            </div>
          ) : (
            <span className="dash-tone-grey inline-flex h-[22px] items-center rounded-md px-2 text-[11px] font-semibold">
              {VERSION_WORDS[version]}
            </span>
          )}

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
                {LANGUAGE_LABEL[code]}
              </button>
            ))}
          </div>

          <button ref={closeButton} type="button" className="dash-btn dash-btn-ghost size-8 p-0" onClick={onClose} aria-label="Close the preview">
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <p className="border-b border-[var(--dash-line)] bg-[var(--dash-furniture)] px-4 py-2 text-[11.5px] text-[var(--dash-quiet)]">
          Only you can see this. Nothing here is published, and there is no link to share.
          {unsaved && version === 'draft' ? ' You have unsaved changes: this shows what is saved.' : ''}
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--dash-canvas)]">
          <article
            dir={rtl ? 'rtl' : 'ltr'}
            lang={language}
            aria-busy={preview.isFetching}
            className={cn('mx-auto w-full max-w-[46rem] px-5 py-8 sm:px-8 sm:py-10', rtl && 'font-[family-name:var(--font-arabic)]')}
          >
            {preview.isError && !page ? (
              <LoadFailure
                title={
                  preview.error instanceof ApiRequestError && preview.error.status === 404
                    ? 'This version does not exist any more'
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
                <span className="dash-skeleton h-56 w-full rounded-[12px]" />
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {page.tags.length > 0 ? (
                  <p className="flex flex-wrap gap-1.5">
                    {page.tags.map((tag) => (
                      <span key={tag.slug} className="rounded-full bg-[var(--dash-blue-tint)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[var(--dash-blue-ink)]">
                        {tag.name}
                      </span>
                    ))}
                  </p>
                ) : null}

                <h1
                  className="dash-title text-[30px] sm:text-[38px]"
                  style={rtl ? { fontFamily: 'var(--font-arabic)', letterSpacing: 0, lineHeight: 1.3 } : undefined}
                >
                  {page.title || <Missing>No title in this language yet</Missing>}
                </h1>

                <p className="text-[17px] leading-relaxed text-[var(--dash-quiet)]">
                  {page.summary || <Missing>No summary in this language yet</Missing>}
                </p>

                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[var(--dash-quiet)]">
                  <span className="font-semibold text-[var(--dash-ink)]">{page.author?.name ?? BLOG_AUTHOR_NAME}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={page.publishedAt}>{publicDate(page.publishedAt, language)}</time>
                  <span aria-hidden="true">·</span>
                  <span>{words.readingTime.replace('{minutes}', String(page.readingMinutes))}</span>
                  {page.updatedAt ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{words.updated.replace('{date}', publicDate(page.updatedAt, language))}</span>
                    </>
                  ) : null}
                </p>

                {page.cover ? (
                  <img
                    src={page.cover.url}
                    alt={page.cover.alt}
                    width={page.cover.width ?? undefined}
                    height={page.cover.height ?? undefined}
                    className="h-auto w-full rounded-[14px] border border-[var(--dash-line)] object-cover"
                  />
                ) : null}

                {page.body.content.length > 0 ? (
                  <BlogBodyView doc={page.body} />
                ) : (
                  <p>
                    <Missing>The article is empty in this language.</Missing>
                  </p>
                )}

                {page.project ? (
                  <p className="rounded-[12px] border border-[var(--dash-line)] bg-[var(--dash-surface)] px-4 py-3 text-[14px]">
                    {words.aboutProject.replace('{project}', page.project.name)}{' '}
                    <span className="font-semibold text-[var(--dash-brand)]">{words.seeProject} →</span>
                  </p>
                ) : null}

                <p className="border-t border-dashed border-[var(--dash-line)] pt-3 text-[11.5px] text-[var(--dash-quiet)]" dir="ltr" lang="en">
                  Search result: <span className="font-semibold text-[var(--dash-ink)]">{page.seo.title}</span> — {page.seo.description}
                </p>
              </div>
            )}
          </article>
        </div>
      </div>
    </div>
  )
}
