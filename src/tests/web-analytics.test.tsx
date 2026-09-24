import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getContent } from '#/frontend/content'
import { applyPrivacyV2 } from '#/frontend/content/privacy-v2'
import { beaconAllowedOn, webAnalyticsToken } from '#/shared/web-analytics'

/**
 * Cloudflare Web Analytics on the public site (`docs/v2/analytics.md`): a
 * cookieless beacon on public pages only, and only while
 * `CF_WEB_ANALYTICS_TOKEN` is set. Unset, nothing changes.
 */

const { buildContentSecurityPolicy } = await import('#/start')
const { CloudflareBeacon } = await import('#/frontend/features/web-analytics/CloudflareBeacon')

const TOKEN = '0123456789abcdef0123456789abcdef'

describe('the beacon switch', () => {
  it('is on only with a token that looks like one', () => {
    expect(webAnalyticsToken({})).toBeNull()
    expect(webAnalyticsToken({ CF_WEB_ANALYTICS_TOKEN: '   ' })).toBeNull()
    expect(webAnalyticsToken({ CF_WEB_ANALYTICS_TOKEN: `"><script>` })).toBeNull()
    expect(webAnalyticsToken({ CF_WEB_ANALYTICS_TOKEN: ` ${TOKEN} ` })).toBe(TOKEN)
  })

  it('never reaches the Dashboard, the admin, the API or a private booking link', () => {
    for (const path of ['/de', '/en/work/some-project', '/ar/blog', '/de/booking', '/en/booking/intro-call', '/de/datenschutz']) {
      expect(beaconAllowedOn(path), path).toBe(true)
    }

    for (const path of [
      '/dashboard',
      '/dashboard/analytics',
      '/dashboard_/login',
      '/admin',
      '/admin/inbox',
      '/api/v2/owner/analytics/overview',
      '/de/booking/manage/REF-123',
      '/en/booking/room/REF-123',
      '/DE/Booking/Manage/REF-123',
    ]) {
      expect(beaconAllowedOn(path), path).toBe(false)
    }
  })

  it('renders the script with the page nonce, and nothing without a token or on a private page', () => {
    expect(renderToStaticMarkup(<CloudflareBeacon token={null} pathname="/de" nonce="n1" />)).toBe('')
    expect(renderToStaticMarkup(<CloudflareBeacon token={TOKEN} pathname="/dashboard" nonce="n1" />)).toBe('')
    expect(renderToStaticMarkup(<CloudflareBeacon token={TOKEN} pathname="/de/booking/manage/X" />)).toBe('')

    const html = renderToStaticMarkup(<CloudflareBeacon token={TOKEN} pathname="/en/work" nonce="n1" />)

    expect(html).toBe(
      `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon="{&quot;token&quot;:&quot;${TOKEN}&quot;}" nonce="n1"></script>`,
    )
  })
})

describe('the content security policy', () => {
  it('is exactly today’s without a token', () => {
    const policy = buildContentSecurityPolicy('n', {})

    expect(policy).toContain("script-src 'self' 'nonce-n' https://challenges.cloudflare.com;")
    expect(policy).toContain("connect-src 'self' https://challenges.cloudflare.com;")
    expect(policy).not.toContain('cloudflareinsights')
  })

  it('allows the beacon and its reports only while the token is set', () => {
    const policy = buildContentSecurityPolicy('n', { CF_WEB_ANALYTICS_TOKEN: TOKEN })

    expect(policy).toContain(
      "script-src 'self' 'nonce-n' https://challenges.cloudflare.com https://static.cloudflareinsights.com;",
    )
    expect(policy).toContain("connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com;")
    expect(buildContentSecurityPolicy('n', { CF_WEB_ANALYTICS_TOKEN: 'bad token' })).not.toContain('cloudflareinsights')
  })
})

describe('the privacy page', () => {
  it.each(['de', 'en', 'ar'] as const)('mentions Cloudflare Web Analytics only while it is on (%s)', (language) => {
    const today = getContent(language).legal.privacy
    const off = applyPrivacyV2(today, language)
    const on = applyPrivacyV2(today, language, { webAnalytics: true })

    expect(JSON.stringify(off)).not.toContain('Cloudflare Web Analytics')
    expect(on.sections).toHaveLength(off.sections.length + 1)

    const added = on.sections.find((section) => section.title.includes('Cloudflare Web Analytics'))!

    expect(added.body).toMatch(/cookie|ملفات ارتباط/iu)
    // Right after the cookie section, before what does not happen.
    expect(on.sections.indexOf(added)).toBe(9)
  })
})
