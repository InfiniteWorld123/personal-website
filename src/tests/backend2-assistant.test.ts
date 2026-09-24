import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from './helpers/backend2-db'
import { type Json, blogHarness, doc, paragraph } from './helpers/backend2-blog'

/**
 * The Public AI Assistant, end to end, against a real PostgreSQL running
 * inside this process (`docs/v2/ai-assistant.md`).
 *
 * What is under test is mostly restraint: it answers only from what is
 * published right now, a withdrawn service stops informing answers at once,
 * a model may not name a price the website does not, the model is never
 * called past its daily allowance (0 by default), and a visitor's
 * conversation stores no address. No real AI service is ever reached: the
 * provider is a fake adapter.
 */
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
delete process.env.BACKEND2_OWNER_AUTH
delete process.env.ASSISTANT_PROVIDER
delete process.env.ASSISTANT_DAILY_PROVIDER_CALLS
delete process.env.ASSISTANT_DAILY_QUESTION_LIMIT

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { ownerAssistantPaths } = await import('#/backend2/modules/assistant/assistant.owner.route')
const { useProviderAdapterForTest } = await import('#/backend2/modules/assistant/assistant.provider')
const { purgeExpiredConversations } = await import('#/backend2/modules/assistant/assistant.service')
const analytics = await import('#/backend2/modules/assistant/assistant.analytics')

const database = await createTestDatabase()
const app = createAppForTest()
const blog = blogHarness({ database, app, runWithDb })
const { call } = blog

beforeEach(async () => {
  await database.reset()
})

afterEach(() => {
  useProviderAdapterForTest(undefined)
  delete process.env.ASSISTANT_DAILY_PROVIDER_CALLS
  delete process.env.ASSISTANT_DAILY_QUESTION_LIMIT
  delete process.env.BACKEND2_OWNER_AUTH
})

afterAll(async () => {
  await database.close()
})

/* ---------------------------------------------------------------- plumbing */

let senders = 0
/** A different visitor address each call, so the per-sender limits stay out of the way. */
const nextSender = () => {
  senders += 1

  return `198.51.${Math.floor(senders / 250) % 250}.${(senders % 250) + 1}`
}

const ask = (body: Json, sender = nextSender()) =>
  call('POST', '/assistant/ask', body, { headers: { 'cf-connecting-ip': sender } })

const enable = async (patch: Json = {}) => {
  const saved = await call('PATCH', '/owner/assistant/settings', { enabled: true, ...patch })

  expect(saved.status, JSON.stringify(saved.body)).toBe(200)

  return saved.body.data
}

const count = async (table: string, where = ''): Promise<number> =>
  (await database.db.query(`SELECT count(*)::int AS n FROM ${table} ${where}`)).rows[0].n as number

const usageToday = async (): Promise<Json> =>
  (await database.db.query(`SELECT * FROM v2_assistant_usage_days WHERE day = (now() AT TIME ZONE 'UTC')::date`))
    .rows[0] ?? {}

/* ------------------------------------------------------ published content */

type Language = 'de' | 'en' | 'ar'

const serviceTexts: Record<Language, Json> = {
  en: {
    name: 'Zebracorn package',
    summary: 'A zebracorn website for small bakeries that want online orders.',
    included: ['Zebracorn design', 'Bakery order form'],
    body: 'The zebracorn package includes a bakery website with an order form and hosting advice.',
    promotionLabel: 'Autumn offer',
    seoTitle: '',
    seoDescription: '',
  },
  de: {
    name: 'Zebracorn-Paket',
    summary: 'Eine Zebracorn-Website für kleine Bäckereien mit Online-Bestellung.',
    included: ['Zebracorn-Design', 'Bestellformular für Bäckereien'],
    body: 'Das Zebracorn-Paket enthält eine Bäckerei-Website mit Bestellformular.',
    promotionLabel: 'Herbstangebot',
    seoTitle: '',
    seoDescription: '',
  },
  ar: {
    name: 'باقة زيبراكورن',
    summary: 'موقع زيبراكورن للمخابز الصغيرة مع الطلب عبر الإنترنت.',
    included: ['تصميم زيبراكورن', 'نموذج طلب للمخبز'],
    body: 'تتضمن باقة زيبراكورن موقعاً للمخبز مع نموذج طلب.',
    promotionLabel: 'عرض الخريف',
    seoTitle: '',
    seoDescription: '',
  },
}

