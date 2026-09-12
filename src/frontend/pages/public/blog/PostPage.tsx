import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Container } from '#/frontend/components/layout/public/Container'
import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { Button } from '#/frontend/components/ui/button'
import { getContent } from '#/frontend/content'
import { PostBody } from '#/frontend/features/blog/PostBody'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { formatPostDate } from '#/frontend/lib/format'
import { useReveal } from '#/frontend/motion'
import type { PublicPost } from '#/shared/types/post.types'

export function PostPage({ post }: { post: PublicPost }) {
  const { language } = useLanguage()
  const { blog, home } = getContent(language)
  const article = useReveal<HTMLElement>()

  return (
    <>
      <article ref={article} data-reveal-scope="" className="public-page-intro pb-section">
        <Container className="post-article">
          <Button asChild variant="ghost" size="sm" className="post-back">
            <Link to="/$lang/blog" params={{ lang: language }} search={{}}>
              <ArrowLeft className="rtl:-scale-x-100" />
              {blog.back}
            </Link>
          </Button>

          <h1 className="section-title text-display-md text-foreground">{post.title}</h1>

          <p className="post-meta">
            <time dateTime={post.publishedOn}>{formatPostDate(post.publishedOn, language)}</time>
            <span aria-hidden="true"> · </span>
            {blog.readingTime.replace('{minutes}', String(post.readingMinutes))}
          </p>

          {post.tags.length > 0 ? (
            <nav className="post-tag-filter" aria-label={blog.allTags}>
              {post.tags.map((tag) => (
                <Link
                  key={tag.slug}
                  to="/$lang/blog"
                  params={{ lang: language }}
                  search={{ tag: tag.slug }}
                  className="post-tag-chip"
                >
                  {tag.name}
                </Link>
              ))}
            </nav>
          ) : null}

          <p className="post-lead">{post.excerpt}</p>

          {post.cover ? (
            <img
              className="post-cover"
              src={post.cover.src}
              width={post.cover.width}
              height={post.cover.height}
              alt={post.cover.alt}
            />
          ) : null}

          <PostBody doc={post.body} />

          {post.project ? (
            <aside className="post-project">
              <p>{blog.aboutProject.replace('{project}', post.project.name)}</p>
              <Button asChild variant="outline" className="rounded-full px-5">
                <Link to="/$lang/work/$slug" params={{ lang: language, slug: post.project.slug }}>
                  {blog.seeProject}
                  <ArrowRight className="btn-arrow rtl:-scale-x-100" />
                </Link>
              </Button>
            </aside>
          ) : null}
        </Container>
      </article>

      <CtaBand title={home.cta.title} body={home.cta.body} button={home.cta.button} alt={home.cta.alt} />
    </>
  )
}
