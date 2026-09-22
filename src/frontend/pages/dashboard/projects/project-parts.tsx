import { ImageOff } from 'lucide-react'
import {
  type Language,
  LANGUAGES,
  type ProjectState,
  STATE_WORDS,
} from '#/backend2/contracts/project.contract'
import { StatusChip, type Tone } from '#/frontend/dashboard/primitives'
import { cn } from '#/frontend/lib/utils'

/**
 * The small pieces the list and the editor both draw, kept in one file so the
 * two screens cannot end up describing the same project differently.
 */

const STATE_TONE: Record<ProjectState, Tone> = {
  draft: 'outline',
  published: 'blue',
  published_with_pending_changes: 'ink',
  unpublished: 'grey',
  archived: 'grey',
}

/**
 * A status never rests on colour alone — the approved rule for the whole
 * dashboard, and the reason this is a word with a tone behind it rather than
 * the coloured dot that was the alternative. The live state also carries a
 * green pip, so "on the site" has a shape as well as a word.
 */
export function StateBadge({ state, className }: { state: ProjectState; className?: string }) {
  return (
    <StatusChip tone={STATE_TONE[state]} className={className}>
      {state === 'published' ? (
        <span className="size-1.5 rounded-full bg-[var(--dash-live)]" aria-hidden="true" />
      ) : null}
      {STATE_WORDS[state].label}
    </StatusChip>
  )
}

/**
 * Which languages are finished, and which are not.
 *
 * Struck through rather than merely dimmed: publication needs all three, so
 * "what is still missing" is the most useful thing a row can say, and it has
 * to survive being read quickly.
 */
export function LanguageTicks({
  complete,
  className,
}: {
  complete: Language[]
  className?: string
}) {
  const missing = LANGUAGES.filter((language) => !complete.includes(language))

  return (
    <span
      className={cn('flex items-center gap-1', className)}
      aria-label={
        missing.length === 0
          ? 'Complete in all three languages'
          : `Still missing: ${missing.map((language) => language.toUpperCase()).join(', ')}`
      }
    >
      {LANGUAGES.map((language) => (
        <span
          key={language}
          aria-hidden="true"
          className={cn(
            'grid h-[18px] w-[22px] place-items-center rounded text-[10px] font-bold uppercase',
            complete.includes(language)
              ? 'bg-[var(--dash-blue-tint)] text-[var(--dash-blue-ink)]'
              : 'bg-[var(--dash-chip)] text-[var(--dash-quiet)] line-through opacity-70',
          )}
        >
          {language}
        </span>
      ))}
    </span>
  )
}

/**
 * The cover, or an honest gap where one is not chosen yet.
 *
 * `loading="lazy"` because the list is paged but the images are private
 * routes, and twenty of them at once is twenty authenticated requests.
 */
export function Cover({
  url,
  alt = '',
  className,
}: {
  url: string | null
  alt?: string
  className?: string
}) {
  if (!url) {
    return (
      <span
        className={cn(
          'grid shrink-0 place-items-center rounded-[8px] border border-dashed border-[var(--dash-line)] text-[var(--dash-quiet)]',
          className,
        )}
        aria-label="No cover image"
      >
        <ImageOff className="size-3.5" aria-hidden="true" />
      </span>
    )
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={cn(
        'shrink-0 rounded-[8px] border border-[var(--dash-line)] bg-[var(--dash-furniture)] object-cover',
        className,
      )}
    />
  )
}

/** One skeleton row, shaped like the real one so nothing jumps on arrival. */
export function RowSkeleton() {
  return (
    <li className="flex items-center gap-3 border-b border-[var(--dash-line)] px-4 py-3 last:border-0">
      <span className="dash-skeleton h-3 w-4 rounded" />
      <span className="dash-skeleton h-12 w-[76px] rounded-[8px]" />
      <span className="flex flex-1 flex-col gap-1.5">
        <span className="dash-skeleton h-3.5 w-40 rounded" />
        <span className="dash-skeleton h-2.5 w-56 rounded" />
      </span>
      <span className="dash-skeleton hidden h-[18px] w-[74px] rounded lg:block" />
      <span className="dash-skeleton h-8 w-20 rounded" />
    </li>
  )
}

/**
 * A failure the owner can act on.
 *
 * `docs/v2/media.md` and the dashboard's own voice: errors say what happened
 * and what to do, and they do not apologise. The retry is the point of the
 * component, so it is always offered.
 */
export function LoadFailure({
  title,
  message,
  onRetry,
}: {
  title: string
  message: string
  onRetry: () => void
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 p-8">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="max-w-[52ch] text-[13px] text-[var(--dash-quiet)]">{message}</p>
      <button type="button" className="dash-btn dash-btn-quiet" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}

/** The sentence under a state chip, for the one place that explains itself. */
export const stateMeaning = (state: ProjectState): string => STATE_WORDS[state].meaning