const fixedPrice = (amountCents = 149_000) => ({
  mode: 'from',
  amountCents,
  period: 'one_time',
  promotion: { active: false, amountCents: null },
})

const createService = async (slug: string, texts: Record<Language, Json>, price: Json = fixedPrice()) => {
  const created = await call('POST', '/owner/services', { name: texts.en.name, language: 'en' })

  expect(created.status, JSON.stringify(created.body)).toBe(201)

  const id = created.body.data.id as string
  const saved = await call('PATCH', `/owner/services/${id}`, {
    draftRevision: created.body.data.draftRevision,
    slug,
    price,
    texts,
  })

  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
  expect(saved.body.data.publishBlockers).toEqual([])

  return id
}

const publishService = async (id: string) => {
  const current = await call('GET', `/owner/services/${id}`)
  const published = await call('POST', `/owner/services/${id}/publish`, {
    draftRevision: current.body.data.draftRevision,
  })

  expect(published.status, JSON.stringify(published.body)).toBe(200)
}

const liveService = async (slug = 'zebracorn', texts = serviceTexts, price?: Json) => {
  const id = await createService(slug, texts, price)

  await publishService(id)

  return id
}

const liveProject = async () => {
  const created = await call('POST', '/owner/projects', { type: 'client' })
  const id = created.body.data.id as string
  const one = (language: Language) => ({
    name: `Okapi Observatory ${language}`,
    categoryLabel: '',
    summary: `An okapi observatory booking system with telescope schedules (${language}).`,
    caseStudy: null,
  })
  const saved = await call('PUT', `/owner/projects/${id}`, {
    draftRevision: created.body.data.draftRevision,
    slug: 'okapi-observatory',
    type: 'client',
    workStatus: 'completed',
    clientName: 'Secret Client GmbH',
    showClientName: false,
    tech: ['React'],
    links: [],
    texts: { de: one('de'), en: one('en'), ar: one('ar') },
    cover: null,
    gallery: [],
  })

  expect(saved.status, JSON.stringify(saved.body)).toBe(200)

  const ready = await call('GET', `/owner/projects/${id}`)
  const published = await call('POST', `/owner/projects/${id}/publish`, {
    draftRevision: ready.body.data.draftRevision,
  })

  expect(published.status, JSON.stringify(published.body)).toBe(200)

  return id
}

const postTexts = (topic: string) => ({
  en: {
    title: `All about ${topic}`,
    summary: `A short guide to ${topic} for curious readers.`,
    body: doc(paragraph(`The ${topic} method explained step by step, with practical tips.`)),
    seoTitle: '',
    seoDescription: '',
  },
  de: {
    title: `Alles über ${topic}`,
    summary: `Eine kurze Anleitung zu ${topic}.`,
    body: doc(paragraph(`Die ${topic}-Methode Schritt für Schritt erklärt.`)),
    seoTitle: '',
    seoDescription: '',
  },
  ar: {
    title: `كل شيء عن ${topic}`,
    summary: `دليل قصير عن ${topic}.`,
    body: doc(paragraph(`شرح طريقة ${topic} خطوة بخطوة.`)),
    seoTitle: '',
    seoDescription: '',
  },
})

/** A fake model: records every call and says whatever the test wants. */
const fakeProvider = (say: (input: Json) => { kind: 'answer'; text: string } | { kind: 'unknown' }) => {
  const calls: Json[] = []

  useProviderAdapterForTest({
    name: 'workers-ai',
    generate: async (input) => {
      calls.push(input)

      return say(input)
    },
  })

  return calls
}

/* ================================================================ switched off */

