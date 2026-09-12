import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import type { BlogCopy } from '#/frontend/content/types'
import type { Language } from '#/frontend/i18n/language'
import { formatPostDate } from '#/frontend/lib/format'
import { useTilt } from '#/frontend/motion'
import type { PublicPostSummary } from '#/shared/types/post.types'

export function PostCard({
  post,
  language,
  copy,
}: {
  post: PublicPostSummary
  language: Language
  copy: BlogCopy
}) {
  const tilt = useTilt<HTMLElement>()

  return (
    <article className="post-card" data-reveal data-tilt ref={tilt}>
      {post.cover ? (
        <img
          className="post-card-image"
          src={post.cover.src}
          width={post.cover.width}
          height={post.cover.height}
          alt={post.cover.alt}
          loading="lazy"
        />
      ) : null}

      <p className="post-card-meta">
        <time dateTime={post.publishedOn}>{formatPostDate(post.publishedOn, language)}</time>
        <span aria-hidden="true"> · </span>
        {copy.readingTime.replace('{minutes}', String(post.readingMinutes))}
      </p>

      <h3>
        <Link to="/$lang/blog/$slug" params={{ lang: language, slug: post.slug }}>
          {post.title}
        </Link>
      </h3>

      <p className="post-card-summary">{post.excerpt}</p>

      {post.tags.length > 0 ? (
        <p className="post-card-tags">{post.tags.map((tag) => tag.name).join(' · ')}</p>
      ) : null}

      <div className="post-card-actions">
        <Button asChild variant="outline" className="rounded-full px-5">
          <Link to="/$lang/blog/$slug" params={{ lang: language, slug: post.slug }}>
            {copy.readArticle}
            <ArrowRight className="btn-arrow rtl:-scale-x-100" />
          </Link>
        </Button>
      </div>
    </article>
  )
}
