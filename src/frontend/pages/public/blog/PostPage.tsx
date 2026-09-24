import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Suspense, lazy, useEffect, useState } from 'react'
import { Container } from '#/frontend/components/layout/public/Container'
import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { Button } from '#/frontend/components/ui/button'
import { getContent } from '#/frontend/content'
import { PostBody } from '#/frontend/features/blog/PostBody'
import { PostEngagement } from '#/frontend/features/blog/PostEngagement'
import { blogV2Words, fillWord } from '#/frontend/features/blog/blog-v2-words'
import type { PublicArticle } from '#/frontend/features/blog/public-article'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { formatPostDate } from '#/frontend/lib/format'
import { useReveal } from '#/frontend/motion'

/*
 * The comment section is its own chunk, fetched after the article is on
 * screen: the form library and the thread code are not worth delaying the
 * text a reader came for, and a legacy article never loads them at all.
 */
const PostComments = lazy(() =>
  import('#/frontend/features/blog/PostComments').then((module) => ({ default: module.PostComments })),
)

export function PostPage({ post }: { post: PublicArticle }) {
  const { language } = useLanguage()
  const { blog, home } = getContent(language)
  const article = useReveal<HTMLElement>()
  // Comments are read in the browser, never rendered on the server: they are
  // not cached, and a page must not be held back by them.
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

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
            {post.updatedOn ? (
              <>
                <span aria-hidden="true"> · </span>
                <span className="post-updated">
                  {fillWord(blogV2Words(language).updated, {
                    date: formatPostDate(post.updatedOn, language),
                  })}
                </span>
              </>
            ) : null}
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

          {/* After the article, not before it: the number is worth something
              once it has been read, and worth nothing as a claim on arrival. */}
          <PostEngagement
            source={post.source}
            slug={post.slug}
            viewCount={post.viewCount}
            likeCount={post.likeCount}
          />

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

          {post.source === 'v2' && post.commentsEnabled && mounted ? (
            <Suspense fallback={null}>
              <PostComments slug={post.slug} initialCount={post.commentCount} />
            </Suspense>
          ) : null}
        </Container>
      </article>

      <CtaBand title={home.cta.title} body={home.cta.body} button={home.cta.button} alt={home.cta.alt} />
    </>
  )
}