describe('before the owner switches it on', () => {
  it('reports itself off with the notice, and refuses a question without storing it', async () => {
    const status = await call('GET', '/assistant/status?language=de')

    expect(status.status).toBe(200)
    expect(status.response.headers.get('cache-control')).toBe('no-store')
    expect(status.body.data).toMatchObject({
      enabled: false,
      mode: 'extractive',
      notice: { key: 'assistant.notice.v1' },
      limits: { messageMaxLength: 1000 },
    })
    expect(status.body.data.notice.text).toContain('gespeichert')
    expect(status.body.data.links.map((link: Json) => link.url)).toEqual([
      '/de/contact',
      '/de/booking',
      '/de/datenschutz',
    ])

    for (const language of ['en', 'ar'] as const) {
      const other = await call('GET', `/assistant/status?language=${language}`)

      expect(other.body.data.notice.text).not.toBe(status.body.data.notice.text)
    }

    const refused = await ask({ message: 'What does the zebracorn package cost?' })

    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('ASSISTANT_UNAVAILABLE')
    expect(refused.body.details).toEqual({ reason: 'disabled' })
    expect(await count('v2_assistant_conversations')).toBe(0)
    expect(await count('v2_assistant_messages')).toBe(0)
  })
})

/* ================================================================== grounding */

describe('answers come only from what is published now', () => {
  it('answers a price question from a live service, with its published price and source', async () => {
    await enable()
    await liveService()

    const answer = await ask({ message: 'How much does the zebracorn package cost?', locale: 'de' })

    expect(answer.status, JSON.stringify(answer.body)).toBe(200)
    expect(answer.response.headers.get('cache-control')).toBe('no-store')

    const { data } = answer.body

    expect(data.conversationId).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(data.answer).toMatchObject({ language: 'en', outcome: 'answered', provider: 'none' })
    expect(data.answer.text).toContain('Zebracorn package')
    expect(data.answer.text).toContain('Price: from €1,490 one-time')
    // A price question always points at the owner for a custom quote.
    expect(data.answer.text).toContain('custom quote')
    expect(data.answer.sources).toContainEqual({
      kind: 'service',
      title: 'Zebracorn package',
      url: '/en/services#zebracorn',
    })
    expect(data.answer.links.map((link: Json) => link.kind)).toEqual(['contact', 'booking'])
  })

  it('never answers from an unpublished service, and forgets one the moment it is taken down', async () => {
    await enable()

    const id = await createService('zebracorn', serviceTexts)

    const before = await ask({ message: 'Tell me about the zebracorn package' })

    expect(before.body.data.answer.outcome).toBe('fallback')
    expect(JSON.stringify(before.body.data.answer)).not.toContain('Zebracorn')

    await publishService(id)

    const live = await ask({ message: 'Tell me about the zebracorn package' })

    expect(live.body.data.answer.outcome).toBe('answered')
    expect(live.body.data.answer.text).toContain('Zebracorn package')

    const takenDown = await call('POST', `/owner/services/${id}/unpublish`)

    expect(takenDown.status, JSON.stringify(takenDown.body)).toBe(200)

    const after = await ask({ message: 'Tell me about the zebracorn package' })

    expect(after.body.data.answer.outcome).toBe('fallback')
    expect(JSON.stringify(after.body.data.answer)).not.toContain('Zebracorn')
  })

  it('does not read a pending draft edit on a live service', async () => {
    await enable()

    const id = await liveService()
    const current = await call('GET', `/owner/services/${id}`)
    const edited = await call('PATCH', `/owner/services/${id}`, {
      draftRevision: current.body.data.draftRevision,
      texts: {
        ...serviceTexts,
        en: { ...serviceTexts.en, body: 'Secret marzipan discount for the capybara season.' },
      },
      price: fixedPrice(99_000),
    })

    expect(edited.status, JSON.stringify(edited.body)).toBe(200)

    const draftWords = await ask({ message: 'Is there a capybara marzipan discount?' })

    expect(draftWords.body.data.answer.outcome).toBe('fallback')

    const price = await ask({ message: 'What is the price of the zebracorn package?' })

    expect(price.body.data.answer.text).toContain('€1,490')
    expect(price.body.data.answer.text).not.toContain('990')
  })

  it('reads published articles and projects, never a draft article or a hidden client name', async () => {
    await enable()
    await liveProject()
    await blog.makeLive('narwhal-guide', { texts: postTexts('narwhal') })
    await blog.makePublishable('walrus-guide', { texts: postTexts('walrus') })

    const article = await ask({ message: 'Do you have a guide about the narwhal method?' })

    expect(article.body.data.answer.outcome).toBe('answered')
    expect(article.body.data.answer.sources).toContainEqual({
      kind: 'post',
      title: 'All about narwhal',
      url: '/en/blog/narwhal-guide',
    })

    const draft = await ask({ message: 'Do you have a guide about the walrus method?' })

    expect(draft.body.data.answer.outcome).toBe('fallback')

    const project = await ask({ message: 'Did you build an okapi observatory?' })

    expect(project.body.data.answer.outcome).toBe('answered')
    expect(project.body.data.answer.sources).toContainEqual({
      kind: 'project',
      title: 'Okapi Observatory en',
      url: '/en/work/okapi-observatory',
    })
    expect(JSON.stringify(project.body.data)).not.toContain('Secret Client')
  })

  it('answers from the published FAQ and static copy', async () => {
    await enable()

    const faq = await ask({ message: 'Do you work with clients outside Germany?' })

    expect(faq.body.data.answer.outcome).toBe('answered')
    expect(faq.body.data.answer.sources.map((source: Json) => source.url)).toContain('/en/faq')

    // A saved Content field is live, so the next answer uses the new wording.
    const key = encodeURIComponent('faq.groups.0.items.3.answer')
    const saved = await call('PUT', `/owner/content/fields/${key}`, {
      language: 'en',
      value: 'Yes, including clients in Iceland and Japan, fully remote.',
      expectedRevision: 0,
    })

    expect(saved.status, JSON.stringify(saved.body)).toBe(200)

    const updated = await ask({ message: 'Do you work with clients outside Germany?' })

    expect(updated.body.data.answer.text).toContain('Iceland and Japan')
  })

  it('says honestly when the website does not answer, and offers Contact and Booking', async () => {
    await enable()
    await liveService()

    const answer = await ask({ message: 'What is the capital city of Mongolia?' })

    expect(answer.body.data.answer).toMatchObject({
      outcome: 'fallback',
      provider: 'none',
      sources: [],
      links: [
        { kind: 'contact', url: '/en/contact' },
        { kind: 'booking', url: '/en/booking' },
      ],
    })
    expect(answer.body.data.answer.text).toContain("couldn't find")
  })

  it('points a visitor who wants the owner at Contact and Booking, and greets a greeting', async () => {
    await enable()

    const handoff = await ask({ message: 'I want to book an appointment' })

    expect(handoff.body.data.answer.links.map((link: Json) => link.kind)).toEqual(['contact', 'booking'])
    expect(['handoff', 'answered']).toContain(handoff.body.data.answer.outcome)

    const hello = await ask({ message: 'Hallo!' })

    expect(hello.body.data.answer).toMatchObject({ outcome: 'smalltalk', language: 'de' })
  })
})

