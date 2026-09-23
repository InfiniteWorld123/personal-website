import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createMemoryStore,
  createTestDatabase,
  ole2Bytes,
  ooxmlBytes,
  pdfBytes,
  pngBytes,
  svgBytes,
  textBytes,
  zipBytes,
} from './helpers/backend2-db'

/**
 * The public Contact endpoint, V2, against a real PostgreSQL in this process.
 *
 * What matters: one submission is exactly one Contact-origin Inbox
 * conversation however often it is sent; a bot is answered like a person and
 * stores nothing; a file is judged by its bytes and kept privately; the
 * removed selects never reach the database; and a visitor learns nothing but
 * "received". No email is sent — the fake transport proves it.
 */
process.env.DATABASE_URL = 'postgres://legacy.invalid/legacy'
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
process.env.INBOX_FROM_ADDRESS = 'info@yamanwarda.de'
delete process.env.BACKEND2_OWNER_AUTH
delete process.env.TURNSTILE_SECRET_KEY
delete process.env.INBOX_SEND_MODE

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { useMediaStoreForTest } = await import('#/backend2/media/store')
const { useInboxTransportForTest } = await import('#/backend2/modules/inbox/inbox.transport')
const { useTurnstileForTest, verifyHuman } = await import('#/backend2/modules/booking/booking.guard')
const { CONTACT_LIMITS } = await import('#/backend2/contracts/contact.contract')

type Json = Record<string, any>

const database = await createTestDatabase()
const app = createAppForTest()
let storage = createMemoryStore()
let sent = 0

beforeEach(async () => {
  await database.reset()
  storage = createMemoryStore()
  useMediaStoreForTest(storage.store)
  sent = 0
  useInboxTransportForTest({
    mode: 'fake',
    send: async () => {
      sent += 1

      return { ok: true, provider: 'fake', providerMessageId: `p-${sent}` }
    },
  })
  useTurnstileForTest(undefined)
  delete process.env.TURNSTILE_SECRET_KEY
})

afterEach(() => {
  useInboxTransportForTest(undefined)
  useMediaStoreForTest(undefined)
  useTurnstileForTest(undefined)
  delete process.env.TURNSTILE_SECRET_KEY
})

afterAll(async () => {
  await database.close()
})

/* ---------------------------------------------------------------- plumbing */

type Upload = { bytes: Uint8Array; name: string; type?: string }

const fields = (over: Record<string, string | undefined> = {}): Record<string, string> => {
  const base: Record<string, string | undefined> = {
    submissionId: crypto.randomUUID(),
    name: 'Lena Fischer',
    email: 'Lena@Example.com',
    message: 'Hello, I would like a new website for my bakery.',
    language: 'de',
    turnstileToken: 'token',
    ...over,
  }

  return Object.fromEntries(Object.entries(base).filter(([, value]) => value !== undefined)) as Record<string, string>
}

const formOf = (values: Record<string, string>, files: Upload[] = []): FormData => {
  const form = new FormData()

  for (const [key, value] of Object.entries(values)) form.append(key, value)

  for (const file of files) {
    form.append('attachment', new File([file.bytes as BlobPart], file.name, { type: file.type ?? 'application/octet-stream' }))
  }

  return form
}

const post = async (
  body: FormData | string,
  options: {
    ip?: string
    contentType?: string
    target?: ReturnType<typeof createAppForTest>
    db?: typeof database.db
  } = {},
): Promise<{ status: number; body: Json; response: Response }> => {
  const request = new Request('http://localhost:3000/api/v2/public/contact', {
    method: 'POST',
    headers: {
      origin: 'http://localhost:3000',
      'x-forwarded-for': options.ip ?? '203.0.113.7',
      ...(options.contentType ? { 'content-type': options.contentType } : {}),
    },
    body,
  })

  const response = await runWithDb(options.db ?? database.db, async () => (options.target ?? app).fetch(request))
  const text = await response.clone().text()

  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Json), response }
}

const submit = (
  over: Record<string, string | undefined> = {},
  files: Upload[] = [],
  ip?: string,
  db?: typeof database.db,
) => post(formOf(fields(over), files), { ip, db })

/**
 * PGlite is one session, so two requests' transactions would otherwise share
 * it. Each "session" here waits while another holds an open transaction —
 * the isolation separate PostgreSQL connections give, for the race test.
 */
