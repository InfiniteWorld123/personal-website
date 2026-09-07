import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import type { ServiceCopy, ServiceSlug } from '#/frontend/content/types'
import { servicePrices } from '#/frontend/content/site'
import type { Language } from '#/frontend/i18n/language'
import { formatEuro } from '#/frontend/lib/format'

/**
 * One service line as it appears on the home page: name, entry price, one
 * sentence, and a link into the detail on `/services`.
 */
export function ServiceCard({
  slug,
  copy,
  language,
  fromLabel,
  moreLabel,
}: {
  slug: ServiceSlug
  copy: Pick<ServiceCopy, 'name' | 'short'>
  language: Language
  fromLabel: string
  moreLabel: string
}) {
  return (
    <article data-reveal className="flex flex-col gap-4 py-8 md:py-0 md:ps-8 md:first:ps-0">
      <div className="flex flex-col gap-1">
        <h3 className="font-heading text-display-sm">{copy.name}</h3>
        <p className="text-muted-foreground tabular text-sm">
          {fromLabel} {formatEuro(servicePrices[slug], language)}
        </p>
      </div>
      <p className="text-foreground/80 leading-relaxed">{copy.short}</p>
      <Link
        to="/$lang/services"
        params={{ lang: language }}
        hash={slug}
        className="text-primary mt-auto inline-flex w-fit items-center gap-1.5 text-sm font-medium hover:underline hover:underline-offset-4"
      >
        {moreLabel}
        <ArrowRight className="size-4 rtl:-scale-x-100" />
      </Link>
    </article>
  )
}