/* ================================================================== languages */

describe('it answers in the language the visitor writes', () => {
  it('German, English and Arabic, whatever the page is', async () => {
    await enable()
    await liveService()

    const german = await ask({ message: 'Was kostet das Zebracorn-Paket?', locale: 'en' })

    expect(german.body.data.answer.language).toBe('de')
    expect(german.body.data.answer.text).toContain('Das steht dazu auf der Website')
    expect(german.body.data.answer.text).toContain('Zebracorn-Paket')
    expect(german.body.data.answer.text).toContain('ab 1.490 € einmalig')
    expect(german.body.data.answer.sources[0].url).toBe('/de/services#zebracorn')

    const english = await ask({ message: 'What does the zebracorn package include?', locale: 'ar' })

    expect(english.body.data.answer.language).toBe('en')
    expect(english.body.data.answer.text).toContain('Zebracorn package')

    const arabic = await ask({ message: 'كم سعر باقة زيبراكورن؟', locale: 'de' })

    expect(arabic.body.data.answer.language).toBe('ar')
    expect(arabic.body.data.answer.text).toContain('هذا ما يذكره الموقع')
    expect(arabic.body.data.answer.text).toContain('باقة زيبراكورن')
    expect(arabic.body.data.answer.sources[0].url).toBe('/ar/services#zebracorn')

    const arabicFallback = await ask({ message: 'ما هي عاصمة منغوليا؟' })

    expect(arabicFallback.body.data.answer).toMatchObject({ language: 'ar', outcome: 'fallback' })
    expect(arabicFallback.body.data.answer.links[0].url).toBe('/ar/contact')

    const { rows } = await database.db.query(
      'SELECT language FROM v2_assistant_conversations ORDER BY created_at, language',
    )

    expect(rows.map((row: Json) => row.language).sort()).toEqual(['ar', 'ar', 'de', 'en'])
  })
})