const sessions = () => {
  let holder: object | null = null
  let released: Promise<void> = Promise.resolve()
  let release = () => {}

  return () => {
    const session = {
      query: async (text: string, values?: unknown[]) => {
        while (holder !== null && holder !== session) await released

        if (text === 'BEGIN') {
          holder = session
          released = new Promise((resolve) => {
            release = resolve
          })
        }

        try {
          return await database.db.query(text, values)
        } finally {
          if ((text === 'COMMIT' || text === 'ROLLBACK') && holder === session) {
            holder = null
            release()
          }
        }
      },
    }

    return session
  }
}

const owner = async (path: string) => {
  const response = await runWithDb(database.db, async () =>
    app.fetch(new Request(`http://localhost:3000/api/v2${path}`)),
  )

  return { status: response.status, response, body: (response.headers.get('content-type') ?? '').includes('json') ? ((await response.json()) as Json) : {} }
}

const conversations = async () =>
  (await database.db.query('SELECT * FROM v2_inbox_conversations ORDER BY created_at')).rows

const messages = async () => (await database.db.query('SELECT * FROM v2_inbox_messages')).rows
const attachments = async () => (await database.db.query('SELECT * FROM v2_inbox_attachments')).rows

const expectNothingStored = async () => {
  expect(await conversations()).toHaveLength(0)
  expect(await messages()).toHaveLength(0)
  expect(await attachments()).toHaveLength(0)
  expect(storage.objects.size).toBe(0)
  expect((await database.db.query('SELECT * FROM v2_media_pending_objects')).rows).toHaveLength(0)
}

/* ---------------------------------------------------------------- the form */

describe('a contact submission', () => {
  it('creates exactly one unread Contact conversation and answers only "received"', async () => {
    const submissionId = crypto.randomUUID()
    const result = await submit({ submissionId })

    expect(result.status, JSON.stringify(result.body)).toBe(201)
    expect(result.body.data).toEqual({ received: true })
    expect(result.response.headers.get('cache-control')).toContain('no-store')

    const [conversation, ...others] = await conversations()

    expect(others).toHaveLength(0)
    expect(conversation).toMatchObject({
      origin: 'contact',
      origin_ref: submissionId,
      counterpart_email: 'lena@example.com',
      counterpart_name: 'Lena Fischer',
      subject: 'Website contact — Lena Fischer',
      is_read: false,
      folder: 'inbox',
      message_count: 1,
      last_direction: 'incoming',
      facts: {},
    })
    expect(conversation.reply_token).toMatch(/^[0-9a-f]{32}$/u)

    const [message] = await messages()

    expect(message).toMatchObject({
      conversation_id: conversation.id,
      direction: 'incoming',
      from_email: 'lena@example.com',
      from_name: 'Lena Fischer',
      to_email: 'info@yamanwarda.de',
      body_text: 'Hello, I would like a new website for my bakery.',
      body_html: null,
      language: 'de',
      dedupe_key: `contact:${submissionId}`,
    })

    // The owner sees it, unread, in the ordinary Inbox — and no email went anywhere.
    const listed = await owner('/owner/inbox/conversations')

    expect(listed.body.data.items).toHaveLength(1)
    expect(listed.body.data.items[0]).toMatchObject({ origin: 'contact', isRead: false })
    expect(sent).toBe(0)
  })

  it('adds phone and company as plain lines after the message', async () => {
    await submit({ phone: '+49 170 1234567', company: 'Bäckerei Fischer' })

    const [message] = await messages()

    expect(message.body_text).toBe(
      'Hello, I would like a new website for my bakery.\n\nPhone: +49 170 1234567\nCompany: Bäckerei Fischer',
    )
  })

  it('never stores the removed "What is it about?" and "Budget range" answers', async () => {
    const result = await submit({ projectType: 'Online shop', budget: '3000-6000', subject: 'Shop', timeline: 'weeks' })

    expect(result.status).toBe(201)

    const [conversation] = await conversations()
    const [message] = await messages()
    const everything = JSON.stringify({ conversation, message })

    expect(conversation.facts).toEqual({})
    expect(everything).not.toContain('Online shop')
    expect(everything).not.toContain('3000-6000')
    expect(everything).not.toContain('weeks')
  })

  it('writes one conversation for the same submissionId sent twice', async () => {
    const submissionId = crypto.randomUUID()

    expect((await submit({ submissionId })).status).toBe(201)

    // The retry's single-use Turnstile token would fail; it is not asked for.
    useTurnstileForTest(async () => false)

    const again = await submit({ submissionId, message: 'A different text for the same submission.' })

    expect(again.status).toBe(201)
    expect(again.body.data).toEqual({ received: true })
    expect(await conversations()).toHaveLength(1)
    expect(await messages()).toHaveLength(1)
  })

  it('writes one conversation when copies of a submission race', async () => {
    const submissionId = crypto.randomUUID()
    const png = { bytes: pngBytes(4, 4), name: 'photo.png', type: 'image/png' }
    const session = sessions()
    let puts = 0
    const put = storage.store.put

    storage.store.put = async (input) => {
      puts += 1

      return put(input)
    }

    const results = await Promise.all([
      submit({ submissionId }, [png], undefined, session()),
      submit({ submissionId }, [png], undefined, session()),
      submit({ submissionId }, [png], undefined, session()),
    ])

    expect(results.map((result) => result.status)).toEqual([201, 201, 201])
    expect(await conversations()).toHaveLength(1)
    expect(await messages()).toHaveLength(1)
    expect(await attachments()).toHaveLength(1)
    // All three got past the first check and stored their bytes — a real
    // race — and the losers' bytes were taken back; only the winner's remain.
    expect(puts).toBe(3)
    expect(storage.objects.size).toBe(1)
    expect((await database.db.query('SELECT * FROM v2_media_pending_objects')).rows).toHaveLength(0)
  })

  it('answers a filled honeypot like a success and stores nothing', async () => {
    const result = await post(
      formOf({ website: 'https://spam.example', name: '', email: 'not-an-email' }, [
        { bytes: new Uint8Array([0x4d, 0x5a, 0, 0]), name: 'x.exe' },
      ]),
    )

    expect(result.status).toBe(201)
    expect(result.body.data).toEqual({ received: true })
    await expectNothingStored()
  })
})

