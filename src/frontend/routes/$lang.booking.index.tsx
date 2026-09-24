import { createFileRoute } from '@tanstack/react-router'
import { getBookingCopy } from '#/frontend/features/booking/booking-copy'
import { fetchBookingSource } from '#/frontend/features/booking/server/booking-source'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { BookingTypesPage } from '#/frontend/pages/public/booking/BookingTypesPage'
import { typesPageV2 } from '#/frontend/pages/public/booking/v2/lazy'

export const Route = createFileRoute('/$lang/booking/')({
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage

    return buildHead({ language, path: '/booking', ...getBookingCopy(language).meta })
  },
  // Legacy or Backend2 (`docs/v2/public-cutover.md`, step 5), decided by the server.
  loader: async () => {
    const source = await fetchBookingSource()

    if (source.v2) await typesPageV2.preload()

    return source
  },
  component: BookingTypesRoute,
})

function BookingTypesRoute() {
  return Route.useLoaderData().v2 ? <typesPageV2.Page /> : <BookingTypesPage />
}
