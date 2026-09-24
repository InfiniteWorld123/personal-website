import { createFileRoute } from '@tanstack/react-router'
import { getBookingCopy } from '#/frontend/features/booking/booking-copy'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { typesPageV2 } from '#/frontend/pages/public/booking/v2/lazy'

export const Route = createFileRoute('/$lang/booking/')({
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage

    return buildHead({ language, path: '/booking', ...getBookingCopy(language).meta })
  },
  // Backend2's booking pages (`docs/v2/public-cutover.md`, step 5), in their own chunk.
  loader: async () => {
    await typesPageV2.preload()
  },
  component: BookingTypesRoute,
})

function BookingTypesRoute() {
  return <typesPageV2.Page />
}
