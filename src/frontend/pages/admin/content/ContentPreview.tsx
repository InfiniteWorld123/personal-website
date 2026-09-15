import { AboutPage } from '#/frontend/pages/public/about/AboutPage'
import { ContactPage } from '#/frontend/pages/public/contact/ContactPage'
import { FaqPage } from '#/frontend/pages/public/faq/FaqPage'
import { HomePage } from '#/frontend/pages/public/home/HomePage'
import { LegalPage } from '#/frontend/pages/public/legal/LegalPage'
import { ServicesPage } from '#/frontend/pages/public/services/ServicesPage'
import { StackPage } from '#/frontend/pages/public/stack/StackPage'
import type { ProjectEntry } from '#/frontend/features/work/project-list'
import type { Language } from '#/frontend/i18n/language'
import { LanguageProvider } from '#/frontend/i18n/language-provider'
import type { PublicPostSummary } from '#/shared/types/post.types'
import { PAGE_LABEL, PREVIEWABLE_PAGES } from './content-format'

/**
 * The page as a visitor would get it, with the drafts written in.
 *
 * These are the real public page components, not a likeness of them — the
 * overlay above this puts unpublished wording in front of published wording
 * and nothing else changes, so what is on screen is what publishing would
 * produce.
 *
 * `/work` and `/blog` are missing on purpose: both read their paging and tag
 * filters out of their own route's search parameters, which do not exist here.
 * Their copy is still editable in the form; only the picture of it is not
 * available, and the pane says so rather than showing a wrong page.
 */
export function ContentPreview({
  page,
  language,
  entries,
  posts,
}: {
  page: string
  language: Language
  entries: ProjectEntry[]
  posts: PublicPostSummary[]
}) {
  const target = PREVIEWABLE_PAGES.has(page) ? page : 'home'

  return (
    <div className="content-preview">
      {target !== page ? (
        <p className="preview-note">
          {PAGE_LABEL[page] ?? page} has no preview of its own — showing the landing page, where
          the header, footer and your details appear.
        </p>
      ) : null}

      <div className="preview-frame">
        <LanguageProvider language={language}>
          {target === 'home' ? <HomePage entries={entries} posts={posts} /> : null}
          {target === 'services' ? <ServicesPage /> : null}
          {target === 'about' ? <AboutPage /> : null}
          {target === 'faq' ? <FaqPage /> : null}
          {target === 'contact' ? <ContactPage /> : null}
          {target === 'stack' ? <StackPage /> : null}
          {target === 'legal' ? (
            <>
              <LegalPage document="impressum" />
              <LegalPage document="privacy" />
            </>
          ) : null}
        </LanguageProvider>
      </div>
    </div>
  )
}
