import { readFile } from 'node:fs/promises'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from './helpers/backend2-db'

/**
 * Content V2, end to end, against a real PostgreSQL running inside this
 * process (`docs/v2/content.md`).
 *
 * Content is the one module where saving *is* publishing, so what is under
 * test is mostly what stands in front of that write: a stale editor cannot
 * overwrite newer wording, a failed save changes nothing a visitor reads,
 * Legal text cannot change while locked, and one language never drags the
 * other two with it.
 *
 * The environment is set before Backend2 is imported, because the application
 * decides at start-up whether the owner routes exist at all.
 */
process.env.DATABASE_URL = 'postgres://legacy.invalid/legacy'
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
process.env.AUTH_V2_SECRET = 'test-only-auth-secret-at-least-32-chars-long'
delete process.env.BACKEND2_OWNER_AUTH

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { createSession } = await import('#/backend2/auth/session')
const { ownerContentPaths } = await import('#/backend2/modules/content/content.owner.route')
const registry = await import('#/backend2/modules/content/content.registry')
const contract = await import('#/backend2/contracts/content.contract')
const { content } = await import('#/frontend/content/base')
const { de, en } = content

type Json = Record<string, any>

const database = await createTestDatabase()
const app = createAppForTest()

beforeEach(async () => {
  await database.reset()
})

afterEach(() => {
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
  options: { host?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Json; response: Response }> => {
  const host = options.host ?? 'localhost:3000'
  const request = new Request(`http://${host}/api/v2${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json', origin: `http://${host}` }),
      ...options.headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const response = await runWithDb(database.db, async () => app.fetch(request))
  const text = await response.clone().text()

  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Json), response }
}

const run = <T>(fn: () => Promise<T>): Promise<T> => runWithDb(database.db, fn)

const fieldPath = (key: string) => `/owner/content/fields/${encodeURIComponent(key)}`

const snapshot = async (): Promise<Json> => {
  const loaded = await call('GET', '/owner/content')
  expect(loaded.status, JSON.stringify(loaded.body)).toBe(200)

  return loaded.body.data
}

const slotOf = async (key: string, language: string): Promise<Json> => {
  const data = await snapshot()

  return data.fields.find((field: Json) => field.key === key).slots[language]
}

const save = (key: string, language: string, value: unknown, expectedRevision: number, extra: Json = {}) =>
  call('PUT', fieldPath(key), { language, value, expectedRevision, ...extra })

const publicCopy = async (language: string): Promise<Json> => {
  const read = await call('GET', `/content?language=${language}`)
  expect(read.status).toBe(200)

  return read.body.data
}

const HEADLINE = 'home.hero.headline'
const LEGAL_TITLE = 'legal.impressum.title'

/* ================================================== the rules, no database */

describe('the contract', () => {
  const text = registry.findContentField(HEADLINE)!
  const paragraph = registry.findContentField('home.hero.sub')!
  const list = registry.findContentField('home.hero.typed[]')!
  const fixed = registry.findContentField('home.story.demo.notes[]')!

  it('trims, keeps line breaks only in paragraphs, and refuses blank required text', () => {
    expect(contract.checkContentValue(text, '  A headline  ')).toEqual({ ok: true, value: 'A headline' })
    expect(contract.checkContentValue(text, '   ').ok).toBe(false)
    expect(contract.checkContentValue(text, 'Two\nlines').ok).toBe(false)
    expect(contract.checkContentValue(paragraph, 'Two\r\nlines')).toEqual({ ok: true, value: 'Two\nlines' })
    expect(contract.checkContentValue(text, 'bell\u0007').ok).toBe(false)
    expect(contract.checkContentValue(text, ['a']).ok).toBe(false)
  })

  it('enforces the hard limits', () => {
    expect(contract.checkContentValue(text, 'x'.repeat(contract.CONTENT_LIMITS.text)).ok).toBe(true)
    expect(contract.checkContentValue(text, 'x'.repeat(contract.CONTENT_LIMITS.text + 1)).ok).toBe(false)
    expect(contract.checkContentValue(paragraph, 'x'.repeat(contract.CONTENT_LIMITS.longText + 1)).ok).toBe(false)
  })

  it('refuses an empty line, a duplicate line, and a list the layout cannot hold', () => {
    const blank = contract.checkContentValue(list, ['one', ' '])
    expect(blank).toEqual({ ok: false, issues: [{ field: 'value.1', message: 'This line is empty' }] })
    expect(contract.checkContentValue(list, ['same', 'same']).ok).toBe(false)
    expect(contract.checkContentValue(list, []).ok).toBe(false)
    expect(contract.checkContentValue(list, Array.from({ length: 25 }, (_, i) => `w${i}`)).ok).toBe(false)
    expect(contract.checkContentValue(list, ['b', 'a'])).toEqual({ ok: true, value: ['b', 'a'] })

    // The homepage demo positions exactly three notes.
    expect(contract.checkContentValue(fixed, ['a', 'b']).ok).toBe(false)
    expect(contract.checkContentValue(fixed, ['c', 'b', 'a']).ok).toBe(true)
  })

  it('checks the shared facts as the links and addresses they are', () => {
    const email = registry.findContentField('site.email')!
    const github = registry.findContentField('site.github')!
    const phone = registry.findContentField('site.phone')!

    expect(contract.checkContentValue(email, 'owner@example.de').ok).toBe(true)
    expect(contract.checkContentValue(email, 'not an address').ok).toBe(false)
    expect(contract.checkContentValue(github, 'https://github.com/someone').ok).toBe(true)
    expect(contract.checkContentValue(github, 'http://github.com/someone').ok).toBe(false)
    expect(contract.checkContentValue(github, 'javascript:alert(1)').ok).toBe(false)
    expect(contract.checkContentValue(github, 'https://user:pw@github.com').ok).toBe(false)
    expect(contract.checkContentValue(phone, '')).toEqual({ ok: true, value: '' })
    expect(contract.checkContentValue(phone, '+49 361 123456').ok).toBe(true)
    expect(contract.checkContentValue(phone, 'call me').ok).toBe(false)
  })

  it('pulls in nothing from the database, the network or another module', async () => {
    const source = await readFile(new URL('../backend2/contracts/content.contract.ts', import.meta.url), 'utf8')
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1])

    expect(imports).toEqual(['valibot', './pagination.contract'])
  })
})

