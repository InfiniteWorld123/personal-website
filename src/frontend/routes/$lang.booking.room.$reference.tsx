import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { site } from '#/frontend/content/site'
import { getBookingCopy } from '#/frontend/features/booking/booking-copy'
import { fetchBookingSource } from '#/frontend/features/booking/server/booking-source'
import { readFragmentToken } from '#/frontend/features/booking/v2/api'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { BookingRoomPage } from '#/frontend/pages/public/booking/BookingRoomPage'
import { roomPageV2 } from '#/frontend/pages/public/booking/v2/lazy'

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
  loader: async () => {
    const source = await fetchBookingSource()

    if (source.v2) await roomPageV2.preload()

    return source
  },
  component: BookingRoomRoute,
})

function BookingRoomRoute() {
  const { reference } = Route.useParams()
  const { v2 } = Route.useLoaderData()
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    if (v2) {
      setToken(readFragmentToken(window.location.hash))

      return
    }

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))

    setToken(hash.get('token') ?? '')
  }, [v2])

  if (token === null) return null

  return v2 ? <roomPageV2.Page reference={reference} token={token} /> : <BookingRoomPage reference={reference} token={token} />
}