/* -------------------------------------------------------------- validation */

describe('validation', () => {
  const issuesFor = async (over: Record<string, string | undefined>) => {
    const result = await submit(over)

    expect(result.status, JSON.stringify(result.body)).toBe(422)
    expect(result.body.code).toBe('VALIDATION_ERROR')

    return (result.body.details.issues as Array<{ field: string; message: string }>).map((issue) => issue.field)
  }

  it('reports every missing field by name', async () => {
    const result = await post(formOf({}))

    expect(result.status).toBe(422)

    const fieldsWithIssues = (result.body.details.issues as Array<{ field: string }>).map((issue) => issue.field)

    expect(fieldsWithIssues).toEqual(expect.arrayContaining(['submissionId', 'name', 'email', 'message', 'language']))
    await expectNothingStored()
  })

  it.each([
    ['submissionId', { submissionId: 'not-a-uuid' }],
    ['name', { name: '   ' }],
    ['name', { name: 'x'.repeat(CONTACT_LIMITS.name + 1) }],
    ['email', { email: 'not-an-email' }],
    ['email', { email: `${'a'.repeat(250)}@example.com` }],
    ['message', { message: 'Too short' }],
    ['message', { message: 'x'.repeat(CONTACT_LIMITS.message + 1) }],
    ['language', { language: 'fr' }],
    ['phone', { phone: 'call me maybe' }],
    ['company', { company: 'c'.repeat(CONTACT_LIMITS.company + 1) }],
  ])('refuses a bad %s', async (field, over) => {
    expect(await issuesFor(over)).toEqual([field])
    await expectNothingStored()
  })

  it('accepts a one-character name and a message of exactly ten characters', async () => {
    expect((await submit({ name: 'Y', message: '0123456789' })).status).toBe(201)
  })

  it('refuses a body that is not multipart', async () => {
    const result = await post(JSON.stringify(fields()), { contentType: 'application/json' })

    expect(result.status).toBe(400)
    await expectNothingStored()
  })

  it('refuses two files', async () => {
    const pdf = { bytes: pdfBytes(), name: 'a.pdf', type: 'application/pdf' }
    const result = await submit({}, [pdf, pdf])

    expect(result.status).toBe(422)
    expect(result.body.details.issues[0].field).toBe('attachment')
    await expectNothingStored()
  })
})

/* ------------------------------------------------------------------- files */