/* ================================================================== the model */

describe('the optional model', () => {
  it('is never called while the daily allowance is 0, which is the default', async () => {
    await enable()
    await liveService()

    const calls = fakeProvider(() => ({ kind: 'answer', text: 'It is lovely.' }))
    const answer = await ask({ message: 'Tell me about the zebracorn package' })

    expect(calls).toHaveLength(0)
    expect(answer.body.data.answer.provider).toBe('none')
    expect((await call('GET', '/assistant/status')).body.data.mode).toBe('extractive')
  })

  it('may reword published snippets, and repeats only published prices', async () => {
    await enable()
    await liveService()
    process.env.ASSISTANT_DAILY_PROVIDER_CALLS = '5'

    const calls = fakeProvider(() => ({
      kind: 'answer',
      text: 'The Zebracorn package starts at €1,490 as a one-time price.',
    }))

    expect((await call('GET', '/assistant/status')).body.data.mode).toBe('generative')

    const answer = await ask({ message: 'How much is the zebracorn package?' })

    expect(calls).toHaveLength(1)
    // Only published snippets reach the model — never a draft, never private data.
    expect(JSON.stringify(calls[0].snippets)).toContain('Zebracorn')
    expect(answer.body.data.answer).toMatchObject({ provider: 'workers-ai', outcome: 'answered' })
    expect(answer.body.data.answer.text).toContain('€1,490')
    expect((await usageToday()).provider_calls).toBe(1)
  })

  it('throws away an answer with an invented price and sends the published wording instead', async () => {
    await enable()
    await liveService()
    process.env.ASSISTANT_DAILY_PROVIDER_CALLS = '5'

    fakeProvider(() => ({ kind: 'answer', text: 'For you, only 999 € this week!' }))

    const answer = await ask({ message: 'How much is the zebracorn package?' })

    expect(answer.body.data.answer.provider).toBe('none')
    expect(answer.body.data.answer.text).not.toContain('999')
    expect(answer.body.data.answer.text).toContain('€1,490')

    const usage = await usageToday()

    expect(usage.provider_calls).toBe(1)
    expect(usage.provider_fallbacks).toBe(1)
  })

  it('falls back safely when the model fails, or says the snippets do not answer', async () => {
    await enable()
    await liveService()
    process.env.ASSISTANT_DAILY_PROVIDER_CALLS = '5'

    fakeProvider(() => {
      throw new Error('provider down')
    })

    const failed = await ask({ message: 'Tell me about the zebracorn package' })

    expect(failed.status).toBe(200)
    expect(failed.body.data.answer).toMatchObject({ provider: 'none', outcome: 'answered' })

    fakeProvider(() => ({ kind: 'unknown' }))

    const unknown = await ask({ message: 'Tell me about the zebracorn package' })

    expect(unknown.body.data.answer).toMatchObject({ provider: 'none', outcome: 'fallback' })
  })

  it('stops calling the model once today’s cap is used, and falls back to the published text', async () => {
    await enable()
    await liveService()
    process.env.ASSISTANT_DAILY_PROVIDER_CALLS = '1'

    const calls = fakeProvider(() => ({ kind: 'answer', text: 'The Zebracorn package is for bakeries.' }))

    const first = await ask({ message: 'Tell me about the zebracorn package' })
    const second = await ask({ message: 'Tell me about the zebracorn package' })

    expect(calls).toHaveLength(1)
    expect(first.body.data.answer.provider).toBe('workers-ai')
    expect(second.body.data.answer.provider).toBe('none')
    expect(second.body.data.answer.outcome).toBe('answered')
    expect((await call('GET', '/assistant/status')).body.data.mode).toBe('extractive')

    const usage = await call('GET', '/owner/assistant/usage?days=7')

    expect(usage.status).toBe(200)
    expect(usage.body.data.provider).toEqual({ configured: 'workers-ai', dailyCap: 1, usedToday: 1, active: false })
    expect(usage.body.data.estimatedCostCents).toBe(0)
  })

  it('is never asked about a question the website does not answer', async () => {
    await enable()
    process.env.ASSISTANT_DAILY_PROVIDER_CALLS = '5'

    const calls = fakeProvider(() => ({ kind: 'answer', text: 'Ulaanbaatar.' }))
    const answer = await ask({ message: 'What is the capital city of Mongolia?' })

    expect(calls).toHaveLength(0)
    expect(answer.body.data.answer.outcome).toBe('fallback')
  })
})

