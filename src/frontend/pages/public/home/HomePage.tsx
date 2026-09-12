import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { getContent } from '#/frontend/content'
import type { ProjectEntry } from '#/frontend/features/work/project-list'
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
 */
export function HomePage({
  entries,
  posts,
}: {
  entries: ProjectEntry[]
  posts: PublicPostSummary[]
}) {
  const { language } = useLanguage()
  const { home, services, work, faq, blog } = getContent(language)

  return (
    <>
      <HeroSection copy={home.hero} />
      <ServicesSection copy={home.services} services={services.items} language={language} />
      <WorkSection copy={home.work} work={work} language={language} entries={entries} />
      <ProcessSection copy={home.process} />
      <BlogSection blog={blog} language={language} posts={posts} />
      <HomeFaqSection copy={faq} />
      <CtaBand title={home.cta.title} body={home.cta.body} button={home.cta.button} alt={home.cta.alt} />
    </>
  )
}
