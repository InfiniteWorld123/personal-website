import { createFileRoute } from '@tanstack/react-router'
import { getBookingCopy } from '#/frontend/features/booking/booking-copy'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { BookingTypesPage } from '#/frontend/pages/public/booking/BookingTypesPage'

export const Route = createFileRoute('/$lang/booking/')({
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage

    return buildHead({ language, path: '/booking', ...getBookingCopy(language).meta })
  },
  component: BookingTypesPage,
})