/* ====================================================================== abuse */

describe('abuse and cost controls', () => {
  it('limits one sender, and keeps only a keyed hash of the address', async () => {
    await enable()

    const sender = '203.0.113.77'
    const statuses: number[] = []

    for (let attempt = 0; attempt < 9; attempt += 1) {
      statuses.push((await ask({ message: 'What is the capital city of Mongolia?' }, sender)).status)
    }

    expect(statuses.slice(0, 8).every((status) => status === 200)).toBe(true)
    expect(statuses[8]).toBe(429)

    const refused = await ask({ message: 'Hello?' }, sender)

    expect(refused.body.code).toBe('RATE_LIMITED')
    expect(refused.body.details.reason).toBe('too_fast')

    // Another visitor is unaffected.
    expect((await ask({ message: 'Hello?' })).status).toBe(200)

    const { rows: keys } = await database.db.query('SELECT key FROM v2_auth_rate_limits')

    for (const { key } of keys as Array<{ key: string }>) {
      expect(key).not.toContain(sender)
    }

    expect((await usageToday()).rate_limited).toBe(2)
  })

  it('stops the whole site at the daily question limit', async () => {
    await enable()
    process.env.ASSISTANT_DAILY_QUESTION_LIMIT = '2'

    expect((await ask({ message: 'Hello' })).status).toBe(200)
    expect((await ask({ message: 'Hello' })).status).toBe(200)

    const third = await ask({ message: 'Hello' })

    expect(third.status).toBe(409)
    expect(third.body).toMatchObject({ code: 'ASSISTANT_UNAVAILABLE', details: { reason: 'daily_limit' } })
    expect(await count('v2_assistant_messages', "WHERE role = 'visitor'")).toBe(2)
    expect((await usageToday()).capped).toBe(1)
  })

  it('refuses an oversized question or body', async () => {
    await enable()

    const long = await ask({ message: 'a'.repeat(1001) })

    expect(long.status).toBe(422)

    const huge = await call('POST', '/assistant/ask', { message: 'hi', padding: 'x'.repeat(9000) })

    expect(huge.status).toBe(413)

    const empty = await ask({ message: '   ' })

    expect(empty.status).toBe(422)
    expect(await count('v2_assistant_messages')).toBe(0)
  })
})

/* ================================================================ transcripts */

