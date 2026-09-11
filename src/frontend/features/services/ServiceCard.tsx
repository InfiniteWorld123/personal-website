import { Link } from '@tanstack/react-router'
import { ArrowRight, AppWindow, Globe2, ShoppingBag } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '#/frontend/components/ui/card'
import type { ServiceCopy, ServiceSlug } from '#/frontend/content/types'
import type { Language } from '#/frontend/i18n/language'
import { useTilt } from '#/frontend/motion'

/**
 * One service line as it appears on the home page. The name comes from the
 * service itself; the description is the home page's own card copy, so
 * `/services` can keep its longer summary. Pricing intentionally stays on
 * `/services`, after the visitor has understood the offer and seen proof.
 */
export function ServiceCard({
  slug,
  copy,
  description,
  language,
  moreLabel,
}: {
  slug: ServiceSlug
  copy: Pick<ServiceCopy, 'name'>
  description: string
  language: Language
  moreLabel: string
}) {
  const tilt = useTilt<HTMLDivElement>()

  return (
    <Card
      data-reveal
      data-tilt
      ref={tilt}
      className="surface-card surface-card-hover flex min-w-0 flex-col rounded-[1.75rem] border-border/50 bg-card py-0"
    >
      <CardHeader className="gap-2 px-7 pt-7 pb-3">
        <CardDescription className="service-symbol" aria-hidden="true">
          {slug === 'software' ? <AppWindow /> : slug === 'websites' ? <Globe2 /> : <ShoppingBag />}
        </CardDescription>
        <CardTitle className="mt-2 text-[1.45rem] leading-snug text-foreground">{copy.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 px-7 pb-6">
        <p className="m-0 text-sm leading-7 text-foreground/58">{description}</p>
      </CardContent>
      <CardFooter className="rounded-b-[1.75rem] border-t border-border/30 bg-muted/25 px-7 py-5">
        <Button
          asChild
          variant="outline"
          className="rounded-full border-border/50 bg-card px-4 text-foreground/68 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
        >
          <Link to="/$lang/services" params={{ lang: language }} hash={slug}>
            {moreLabel}
            <ArrowRight className="btn-arrow rtl:-scale-x-100" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
