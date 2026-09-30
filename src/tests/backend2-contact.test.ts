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
const { CONTACT_FIELDS, CONTACT_LIMITS } = await import('#/backend2/contracts/contact.contract')
const { probeMedia } = await import('#/backend2/media/probe')

type Json = Record<string, any>

const database = await createTestDatabase()
const app = createAppForTest()
let storage = createMemoryStore()
let sent = 0
let recipients: string[] = []

beforeEach(async () => {
  await database.reset()
  storage = createMemoryStore()
  useMediaStoreForTest(storage.store)
  sent = 0
  recipients = []
  useInboxTransportForTest({
    mode: 'fake',
    send: async (email) => {
      sent += 1
      recipients.push(email.to)

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

const ownerCall = async (method: string, path: string, body?: unknown) => {
  const response = await runWithDb(database.db, async () =>
    app.fetch(
      new Request(`http://localhost:3000/api/v2${path}`, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    ),
  )
  const text = await response.text()

  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Json) }
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
    expect(CONTACT_FIELDS.honeypot).toBe('hp_x9')

    const result = await post(
      formOf({ hp_x9: 'https://spam.example', name: '', email: 'not-an-email' }, [
        { bytes: new Uint8Array([0x4d, 0x5a, 0, 0]), name: 'x.exe' },
      ]),
    )

    expect(result.status).toBe(201)
    expect(result.body.data).toEqual({ received: true })
    await expectNothingStored()
  })

  it('keeps a real message whose old `website` field a browser autofilled', async () => {
    const result = await submit({ website: 'https://lena-fischer.example' })

    expect(result.status, JSON.stringify(result.body)).toBe(201)
    expect(await conversations()).toHaveLength(1)
    // The autofilled value is not part of the message.
    expect(JSON.stringify(await messages())).not.toContain('lena-fischer.example')
  })

  it('stores a message, name and company holding U+0000 instead of failing it', async () => {
    const result = await submit({
      name: 'Lena\u0000 Fischer',
      company: 'Bäckerei\u0000',
      message: 'Hello,\u0000 I would like a new website.',
    })

    expect(result.status, JSON.stringify(result.body)).toBe(201)

    const [message] = await messages()

    expect(message.body_text).toBe('Hello, I would like a new website.\n\nCompany: Bäckerei')
    expect(message.from_name).toBe('Lena Fischer')
  })

  it('reads a phone number typed in Arabic-Indic or Persian digits', async () => {
    expect((await submit({ phone: '+٤٩ ١٧٠ ١٢٣٤٥٦٧' })).status).toBe(201)
    expect((await messages())[0].body_text).toContain('Phone: +49 170 1234567')

    await database.reset()

    expect((await submit({ phone: '۰۱۷۰ ۱۲۳۴۵۶۷' })).status).toBe(201)
    expect((await messages())[0].body_text).toContain('Phone: 0170 1234567')
  })

  it('answers the owner’s reply draft in the language of the page the message came from', async () => {
    await submit({ language: 'ar' })

    const [conversation] = await conversations()
    const created = await ownerCall('POST', '/owner/inbox/drafts', { conversationId: conversation.id })

    expect(created.status, JSON.stringify(created.body)).toBe(201)
    expect(created.body.data.language).toBe('ar')

    // The owner's own choice still wins.
    await database.reset()
    await submit({ language: 'de' })

    const [second] = await conversations()
    const chosen = await ownerCall('POST', '/owner/inbox/drafts', { conversationId: second.id, language: 'en' })

    expect(chosen.body.data.language).toBe('en')
  })
})

/* --------------------------------------------------------- email addresses */

describe('email addresses', () => {
  it.each([
    ["an apostrophe", "o'brien@example.ie"],
    ['umlauts in the domain', 'info@bäckerei-müller.de'],
    ['a double hyphen in the domain', 'anna@my--agency.de'],
    ['a punycode domain', 'info@xn--bckerei-mller-hcbc.de'],
  ])('takes an address with %s — and the owner can answer it', async (_label, email) => {
    const result = await submit({ email })

    expect(result.status, JSON.stringify(result.body)).toBe(201)

    const [conversation] = await conversations()

    expect(conversation.counterpart_email).toBe(email)

    const draft = (await ownerCall('POST', '/owner/inbox/drafts', { conversationId: conversation.id })).body.data
    const saved = await ownerCall('PATCH', `/owner/inbox/drafts/${draft.id}`, {
      revision: draft.revision,
      bodyDoc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Thank you!' }] }] },
    })
    const reply = await ownerCall('POST', `/owner/inbox/drafts/${draft.id}/send`, { revision: saved.body.data.revision })

    expect(reply.status, JSON.stringify(reply.body)).toBe(200)
    // A domain with umlauts leaves in the form every mail server reads.
    expect(recipients).toEqual([email === 'info@bäckerei-müller.de' ? 'info@xn--bckerei-mller-bfb28a.de' : email])
  })

  it('asks for A–Z before the @, where the email service could not answer', async () => {
    const result = await submit({ email: 'jürgen@example.de' })

    expect(result.status).toBe(422)
    expect(result.body.details.issues).toEqual([
      { field: 'email', message: 'Use only the letters A–Z, digits and . _ - + before the @' },
    ])
    await expectNothingStored()
  })

  it.each([['a@b.com, c@d.com'], ['Lena <lena@example.com>'], ['lena@localhost'], ['lena@1.2.3.4'], ['lena@exa mple.com']])(
    'refuses %s with one issue',
    async (email) => {
      const result = await submit({ email })

      expect(result.status).toBe(422)
      expect(result.body.details.issues.map((issue: { field: string }) => issue.field)).toEqual(['email'])
    },
  )
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

/* ------------------------------------------------------- real-shaped files */

const utf16 = (text: string): number[] => [...text].flatMap((character) => [character.charCodeAt(0), 0])

/**
 * A `.doc` as Word on a Mac writes it: the OLE2 directory at the very end,
 * well past the first 64 KB, and spread over two sectors — `WordDocument` is
 * in the second. The first sectors hold only text, including the word
 * "MacBook" in UTF-16, which a search of the head alone would take for an
 * Excel "Book" stream.
 */
const macWordBytes = (stream = 'WordDocument', text = 'Notes written on my MacBook for the new website.'): Uint8Array => {
  const sector = 512
  const dataSectors = 200 // 100 KB before the directory
  const fatSectors = [dataSectors, dataSectors + 1] // 128 entries each
  const directory = [dataSectors + 2, dataSectors + 3]
  const bytes = new Uint8Array((directory[1]! + 2) * sector)
  const view = new DataView(bytes.buffer)
  const at = (index: number) => (index + 1) * sector
  const setFat = (index: number, value: number) =>
    view.setUint32(at(fatSectors[Math.floor(index / 128)]!) + (index % 128) * 4, value, true)

  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0)
  view.setUint16(24, 0x3e, true)
  view.setUint16(26, 3, true)
  view.setUint16(28, 0xfffe, true)
  view.setUint16(30, 9, true) // 512-byte sectors
  view.setUint16(32, 6, true)
  view.setUint32(44, fatSectors.length, true)
  view.setUint32(48, directory[0]!, true) // the first directory sector
  view.setUint32(56, 4096, true)
  view.setUint32(60, 0xfffffffe, true)
  view.setUint32(68, 0xfffffffe, true) // no DIFAT chain
  for (let index = 0; index < 109; index += 1) view.setUint32(76 + index * 4, fatSectors[index] ?? 0xffffffff, true)

  // The document's text, as Word stores it: UTF-16.
  bytes.set(utf16(text), at(3))

  // The FAT: every data sector ends its own chain; the directory's two are linked.
  for (let index = 0; index < 256; index += 1) setFat(index, 0xffffffff)
  for (let index = 0; index < dataSectors; index += 1) setFat(index, 0xfffffffe)
  for (const fat of fatSectors) setFat(fat, 0xfffffffd)
  setFat(directory[0]!, directory[1]!)
  setFat(directory[1]!, 0xfffffffe)

  const entry = (offset: number, name: string, type: number) => {
    bytes.set(utf16(name), offset)
    view.setUint16(offset + 64, (name.length + 1) * 2, true)
    bytes[offset + 66] = type
  }

  entry(at(directory[0]!), 'Root Entry', 5)
  entry(at(directory[0]!) + 128, '1Table', 2)
  entry(at(directory[0]!) + 256, '\u0005SummaryInformation', 2)
  entry(at(directory[0]!) + 384, '\u0005DocumentSummaryInformation', 2)
  entry(at(directory[1]!), stream, 2)

  return bytes
}

/** A stored (uncompressed) ZIP, with its central directory at the end as every ZIP has. */
const zipOf = (entries: Array<[string, Uint8Array]>): Uint8Array => {
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const [name, data] of entries) {
    const nameBytes = new TextEncoder().encode(name)
    const local = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(local.buffer)

    localView.setUint32(0, 0x04034b50, true)
    localView.setUint32(18, data.length, true)
    localView.setUint32(22, data.length, true)
    localView.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)

    const record = new Uint8Array(46 + nameBytes.length)
    const recordView = new DataView(record.buffer)

    recordView.setUint32(0, 0x02014b50, true)
    recordView.setUint32(20, data.length, true)
    recordView.setUint32(24, data.length, true)
    recordView.setUint16(28, nameBytes.length, true)
    recordView.setUint32(42, offset, true)
    record.set(nameBytes, 46)

    parts.push(local, data)
    central.push(record)
    offset += local.length + data.length
  }

  const centralSize = central.reduce((sum, record) => sum + record.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)

  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)

  const all = [...parts, ...central, end]
  const bytes = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0))
  let position = 0

  for (const part of all) {
    bytes.set(part, position)
    position += part.length
  }

  return bytes
}