describe('the conversation a visitor has', () => {
  it('continues with its handle, stores only a hash of it, and keeps no address', async () => {
    await enable()

    const first = await ask({ message: 'Hello', locale: 'en' }, '203.0.113.9')
    const token = first.body.data.conversationId as string

    const second = await ask({ conversationId: token, message: 'What is the capital city of Mongolia?' })

    expect(second.body.data.conversationId).toBe(token)
    expect(await count('v2_assistant_conversations')).toBe(1)
    expect(await count('v2_assistant_messages')).toBe(4)

    const stored = JSON.stringify(
      (await database.db.query('SELECT * FROM v2_assistant_conversations')).rows,
    )

    expect(stored).not.toContain(token)
    expect(stored).not.toContain('203.0.113.9')

    const { rows: columns } = await database.db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name IN ('v2_assistant_conversations', 'v2_assistant_messages')`,
    )
    const names = columns.map((row: Json) => row.column_name as string)

    for (const forbidden of ['ip', 'ip_address', 'user_agent', 'email', 'name']) {
      expect(names).not.toContain(forbidden)
    }

    // An unknown handle simply starts a new conversation.
    const unknown = await ask({ conversationId: 'A'.repeat(43), message: 'Hello' })

    expect(unknown.status).toBe(200)
    expect(unknown.body.data.conversationId).not.toBe('A'.repeat(43))
    expect(await count('v2_assistant_conversations')).toBe(2)
  })
})

describe('the owner’s transcript viewer', () => {
  const seed = async () => {
    await enable()

    const messages = [
      'Hello',
      'Was kostet eine Website?',
      'What is the capital city of Mongolia?',
      'كم سعر الموقع؟',
      'Do you work with clients outside Germany?',
    ]

    for (const message of messages) {
      expect((await ask({ message })).status).toBe(200)
    }
  }

  it('pages conversations in a stable order, and filters by language, search, outcome and date', async () => {
    await seed()

    const seen: string[] = []

    for (const page of [1, 2, 3]) {
      const listed = await call('GET', `/owner/assistant/conversations?page=${page}&pageSize=2`)

      expect(listed.status).toBe(200)
      expect(listed.response.headers.get('cache-control')).toContain('no-store')
      expect(listed.body.data).toMatchObject({ page, pageSize: 2, total: 5, pageCount: 3 })

      seen.push(...listed.body.data.items.map((item: Json) => item.id))
    }

    expect(new Set(seen).size).toBe(5)

    const first = await call('GET', '/owner/assistant/conversations?pageSize=100')

    expect(first.body.data.items.map((item: Json) => item.id)).toEqual(seen)
    expect(first.body.data.items[0]).toMatchObject({ messageCount: 2 })
    expect(Object.keys(first.body.data.items[0]).sort()).toEqual(
      ['createdAt', 'fallbackCount', 'id', 'language', 'lastMessageAt', 'messageCount', 'pageLocale', 'preview'].sort(),
    )

    const arabic = await call('GET', '/owner/assistant/conversations?language=ar')

    expect(arabic.body.data.total).toBe(1)
    expect(arabic.body.data.items[0].preview).toBe('كم سعر الموقع؟')

    const searched = await call('GET', '/owner/assistant/conversations?search=mongolia')

    expect(searched.body.data.total).toBe(1)

    const unanswered = await call('GET', '/owner/assistant/conversations?outcome=fallback')

    expect(unanswered.body.data.items.every((item: Json) => item.fallbackCount > 0)).toBe(true)

    const today = new Date().toISOString().slice(0, 10)
    const inRange = await call('GET', `/owner/assistant/conversations?from=${today}&to=${today}`)

    expect(inRange.body.data.total).toBe(5)

    const past = await call('GET', '/owner/assistant/conversations?from=2020-01-01&to=2020-01-31')

    expect(past.body.data.total).toBe(0)

    const reversed = await call('GET', `/owner/assistant/conversations?from=${today}&to=2020-01-01`)

    expect(reversed.status).toBe(422)

    const oversize = await call('GET', '/owner/assistant/conversations?pageSize=101')

    expect(oversize.status).toBe(422)
  })

  it('shows one conversation in order, and deleting it removes every message', async () => {
    await seed()

    const listed = await call('GET', '/owner/assistant/conversations?search=kostet')
    const id = listed.body.data.items[0].id as string

    const detail = await call('GET', `/owner/assistant/conversations/${id}`)

    expect(detail.status).toBe(200)
    expect(detail.body.data.messages.map((message: Json) => [message.position, message.role])).toEqual([
      [1, 'visitor'],
      [2, 'assistant'],
    ])
    expect(detail.body.data.messages[1]).toMatchObject({ language: 'de', provider: 'none' })

    const messagesBefore = await count('v2_assistant_messages')
    const deleted = await call('DELETE', `/owner/assistant/conversations/${id}`)

    expect(deleted.status).toBe(200)
    expect(deleted.body.data).toEqual({ id, deleted: true })
    expect(await count('v2_assistant_messages', `WHERE conversation_id = '${id}'`)).toBe(0)
    expect(await count('v2_assistant_messages')).toBe(messagesBefore - 2)
    expect((await call('GET', `/owner/assistant/conversations/${id}`)).status).toBe(404)
    expect((await call('DELETE', `/owner/assistant/conversations/${id}`)).status).toBe(404)
    expect((await call('GET', '/owner/assistant/conversations/not-a-uuid')).status).toBe(422)

    // The anonymous daily counters survive the deletion.
    expect((await usageToday()).questions).toBe(5)
  })

  it('reports usage per day with zeros filled in and a cost of zero', async () => {
    await seed()

    const usage = await call('GET', '/owner/assistant/usage?days=3')

    expect(usage.status).toBe(200)
    expect(usage.body.data.days).toHaveLength(3)
    expect(usage.body.data.days[0]).toMatchObject({ questions: 0 })
    expect(usage.body.data.days[2]).toMatchObject({ conversations: 5, questions: 5 })
    expect(usage.body.data.provider).toEqual({ configured: 'none', dailyCap: 0, usedToday: 0, active: false })
    expect(usage.body.data.estimatedCostCents).toBe(0)
    expect((await call('GET', '/owner/assistant/usage?days=91')).status).toBe(422)
  })

  it('gives Analytics read-only aggregates', async () => {
    await seed()

    const today = new Date().toISOString().slice(0, 10)
    const totals = await runWithDb(database.db, () => analytics.readAssistantTotals({ from: today, to: today }))

    expect(totals).toMatchObject({ conversations: 5, questions: 5, providerCalls: 0, costCents: 0 })
    expect(totals.answered + totals.fallbacks + totals.handoffs).toBeLessThanOrEqual(5)
    expect(totals.fallbacks).toBeGreaterThanOrEqual(1)

    const stored = await runWithDb(database.db, () => analytics.readAssistantStoredCounts())

    expect(stored).toEqual({ conversations: 5, messages: 10 })
    await expect(
      runWithDb(database.db, () => analytics.readAssistantActivity({ from: '2020-01-01', to: '2026-01-01' })),
    ).rejects.toThrow()
  })
})

/* ================================================================== retention */

describe('retention', () => {
  it('keeps everything under manual retention, and deletes idle conversations after N days', async () => {
    await enable()

    await ask({ message: 'Hello' })
    await ask({ message: 'Hello again' })

    await database.db.query(
      `UPDATE v2_assistant_conversations SET last_message_at = now() - interval '40 days'
        WHERE id = (SELECT id FROM v2_assistant_conversations ORDER BY created_at LIMIT 1)`,
    )

    expect(await runWithDb(database.db, () => purgeExpiredConversations())).toEqual({ mode: 'manual', deleted: 0 })
    expect(await count('v2_assistant_conversations')).toBe(2)

    const settings = await enable({ retentionMode: 'days', retentionDays: 30 })

    expect(settings).toMatchObject({ enabled: true, retentionMode: 'days', retentionDays: 30 })

    expect(await runWithDb(database.db, () => purgeExpiredConversations())).toEqual({ mode: 'days', deleted: 1 })
    expect(await count('v2_assistant_conversations')).toBe(1)
    expect(await count('v2_assistant_messages')).toBe(2)

    const back = await call('PATCH', '/owner/assistant/settings', { retentionMode: 'manual' })

    expect(back.body.data).toMatchObject({ retentionMode: 'manual', retentionDays: null })

    const invalid = await call('PATCH', '/owner/assistant/settings', { retentionMode: 'days' })

    expect(invalid.status).toBe(422)
  })
})

/* ============================================================ the owner fence */

describe('the owner boundary', () => {
  it('answers 404 — never 401 — on every assistant owner route from a non-local host', async () => {
    await enable()
    await ask({ message: 'Hello' })

    for (const route of ownerAssistantPaths) {
      const refused = await call(
        route.method,
        route.path.replace('/api/v2', ''),
        route.method === 'GET' ? undefined : { enabled: false },
        { host: 'yamanwarda.de' },
      )

      expect(refused.status, `${route.method} ${route.path}`).toBe(404)
    }

    expect(await count('v2_assistant_conversations')).toBe(1)
    expect((await call('GET', '/owner/assistant/settings')).body.data.enabled).toBe(true)
  })

  it('does not exist at all without the local owner flag, while the public routes still do', async () => {
    const saved = process.env.BACKEND2_OWNER_API
    delete process.env.BACKEND2_OWNER_API

    try {
      const fenced = createAppForTest()
      const request = (path: string) =>
        runWithDb(database.db, async () => fenced.fetch(new Request(`http://localhost:3000/api/v2${path}`)))

      expect((await request('/owner/assistant/conversations')).status).toBe(404)
      expect((await request('/assistant/status')).status).toBe(200)
    } finally {
      process.env.BACKEND2_OWNER_API = saved
    }
  })

  it('demands a real owner session once V2 sign-in is switched on', async () => {
    process.env.BACKEND2_OWNER_AUTH = 'required'

    expect((await call('GET', '/owner/assistant/conversations')).status).toBe(401)
    expect((await call('GET', '/owner/assistant/usage')).status).toBe(401)
  })
})
