import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
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
  head: () => ({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] }),
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
