import { createHmac } from 'node:crypto'
import PostalMime from 'postal-mime'
import { describe, expect, it } from 'vitest'
import {
  buildPayload,
  type DeliveryEnv,
  deliver,
  type IncomingMessage,
  type ParsedMail,
  tailOfIds,
  V2_LIMITS,
} from '../../workers/inbound-email/src/deliver'

/**
 * The inbound mail Worker, without Cloudflare.
 *
 * What matters is what can never happen: a letter lost because the V2 Inbox
 * was down, a letter refused although the owner's mailbox already has it, or
 * a signature the site would not accept. `backend2-inbox.test.ts` runs the
 * same `deliver` against the real ingress route.
 */

const SECRET = 'test-only-inbox-ingress-secret-0123456789'

const env = (over: Partial<DeliveryEnv> = {}): DeliveryEnv => ({
  FORWARD_COPY_TO: 'owner@example.com',
  INBOX_V2_ENDPOINT: 'https://site.example/api/v2/inbound-email',
  INBOX_INGRESS_SECRET: SECRET,
  ...over,
})

const RAW = [
  'From: "Anna Client" <anna@example.com>',
  'To: info@yamanwarda.de',
  'Subject: Re: Offer',
  'Message-ID: <answer-1@example.com>',
  'In-Reply-To: <sent-1@yamanwarda.de>',
  'References: <first@example.com> <sent-1@yamanwarda.de>',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Thanks, that works.',
  '',
].join('\r\n')

type Events = string[]

const fakeMessage = (
  events: Events,
  options: { forwardFails?: boolean; headers?: Record<string, string>; raw?: string; envelopeFrom?: string } = {},
) => {
  const headers = new Headers(
    options.headers ?? {
      'message-id': '<answer-1@example.com>',
      'in-reply-to': '<sent-1@yamanwarda.de>',
      references: '<first@example.com> <sent-1@yamanwarda.de>',
      subject: 'Re: Offer',
    },
  )
  const state = { rejected: null as string | null, forwardedTo: null as string | null }
  const message: IncomingMessage = {
    from: options.envelopeFrom ?? 'bounce-123@mailer.example',
    to: 'info@yamanwarda.de',
    headers,
    raw: new Blob([options.raw ?? RAW]).stream(),
    forward: async (to) => {
      events.push('forward')

      if (options.forwardFails) throw new Error('destination not verified')

      state.forwardedTo = to
    },
    setReject: (reason) => {
      events.push('reject')
      state.rejected = reason
    },
  }

  return { message, state }
}

type Call = { url: string; headers: Record<string, string>; body: string }

const network = (events: Events, statuses: Array<number | 'throw'>) => {
  const calls: Call[] = []
  let v2Index = 0

  const fetch = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url, headers: init.headers, body: init.body })

    events.push('post-v2')
    const status = statuses[Math.min(v2Index, statuses.length - 1)]!

    v2Index += 1

    if (status === 'throw') throw new Error('connection reset')

    return { ok: status >= 200 && status < 300, status }
  }

  return { fetch, calls }
}

const parse = async (raw: ArrayBuffer): Promise<ParsedMail> => {
  const parsed = await PostalMime.parse(raw)

  return parsed
}

const run = async (
  options: {
    env?: DeliveryEnv
    statuses?: Array<number | 'throw'>
    forwardFails?: boolean
    parse?: (raw: ArrayBuffer) => Promise<ParsedMail>
  } = {},
) => {
  const events: Events = []
  const { message, state } = fakeMessage(events, { forwardFails: options.forwardFails })
  const net = network(events, options.statuses ?? [200])
  let clock = 1_790_000_000_000
  const sleeps: number[] = []

  const result = await deliver(message, options.env ?? env(), {
    parse: async (raw) => {
      events.push('parse')

      return (options.parse ?? parse)(raw)
    },
    fetch: net.fetch,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds)
      clock += milliseconds
    },
    now: () => clock,
  })

  return { result, events, state, calls: net.calls, sleeps }
}

const expectedV2Signature = (call: Call) =>
  createHmac('sha256', SECRET).update(`${call.headers['x-inbox-timestamp']}.${call.body}`).digest('hex')

