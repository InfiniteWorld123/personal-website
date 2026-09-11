import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { getContent } from '#/frontend/content'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { HeroSection } from './HeroSection'
import { HomeFaqSection } from './HomeFaqSection'
import { ProcessSection } from './ProcessSection'
import { ServicesSection } from './ServicesSection'
import { WorkSection } from './WorkSection'

/**
 * Section order follows `docs/content-decisions.md` C6 and C16: person and
 * offer, the three service lines, proof, how the work runs, the common
 * questions, then the call to action.
 * The story illustration, fit section, and about teaser are not part of the
 * landing page; their content and components stay for their own pages.
 */
export function HomePage() {
  const { language } = useLanguage()
  const { home, services, work, faq } = getContent(language)

  return (
    <>
      <HeroSection copy={home.hero} />
      <ServicesSection copy={home.services} services={services.items} language={language} />
      <WorkSection copy={home.work} work={work} language={language} />
      <ProcessSection copy={home.process} />
      <HomeFaqSection copy={faq} />
      <CtaBand title={home.cta.title} body={home.cta.body} button={home.cta.button} alt={home.cta.alt} />
    </>
  )
}
