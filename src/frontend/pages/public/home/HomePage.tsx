import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { getContent } from '#/frontend/content'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { AboutTeaser } from './AboutTeaser'
import { FitSection } from './FitSection'
import { HeroSection } from './HeroSection'
import { ProcessSection } from './ProcessSection'
import { ServicesSection } from './ServicesSection'
import { WorkSection } from './WorkSection'

/**
 * Section order follows `docs/positioning.md`: offer first, proof, process,
 * qualification, a short word about the person, then the call to action.
 */
export function HomePage() {
  const { language } = useLanguage()
  const { home, services, work } = getContent(language)

  return (
    <>
      <HeroSection copy={home.hero} />
      <ServicesSection copy={home.services} services={services.items} language={language} />
      <WorkSection copy={home.work} work={work} language={language} />
      <ProcessSection copy={home.process} />
      <FitSection copy={home.fit} />
      <AboutTeaser copy={home.about} language={language} />
      <CtaBand title={home.cta.title} body={home.cta.body} button={home.cta.button} alt={home.cta.alt} />
    </>
  )
}
