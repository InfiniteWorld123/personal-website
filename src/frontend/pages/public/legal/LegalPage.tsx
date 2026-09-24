import { Container } from '#/frontend/components/layout/public/Container'
import { Eyebrow, Section } from '#/frontend/components/layout/public/Section'
import { getContent } from '#/frontend/content'
import { applyPrivacyV2 } from '#/frontend/content/privacy-v2'
import type { LegalCopy } from '#/frontend/content/types'
import { useLanguage } from '#/frontend/i18n/language-provider'

/**
 * Impressum and Datenschutz share a shape: a run of headed sections, each
 * holding either a paragraph or a short list. Plain text, no motion, no CTA —
 * a visitor here wants a fact, not to be sold to.
 */
export function LegalPage({
  document,
  webAnalytics = false,
}: {
  document: 'impressum' | 'privacy'
  /** Cloudflare Web Analytics is switched on: the privacy page says so. */
  webAnalytics?: boolean
}) {
  const { language } = useLanguage()
  const base: LegalCopy = getContent(language).legal[document]
  // The privacy page describes what V2 does (`docs/v2/privacy-v2.md`).
  const copy = document === 'privacy' ? applyPrivacyV2(base, language, { webAnalytics }) : base

  return (
    <>
      <section className="pt-10 pb-10 sm:pt-14">
        <Container className="flex max-w-2xl flex-col">
          <Eyebrow>{copy.eyebrow}</Eyebrow>
          <h1 className="section-title mt-5 text-display-md text-foreground">{copy.title}</h1>
          <p className="hero-copy mt-6 text-base leading-8">{copy.intro}</p>
        </Container>
      </section>

      <Section className="pt-0">
        <Container className="flex max-w-2xl flex-col gap-9">
          {copy.sections.map((section) => (
            <section key={section.title} className="flex flex-col gap-2.5">
              <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
              {section.body ? (
                <p className="m-0 text-sm leading-7 text-foreground/62">{section.body}</p>
              ) : null}
              {section.lines ? (
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm leading-7 text-foreground/62">
                  {section.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
          <p className="text-muted-foreground border-border m-0 border-t pt-6 text-xs">{copy.updated}</p>
        </Container>
      </Section>
    </>
  )
}
