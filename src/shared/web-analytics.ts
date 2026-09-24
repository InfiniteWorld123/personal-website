/**
 * Cloudflare Web Analytics on the public site (`docs/v2/analytics.md`,
 * approved by the owner on 24 Sep 2026): a cookieless beacon, on public
 * pages only, and only while `CF_WEB_ANALYTICS_TOKEN` is set. Unset, the site
 * behaves exactly as it did before — no script, no extra CSP origin.
 *
 * Pure and dependency-free, so the request middleware (`src/start.ts`), the
 * public layout and the tests all read the same rule.
 */

export const CF_BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js'
/** Where the beacon script is loaded from (CSP `script-src`). */
export const CF_BEACON_SCRIPT_ORIGIN = 'https://static.cloudflareinsights.com'
/** Where the beacon reports page loads (CSP `connect-src`). */
export const CF_BEACON_REPORT_ORIGIN = 'https://cloudflareinsights.com'

/**
 * The site's beacon token, or `null`. The token is public by design — it is
 * printed in every page — but it still has to look like one: it lands inside
 * an HTML attribute, and a malformed value must not switch anything on.
 */
export const webAnalyticsToken = (
  environment: Record<string, string | undefined> = process.env,
): string | null => {
  const token = environment.CF_WEB_ANALYTICS_TOKEN?.trim()

  return token && /^[A-Za-z0-9_-]{16,64}$/u.test(token) ? token : null
}

/**
 * Whether a path may carry the beacon: public pages only. Never the private
 * Dashboard, the retired `/admin` address (a 404 now, kept out of the
 * figures), the API, a booking's private manage link or its video room — the
 * last two carry a private reference in the address.
 */
export const beaconAllowedOn = (pathname: string): boolean => {
  const path = pathname.toLowerCase()

  if (path === '/dashboard' || path.startsWith('/dashboard/') || path.startsWith('/dashboard_')) return false
  if (path === '/admin' || path.startsWith('/admin/')) return false
  if (path === '/api' || path.startsWith('/api/')) return false
  if (/^\/[a-z]{2}\/booking\/(manage|room)(\/|$)/u.test(path)) return false

  return true
}

/** The `data-cf-beacon` attribute value. `spa` stays Cloudflare's default. */
export const beaconConfig = (token: string): string => JSON.stringify({ token })
