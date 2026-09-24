import { CF_BEACON_SRC, beaconAllowedOn, beaconConfig } from '#/shared/web-analytics'
import { fetchBeaconToken } from './server/beacon'

/**
 * Cloudflare Web Analytics' cookieless beacon, on public pages only
 * (`src/shared/web-analytics.ts`). Renders nothing without a token.
 *
 * It is server-rendered with the page's CSP nonce, so the browser runs it
 * once per full page load; Cloudflare's beacon follows in-site navigation on
 * its own. Nothing here reaches the Dashboard: it is only mounted by the
 * public `/$lang` layout.
 */
export function CloudflareBeacon({
  token,
  pathname,
  nonce,
}: {
  token: string | null
  pathname: string
  nonce?: string
}) {
  if (!token || !beaconAllowedOn(pathname)) return null

  // Cloudflare's own snippet, as the dashboard hands it out: a module script (deferred by nature).
  return <script type="module" src={CF_BEACON_SRC} data-cf-beacon={beaconConfig(token)} nonce={nonce} />
}

/*
 * The token cannot change while a tab is open, so the browser asks for it at
 * most once — and not at all after the first page, whose server render
 * already carried it (`rememberBeaconToken`).
 */
let known: Promise<string | null> | undefined

export const loadBeaconToken = (): Promise<string | null> => {
  if (typeof window === 'undefined') return fetchBeaconToken()

  known ??= fetchBeaconToken().catch(() => {
    known = undefined

    return null
  })

  return known
}

export const rememberBeaconToken = (token: string | null): void => {
  if (typeof window !== 'undefined') known ??= Promise.resolve(token)
}
