import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getBookingCopy } from '#/frontend/features/booking/booking-copy'
import { fetchBookingSource } from '#/frontend/features/booking/server/booking-source'
import { readFragmentToken } from '#/frontend/features/booking/v2/api'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { site } from '#/frontend/content/site'
import { BookingManagePage } from '#/frontend/pages/public/booking/BookingManagePage'
import { managePageV2 } from '#/frontend/pages/public/booking/v2/lazy'

/**
 * The page the emailed link opens. Never indexed: the URL carries a token, and
 * a search engine following it would put a live cancel link in an index.
 */
export const Route = createFileRoute('/$lang/booking/manage/$reference')({
  // Not indexed, but still titled. The tab, the back button and every
  // bookmark a visitor makes of the link in their confirmation mail read from
  // `<title>`, and an empty one leaves them with the bare URL. The words are
  // the page's own heading rather than anything written for search.
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

    if (source.v2) await managePageV2.preload()

    return source
  },
  component: BookingManageRoute,
})

function BookingManageRoute() {
  const { reference } = Route.useParams()
  const { v2 } = Route.useLoaderData()
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    // Backend2's links carry the credential bare in the fragment (`#<credential>`).
    if (v2) {
      setToken(readFragmentToken(window.location.hash))

      return
    }

    const url = new URL(window.location.href)
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
    const legacyToken = url.searchParams.get('token')
    const found = hash.get('token') ?? legacyToken ?? ''

    if (legacyToken) {
      url.searchParams.delete('token')
      url.hash = `token=${encodeURIComponent(legacyToken)}`
      window.history.replaceState(window.history.state, '', url)
    }

    setToken(found)
  }, [v2])

  if (token === null) return null

  return v2 ? <managePageV2.Page reference={reference} token={token} /> : <BookingManagePage reference={reference} token={token} />
}