describe('the release registry', () => {
  const keys = registry.contentRegistry.map((field) => field.key)

  it('accepts every wording the release ships, in every language', () => {
    for (const field of registry.contentRegistry) {
      for (const slot of registry.slotsOf(field)) {
        const checked = contract.checkContentValue(field, registry.originalValue(field, slot))
        expect(checked.ok, `${field.key} ${slot}`).toBe(true)
      }
    }
  })

  it('leaves out what other modules own, routes, and interface furniture', () => {
    const forbidden = [
      /^services\.items\./,
      /^home\.services\.cards\./,
      /^price\./,
      /^work\.items\./,
      /\.to$/,
      /^shell\.nav/,
      /^contact\.form\./,
      /^blog\.(loadMore|readingTime|like)/,
    ]

    for (const pattern of forbidden) {
      expect(keys.filter((key) => pattern.test(key)), String(pattern)).toEqual([])
    }
  })

  it('covers every approved page and keeps the page framing of the other modules', () => {
    for (const page of ['home', 'services', 'work', 'about', 'blog', 'faq', 'contact', 'stack', 'legal', 'shell', 'notFound', 'site']) {
      expect(keys.some((key) => key.split('.')[0] === page), page).toBe(true)
    }

    for (const key of ['services.meta.title', 'services.intro', 'work.intro', 'blog.meta.description', 'legal.privacy.title']) {
      expect(keys, key).toContain(key)
    }
  })

  it('is a written list: a string added to the content tree is not editable by itself', () => {
    // Pinned. Changing it means somebody chose to change what is editable.
    expect(registry.contentRegistry).toHaveLength(248)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('writes facts once and copy per language, and marks Legal', () => {
    for (const field of registry.contentRegistry) {
      expect(field.shared, field.key).toBe(field.key.startsWith('site.'))
      expect(field.scope === 'legal', field.key).toBe(field.key.startsWith('legal.'))
    }
  })
})

/* ====================================================== the security fence */

describe('the owner boundary', () => {
  it('answers 404 — never 401 — on every owner route from a non-local host, and writes nothing', async () => {
    for (const route of ownerContentPaths) {
      const refused = await call(
        route.method,
        route.path.replace('/api/v2', ''),
        route.method === 'GET' ? undefined : { language: 'de', value: 'Hijacked', expectedRevision: 0 },
        { host: 'yamanwarda.de' },
      )

      expect(refused.status, `${route.method} ${route.path}`).toBe(404)
      expect(refused.body.code).toBe('NOT_FOUND')
    }

    expect((await publicCopy('de')).fields[HEADLINE]).toBe(de.home.hero.headline)
  })

  it('does not mount the owner routes at all without the development opt-in', async () => {
    process.env.BACKEND2_OWNER_API = ''

    try {
      const closed = createAppForTest()
      const response = await runWithDb(database.db, async () =>
        closed.fetch(new Request('http://localhost:3000/api/v2/owner/content')),
      )

      expect(response.status).toBe(404)
    } finally {
      process.env.BACKEND2_OWNER_API = 'local'
    }
  })

  it('demands a real owner session and the CSRF header once V2 sign-in is switched on', async () => {
    process.env.BACKEND2_OWNER_AUTH = 'required'

    expect((await call('GET', '/owner/content')).status).toBe(401)
    expect((await save(HEADLINE, 'de', 'Stranger', 0)).status).toBe(401)

    const { rows } = await database.db.query(
      `INSERT INTO v2_owner (email, password_hash, totp_confirmed_at, recovery_codes_issued_at)
       VALUES ('owner@example.de', 'not-a-real-hash', now(), now()) RETURNING id`,
    )
    const session = await run(() => createSession({ ownerId: rows[0].id, method: 'password_totp' }))
    const cookie = `v2_owner_session=${encodeURIComponent(session.token)}; v2_csrf=${encodeURIComponent(session.csrfToken)}`

    expect((await call('GET', '/owner/content', undefined, { headers: { cookie } })).status).toBe(200)

    const forged = await call('PUT', fieldPath(HEADLINE), { language: 'de', value: 'Forged', expectedRevision: 0 }, {
      headers: { cookie },
    })
    expect(forged.status).toBe(401)

    const saved = await call('PUT', fieldPath(HEADLINE), { language: 'de', value: 'Signed in', expectedRevision: 0 }, {
      headers: { cookie, 'x-v2-csrf': session.csrfToken },
    })
    expect(saved.status).toBe(200)

    const remote = await call('GET', '/owner/content', undefined, { host: 'yamanwarda.de', headers: { cookie } })
    expect(remote.status).toBe(404)
  })

  it('leaves the public read reachable from anywhere', async () => {
    const read = await call('GET', '/content?language=en', undefined, { host: 'yamanwarda.de' })
    expect(read.status).toBe(200)
  })
})

/* ========================================================== reading */

describe('the editor’s snapshot', () => {
  it('starts on the release wording, at revision 0, with nothing to review', async () => {
    const data = await snapshot()

    expect(data.pages[0]).toBe('home')
    expect(data.fields).toHaveLength(registry.contentRegistry.length)
    expect(data.reviewCounts).toEqual({ de: 0, en: 0, ar: 0 })

    const headline = data.fields.find((field: Json) => field.key === HEADLINE)
    expect(Object.keys(headline.slots)).toEqual(['de', 'en', 'ar'])
    expect(headline.slots.de).toEqual({
      value: de.home.hero.headline,
      original: de.home.hero.headline,
      isOriginal: true,
      revision: 0,
      needsReview: false,
      updatedAt: null,
    })

    const email = data.fields.find((field: Json) => field.key === 'site.email')
    expect(Object.keys(email.slots)).toEqual(['shared'])
  })

  it('is never cached', async () => {
    const read = await call('GET', '/owner/content')
    expect(read.response.headers.get('cache-control')).toContain('no-store')
    expect((await call('GET', '/owner/content/history')).response.headers.get('cache-control')).toContain('no-store')
  })
})

/* ========================================================= direct-live saves */

describe('saving a field', () => {
  it('makes that language live at once, and leaves the others and every other field alone', async () => {
    const saved = await save(HEADLINE, 'de', 'Neue Überschrift', 0)

    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect(saved.body.message).toBe('Saved and live')
    expect(saved.body.data.changed).toBe(true)
    expect(saved.body.data.field.slots.de).toMatchObject({ value: 'Neue Überschrift', revision: 1, isOriginal: false })

    expect((await publicCopy('de')).fields[HEADLINE]).toBe('Neue Überschrift')
    expect((await publicCopy('en')).fields[HEADLINE]).toBe(en.home.hero.headline)
    expect((await publicCopy('de')).fields['home.hero.sub']).toBe(de.home.hero.sub)

    // Only V2 content changed: no other module's table holds a row.
    for (const table of ['v2_services', 'v2_projects', 'v2_blog_posts']) {
      const { rows } = await database.db.query(`SELECT count(*)::int AS total FROM ${table}`)
      expect(rows[0].total, table).toBe(0)
    }
  })

  it('flags the other two languages for review, without changing their wording or revision', async () => {
    await save(HEADLINE, 'de', 'Neu', 0)

    const data = await snapshot()
    const headline = data.fields.find((field: Json) => field.key === HEADLINE)

    expect(headline.slots.de.needsReview).toBe(false)
    expect(headline.slots.en).toMatchObject({ needsReview: true, revision: 0, value: en.home.hero.headline })
    expect(headline.slots.ar.needsReview).toBe(true)
    expect(data.reviewCounts).toEqual({ de: 0, en: 1, ar: 1 })

    const reviewed = await call('POST', `${fieldPath(HEADLINE)}/reviewed`, { language: 'en' })
    expect(reviewed.status).toBe(200)
    expect(reviewed.body.data.slots.en.needsReview).toBe(false)

    // Saving the flagged language by hand also settles it.
    await save(HEADLINE, 'ar', 'عنوان جديد', 0)
    const after = await slotOf(HEADLINE, 'ar')
    expect(after.needsReview).toBe(false)
    expect((await snapshot()).reviewCounts).toEqual({ de: 1, en: 1, ar: 0 })
  })

  it('records one history line per complete edit, and nothing for a value that is already live', async () => {
    await save(HEADLINE, 'de', 'Eins', 0)

    const again = await save(HEADLINE, 'de', 'Eins', 1)
    expect(again.status).toBe(200)
    expect(again.body.data.changed).toBe(false)
    expect(again.body.message).toBe('Already live')

    const history = await call('GET', '/owner/content/history')
    expect(history.body.data.total).toBe(1)
    expect(history.body.data.items[0]).toMatchObject({
      key: HEADLINE,
      language: 'de',
      action: 'edit',
      before: de.home.hero.headline,
      after: 'Eins',
      revision: 1,
    })
  })

  it('treats a retry of a save that already succeeded as success, not as a conflict', async () => {
    await save(HEADLINE, 'de', 'Angekommen', 0)

    // The first answer was lost; the editor retries with the revision it had.
    const retry = await save(HEADLINE, 'de', 'Angekommen', 0)
    expect(retry.status).toBe(200)
    expect(retry.body.data.field.slots.de.revision).toBe(1)
  })

  it('refuses a stale editor instead of reverting newer wording, and says what is live now', async () => {
    await save(HEADLINE, 'de', 'Aus Tab A', 0)

    const stale = await save(HEADLINE, 'de', 'Aus Tab B', 0)
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('CONFLICT')
    expect(stale.body.details.current).toEqual({ value: 'Aus Tab A', revision: 1 })

    expect((await publicCopy('de')).fields[HEADLINE]).toBe('Aus Tab A')
  })

  /*
   * The in-process test database has one connection, so two requests cannot
   * truly overlap here. The guards that settle a real race are therefore
   * tested directly: each write is conditional in SQL itself.
   */
  it('makes the losing write of a race change nothing', async () => {
    const repo = await import('#/backend2/modules/content/content.repo')

    const first = await run(() => repo.insertValue({ key: HEADLINE, slot: 'en', value: 'First' }))
    const second = await run(() => repo.insertValue({ key: HEADLINE, slot: 'en', value: 'Second' }))
    expect(first?.revision).toBe(1)
    expect(second).toBeNull()

    const stale = await run(() =>
      repo.updateValue({ key: HEADLINE, slot: 'en', value: 'Stale', expectedRevision: 0 }),
    )
    expect(stale).toBeNull()
    expect((await publicCopy('en')).fields[HEADLINE]).toBe('First')
  })

  it('refuses invalid values with field-level issues, and leaves the live value in place', async () => {
    const cases: Array<[string, string, unknown, number, string]> = [
      [HEADLINE, 'de', '   ', 422, 'value'],
      [HEADLINE, 'de', ['a list'], 422, 'value'],
      [HEADLINE, 'de', 'x'.repeat(501), 422, 'value'],
      ['home.hero.typed[]', 'de', ['Websites', ''], 422, 'value.1'],
      ['site.github', 'shared', 'github.com/no-scheme', 422, 'value'],
    ]

    for (const [key, language, value, status, path] of cases) {
      const refused = await save(key, language, value, 0)
      expect(refused.status, `${key} ${JSON.stringify(value)}`).toBe(status)
      expect(refused.body.code).toBe('VALIDATION_ERROR')
      expect(refused.body.details.issues[0].field).toBe(path)
    }

    expect((await publicCopy('de')).fields[HEADLINE]).toBe(de.home.hero.headline)
    expect((await call('GET', '/owner/content/history')).body.data.total).toBe(0)
  })

  it('refuses a key outside the registry, the wrong language slot, and a malformed request', async () => {
    const unknown = await save('services.items.websites.name', 'de', 'Two editors', 0)
    expect(unknown.status).toBe(404)

    expect((await save('work.items.inknest.summary', 'de', 'x', 0)).status).toBe(404)
    expect((await save(HEADLINE, 'shared', 'x', 0)).status).toBe(422)
    expect((await save('site.email', 'de', 'owner@example.de', 0)).status).toBe(422)
    expect((await save(HEADLINE, 'fr', 'x', 0)).status).toBe(422)
    expect((await call('PUT', fieldPath(HEADLINE), { language: 'de', value: 'x' })).status).toBe(422)
  })

  it('saves a list whole, in the order given, under its percent-encoded key', async () => {
    const saved = await save('home.hero.typed[]', 'en', ['Shops', ' Websites ', 'Software'], 0)

    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect((await publicCopy('en')).fields['home.hero.typed[]']).toEqual(['Shops', 'Websites', 'Software'])
  })

  it('saves a shared fact once for all three languages', async () => {
    const saved = await save('site.phone', 'shared', '+49 361 123456', 0)
    expect(saved.status).toBe(200)

    for (const language of ['de', 'en', 'ar']) {
      expect((await publicCopy(language)).shared['site.phone']).toBe('+49 361 123456')
    }

    // A fact flags nothing for review: there is no other language.
    expect((await snapshot()).reviewCounts).toEqual({ de: 0, en: 0, ar: 0 })
  })
})

/* ================================================================== Legal */

describe('Legal text', () => {
  it('cannot change while locked, by an edit, Original, or history', async () => {
    const locked = await save(LEGAL_TITLE, 'de', 'Geändert', 0)
    expect(locked.status).toBe(409)
    expect(locked.body.code).toBe('LEGAL_LOCKED')
    expect((await publicCopy('de')).fields[LEGAL_TITLE]).toBe(de.legal.impressum.title)

    const unlocked = await save(LEGAL_TITLE, 'de', 'Impressum (neu)', 0, { legalUnlocked: true })
    expect(unlocked.status).toBe(200)
    expect((await publicCopy('de')).fields[LEGAL_TITLE]).toBe('Impressum (neu)')

    const original = await call('POST', `${fieldPath(LEGAL_TITLE)}/restore-original`, { language: 'de', expectedRevision: 1 })
    expect(original.body.code).toBe('LEGAL_LOCKED')

    const history = await call('GET', '/owner/content/history')
    const restore = await call('POST', `/owner/content/history/${history.body.data.items[0].id}/restore`, {
      expectedRevision: 1,
      side: 'before',
    })
    expect(restore.body.code).toBe('LEGAL_LOCKED')

    expect((await publicCopy('de')).fields[LEGAL_TITLE]).toBe('Impressum (neu)')
  })
})

/* ================================================== Original and history */

describe('Original', () => {
  it('restores the release wording as a new live revision with its own history line', async () => {
    await save(HEADLINE, 'de', 'Vorübergehend', 0)

    const restored = await call('POST', `${fieldPath(HEADLINE)}/restore-original`, { language: 'de', expectedRevision: 1 })
    expect(restored.status, JSON.stringify(restored.body)).toBe(200)
    expect(restored.body.data.field.slots.de).toMatchObject({ value: de.home.hero.headline, isOriginal: true, revision: 2 })
    expect((await publicCopy('de')).fields[HEADLINE]).toBe(de.home.hero.headline)

    const history = await call('GET', '/owner/content/history')
    expect(history.body.data.items[0]).toMatchObject({ action: 'restore_original', before: 'Vorübergehend' })
  })

  it('is refused from a stale editor, leaving the newer wording live', async () => {
    await save(HEADLINE, 'de', 'Eins', 0)
    await save(HEADLINE, 'de', 'Zwei', 1)

    const stale = await call('POST', `${fieldPath(HEADLINE)}/restore-original`, { language: 'de', expectedRevision: 1 })
    expect(stale.status).toBe(409)
    expect((await publicCopy('de')).fields[HEADLINE]).toBe('Zwei')
  })
})

describe('history', () => {
  it('brings back either side of an earlier change, as a new live revision', async () => {
    await save(HEADLINE, 'de', 'Eins', 0)
    await save(HEADLINE, 'de', 'Zwei', 1)

    const history = await call('GET', `/owner/content/history?key=${encodeURIComponent(HEADLINE)}&language=de`)
    const first = history.body.data.items.find((item: Json) => item.after === 'Eins')

    const after = await call('POST', `/owner/content/history/${first.id}/restore`, { expectedRevision: 2 })
    expect(after.status, JSON.stringify(after.body)).toBe(200)
    expect((await publicCopy('de')).fields[HEADLINE]).toBe('Eins')

    const before = await call('POST', `/owner/content/history/${first.id}/restore`, { expectedRevision: 3, side: 'before' })
    expect(before.status).toBe(200)
    expect((await publicCopy('de')).fields[HEADLINE]).toBe(de.home.hero.headline)

    const latest = (await call('GET', '/owner/content/history')).body.data.items[0]
    expect(latest).toMatchObject({ action: 'restore_history', restoredFrom: first.id, revision: 4 })
  })

  it('answers 404 for an entry that does not exist and 422 for a malformed id', async () => {
    expect(
      (await call('POST', '/owner/content/history/11111111-1111-4111-8111-111111111111/restore', { expectedRevision: 0 })).status,
    ).toBe(404)
    expect((await call('POST', '/owner/content/history/nope/restore', { expectedRevision: 0 })).status).toBe(422)
  })

  it('pages on the server, newest first, in a fixed order, and is bounded', async () => {
    let revision = 0
    for (let index = 1; index <= 5; index += 1) {
      const saved = await save(HEADLINE, 'en', `Version ${index}`, revision)
      revision = saved.body.data.field.slots.en.revision
    }

    const first = await call('GET', '/owner/content/history?page=1&pageSize=2')
    expect(first.body.data).toMatchObject({ page: 1, pageSize: 2, total: 5, pageCount: 3, hasMore: true })
    expect(first.body.data.items.map((item: Json) => item.after)).toEqual(['Version 5', 'Version 4'])

    const last = await call('GET', '/owner/content/history?page=3&pageSize=2')
    expect(last.body.data.items.map((item: Json) => item.after)).toEqual(['Version 1'])
    expect(last.body.data.hasMore).toBe(false)

    expect((await call('GET', '/owner/content/history?pageSize=101')).status).toBe(422)
    expect((await call('GET', '/owner/content/history?key=home.hero.sub')).body.data.total).toBe(0)
  })
})

/* ============================================================ public reads */

describe('what a visitor receives', () => {
  it('is one language’s copy and the shared facts, and nothing about the owner', async () => {
    await save(HEADLINE, 'de', 'Neu', 0)
    const read = await publicCopy('de')

    expect(Object.keys(read).sort()).toEqual(['fields', 'language', 'shared'])
    expect(Object.keys(read.fields)).toHaveLength(registry.contentRegistry.filter((field) => !field.shared).length)
    expect(Object.keys(read.shared).sort()).toEqual(['site.city', 'site.email', 'site.github', 'site.linkedin', 'site.phone'])

    const text = JSON.stringify(read)
    for (const word of ['revision', 'needsReview', 'history', 'original', 'import', 'updatedAt']) {
      expect(text, word).not.toContain(word)
    }

    expect((await call('GET', '/content?language=fr')).status).toBe(422)
    expect((await call('GET', '/content')).status).toBe(422)
  })

  it('makes every cache ask again, so a saved field is never reported live while an old copy is served', async () => {
    const first = await call('GET', '/content?language=de')
    const etag = first.response.headers.get('etag')!

    expect(first.response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/)

    const unchanged = await call('GET', '/content?language=de', undefined, { headers: { 'if-none-match': etag } })
    expect(unchanged.status).toBe(304)

    await save(HEADLINE, 'de', 'Sofort sichtbar', 0)

    const changed = await call('GET', '/content?language=de', undefined, { headers: { 'if-none-match': etag } })
    expect(changed.status).toBe(200)
    expect(changed.body.data.fields[HEADLINE]).toBe('Sofort sichtbar')
  })
})
