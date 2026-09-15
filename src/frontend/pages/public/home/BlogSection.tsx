import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Section, SectionHeading } from '#/frontend/components/layout/public/Section'
import { Button } from '#/frontend/components/ui/button'
import type { BlogCopy } from '#/frontend/content/types'
import { PostCard } from '#/frontend/features/blog/PostCard'
import type { Language } from '#/frontend/i18n/language'
import type { PublicPostSummary } from '#/shared/types/post.types'

/** How many of the newest articles the home page shows. */
const HOME_POST_COUNT = 3

/**
 * The section is left out entirely when nothing is published: an empty
 * "Writing" heading on the landing page says the opposite of what it is for.
 */
export function BlogSection({
  blog,
  language,
  posts,
}: {
  blog: BlogCopy
  language: Language
  posts: PublicPostSummary[]
}) {
  if (posts.length === 0) return null

  return (
    <Section id="blog">
      <Container className="flex flex-col gap-10">
        <div className="section-heading-row">
          <SectionHeading
            eyebrow={blog.home.eyebrow}
            title={blog.home.title}
            sub={blog.home.sub}
            eyebrowKey="blog.home.eyebrow"
            titleKey="blog.home.title"
            subKey="blog.home.sub"
          />
          <Button asChild variant="outline" className="rounded-full px-5">
            <Link to="/$lang/blog" params={{ lang: language }} search={{}}>
              {blog.home.all}
              <ArrowRight className="btn-arrow rtl:-scale-x-100" />
            </Link>
          </Button>
        </div>

        <div className="post-grid">
          {posts.slice(0, HOME_POST_COUNT).map((post) => (
            <PostCard key={post.slug} post={post} language={language} copy={blog} />
          ))}
        </div>
      </Container>
    </Section>
  )
}
