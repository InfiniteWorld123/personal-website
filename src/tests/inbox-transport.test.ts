import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveInboxTransport, type OutgoingEmail } from '#/backend2/modules/inbox/inbox.transport'

const email: OutgoingEmail = { from: 'QA <qa@example.com>', to: 'test@example.com', replyTo: 'qa@example.com', subject: 'Local test', text: 'Sample', html: '<p>Sample</p>', headers: {}, attachments: [], idempotencyKey: 'qa-unique-message' }
const transport = () => resolveInboxTransport({ INBOX_SEND_MODE: 'live', RESEND_API_KEY: 're_test_only' })
afterEach(() => vi.unstubAllGlobals())

describe('provider outcome classification (mocked HTTP only)', () => {
  it.each(['TimeoutError', 'TypeError'])('marks a %s as unknown instead of asserting nothing was sent', async (name) => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('Interrupted'), { name })))
    expect(await transport().send(email)).toMatchObject({ ok: false, provider: 'resend', uncertain: true })
  })

  it.each([500, 503, 409])('marks provider HTTP %s as uncertain', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })))
    expect(await transport().send(email)).toMatchObject({ ok: false, uncertain: true })
  })

  it.each(['{}', 'null', '{"id":""}', 'not json'])('does not claim acceptance without an ID: %s', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })))
    expect(await transport().send(email)).toMatchObject({ ok: false, uncertain: true })
  })

  it('confirms a valid success and reuses the stable idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"id":"provider-id"}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await transport().send(email)).toEqual({ ok: true, provider: 'resend', providerMessageId: 'provider-id' })
    expect(fetchMock.mock.calls[0][1].headers['idempotency-key']).toBe(email.idempotencyKey)
  })
})
