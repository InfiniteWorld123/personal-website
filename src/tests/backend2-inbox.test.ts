import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryStore, createTestDatabase, pdfBytes, pngBytes } from './helpers/backend2-db'

/**
 * The Inbox, end to end, against a real PostgreSQL inside this process.
 *
 * What is under test is mostly that nothing happens by accident: an autosave
 * never sends, a double-click never sends twice, a reply is never filed under
 * the wrong conversation on the strength of a subject line, a forged or
 * replayed delivery is refused, and a file from a stranger never reaches the
 * Media library unless the owner puts it there.
 *
 * Every send goes to a fake transport. Nothing here can reach Resend.
 */
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
process.env.INBOX_REPLY_ADDRESS = 'reply@yamanwarda.de'
process.env.INBOX_FROM_ADDRESS = 'info@yamanwarda.de'
delete process.env.BACKEND2_OWNER_AUTH
delete process.env.INBOX_SEND_MODE

const SECRET = 'test-only-inbox-ingress-secret-0123456789'

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { useMediaStoreForTest } = await import('#/backend2/media/store')
const { useInboxTransportForTest } = await import('#/backend2/modules/inbox/inbox.transport')
const { signIngress, replyTokenFrom, addressOf } = await import('#/backend2/modules/inbox/ingress.service')
const { ownerInboxPaths } = await import('#/backend2/modules/inbox/inbox.owner.route')
const { renderEmail, docToPlainText } = await import('#/backend2/modules/inbox/email-render')
const { classifyIncomingFile } = await import('#/backend2/modules/inbox/inbox.files')

type Json = Record<string, any>
type Sent = { to: string; subject: string; replyTo: string; headers: Record<string, string>; idempotencyKey: string; attachments: number; text: string; html: string }

const database = await createTestDatabase()
const app = createAppForTest()
let storage = createMemoryStore()

let sent: Sent[] = []
let failNext = 0

beforeEach(async () => {
  await database.reset()
  storage = createMemoryStore()
  useMediaStoreForTest(storage.store)
  sent = []
  failNext = 0
  process.env.INBOX_INGRESS_SECRET = SECRET
  useInboxTransportForTest({
    mode: 'fake',
    send: async (email) => {
      if (failNext > 0) {
        failNext -= 1
        // A provider that timed out: it may have taken the email. The key is
        // recorded so the test can check the retry reuses it.
        sent.push({ ...summarise(email), subject: `FAILED:${email.subject}` })

        return { ok: false, provider: 'fake', reason: 'The email service did not answer in time.' }
      }

      sent.push(summarise(email))

      return { ok: true, provider: 'fake', providerMessageId: `p-${sent.length}` }
    },
  })
})

const summarise = (email: any): Sent => ({
  to: email.to,
  subject: email.subject,
  replyTo: email.replyTo,
  headers: email.headers,
  idempotencyKey: email.idempotencyKey,
  attachments: email.attachments.length,
  text: email.text,
  html: email.html,
})

afterEach(() => {
  useInboxTransportForTest(undefined)
  useMediaStoreForTest(undefined)
  delete process.env.BACKEND2_OWNER_AUTH
})

afterAll(async () => {
  await database.close()
})

/* ---------------------------------------------------------------- plumbing */

const call = async (
  method: string,
  path: string,
  body?: unknown,
  options: { host?: string; headers?: Record<string, string>; raw?: string } = {},
): Promise<{ status: number; body: Json; response: Response }> => {
  const host = options.host ?? 'localhost:3000'
  const payload = options.raw ?? (body === undefined ? undefined : JSON.stringify(body))
  const request = new Request(`http://${host}/api/v2${path}`, {
    method,
    headers: {
      ...(payload === undefined ? {} : { 'content-type': 'application/json', origin: `http://${host}` }),
      ...options.headers,
    },
    body: payload,
  })

  const response = await runWithDb(database.db, async () => app.fetch(request))
  const type = response.headers.get('content-type') ?? ''
  const text = type.includes('json') ? await response.clone().text() : ''

  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Json), response }
}

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64')

const deliver = async (
  letter: Json,
  options: { secret?: string; timestamp?: number; tamper?: boolean } = {},
) => {
  const body = JSON.stringify({ to: ['info@yamanwarda.de'], ...letter })
  const signed = await signIngress({ secret: options.secret ?? SECRET, body, timestamp: options.timestamp })

  return call('POST', '/inbound-email', undefined, {
    raw: options.tamper ? body.replace('Hello', 'Hullo') : body,
    headers: {
      'content-type': 'application/json',
      'x-inbox-signature': signed.signature,
      'x-inbox-timestamp': signed.timestamp,
    },
  })
}

let letterCounter = 0

const letter = (over: Json = {}): Json => ({
  from: 'Anna Client <anna@example.com>',
  fromName: 'Anna Client',
  subject: 'Website question',
  text: 'Hello, I have a question.',
  messageId: `<letter-${(letterCounter += 1)}@example.com>`,
  ...over,
})