describe('the attachment', () => {
  const officeWith = (extra: string) =>
    textBytes(`PK[Content_Types].xml${' '.repeat(8)}word/document.xml ${extra}`)

  const heicBytes = () => {
    const bytes = new Uint8Array(64)

    new DataView(bytes.buffer).setUint32(0, 24)
    bytes.set(textBytes('ftypheic'), 4)

    return bytes
  }

  it.each([
    ['offer.pdf', pdfBytes(), 'application/pdf'],
    ['photo.png', pngBytes(10, 10), 'image/png'],
    ['brief.docx', ooxmlBytes('word'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['numbers.xlsx', ooxmlBytes('xl'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['old.doc', ole2Bytes('WordDocument'), 'application/msword'],
    ['IMG_0001.HEIC', heicBytes(), 'image/heic'],
  ])('keeps %s privately on the message', async (name, bytes, detected) => {
    const result = await submit({}, [{ bytes, name }])

    expect(result.status, JSON.stringify(result.body)).toBe(201)

    const [attachment] = await attachments()
    const [message] = await messages()

    expect(attachment).toMatchObject({
      message_id: message.id,
      file_name: name,
      detected_type: detected,
      status: 'stored',
      byte_size: bytes.byteLength,
    })
    expect(attachment.storage_key).toMatch(/^inbox\//u)
    expect(storage.objects.get(attachment.storage_key)?.bytes).toEqual(bytes)
    // Stored with no pending ledger entry left behind, and not in Media.
    expect((await database.db.query('SELECT * FROM v2_media_pending_objects')).rows).toHaveLength(0)
    expect((await database.db.query('SELECT * FROM v2_media_assets')).rows).toHaveLength(0)
  })

  it('is downloadable by the owner and by nobody else', async () => {
    await submit({}, [{ bytes: pdfBytes(), name: 'offer.pdf' }])

    const [attachment] = await attachments()
    const download = await owner(`/owner/inbox/attachments/${attachment.id}`)

    expect(download.status).toBe(200)
    expect(download.response.headers.get('content-disposition')).toMatch(/^attachment;/u)

    const stranger = await runWithDb(database.db, async () =>
      app.fetch(new Request(`http://yamanwarda.de/api/v2/owner/inbox/attachments/${attachment.id}`)),
    )

    expect(stranger.status).toBe(404)
    expect((await owner(`/media/${attachment.id}`)).status).toBe(404)
  })

  it('renames a file whose name disagrees with its bytes', async () => {
    await submit({}, [{ bytes: pdfBytes(), name: 'offer.exe' }])

    expect((await attachments())[0].file_name).toBe('offer.exe.pdf')
  })

  it('treats an empty file input as no file', async () => {
    const result = await submit({}, [{ bytes: new Uint8Array(), name: '' }])

    expect(result.status).toBe(201)
    expect(await attachments()).toHaveLength(0)
  })

  it.each([
    ['a program', 'setup.exe', new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 3, 0, 0, 0])],
    ['a program renamed .pdf', 'invoice.pdf', new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1])],
    ['a web page', 'page.html', textBytes('<!doctype html><script>alert(1)</script>')],
    ['a web page renamed .png', 'photo.png', textBytes('<html><body>hi</body></html>')],
    ['an SVG', 'logo.svg', svgBytes()],
    ['a script', 'run.sh', textBytes('#!/bin/sh\nrm -rf ~')],
    ['a ZIP renamed .pdf', 'offer.pdf', zipBytes()],
    ['a ZIP', 'files.zip', zipBytes()],
    ['plain text', 'notes.txt', textBytes('just some notes')],
    ['a macro-enabled Word file renamed .docx', 'brief.docx', officeWith('word/vbaProject.bin')],
    ['an OLE2 file with no Office stream', 'old.doc', ole2Bytes()],
  ])('refuses %s with UNSUPPORTED_FILE_TYPE', async (_label, name, bytes) => {
    const result = await submit({}, [{ bytes, name, type: 'application/pdf' }])

    expect(result.status, JSON.stringify(result.body)).toBe(422)
    expect(result.body.code).toBe('UNSUPPORTED_FILE_TYPE')
    expect(result.body.details).toMatchObject({ field: 'attachment', maxBytes: 10 * 1024 * 1024 })
    expect(result.body.details.allowed).toEqual(['pdf', 'image', 'video', 'word', 'excel', 'powerpoint'])
    await expectNothingStored()
  })

  it('refuses a file over 10 MB with FILE_TOO_LARGE', async () => {
    const big = pdfBytes(CONTACT_LIMITS.fileBytes + 1)
    const result = await submit({}, [{ bytes: big, name: 'big.pdf' }])

    expect(result.status).toBe(413)
    expect(result.body.code).toBe('FILE_TOO_LARGE')
    expect(result.body.details).toMatchObject({ field: 'attachment', maxBytes: CONTACT_LIMITS.fileBytes })
    await expectNothingStored()
  })

  it('accepts a file of exactly 10 MB', async () => {
    const result = await submit({}, [{ bytes: pdfBytes(CONTACT_LIMITS.fileBytes), name: 'max.pdf' }])

    expect(result.status).toBe(201)
    expect(await attachments()).toHaveLength(1)
  })

  it('refuses a request body over 11 MB while reading it', async () => {
    const result = await submit({}, [{ bytes: pdfBytes(12 * 1024 * 1024), name: 'huge.pdf' }])

    expect(result.status).toBe(413)
    expect(result.body.code).toBe('BODY_TOO_LARGE')
    await expectNothingStored()
  })

  it('fails clearly and writes nothing when the file cannot be stored', async () => {
    useMediaStoreForTest('none')

    const submissionId = crypto.randomUUID()
    const result = await submit({ submissionId }, [{ bytes: pdfBytes(), name: 'offer.pdf' }])

    expect(result.status).toBe(503)
    expect(result.body.code).toBe('STORAGE_UNAVAILABLE')
    expect(await conversations()).toHaveLength(0)

    // The same submission, without the file, still goes through.
    expect((await submit({ submissionId })).status).toBe(201)
    expect(await conversations()).toHaveLength(1)
  })
})

/* -------------------------------------------------------------- anti-abuse */

describe('anti-abuse', () => {
  it('limits one source to five submissions an hour', async () => {
    for (let index = 0; index < 5; index += 1) {
      expect((await submit({ email: `visitor${index}@example.com` }, [], '198.51.100.1')).status).toBe(201)
    }

    const limited = await submit({ email: 'visitor9@example.com' }, [], '198.51.100.1')

    expect(limited.status).toBe(429)
    expect(limited.body.code).toBe('RATE_LIMITED')
    expect(await conversations()).toHaveLength(5)

    // Another source is not affected.
    expect((await submit({ email: 'other@example.com' }, [], '198.51.100.2')).status).toBe(201)
  })

  it('limits one email address to three submissions an hour, whatever its case', async () => {
    const emails = ['same@example.com', 'SAME@example.com', ' Same@Example.com ']

    for (const [index, email] of emails.entries()) {
      expect((await submit({ email }, [], `198.51.100.${10 + index}`)).status).toBe(201)
    }

    const limited = await submit({ email: 'same@example.com' }, [], '198.51.100.20')

    expect(limited.status).toBe(429)
    expect(await conversations()).toHaveLength(3)
  })

  it('refuses a failed human check and stores nothing', async () => {
    useTurnstileForTest(async () => false)

    const result = await submit({}, [{ bytes: pdfBytes(), name: 'offer.pdf' }])

    expect(result.status).toBe(422)
    expect(result.body.code).toBe('VERIFICATION_FAILED')
    await expectNothingStored()
  })

  it('passes the token and visitor address to the human check', async () => {
    const seen: Array<[string, string]> = []

    useTurnstileForTest(async (token, ip) => {
      seen.push([token, ip])

      return true
    })

    expect((await submit({ turnstileToken: 'abc' }, [], '198.51.100.44')).status).toBe(201)
    expect(seen).toEqual([['abc', '198.51.100.44']])
  })

  it('requires a token wherever a Turnstile secret is configured', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret'

    const result = await submit({ turnstileToken: '' })

    expect(result.status).toBe(422)
    expect(result.body.code).toBe('VERIFICATION_FAILED')
    expect(await conversations()).toHaveLength(0)
  })

  it('refuses to run without Turnstile in production', async () => {
    await expect(verifyHuman('token', '1.2.3.4', { NODE_ENV: 'production' })).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    })
  })
})

/* ------------------------------------------------------------ availability */

describe('availability', () => {
  it('does not exist where no V2 database is configured', async () => {
    const saved = process.env.DATABASE_URL_V2

    delete process.env.DATABASE_URL_V2

    try {
      const bare = createAppForTest()
      const result = await post(formOf(fields()), { target: bare })

      expect(result.status).toBe(404)
    } finally {
      process.env.DATABASE_URL_V2 = saved
    }

    expect(await conversations()).toHaveLength(0)
  })
})
