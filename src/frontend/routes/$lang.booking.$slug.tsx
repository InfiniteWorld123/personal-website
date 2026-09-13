import { createFileRoute } from '@tanstack/react-router'
import { getBookingCopy } from '#/frontend/features/booking/booking-copy'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { BookingFlowPage } from '#/frontend/pages/public/booking/BookingFlowPage'

export const Route = createFileRoute('/$lang/booking/$slug')({
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage

    return buildHead({
      language,
      path: `/booking/${params.slug}`,
      ...getBookingCopy(language).meta,
    })
  },
  component: BookingFlowRoute,
})

function BookingFlowRoute() {
  return <BookingFlowPage slug={Route.useParams().slug} />
}
