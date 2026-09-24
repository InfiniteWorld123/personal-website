import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'

/**
 * Which backend the public booking pages talk to (`docs/v2/public-cutover.md`,
 * step 5), decided on the server from `PUBLIC_V2_MODULES`.
 *
 * The answer only chooses which public endpoints the pages call. It is not a
 * security boundary: each endpoint — legacy `/api/booking` or Backend2's
 * `/api/v2/public/booking` — enforces its own rules, and the V2 ones answer
 * only where a V2 database is configured.
 */
export const fetchBookingSource = createServerFn({ method: 'GET' }).handler(async (): Promise<{ v2: boolean }> => {
  const { readsFromV2 } = await import('#/backend2/public-source')

  return { v2: readsFromV2('booking') }
})

/**
 * For the parts of the site that invite rather than book — the home band, the
 * line under the hero, the card on the contact page. A setting that changes
 * only with a deployment's environment is never refetched on its own.
 */
export const bookingSourceQuery = () =>
  queryOptions({
    queryKey: ['public-source', 'booking'],
    queryFn: () => fetchBookingSource(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
