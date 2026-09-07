import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '#/frontend/components/ui/card'
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
    <Card
      data-reveal
      className="surface-card surface-card-hover flex min-w-0 flex-col rounded-[1.75rem] border-border/50 bg-card py-0"
    >
      <CardHeader className="gap-2 px-7 pt-7 pb-3">
        <CardDescription className="tabular text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-primary/70 rtl:tracking-normal">
          {fromLabel} {formatEuro(servicePrices[slug], language)}
        </CardDescription>
        <CardTitle className="mt-2 text-[1.45rem] leading-snug text-foreground">{copy.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 px-7 pb-6">
        <p className="m-0 text-sm leading-7 text-foreground/58">{copy.short}</p>
      </CardContent>
      <CardFooter className="rounded-b-[1.75rem] border-t border-border/30 bg-muted/25 px-7 py-5">
        <Button
          asChild
          variant="outline"
          className="btn-glow-outline rounded-full border-border/50 bg-card px-4 text-foreground/68 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
        >
          <Link to="/$lang/services" params={{ lang: language }} hash={slug}>
            {moreLabel}
            <ArrowRight className="rtl:-scale-x-100" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
