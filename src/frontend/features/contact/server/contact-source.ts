import { createServerFn } from '@tanstack/react-start'

/**
 * Which endpoint the Contact form posts to (`docs/v2/public-cutover.md`,
 * step 6), decided on the server from `PUBLIC_V2_MODULES`.
 *
 * It picks the form, not the rules: the legacy `/api/contact` and Backend2's
 * `/api/v2/public/contact` each validate, rate-limit and verify Turnstile on
 * their own, and the V2 one answers only where a V2 database is configured.
 */
export const fetchContactSource = createServerFn({ method: 'GET' }).handler(async (): Promise<{ v2: boolean }> => {
  const { readsFromV2 } = await import('#/backend2/public-source')

  return { v2: readsFromV2('contact') }
})
