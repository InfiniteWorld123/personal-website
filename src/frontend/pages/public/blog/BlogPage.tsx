import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Container } from '#/frontend/components/layout/public/Container'
import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { Eyebrow } from '#/frontend/components/layout/public/Section'
import { Button } from '#/frontend/components/ui/button'
import { getContent } from '#/frontend/content'
import { PostCard } from '#/frontend/features/blog/PostCard'
import { getPostBatch } from '#/frontend/features/blog/post-list'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { SplitWords, useReveal } from '#/frontend/motion'
import type { PublicPostSummary, PublicTag } from '#/shared/types/post.types'

export function BlogPage({ posts, tags }: { posts: PublicPostSummary[]; tags: PublicTag[] }) {
  const { language } = useLanguage()
  const { blog, home } = getContent(language)
  const { page, tag } = useSearch({ from: '/$lang/blog/' })
  const navigate = useNavigate()
  const header = useReveal<HTMLElement>()
  const grid = useReveal<HTMLElement>()
  const batch = getPostBatch(posts, page)

  return (
    <>
      <section ref={header} data-reveal-scope="" className="public-page-intro">
        <Container>
          <Eyebrow data-reveal>{blog.eyebrow}</Eyebrow>
          <h1 className="section-title mt-5 text-display-lg text-foreground">
            <SplitWords text={blog.title} />
          </h1>
          <p data-reveal className="page-intro-copy">
            {blog.intro}
          </p>
        </Container>
      </section>

      <section ref={grid} data-reveal-scope="" className="pb-section" aria-label={blog.eyebrow}>
        <Container>
          {tags.length > 0 ? (
            <nav className="post-tag-filter" aria-label={blog.allTags}>
              <Link
                to="/$lang/blog"
                params={{ lang: language }}
                search={{}}
                className="post-tag-chip"
                data-active={tag ? undefined : ''}
              >
                {blog.allTags}
              </Link>
              {tags.map((entry) => (
                <Link
                  key={entry.slug}
                  to="/$lang/blog"
                  params={{ lang: language }}
                  search={{ tag: entry.slug }}
                  className="post-tag-chip"
                  data-active={tag === entry.slug ? '' : undefined}
                >
                  {entry.name}
                </Link>
              ))}
            </nav>
          ) : null}

          {batch.visible.length ? (
            <div className="post-grid">
              {batch.visible.map((post) => (
                <PostCard key={post.slug} post={post} language={language} copy={blog} />
              ))}
            </div>
          ) : (
            <p className="work-empty">{blog.empty}</p>
          )}

          <div className="work-pagination">
            <p role="status" aria-live="polite">
              {blog.shown
                .replace('{visible}', String(batch.visible.length))
                .replace('{total}', String(posts.length))}
            </p>
            {batch.hasMore ? (
              <Button
                variant="outline"
                className="rounded-full px-6"
                onClick={() =>
                  void navigate({
                    to: '/$lang/blog',
                    params: { lang: language },
                    search: { tag, page: batch.page + 1 },
                    resetScroll: false,
                  })
                }
              >
                {blog.loadMore}
              </Button>
            ) : null}
            <a className="post-feed-link" href={`/rss/${language}.xml`}>
              {blog.feed}
            </a>
          </div>
        </Container>
      </section>

      <CtaBand title={home.cta.title} body={home.cta.body} button={home.cta.button} alt={home.cta.alt} />
    </>
  )
}