const list = async (query = '') => {
  const result = await call('GET', `/owner/inbox/conversations${query}`)

  expect(result.status, JSON.stringify(result.body)).toBe(200)

  return result.body.data
}

const open = async (id: string, query = '') => {
  const result = await call('GET', `/owner/inbox/conversations/${id}${query}`)

  expect(result.status, JSON.stringify(result.body)).toBe(200)

  return result.body.data
}

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

const newDraft = async (over: Json = {}) => {
  const created = await call('POST', '/owner/inbox/drafts', { toEmail: 'bob@example.com', subject: 'Offer', ...over })

  expect(created.status, JSON.stringify(created.body)).toBe(201)

  return created.body.data
}

const save = async (draft: Json, patch: Json) => {
  const result = await call('PATCH', `/owner/inbox/drafts/${draft.id}`, { revision: draft.revision, ...patch })

  expect(result.status, JSON.stringify(result.body)).toBe(200)

  return result.body.data
}

const uploadMedia = async (fileName: string, bytes: Uint8Array): Promise<Json> => {
  const request = new Request('http://localhost:3000/api/v2/owner/media/files', {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.byteLength),
      'x-media-filename': encodeURIComponent(fileName),
    },
    body: bytes as unknown as BodyInit,
  })
  const response = await runWithDb(database.db, async () => app.fetch(request))
  const body = JSON.parse(await response.text())

  expect(response.status, JSON.stringify(body)).toBe(201)

  return body.data.asset
}

/* ------------------------------------------------------------------- fence */

describe('the owner fence', () => {
  it('answers every owner Inbox route with 404 from a non-local host', async () => {
    for (const route of ownerInboxPaths) {
      const result = await call(route.method, route.path.replace('/api/v2', ''), route.method === 'GET' ? undefined : {}, {
        host: 'yamanwarda.de',
      })

      expect(result.status, `${route.method} ${route.path}`).toBe(404)
    }
  })

  it('demands a session once owner auth is required', async () => {
    process.env.BACKEND2_OWNER_AUTH = 'required'

    const result = await call('GET', '/owner/inbox/conversations')

    expect(result.status).toBe(401)
  })
})

/* ----------------------------------------------------------------- ingress */

