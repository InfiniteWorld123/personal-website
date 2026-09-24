import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { BookingBand } from '#/frontend/features/booking/BookingBand'
import { getContent } from '#/frontend/content'
import type { ProjectEntry } from '#/frontend/features/work/project-list'
import { HomeServicesV2, homeServicesView } from '#/frontend/features/services-public/HomeServicesV2'
import type { HomeServicesData } from '#/frontend/features/services-public/server/services-source'
import type { PublicPostSummary } from '#/shared/types/post.types'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { BlogSection } from './BlogSection'
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
 * The writing section sits after the process and disappears when nothing is
 * published, so the page never advertises an empty blog.
 * The booking band follows the process for the same reason the closing call
 * to action ends the page: asking for a call before the visitor has seen how
 * the work runs is asking twice in one screen.
 */
export function HomePage({
  entries,
  posts,
  services: servicesData,
}: {
  entries: ProjectEntry[]
  posts: PublicPostSummary[]
  /** Absent in the admin's preview, and `legacy` with the switch off: today's three cards. */
  services?: HomeServicesData
}) {
  const { language } = useLanguage()
  const { home, services, work, faq, blog } = getContent(language)
  const servicesView = homeServicesView(servicesData)

  return (
    <>
      <HeroSection copy={home.hero} />
      {servicesView === 'legacy' ? (
        <ServicesSection copy={home.services} services={services.items} language={language} />
      ) : servicesView === 'v2' && servicesData?.source === 'v2' ? (
        <HomeServicesV2 copy={home.services} items={servicesData.items} language={language} />
      ) : null}
      <WorkSection copy={home.work} work={work} language={language} entries={entries} />
      <ProcessSection copy={home.process} />
      <BookingBand />
      <BlogSection blog={blog} language={language} posts={posts} />
      <HomeFaqSection copy={faq} />
      <CtaBand
        title={home.cta.title}
        body={home.cta.body}
        button={home.cta.button}
        alt={home.cta.alt}
        keyBase="home.cta"
      />
    </>
  )
}