/**
 * A `.docx` the way LibreOffice or a Word file with photos is laid out: a
 * large picture first, and `[Content_Types].xml` as the last entry — nowhere
 * near the first 8 KB.
 */
const lateOfficeBytes = (folder: 'word' | 'xl' = 'word', extra: Array<[string, Uint8Array]> = []): Uint8Array =>
  zipOf([
    [`${folder}/media/image1.png`, new Uint8Array(70 * 1024).fill(7)],
    ['_rels/.rels', textBytes('<Relationships/>')],
    [`${folder}/${folder === 'word' ? 'document' : 'workbook'}.xml`, textBytes('<document/>')],
    ...extra,
    ['[Content_Types].xml', textBytes('<Types/>')],
  ])

/** A phone photo: 85 KB of camera data (EXIF, a colour profile) before the frame header. */
const phoneJpegBytes = (): Uint8Array => {
  const segment = (marker: number, length: number) => {
    const bytes = new Uint8Array(2 + length)

    bytes[0] = 0xff
    bytes[1] = marker
    bytes[2] = length >> 8
    bytes[3] = length & 0xff

    return bytes
  }
  const sof = segment(0xc0, 17)

  sof.set([0x08, 0x0f, 0xc0, 0x0b, 0xd0], 4) // 8-bit, 4032 x 3024

  const pieces = [new Uint8Array([0xff, 0xd8]), segment(0xe1, 65_533), segment(0xe2, 20_000), sof, segment(0xda, 12), new Uint8Array([1, 2, 3, 0xff, 0xd9])]
  const bytes = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0))
  let offset = 0

  for (const piece of pieces) {
    bytes.set(piece, offset)
    offset += piece.length
  }

  return bytes
}

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

  it.each([
    ['a Word file from a Mac, its directory at the end', 'Angebot.doc', macWordBytes(), 'application/msword'],
    ['a Word file whose parts are listed at the end', 'Brief.docx', lateOfficeBytes('word'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['an Excel file whose parts are listed at the end', 'Zahlen.xlsx', lateOfficeBytes('xl'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['a phone photo with its frame header past 64 KB', 'IMG_2044.JPG', phoneJpegBytes(), 'image/jpeg'],
  ])('keeps %s', async (_label, name, bytes, detected) => {
    expect(bytes.byteLength).toBeGreaterThan(64 * 1024)

    const result = await submit({}, [{ bytes, name }])

    expect(result.status, JSON.stringify(result.body)).toBe(201)
    expect((await attachments())[0]).toMatchObject({ file_name: name, detected_type: detected, status: 'stored' })
  })

  it('reads an OLE2 file by its directory, not by words in its text', async () => {
    // "MacBook" in the text is not an Excel stream; the directory says Word.
    expect(probeMedia(macWordBytes())?.contentType).toBe('application/msword')
    expect(probeMedia(macWordBytes('Workbook'))?.contentType).toBe('application/vnd.ms-excel')
    expect(probeMedia(macWordBytes('PowerPoint Document'))?.contentType).toBe('application/vnd.ms-powerpoint')
    // A directory naming no Office stream is still refused.
    expect((await submit({}, [{ bytes: macWordBytes('Contents'), name: 'odd.doc' }])).body.code).toBe('UNSUPPORTED_FILE_TYPE')
  })

  it('still refuses a macro-enabled Word file whose parts are listed at the end', async () => {
    const result = await submit({}, [{ bytes: lateOfficeBytes('word', [['word/vbaProject.bin', textBytes('x')]]), name: 'brief.docx' }])

    expect(result.body.code).toBe('UNSUPPORTED_FILE_TYPE')
  })

  it('leaves the Media library’s head-only reading as it was', () => {
    const head = (bytes: Uint8Array) => bytes.subarray(0, 64 * 1024)

    // Media reads only the head: the name still picks the OLE2 flavour there.
    expect(probeMedia(head(macWordBytes('WordDocument', 'Angebot')), 'Angebot.doc')?.contentType).toBe('application/msword')
    expect(probeMedia(head(macWordBytes('WordDocument', 'Angebot')))).toBeNull()
    expect(probeMedia(head(lateOfficeBytes('word')))?.contentType).toBe('application/zip')
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

  it('does not lock out an address after failed human checks sent in its name', async () => {
    useTurnstileForTest(async (token) => token === 'good')

    for (let index = 0; index < 6; index += 1) {
      const refused = await submit({ email: 'client@example.com', turnstileToken: 'bad' }, [], '198.51.100.60')

      expect(refused.body.code).toBe('VERIFICATION_FAILED')
    }

    // The client, from the same network and from another, still gets through.
    expect((await submit({ email: 'client@example.com', turnstileToken: 'good' }, [], '198.51.100.60')).status).toBe(201)
    expect((await submit({ email: 'client@example.com', turnstileToken: 'good' }, [], '198.51.100.61')).status).toBe(201)
  })

  it('answers a retry of a message that arrived with success, even at the limit', async () => {
    const last = crypto.randomUUID()

    for (const submissionId of [crypto.randomUUID(), crypto.randomUUID(), last]) {
      expect((await submit({ email: 'same@example.com', submissionId })).status).toBe(201)
    }

    // The limit is reached — and the retry of the third is still "received".
    expect((await submit({ email: 'same@example.com' })).status).toBe(429)

    const retry = await submit({ email: 'same@example.com', submissionId: last })

    expect(retry.status).toBe(201)
    expect(await conversations()).toHaveLength(3)
  })

  it('counts only received messages against an address, not refused files', async () => {
    for (let index = 0; index < 4; index += 1) {
      expect((await submit({ email: 'files@example.com' }, [{ bytes: textBytes('x'), name: 'x.txt' }], `198.51.100.${70 + index}`)).status).toBe(422)
    }

    expect((await submit({ email: 'files@example.com' }, [], '198.51.100.80')).status).toBe(201)
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