describe('receiving mail', () => {
  it('files a first incoming email as a new unread conversation', async () => {
    const result = await deliver(letter())

    expect(result.status, JSON.stringify(result.body)).toBe(200)
    expect(result.body.data.outcome).toBe('recorded')

    const page = await list()

    expect(page.total).toBe(1)
    expect(page.items[0]).toMatchObject({
      counterpartEmail: 'anna@example.com',
      counterpartName: 'Anna Client',
      subject: 'Website question',
      isRead: false,
      folder: 'inbox',
      origin: 'incoming',
      lastPreview: 'Hello, I have a question.',
    })

    const counts = await call('GET', '/owner/inbox/counts')

    expect(counts.body.data).toMatchObject({ inbox: 1, inboxUnread: 1 })
  })

  it('is off without a secret, and refuses a short one', async () => {
    delete process.env.INBOX_INGRESS_SECRET
    expect((await deliver(letter())).body.code).toBe('INGRESS_DISABLED')

    process.env.INBOX_INGRESS_SECRET = 'too-short'
    expect((await deliver(letter())).status).toBe(503)
    expect((await list()).total).toBe(0)
  })

  it('refuses a wrong secret, a tampered body, and a stale timestamp', async () => {
    expect((await deliver(letter(), { secret: 'another-secret-that-is-long-enough-000000' })).status).toBe(401)
    expect((await deliver(letter(), { tamper: true })).body.code).toBe('INVALID_SIGNATURE')
    expect((await deliver(letter(), { timestamp: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(401)
    expect((await list()).total).toBe(0)
  })

  it('refuses a delivery without a timestamp header', async () => {
    const result = await call('POST', '/inbound-email', undefined, {
      raw: JSON.stringify(letter({ to: ['info@yamanwarda.de'] })),
      headers: { 'content-type': 'application/json', 'x-inbox-signature': 'ab' },
    })

    expect(result.status).toBe(401)
  })

  it('writes the same letter once, however many times it is delivered', async () => {
    const same = letter()

    expect((await deliver(same)).body.data.outcome).toBe('recorded')
    expect((await deliver(same)).body.data.outcome).toBe('duplicate')

    // No Message-ID at all: the content itself is the key.
    const bare = letter({ messageId: '' , text: 'No id here' })

    expect((await deliver(bare)).body.data.outcome).toBe('recorded')
    expect((await deliver(bare)).body.data.outcome).toBe('duplicate')

    expect((await list()).total).toBe(2)
  })

  it('keeps two separate emails from the same person as two conversations', async () => {
    await deliver(letter({ subject: 'Website question' }))
    await deliver(letter({ subject: 'Website question' }))

    expect((await list()).total).toBe(2)
  })

  it('does not merge on subject or sender when the threading headers are missing', async () => {
    await deliver(letter({ subject: 'Offer' }))
    await deliver(letter({ subject: 'Re: Offer', inReplyTo: '', references: '' }))

    expect((await list()).total).toBe(2)
  })

  it('treats a malformed In-Reply-To as a new conversation', async () => {
    await deliver(letter())
    await deliver(letter({ inReplyTo: 'not-an-id', references: '<<>>' }))

    expect((await list()).total).toBe(2)
  })

  it('reads addresses and reply tokens carefully', () => {
    expect(addressOf('Anna <ANNA@Example.com>')).toBe('anna@example.com')
    expect(addressOf('nothing here')).toBeNull()
    expect(replyTokenFrom(['reply+0123456789abcdef0123456789abcdef@yamanwarda.de'])).toBe(
      '0123456789abcdef0123456789abcdef',
    )
    expect(replyTokenFrom(['reply+abc@yamanwarda.de'])).toBeNull()
    expect(replyTokenFrom(['reply+0123456789abcdef0123456789abcdef@evil.example'])).toBeNull()
  })
})

/* ---------------------------------------------------------------- sending */

describe('composing and sending', () => {
  it('autosaves without ever sending', async () => {
    const draft = await newDraft()
    const saved = await save(draft, { bodyDoc: doc('Draft text'), subject: 'Offer v2' })

    expect(saved.revision).toBe(draft.revision + 1)
    expect(saved.subject).toBe('Offer v2')
    expect(sent).toHaveLength(0)
    expect((await list('?view=sent')).total).toBe(0)

    const drafts = await call('GET', '/owner/inbox/drafts')

    expect(drafts.body.data.total).toBe(1)
  })

  it('keeps an incomplete private draft saveable', async () => {
    const draft = await newDraft({ toEmail: 'not-an-address', subject: '' })
    const saved = await save(draft, { toEmail: 'still not' })

    expect(saved.toEmail).toBe('still not')
  })

  it('refuses a stale autosave and hands back the newer draft', async () => {
    const draft = await newDraft()

    await save(draft, { subject: 'Newer' })

    const stale = await call('PATCH', `/owner/inbox/drafts/${draft.id}`, { revision: draft.revision, subject: 'Older' })

    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('STALE_DRAFT')
    expect(stale.body.details.draft.subject).toBe('Newer')
  })

  it('refuses an empty body, an invalid address, and asks before a blank subject', async () => {
    let draft = await newDraft({ subject: '' })

    const empty = await call('POST', `/owner/inbox/drafts/${draft.id}/send`, { revision: draft.revision })

    expect(empty.body.code).toBe('VALIDATION_ERROR')

    draft = await save(draft, { bodyDoc: doc('Hi Bob') })

    const blank = await call('POST', `/owner/inbox/drafts/${draft.id}/send`, { revision: draft.revision })

    expect(blank.status).toBe(422)
    expect(blank.body.code).toBe('CONFIRMATION_REQUIRED')
    expect(sent).toHaveLength(0)

    const confirmed = await call('POST', `/owner/inbox/drafts/${draft.id}/send`, {
      revision: draft.revision,
      confirmBlankSubject: true,
    })

    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)

    let bad = await newDraft({ toEmail: 'a@b.com, c@d.com' })

    bad = await save(bad, { bodyDoc: doc('x') })

    const refused = await call('POST', `/owner/inbox/drafts/${bad.id}/send`, { revision: bad.revision })

    expect(refused.body.code).toBe('VALIDATION_ERROR')
  })

  it('sends a new email once, however often Send is pressed', async () => {
    let draft = await newDraft()

    draft = await save(draft, { bodyDoc: doc('Here is the offer') })

    const first = await call('POST', `/owner/inbox/drafts/${draft.id}/send`, { revision: draft.revision })

    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body.data.message.delivery).toMatchObject({ status: 'accepted', provider: 'fake' })

    const second = await call('POST', `/owner/inbox/drafts/${draft.id}/send`, { revision: draft.revision })

    expect(second.status).toBe(200)
    expect(second.body.data.alreadySent).toBe(true)
    expect(sent).toHaveLength(1)

    expect(sent[0]).toMatchObject({ to: 'bob@example.com', subject: 'Offer' })
    expect(sent[0]!.replyTo).toMatch(/^reply\+[0-9a-f]{32}@yamanwarda\.de$/u)
    expect(sent[0]!.headers['Message-ID']).toMatch(/^<.+@yamanwarda\.de>$/u)
    expect(sent[0]!.text).toBe('Here is the offer')

    const sentView = await list('?view=sent')

    expect(sentView.total).toBe(1)
    expect(sentView.items[0]).toMatchObject({ origin: 'outgoing', isRead: true })

    // The draft is gone; the text lives on the message.
    expect((await call('GET', '/owner/inbox/drafts')).body.data.total).toBe(0)
  })

  it('keeps a failed send with its text, and retries with the same key', async () => {
    let draft = await newDraft()

    draft = await save(draft, { bodyDoc: doc('Try me') })
    failNext = 1

    const failed = await call('POST', `/owner/inbox/drafts/${draft.id}/send`, { revision: draft.revision })

    expect(failed.status).toBe(409)
    expect(failed.body.code).toBe('SEND_FAILED')

    const { conversationId, messageId } = failed.body.details
    const detail = await open(conversationId)
    const message = detail.messages.items[0]

    expect(message.delivery).toMatchObject({ status: 'failed', canRetry: true })
    expect(message.bodyText).toBe('Try me')
    expect(detail.conversation.hasFailedSend).toBe(true)

    const retried = await call('POST', `/owner/inbox/messages/${messageId}/retry`)

    expect(retried.status, JSON.stringify(retried.body)).toBe(200)
    expect(retried.body.data.delivery.status).toBe('accepted')
    expect(sent.map((email) => email.idempotencyKey)).toEqual([messageId, messageId])

    // Accepted is final: another retry does not send again.
    await call('POST', `/owner/inbox/messages/${messageId}/retry`)
    expect(sent).toHaveLength(2)
  })

  it('refuses to retry a message that is being sent right now', async () => {
    let draft = await newDraft()

    draft = await save(draft, { bodyDoc: doc('x') })
    failNext = 1

    const failed = await call('POST', `/owner/inbox/drafts/${draft.id}/send`, { revision: draft.revision })
    const { messageId } = failed.body.details

    await database.db.query(
      `UPDATE v2_inbox_messages SET delivery_status = 'sending', last_attempt_at = now() WHERE id = $1`,
      [messageId],
    )

    expect((await call('POST', `/owner/inbox/messages/${messageId}/retry`)).status).toBe(409)
  })

  it('replies inside the conversation with threading headers and a quote', async () => {
    await deliver(letter({ messageId: '<first@example.com>' }))

    const [conversation] = (await list()).items
    const created = await call('POST', '/owner/inbox/drafts', { conversationId: conversation.id })

    expect(created.status).toBe(201)
    expect(created.body.data).toMatchObject({ toEmail: 'anna@example.com', subject: 'Re: Website question' })

    // Opening the reply again recovers the same draft.
    const again = await call('POST', '/owner/inbox/drafts', { conversationId: conversation.id })

    expect(again.status).toBe(200)
    expect(again.body.data.id).toBe(created.body.data.id)

    const reply = await save(created.body.data, { bodyDoc: doc('Thanks Anna'), toEmail: 'someone@else.com' })

    expect(reply.toEmail).toBe('anna@example.com')

    const result = await call('POST', `/owner/inbox/drafts/${reply.id}/send`, { revision: reply.revision })

    expect(result.status, JSON.stringify(result.body)).toBe(200)
    expect(sent[0]!.headers['In-Reply-To']).toBe('<first@example.com>')
    expect(sent[0]!.headers.References).toBe('<first@example.com>')
    expect(sent[0]!.text).toContain('Thanks Anna')
    expect(sent[0]!.text).toContain('> Hello, I have a question.')

    const detail = await open(conversation.id)

    expect(detail.messages.total).toBe(2)
    expect((await list()).total).toBe(1)
  })
})

/* -------------------------------------------------------- replies coming in */

describe('replies arriving', () => {
  const sendNew = async () => {
    let draft = await newDraft()

    draft = await save(draft, { bodyDoc: doc('Offer attached') })

    const result = await call('POST', `/owner/inbox/drafts/${draft.id}/send`, { revision: draft.revision })

    return { conversationId: result.body.data.conversationId as string, email: sent.at(-1)! }
  }

  it('threads an answer by the reply address', async () => {
    const { conversationId, email } = await sendNew()

    await deliver(letter({ from: 'bob@example.com', to: [email.replyTo], subject: 'Re: Offer', inReplyTo: '' }))

    const detail = await open(conversationId)

    expect(detail.messages.total).toBe(2)
    expect(detail.conversation.isRead).toBe(false)
    expect((await list()).total).toBe(1)
  })

  it('threads an answer by In-Reply-To when it comes to info@', async () => {
    const { conversationId, email } = await sendNew()

    await deliver(letter({ from: 'bob@example.com', inReplyTo: email.headers['Message-ID'] }))

    expect((await open(conversationId)).messages.total).toBe(2)
  })

  it('brings an archived or trashed conversation back to the Inbox as unread', async () => {
    const { conversationId, email } = await sendNew()

    await call('PATCH', `/owner/inbox/conversations/${conversationId}`, { archived: true })
    await deliver(letter({ to: [email.replyTo] }))

    let summary = (await open(conversationId)).conversation

    expect(summary).toMatchObject({ folder: 'inbox', isRead: false })

    await call('POST', `/owner/inbox/conversations/${conversationId}/trash`)
    await deliver(letter({ to: [email.replyTo] }))

    summary = (await open(conversationId)).conversation
    expect(summary).toMatchObject({ folder: 'inbox', isRead: false, trashedAt: null })
  })

  it('starts a new conversation when the old one was deleted for good', async () => {
    const { conversationId, email } = await sendNew()

    await call('POST', `/owner/inbox/conversations/${conversationId}/trash`)
    await call('DELETE', `/owner/inbox/conversations/${conversationId}`, { confirm: conversationId })
    await deliver(letter({ to: [email.replyTo], inReplyTo: email.headers['Message-ID'] }))

    const page = await list()

    expect(page.total).toBe(1)
    expect(page.items[0].id).not.toBe(conversationId)
  })

  it('takes a letter from the real inbound Worker code: threaded by References, files it could not carry named', async () => {
    const { deliver: workerDeliver } = await import('../../workers/inbound-email/src/deliver')
    const { conversationId, email } = await sendNew()
    const forwarded: string[] = []

    const result = await workerDeliver(
      {
        from: 'bounce@mailer.example',
        to: 'info@yamanwarda.de',
        // No In-Reply-To and no reply token: only References can thread it.
        headers: new Headers({
          'message-id': '<worker-1@example.com>',
          references: `<unrelated@example.com> ${email.headers['Message-ID']}`,
        }),
        raw: new Blob(['ignored by the parser below']).stream(),
        forward: async (to) => {
          forwarded.push(to)
        },
        setReject: () => {
          throw new Error('must not refuse')
        },
      },
      {
        FORWARD_COPY_TO: 'owner@example.com',
        INBOX_V2_ENDPOINT: 'http://localhost:3000/api/v2/inbound-email',
        INBOX_INGRESS_SECRET: SECRET,
      },
      {
        parse: async () => ({
          from: { name: 'Bob', address: 'bob@example.com' },
          subject: 'Re: Offer',
          text: 'Signed and attached.',
          attachments: [
            { filename: 'signed.pdf', mimeType: 'application/pdf', disposition: 'attachment', content: pdfBytes() },
            {
              filename: 'scan.tiff',
              mimeType: 'image/tiff',
              disposition: 'attachment',
              content: new ArrayBuffer(11 * 1024 * 1024),
            },
          ],
        }),
        fetch: async (url, init) =>
          runWithDb(database.db, async () => app.fetch(new Request(url, { ...init, signal: undefined }))),
      },
    )

    expect(forwarded).toEqual(['owner@example.com'])
    expect(result.v2).toEqual({ status: 200, taken: true, attempts: 1 })

    const detail = await open(conversationId)

    expect(detail.messages.total).toBe(2)

    const arrived = detail.messages.items.find((message: Json) => message.direction === 'incoming')

    expect(arrived.bodyText).toBe('Signed and attached.')
    expect(arrived.incomingAttachments.map((file: Json) => [file.fileName, file.status])).toEqual([
      ['signed.pdf', 'stored'],
      ['scan.tiff', 'failed'],
    ])
    expect(arrived.incomingAttachments[1].failureReason).toMatch(/larger than 10 MB.*forwarded to your mailbox/u)
  })

  it('does not file our own sent mail coming back as a new letter', async () => {
    const { email } = await sendNew()

    const echo = await deliver(letter({ messageId: email.headers['Message-ID'] }))

    expect(echo.body.data.outcome).toBe('duplicate')
  })
})

/* ------------------------------------------------------- folders and flags */

describe('folders, flags, search and pagination', () => {
  it('marks read, stars, archives and filters', async () => {
    await deliver(letter({ subject: 'One' }))
    await deliver(letter({ subject: 'Two' }))

    const [latest] = (await list()).items

    await call('PATCH', `/owner/inbox/conversations/${latest.id}`, { isRead: true, isStarred: true })

    expect((await list('?unread=true')).total).toBe(1)
    expect((await list('?starred=true')).items[0].id).toBe(latest.id)

    await call('PATCH', `/owner/inbox/conversations/${latest.id}`, { archived: true })

    expect((await list()).total).toBe(1)
    expect((await list('?view=archived')).total).toBe(1)

    const counts = (await call('GET', '/owner/inbox/counts')).body.data

    expect(counts).toMatchObject({ inbox: 1, archived: 1, inboxUnread: 1 })
  })

  it('searches subjects, people and bodies, with wildcards taken literally', async () => {
    await deliver(letter({ subject: 'Invoice 100%', text: 'Payment details' }))
    await deliver(letter({ from: 'carl@firma.de', subject: 'Hello', text: 'Nothing' }))

    expect((await list('?q=payment')).total).toBe(1)
    expect((await list('?q=firma')).total).toBe(1)
    expect((await list('?q=100%25')).total).toBe(1)
    expect((await list('?q=%25')).total).toBe(1)
  })

  it('pages deterministically and bounds the page size', async () => {
    for (let index = 0; index < 5; index += 1) await deliver(letter({ subject: `S${index}` }))

    const first = await list('?pageSize=2&page=1')
    const second = await list('?pageSize=2&page=2')
    const third = await list('?pageSize=2&page=3')

    expect(first).toMatchObject({ total: 5, pageCount: 3, hasMore: true })
    expect(third.items).toHaveLength(1)

    const ids = [...first.items, ...second.items, ...third.items].map((item: Json) => item.id)

    expect(new Set(ids).size).toBe(5)
    expect((await call('GET', '/owner/inbox/conversations?pageSize=1000')).status).toBe(422)
  })

  it('pages a long conversation instead of loading all of it', async () => {
    const { email } = await (async () => {
      let draft = await newDraft()

      draft = await save(draft, { bodyDoc: doc('Start') })
      await call('POST', `/owner/inbox/drafts/${draft.id}/send`, { revision: draft.revision })

      return { email: sent.at(-1)! }
    })()

    for (let index = 0; index < 4; index += 1) await deliver(letter({ to: [email.replyTo], text: `Answer ${index}` }))

    const [conversation] = (await list()).items
    const page = await open(conversation.id, '?pageSize=2')

    expect(page.messages).toMatchObject({ total: 5, pageCount: 3 })
    expect(page.messages.items[0].bodyText).toBe('Answer 3')
  })
})

/* -------------------------------------------------------------------- trash */

describe('Trash', () => {
  it('moves, restores to where it came from, and refuses archive while trashed', async () => {
    await deliver(letter())

    const [conversation] = (await list()).items

    await call('PATCH', `/owner/inbox/conversations/${conversation.id}`, { archived: true })
    await call('POST', `/owner/inbox/conversations/${conversation.id}/trash`)

    expect((await list('?view=trash')).total).toBe(1)
    expect(
      (await call('PATCH', `/owner/inbox/conversations/${conversation.id}`, { archived: false })).status,
    ).toBe(409)

    const restored = await call('POST', `/owner/inbox/conversations/${conversation.id}/restore`)

    expect(restored.body.data.folder).toBe('archived')
  })

  it('deletes permanently only from Trash, only with confirmation', async () => {
    await deliver(letter())

    const [conversation] = (await list()).items

    expect((await call('DELETE', `/owner/inbox/conversations/${conversation.id}`, { confirm: conversation.id })).status).toBe(409)

    await call('POST', `/owner/inbox/conversations/${conversation.id}/trash`)

    const wrong = await call('DELETE', `/owner/inbox/conversations/${conversation.id}`, {
      confirm: '22222222-2222-4222-8222-222222222222',
    })

    expect(wrong.status).toBe(400)

    const done = await call('DELETE', `/owner/inbox/conversations/${conversation.id}`, { confirm: conversation.id })

    expect(done.status).toBe(200)
    expect((await call('GET', `/owner/inbox/conversations/${conversation.id}`)).status).toBe(404)
  })

  it('empties Trash only after the exact confirmation, and leaves the rest', async () => {
    await deliver(letter({ subject: 'A' }))
    await deliver(letter({ subject: 'B' }))
    await deliver(letter({ subject: 'Keep' }))

    for (const item of (await list()).items.filter((item: Json) => item.subject !== 'Keep')) {
      await call('POST', `/owner/inbox/conversations/${item.id}/trash`)
    }

    expect((await call('POST', '/owner/inbox/trash/empty', { confirm: 'yes' })).status).toBe(422)

    const emptied = await call('POST', '/owner/inbox/trash/empty', { confirm: 'EMPTY TRASH' })

    expect(emptied.body.data.deleted).toBe(2)
    expect((await list('?view=trash')).total).toBe(0)
    expect((await list()).total).toBe(1)
  })
})

/* -------------------------------------------------------------- attachments */

describe('incoming attachments', () => {
  const withFiles = (files: Json[]) =>
    deliver(letter({ files }))

  const firstMessage = async () => {
    const [conversation] = (await list()).items

    return (await open(conversation.id)).messages.items[0]
  }

  it('keeps a PDF private, downloadable only as a download', async () => {
    await withFiles([{ filename: 'offer.pdf', contentType: 'application/pdf', content: b64(pdfBytes()) }])

    const message = await firstMessage()
    const [file] = message.incomingAttachments

    expect(file).toMatchObject({ fileName: 'offer.pdf', contentType: 'application/pdf', status: 'stored', canSaveToMedia: true })

    const download = await call('GET', `/owner/inbox/attachments/${file.id}`)

    expect(download.status).toBe(200)
    expect(download.response.headers.get('content-disposition')).toMatch(/^attachment;/u)
    expect(download.response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(download.response.headers.get('content-security-policy')).toContain('sandbox')

    // Not in the library by itself.
    expect((await call('GET', '/owner/media/files')).body.data.total).toBe(0)

    // And nowhere for a stranger.
    expect((await call('GET', `/owner/inbox/attachments/${file.id}`, undefined, { host: 'yamanwarda.de' })).status).toBe(404)
    expect((await call('GET', `/media/${file.id}`)).status).toBe(404)
  })

  it('blocks programs and scripts without losing the letter', async () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 1, 2, 3])

    await withFiles([
      { filename: 'invoice.pdf.exe', contentType: 'application/octet-stream', content: b64(exe) },
      { filename: 'photo.jpg', contentType: 'image/jpeg', content: b64(exe) },
      { filename: 'page.html', contentType: 'text/html', content: b64(new TextEncoder().encode('<html></html>')) },
      { filename: 'ok.png', contentType: 'image/png', content: b64(pngBytes(4, 4)) },
    ])

    const message = await firstMessage()
    const statuses = message.incomingAttachments.map((file: Json) => file.status)

    expect(statuses).toEqual(['blocked', 'blocked', 'blocked', 'stored'])
    expect(message.bodyText).toBe('Hello, I have a question.')
    expect(message.incomingAttachments[0].failureReason).toMatch(/Blocked for safety/u)
    expect([...storage.objects.keys()]).toHaveLength(1)
  })

  it('keeps an unrecognised but harmless file for download, without Save to Media', async () => {
    await withFiles([
      { filename: 'meeting.ics', contentType: 'text/calendar', content: b64(new Uint8Array([0, 1, 2, 3, 250, 251])) },
    ])

    const [file] = (await firstMessage()).incomingAttachments

    expect(file).toMatchObject({ status: 'stored', canSaveToMedia: false })
    expect(file.saveToMediaUnavailableReason).toMatch(/Download it instead/u)

    const download = await call('GET', `/owner/inbox/attachments/${file.id}`)

    expect(download.response.headers.get('content-type')).toBe('application/octet-stream')

    const refused = await call('POST', `/owner/inbox/attachments/${file.id}/save-to-media`, {})

    expect(refused.body.code).toBe('UNSUPPORTED_FILE_TYPE')
  })

  it('saves a supported file to Media once, and deleting the letter leaves the copy', async () => {
    await withFiles([{ filename: 'logo.png', contentType: 'image/png', content: b64(pngBytes(8, 8)) }])

    const [conversation] = (await list()).items
    const [file] = (await open(conversation.id)).messages.items[0].incomingAttachments

    const saved = await call('POST', `/owner/inbox/attachments/${file.id}/save-to-media`, {})

    expect(saved.status, JSON.stringify(saved.body)).toBe(201)
    expect(saved.body.data.asset).toMatchObject({ kind: 'image', displayName: 'logo.png' })

    const again = await call('POST', `/owner/inbox/attachments/${file.id}/save-to-media`, {})

    expect(again.body.data.alreadySaved).toBe(true)
    expect((await call('GET', '/owner/media/files')).body.data.total).toBe(1)

    await call('POST', `/owner/inbox/conversations/${conversation.id}/trash`)
    const removed = await call('DELETE', `/owner/inbox/conversations/${conversation.id}`, { confirm: conversation.id })

    expect(removed.body.data.storageRemoved).toBe(true)
    expect((await call('GET', `/owner/media/files/${saved.body.data.asset.id}`)).status).toBe(200)
    // Only the Media copy remains in storage.
    expect([...storage.objects.keys()].every((key) => key.startsWith('media/'))).toBe(true)
  })

  it('refuses oversized and unreadable files without dropping the message', () => {
    const big = classifyIncomingFile({
      filename: 'big.pdf',
      contentType: 'application/pdf',
      content: Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64'),
    })

    expect(big.status).toBe('failed')
    expect(classifyIncomingFile({ filename: 'x', contentType: '', content: '' }).status).toBe('failed')
    expect(classifyIncomingFile({ filename: 'report.docm', contentType: '', content: b64(pdfBytes()) }).status).toBe(
      'blocked',
    )
  })

  it('stores the HTML part only for the sandboxed view', async () => {
    await deliver(letter({ html: '<p>Hi<script>alert(1)</script></p>' }))

    const message = await firstMessage()

    expect(message.hasHtml).toBe(true)

    const html = await call('GET', `/owner/inbox/messages/${message.id}/html`)

    expect(html.body.data.html).toContain('<p>Hi')
  })
})

