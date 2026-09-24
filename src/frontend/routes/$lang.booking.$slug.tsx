import { createFileRoute } from '@tanstack/react-router'
import { getBookingCopy } from '#/frontend/features/booking/booking-copy'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { flowPageV2 } from '#/frontend/pages/public/booking/v2/lazy'

/**
 * `?slot=` carries a time the visitor already picked elsewhere — the line
 * under the hero, the band on the home page — so the calendar opens on that
 * day with that time selected instead of asking the same question twice.
 *
 * Anything unparseable is dropped rather than rejected: a hand-edited or
 * expired link has to land on a working calendar, never on an error page. The
 * flow itself only honours the value if the slot is still free.
 */
export const Route = createFileRoute('/$lang/booking/$slug')({
  validateSearch: (search: Record<string, unknown>): { slot?: string } => {
    const slot = search.slot

    return typeof slot === 'string' && !Number.isNaN(Date.parse(slot)) ? { slot } : {}
  },
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage

    return buildHead({
      language,
      path: `/booking/${params.slug}`,
      ...getBookingCopy(language).meta,
    })
  },
  loader: async () => {
    await flowPageV2.preload()
  },
  component: BookingFlowRoute,
})

function BookingFlowRoute() {
  const { slug } = Route.useParams()
  const { slot } = Route.useSearch()

  return <flowPageV2.Page slug={slug} slot={slot} />
}