describe('every letter reaches the owner’s mailbox first', () => {
  it('forwards before parsing, then posts a signed letter to the V2 Inbox', async () => {
    const { result, events, state, calls } = await run()

    expect(events).toEqual(['forward', 'parse', 'post-v2'])
    expect(state.forwardedTo).toBe('owner@example.com')
    expect(state.rejected).toBeNull()
    expect(result).toMatchObject({ forwarded: 'forwarded', v2: { status: 200, taken: true, attempts: 1 } })

    const [call] = calls

    expect(call!.url).toBe('https://site.example/api/v2/inbound-email')
    expect(call!.headers['x-inbox-timestamp']).toBe('1790000000')
    expect(call!.headers['x-inbox-signature']).toBe(expectedV2Signature(call!))
    expect(call!.headers['x-inbound-signature']).toBeUndefined()
  })

  it('carries the threading headers and the header sender, not the bounce address', async () => {
    const { calls } = await run()
    const letter = JSON.parse(calls[0]!.body)

    expect(letter).toMatchObject({
      to: ['info@yamanwarda.de'],
      from: 'anna@example.com',
      fromName: 'Anna Client',
      subject: 'Re: Offer',
      messageId: '<answer-1@example.com>',
      inReplyTo: '<sent-1@yamanwarda.de>',
      references: '<first@example.com> <sent-1@yamanwarda.de>',
      files: [],
      omittedFiles: [],
    })
    expect(letter.text.trim()).toBe('Thanks, that works.')
  })
})

describe('when the V2 Inbox cannot take the letter', () => {
  it('retries a server error with a fresh timestamp, and files it once it answers', async () => {
    const { result, calls, sleeps, state } = await run({ statuses: [503, 'throw', 200] })

    expect(result.v2).toEqual({ status: 200, taken: true, attempts: 3 })
    expect(sleeps).toEqual([1000, 4000])
    expect(calls.map((call) => call.headers['x-inbox-timestamp'])).toEqual(['1790000000', '1790000001', '1790000005'])
    // Every attempt is signed for its own timestamp, over the same letter.
    for (const call of calls) expect(call.headers['x-inbox-signature']).toBe(expectedV2Signature(call))
    expect(new Set(calls.map((call) => call.body)).size).toBe(1)
    expect(state.rejected).toBeNull()
  })

  it('gives up after three attempts and never refuses a letter that was forwarded', async () => {
    const { result, state } = await run({ statuses: [500] })

    expect(result).toMatchObject({ forwarded: 'forwarded', v2: { status: 500, taken: false, attempts: 3 }, rejected: false })
    expect(state.rejected).toBeNull()
  })

  it('does not retry a refusal that will not change (a 4xx, or the old site’s 403/404)', async () => {
    for (const status of [400, 401, 403, 404]) {
      const { result, state } = await run({ statuses: [status] })

      expect(result.v2).toEqual({ status, taken: false, attempts: 1 })
      expect(state.rejected).toBeNull()
    }
  })

  it('refuses the letter only when nobody took it', async () => {
    const lost = await run({ forwardFails: true, statuses: [503] })

    expect(lost.result).toMatchObject({ forwarded: 'failed', rejected: true })
    expect(lost.state.rejected).toMatch(/temporarily unavailable/u)

    const saved = await run({ forwardFails: true, statuses: [200] })

    expect(saved.result).toMatchObject({ forwarded: 'failed', rejected: false })
    expect(saved.state.rejected).toBeNull()
  })

  it('still forwards, and refuses nothing, when the V2 Inbox is not configured', async () => {
    const { result, events } = await run({ env: env({ INBOX_V2_ENDPOINT: '', INBOX_INGRESS_SECRET: '' }) })

    expect(events).toEqual(['forward'])
    expect(result).toMatchObject({ forwarded: 'forwarded', v2: null, rejected: false })
  })

  it('refuses when there is nowhere at all to put it', async () => {
    const { result } = await run({ env: {} })

    expect(result).toMatchObject({ forwarded: 'off', rejected: true })
  })

  it('posts from the headers alone when the letter cannot be parsed', async () => {
    const { result, calls } = await run({
      parse: async () => {
        throw new Error('broken MIME')
      },
    })
    const letter = JSON.parse(calls[0]!.body)

    expect(result.v2?.taken).toBe(true)
    expect(letter).toMatchObject({
      from: 'bounce-123@mailer.example',
      subject: 'Re: Offer',
      messageId: '<answer-1@example.com>',
      references: '<first@example.com> <sent-1@yamanwarda.de>',
      text: '',
    })
  })
})

