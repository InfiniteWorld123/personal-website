import { Eye, Heart } from 'lucide-react'
import { getContent } from '#/frontend/content'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { cn } from '#/frontend/lib/utils'
import { usePostEngagement } from './post-engagement'

/**
 * How many people read this, and whether you liked it.
 *
 * "Reads", never "readers": nothing records who opened the article, so the
 * figure counts openings and the word has to say so. Both numbers are grouped
 * by the reader's own locale, because 1.204 and 1,204 are the same number to a
 * German and a different one to everybody else.
 */
export function PostEngagement({
  source = 'legacy',
  slug,
  viewCount,
  likeCount,
}: {
  /** Which backend counts this article's reads and likes. */
  source?: 'legacy' | 'v2'
  slug: string
  viewCount: number
  likeCount: number
}) {
  const { language } = useLanguage()
  const { blog } = getContent(language)
  const engagement = usePostEngagement(slug, { viewCount, likeCount }, source)

  const count = (value: number) => new Intl.NumberFormat(language).format(value)

  /**
   * The right form of the noun, then the number inside it.
   *
   * `1 Aufrufe` and `1 reads` are both wrong, and a language whose rule is not
   * one-versus-many — Arabic has six categories — should not be served by a
   * hand-written `=== 1`. `Intl.PluralRules` decides, and anything that is not
   * `one` falls to the general form, which is the form that carries `{count}`.
   */
  const plural = (one: string, other: string, value: number) =>
    (new Intl.PluralRules(language).select(value) === 'one' ? one : other).replace(
      '{count}',
      count(value),
    )

  return (
    <div className="post-engagement">
      <p className="post-engagement-reads">
        <Eye aria-hidden="true" className="size-4" />
        {plural(blog.readsOne, blog.reads, engagement.viewCount)}
      </p>

      <button
        type="button"
        onClick={engagement.toggleLike}
        // The button announces the act, the figure beside it announces the
        // total. Without this a screen reader hears only a number changing.
        aria-pressed={engagement.liked}
        className={cn('post-like', engagement.liked && 'is-liked')}
      >
        <Heart
          aria-hidden="true"
          className="size-4"
          // Filled once you have pressed it — the one bit of state on this
          // page that belongs to you rather than to everyone.
          fill={engagement.liked ? 'currentColor' : 'none'}
        />
        <span>{engagement.liked ? blog.liked : blog.like}</span>
        {/*
          Shown as a bare number beside the verb, because that is how it reads
          — but a screen reader would hear "Like this, 12", which is a number
          attached to nothing. The label says what the twelve are.
        */}
        <span
          aria-label={plural(blog.likesOne, blog.likes, engagement.likeCount)}
          className="post-like-count"
        >
          {count(engagement.likeCount)}
        </span>
      </button>
    </div>
  )
}
