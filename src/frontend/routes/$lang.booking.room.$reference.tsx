import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { site } from '#/frontend/content/site'
import { getBookingCopy } from '#/frontend/features/booking/booking-copy'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { BookingRoomPage } from '#/frontend/pages/public/booking/BookingRoomPage'

/**
 * The room the emailed link opens, and never indexed for the reason the manage
 * page is not: the URL carries a live token.
 *
 * The token is read from the fragment, exactly as `manage` reads it. A
 * fragment is never sent to the server, so it appears in no access log, no
 * referrer header, and no analytics row.
 */
export const Route = createFileRoute('/$lang/booking/room/$reference')({
  // Titled for the same reason the manage page is, and indexed for none.
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage

    return {
      meta: [
        { title: `${getBookingCopy(language).manage.heading} · ${site.name}` },
        { name: 'robots', content: 'noindex, nofollow' },
      ],
    }
  },
  component: BookingRoomRoute,
})

function BookingRoomRoute() {
  const { reference } = Route.useParams()
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))

    setToken(hash.get('token') ?? '')
  }, [])

  if (token === null) return null

  return <BookingRoomPage reference={reference} token={token} />
}