describe('outgoing attachments from Media', () => {
  it('attaches Media files, blocks their deletion while used, and frees them after deletion', async () => {
    const asset = await uploadMedia('price-list.pdf', pdfBytes())
    let draft = await newDraft()

    draft = await save(draft, { bodyDoc: doc('See attached'), attachmentAssetIds: [asset.id] })

    expect(draft.attachments).toEqual([
      expect.objectContaining({ assetId: asset.id, fileName: 'price-list.pdf', contentType: 'application/pdf' }),
    ])

    expect((await call('DELETE', `/owner/media/files/${asset.id}`)).body.code).toBe('DELETE_BLOCKED_BY_REFERENCES')

    const result = await call('POST', `/owner/inbox/drafts/${draft.id}/send`, { revision: draft.revision })

    expect(result.status, JSON.stringify(result.body)).toBe(200)
    expect(sent[0]!.attachments).toBe(1)

    const references = await call('GET', `/owner/media/files/${asset.id}/references`)

    expect(references.body.data.items).toEqual([expect.objectContaining({ module: 'inbox', scope: 'record' })])
    expect((await call('DELETE', `/owner/media/files/${asset.id}`)).status).toBe(409)

    const conversationId = result.body.data.conversationId

    await call('POST', `/owner/inbox/conversations/${conversationId}/trash`)
    await call('DELETE', `/owner/inbox/conversations/${conversationId}`, { confirm: conversationId })

    // The shared file survived; only the email's use of it is gone.
    expect((await call('GET', `/owner/media/files/${asset.id}`)).status).toBe(200)
    expect((await call('DELETE', `/owner/media/files/${asset.id}`)).status).toBe(200)
  })

  it('releases a discarded draft’s files', async () => {
    const asset = await uploadMedia('a.png', pngBytes(4, 4))
    const draft = await newDraft()

    await save(draft, { attachmentAssetIds: [asset.id] })
    await call('DELETE', `/owner/inbox/drafts/${draft.id}`)

    expect((await call('DELETE', `/owner/media/files/${asset.id}`)).status).toBe(200)
  })

  it('refuses a file that is not in the library', async () => {
    const draft = await newDraft()
    const result = await call('PATCH', `/owner/inbox/drafts/${draft.id}`, {
      revision: draft.revision,
      attachmentAssetIds: ['33333333-3333-4333-8333-333333333333'],
    })

    expect(result.body.code).toBe('VALIDATION_ERROR')
  })
})