describe('what the V2 schema accepts', () => {
  const message = (headers: Record<string, string> = {}) => fakeMessage([], { headers }).message

  it('keeps the newest ids of a long References header, cut at an id', () => {
    const ids = Array.from({ length: 2000 }, (_, index) => `<id-${index}@example.com>`).join(' ')
    const tail = tailOfIds(ids, V2_LIMITS.references)

    expect(tail.length).toBeLessThanOrEqual(V2_LIMITS.references)
    expect(tail.startsWith('<id-')).toBe(true)
    expect(tail.endsWith('<id-1999@example.com>')).toBe(true)
    expect(tailOfIds('  <a@b>  ', 100)).toBe('<a@b>')
  })

  it('clamps the text, the HTML and an overlong Message-ID', () => {
    const { body } = buildPayload(message({ 'message-id': `<${'x'.repeat(2000)}@example.com>` }), {
      text: 't'.repeat(3_000_000),
      html: 'h'.repeat(3_000_000),
      subject: 's'.repeat(5000),
    })
    const letter = JSON.parse(body)

    expect(letter.text).toHaveLength(V2_LIMITS.text)
    expect(letter.html).toHaveLength(V2_LIMITS.html)
    expect(letter.subject).toHaveLength(V2_LIMITS.subject)
    expect(letter.messageId).toBe('')
  })

  it('names the files it could not carry instead of dropping them silently', () => {
    const file = (name: string, megabytes: number) => ({
      filename: name,
      mimeType: 'application/pdf',
      disposition: 'attachment',
      content: new ArrayBuffer(megabytes * 1024 * 1024),
    })
    const payload = buildPayload(message(), {
      attachments: [file('a.pdf', 9), file('huge.pdf', 11), file('b.pdf', 9), file('c.pdf', 9), file('d.pdf', 1)],
    })
    const letter = JSON.parse(payload.body)

    expect(letter.files.map((carried: { filename: string }) => carried.filename)).toEqual(['a.pdf', 'b.pdf', 'd.pdf'])
    expect(letter.omittedFiles).toEqual([
      { filename: 'huge.pdf', contentType: 'application/pdf', byteSize: 11 * 1024 * 1024, reason: 'too-large' },
      { filename: 'c.pdf', contentType: 'application/pdf', byteSize: 9 * 1024 * 1024, reason: 'letter-too-large' },
    ])
    expect(payload).toMatchObject({ files: 3, omitted: 2 })
    expect(new TextEncoder().encode(payload.body).byteLength).toBeLessThanOrEqual(V2_LIMITS.bodyBytes)
  })

  it('stays under the body limit when the text and HTML leave less room', () => {
    const file = (name: string) => ({
      filename: name,
      mimeType: 'image/jpeg',
      disposition: 'attachment',
      content: new ArrayBuffer(6 * 1024 * 1024),
    })
    // Three bytes a character in UTF-8, and six once JSON escapes a control
    // character: 9 MB of letter before a single file.
    const payload = buildPayload(message(), {
      text: '中'.repeat(1_000_000),
      html: '\u0001'.repeat(1_000_000),
      attachments: [file('1.jpg'), file('2.jpg'), file('3.jpg')],
    })

    // 18 MB of files is within the 20 MB the Worker carries, but not beside that letter.
    expect(payload).toMatchObject({ files: 2, omitted: 1 })
    expect(new TextEncoder().encode(payload.body).byteLength).toBeLessThanOrEqual(V2_LIMITS.bodyBytes)
  })

  it('carries at most thirty files', () => {
    const payload = buildPayload(message(), {
      attachments: Array.from({ length: 35 }, (_, index) => ({
        filename: `${index}.txt`,
        mimeType: 'text/plain',
        disposition: 'attachment',
        content: new Uint8Array([1, 2, 3]),
      })),
    })

    expect(payload).toMatchObject({ files: 30, omitted: 5 })
  })
})
