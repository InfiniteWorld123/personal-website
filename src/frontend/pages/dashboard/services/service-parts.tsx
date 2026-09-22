import {
  LANGUAGES,
  type Language,
  type PublicServicePrice,
  SERVICE_STATE_WORDS,
  type ServiceState,
} from '#/backend2/contracts/service.contract'
import { StatusChip, type Tone } from '#/frontend/dashboard/primitives'
import { parseServiceBody, priceParts, PRICE_WORDS } from '#/frontend/features/services/service-display'
import { cn } from '#/frontend/lib/utils'

/**
 * The small pieces the Services list, editor and preview share, so no two of
 * them can describe one service differently. The same tones as Projects.
 */

const STATE_TONE: Record<ServiceState, Tone> = {
  draft: 'outline',
  published: 'blue',
  published_with_pending_changes: 'ink',
  unpublished: 'grey',
}

export function StateBadge({ state, className }: { state: ServiceState; className?: string }) {
  return (
    <StatusChip tone={STATE_TONE[state]} className={className}>
      {state === 'published' ? (
        <span className="size-1.5 rounded-full bg-[var(--dash-live)]" aria-hidden="true" />
      ) : null}
      {SERVICE_STATE_WORDS[state].label}
    </StatusChip>
  )
}

/** Struck through when missing: publication needs all three. */
export function LanguageTicks({ complete, className }: { complete: Language[]; className?: string }) {
  const missing = LANGUAGES.filter((language) => !complete.includes(language))

  return (
    <span
      className={cn('flex items-center gap-1', className)}
      role="img"
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

export function RowSkeleton() {
  return (
    <li className="flex items-center gap-3 border-b border-[var(--dash-line)] px-4 py-3 last:border-0">
      <span className="dash-skeleton h-3 w-4 rounded" />
      <span className="dash-skeleton size-7 rounded-[8px]" />
      <span className="flex flex-1 flex-col gap-1.5">
        <span className="dash-skeleton h-3.5 w-40 rounded" />
        <span className="dash-skeleton h-2.5 w-56 rounded" />
      </span>
      <span className="dash-skeleton h-8 w-28 rounded" />
    </li>
  )
}

export function LoadFailure({
  title,
  message,
  onRetry,
  retryLabel = 'Try again',
}: {
  title: string
  message: string
  onRetry: () => void
  retryLabel?: string
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 p-8">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="max-w-[52ch] text-[13px] text-[var(--dash-quiet)]">{message}</p>
      <button type="button" className="dash-btn dash-btn-quiet" onClick={onRetry}>
        {retryLabel}
      </button>
    </div>
  )
}

/**
 * One price as a visitor reads it, in their language. `withCaption` is the
 * service page's "einmalig" line — shown there only (approved choice 4A).
 */
export function PriceText({
  price,
  language,
  withCaption = false,
  className,
}: {
  price: PublicServicePrice | null
  language: Language
  withCaption?: boolean
  className?: string
}) {
  if (!price) return <span className="text-[var(--dash-quiet)] italic">Price not finished yet</span>

  const parts = priceParts(price, language)
  const words = PRICE_WORDS[language]

  return (
    <span className={cn('inline-flex flex-col gap-1', className)} dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language}>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {parts.label ? (
          <span className="rounded-full bg-[var(--dash-blue-tint)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[var(--dash-blue-ink)]">
            {parts.label}
          </span>
        ) : null}
        {parts.lead ? <span className="text-[0.8em] text-[var(--dash-quiet)]">{parts.lead}</span> : null}
        {parts.regular ? (
          <del className="text-[0.8em] text-[var(--dash-quiet)]">
            <span className="sr-only">{words.regular} </span>
            {parts.regular}
          </del>
        ) : null}
        <span className="dash-num font-semibold text-[var(--dash-brand)]">
          {parts.regular ? <span className="sr-only">{words.offer} </span> : null}
          {parts.amount}
        </span>
        {parts.period ? <span className="text-[0.8em] text-[var(--dash-quiet)]">{parts.period}</span> : null}
      </span>
      {withCaption && parts.caption ? (
        <span className="text-[12px] text-[var(--dash-quiet)]">{parts.caption}</span>
      ) : null}
    </span>
  )
}

/** The longer description, laid out the way the service page will. */
export function BodyView({ text, language }: { text: string; language: Language }) {
  const blocks = parseServiceBody(text)

  if (blocks.length === 0) return <p className="text-[13px] text-[var(--dash-quiet)] italic">Nothing written yet.</p>

  return (
    <div className="flex flex-col gap-3 text-[14px] leading-relaxed" dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language}>
      {blocks.map((block, index) =>
        block.type === 'h' ? (
          <h3 key={index} className="mt-1 text-[14.5px] font-semibold">
            {block.text}
          </h3>
        ) : block.type === 'ul' ? (
          <ul key={index} className="flex list-disc flex-col gap-1 ps-5 marker:text-[var(--dash-brand)]">
            {block.items.map((item, at) => (
              <li key={at}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={index}>{block.text}</p>
        ),
      )}
    </div>
  )
}

export const stateMeaning = (state: ServiceState): string => SERVICE_STATE_WORDS[state].meaning