/* ------------------------------------------------------------------ settings */

describe('signatures and ready replies', () => {
  it('saves one signature per language and says sending is fake here', async () => {
    const put = await call('PUT', '/owner/inbox/settings', {
      signatures: { de: 'Viele Grüße', en: 'Best regards', ar: 'مع التحية' },
    })

    expect(put.status).toBe(200)
    expect(put.body.data.signatures.ar).toBe('مع التحية')
    expect(put.body.data.fromAddress).toBe('info@yamanwarda.de')
    expect(put.body.data.sendMode).toBe('fake')
  })

  it('creates, pages, edits and deletes ready replies', async () => {
    for (const title of ['Charlie', 'alpha', 'Bravo']) {
      expect((await call('POST', '/owner/inbox/snippets', { title, body: `${title} body`, language: 'en' })).status).toBe(201)
    }

    const page = await call('GET', '/owner/inbox/snippets?pageSize=2')

    expect(page.body.data).toMatchObject({ total: 3, pageCount: 2 })
    expect(page.body.data.items.map((item: Json) => item.title)).toEqual(['alpha', 'Bravo'])

    const id = page.body.data.items[0].id

    expect((await call('PATCH', `/owner/inbox/snippets/${id}`, { title: 'Alpha', body: 'Changed' })).body.data.body).toBe(
      'Changed',
    )
    expect((await call('DELETE', `/owner/inbox/snippets/${id}`)).status).toBe(200)
    expect((await call('DELETE', `/owner/inbox/snippets/${id}`)).status).toBe(404)
    expect((await call('POST', '/owner/inbox/snippets', { title: ' ', body: 'x' })).status).toBe(422)
  })
})

/* ------------------------------------------------------------------ rendering */

describe('rendering an email body', () => {
  it('escapes text and drops unsafe links', () => {
    const rendered = renderEmail({
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '<script>x</script> & ' },
              { type: 'text', text: 'site', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
            ],
          },
          { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }] },
        ],
      },
    })

    expect(rendered.html).toContain('&lt;script&gt;')
    expect(rendered.html).not.toContain('<script>')
    expect(rendered.html).toContain('<a href="https://example.com">site</a>')
    expect(rendered.text).toBe('<script>x</script> & site (https://example.com)\n\n- one')
    expect(docToPlainText({ type: 'doc', content: [] })).toBe('')
  })

  it('refuses images and tables in an email body', async () => {
    const draft = await newDraft()
    const result = await call('PATCH', `/owner/inbox/drafts/${draft.id}`, {
      revision: draft.revision,
      bodyDoc: {
        type: 'doc',
        content: [{ type: 'image', attrs: { mediaId: '44444444-4444-4444-8444-444444444444', alt: '', width: null, height: null } }],
      },
    })

    expect(result.body.code).toBe('VALIDATION_ERROR')
  })
})
