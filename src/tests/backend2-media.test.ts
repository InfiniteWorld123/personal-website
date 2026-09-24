import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createMemoryStore,
  createTestDatabase,
  gifBytes,
  jpegBytes,
  mp4Bytes,
  odfBytes,
  ole2Bytes,
  ooxmlBytes,
  pdfBytes,
  pngBytes,
  rtfBytes,
  svgBytes,
  textBytes,
  webpBytes,
  zipBytes,
} from './helpers/backend2-db'

/**
 * The shared Media vault, end to end, against a real PostgreSQL running inside
 * this process (PGlite) and an in-memory object store.
 *
 * What is under test is mostly *refusal*: that a file nothing has published
 * cannot be fetched by a visitor, that a file something still uses cannot be
 * deleted by anyone, that a folder cannot be moved inside itself or deleted
 * with files in it, and that bytes and rows never disagree about whether a
 * file exists. A mocked database would prove none of it — the `ON DELETE
 * RESTRICT` foreign keys and the deferred constraints are the mechanism.
 *
 * The environment is set before Backend2 is imported: the application decides
 * at start-up whether the owner routes exist at all.
 */
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'
process.env.BACKEND2_OWNER_API = 'local'
process.env.NODE_ENV = 'development'
delete process.env.BACKEND2_OWNER_AUTH

const { createAppForTest } = await import('#/backend2/app')
const { runWithDb } = await import('#/backend2/db/client')
const { useMediaStoreForTest } = await import('#/backend2/media/store')
const { probeMedia } = await import('#/backend2/media/probe')
const { sanitizeFileName, buildStorageKey } = await import('#/backend2/media/naming')
const { MAX_BYTES, MEDIA_LIMITS } = await import('#/backend2/contracts/media.contract')
const { replaceReferences, releaseReferences, sweepPendingObjects } = await import(
  '#/backend2/modules/media/media.service'
)

type Json = Record<string, any>

const database = await createTestDatabase()
const app = createAppForTest()
let storage = createMemoryStore()

beforeEach(async () => {
  await database.reset()
  storage = createMemoryStore()
  useMediaStoreForTest(storage.store)
})

afterEach(() => {
  useMediaStoreForTest(undefined)
  delete process.env.BACKEND2_OWNER_AUTH
})

afterAll(async () => {
  useMediaStoreForTest(undefined)
  await database.close()
})

/* --------------------------------------------------------------- plumbing */

const call = async (
  method: string,
  path: string,
  body?: unknown,
  options: { host?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Json; response: Response }> => {
  const request = new Request(`http://${options.host ?? 'localhost:3000'}/api/v2${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...options.headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const response = await runWithDb(database.db, async () => app.fetch(request))
  const text = await response.clone().text()

  return { status: response.status, body: text === '' ? {} : JSON.parse(text), response }
}

/** An upload, sent the way the dashboard sends one: the raw file as the body. */
const upload = async (
  fileName: string,
  bytes: Uint8Array,
  options: { folderId?: string | null; host?: string; contentType?: string } = {},
): Promise<{ status: number; body: Json; response: Response }> => {
  const headers: Record<string, string> = {
    'content-type': options.contentType ?? 'application/octet-stream',
    'content-length': String(bytes.byteLength),
    'x-media-filename': encodeURIComponent(fileName),
  }

  if (options.folderId) headers['x-media-folder'] = options.folderId

  const request = new Request(`http://${options.host ?? 'localhost:3000'}/api/v2/owner/media/files`, {
    method: 'POST',
    headers,
    body: bytes as unknown as BodyInit,
  })

  const response = await runWithDb(database.db, async () => app.fetch(request))
  const text = await response.clone().text()

  return { status: response.status, body: text === '' ? {} : JSON.parse(text), response }
}

const uploadOk = async (
  fileName: string,
  bytes: Uint8Array,
  options: { folderId?: string | null } = {},
): Promise<Json> => {
  const result = await upload(fileName, bytes, options)

  expect(result.status, JSON.stringify(result.body)).toBe(201)

  return result.body.data.asset
}

const makeFolder = async (name: string, parentId: string | null = null): Promise<Json> => {
  const result = await call('POST', '/owner/media/folders', { name, parentId })

  expect(result.status, JSON.stringify(result.body)).toBe(201)

  return result.body.data
}

/* ------------------------------------------------------- what a file is */

describe('identifying a file from its bytes', () => {
  it('reads the real type and dimensions, whatever the browser claimed', async () => {
    expect(probeMedia(pngBytes(800, 600))).toMatchObject({
      kind: 'image',
      contentType: 'image/png',
      width: 800,
      height: 600,
    })
    expect(probeMedia(jpegBytes(1920, 1080))).toMatchObject({
      contentType: 'image/jpeg',
      width: 1920,
      height: 1080,
    })
    expect(probeMedia(gifBytes(64, 48))).toMatchObject({ contentType: 'image/gif', width: 64 })
    expect(probeMedia(webpBytes(320, 240))).toMatchObject({
      contentType: 'image/webp',
      width: 320,
      height: 240,
    })
    expect(probeMedia(mp4Bytes())).toMatchObject({ kind: 'video', contentType: 'video/mp4' })
    expect(probeMedia(pdfBytes())).toMatchObject({
      kind: 'document',
      contentType: 'application/pdf',
    })
  })

  it('reads the work-document formats the owner asked for', () => {
    expect(probeMedia(ooxmlBytes('word'))).toMatchObject({ kind: 'document', extension: 'docx' })
    expect(probeMedia(ooxmlBytes('xl'))).toMatchObject({ extension: 'xlsx' })
    expect(probeMedia(ooxmlBytes('ppt'))).toMatchObject({ extension: 'pptx' })
    expect(probeMedia(odfBytes('text'))).toMatchObject({
      contentType: 'application/vnd.oasis.opendocument.text',
      extension: 'odt',
    })
    expect(probeMedia(odfBytes('spreadsheet'))).toMatchObject({ extension: 'ods' })
    expect(probeMedia(rtfBytes())).toMatchObject({ contentType: 'application/rtf' })
    // A ZIP that claims to be nothing else stays a ZIP.
    expect(probeMedia(zipBytes())).toMatchObject({ contentType: 'application/zip' })
  })

  it('tells the three legacy Office formats apart by their stream names', () => {
    expect(probeMedia(ole2Bytes('WordDocument'))).toMatchObject({ contentType: 'application/msword' })
    expect(probeMedia(ole2Bytes('Workbook'))).toMatchObject({ contentType: 'application/vnd.ms-excel' })
    expect(probeMedia(ole2Bytes('PowerPoint'))).toMatchObject({
      contentType: 'application/vnd.ms-powerpoint',
    })

    // No readable stream name: the extension picks between the three, and only
    // because the OLE2 signature has already proved the family.
    expect(probeMedia(ole2Bytes(), 'angebot.doc')).toMatchObject({ contentType: 'application/msword' })
    expect(probeMedia(ole2Bytes(), 'mystery.png')).toBeNull()
  })

  it('accepts an SVG and reads its size from the viewBox', () => {
    expect(probeMedia(svgBytes())).toMatchObject({
      kind: 'image',
      contentType: 'image/svg+xml',
      width: 240,
      height: 120,
    })
    // Still an SVG with a script in it — the CSP sandbox is what makes that
    // safe, not a substring hunt that entities would walk straight past.
    expect(probeMedia(svgBytes('<script>alert(1)</script>'))).toMatchObject({
      contentType: 'image/svg+xml',
    })
  })

  it('accepts plain text only when the name says which flavour it is', () => {
    expect(probeMedia(textBytes('# Notes\n\nSome notes.'), 'notes.md')).toMatchObject({
      contentType: 'text/markdown',
    })
    expect(probeMedia(textBytes('a,b,c\n1,2,3'), 'rows.csv')).toMatchObject({ contentType: 'text/csv' })
    // Binary renamed `.txt` fails the decode, so it is not text.
    expect(probeMedia(new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe]), 'sneaky.txt')).toBeNull()
    // And text with no recognised extension is not guessed at.
    expect(probeMedia(textBytes('hello'), 'hello.bin')).toBeNull()
  })

  it('still refuses what nothing can verify', () => {
    expect(probeMedia(textBytes('#!/bin/sh\nrm -rf /'))).toBeNull()
    expect(probeMedia(textBytes('<html><script>x</script></html>'), 'page.html')).toBeNull()
    expect(probeMedia(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), 'setup.exe')).toBeNull()
    expect(probeMedia(new Uint8Array(0))).toBeNull()
  })

  it('stores the detected type, not the one the upload declared', async () => {
    // A PDF, announced as a PNG, named as a PNG.
    const asset = await uploadOk('invoice.png', pdfBytes())

    expect(asset.contentType).toBe('application/pdf')
    expect(asset.kind).toBe('document')
    // And the name is corrected rather than left contradicting the file.
    expect(asset.displayName).toBe('invoice.pdf')
  })
})

describe('names and keys', () => {
  it('never lets an uploaded filename become a path', () => {
    expect(sanitizeFileName('../../etc/passwd', 'png')).toBe('passwd.png')
    expect(sanitizeFileName('C:\\Windows\\system32\\evil.exe', 'pdf')).toBe('evil.pdf')
    expect(sanitizeFileName('.hidden', 'png')).toBe('hidden.png')
    expect(sanitizeFileName('  ', 'png')).toBe('file.png')
    expect(sanitizeFileName('a'.repeat(500), 'png')).toHaveLength(MEDIA_LIMITS.filename)
  })

  it('generates an opaque key that owes nothing to the filename', () => {
    const key = buildStorageKey('png', new Date('2026-09-22T10:00:00Z'))

    expect(key).toMatch(/^media\/2026\/09\/[0-9a-f-]{36}\.png$/u)
    expect(buildStorageKey('png')).not.toBe(buildStorageKey('png'))
  })

  it('keeps the storage key out of every owner response', async () => {
    const asset = await uploadOk('photo.png', pngBytes(10, 10))
    const detail = await call('GET', `/owner/media/files/${asset.id}`)
    const list = await call('GET', '/owner/media/files')

    const key = [...storage.objects.keys()][0]!

    expect(JSON.stringify(detail.body)).not.toContain(key)
    expect(JSON.stringify(list.body)).not.toContain(key)
    expect(detail.body.data.storageKey).toBeUndefined()
  })

  it('resolves a name collision instead of refusing the upload', async () => {
    const first = await uploadOk('cover.png', pngBytes(10, 10))
    const second = await uploadOk('cover.png', pngBytes(20, 20))

    expect(first.displayName).toBe('cover.png')
    expect(second.displayName).toBe('cover (2).png')
  })
})

/* ------------------------------------------------------------- uploading */

describe('taking a file in', () => {
  it('accepts every allowed family and records what it measured', async () => {
    const image = await uploadOk('a.png', pngBytes(120, 80))
    const video = await uploadOk('b.mp4', mp4Bytes())
    const document = await uploadOk('c.pdf', pdfBytes())

    expect(image).toMatchObject({ kind: 'image', width: 120, height: 80 })
    // Dimensions are not invented for files the server did not measure.
    expect(video).toMatchObject({ kind: 'video', width: null, height: null })
    expect(document).toMatchObject({ kind: 'document', width: null, height: null })
    expect(storage.objects.size).toBe(3)
  })

  it('accepts the work documents and an SVG logo', async () => {
    const word = await uploadOk('angebot.docx', ooxmlBytes('word'))
    const legacy = await uploadOk('alt-angebot.doc', ole2Bytes('WordDocument'))
    const sheet = await uploadOk('preise.ods', odfBytes('spreadsheet'))
    const notes = await uploadOk('notizen.md', textBytes('# Notizen\n\nNichts besonderes.'))
    const logo = await uploadOk('mark.svg', svgBytes())

    expect(word.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    expect(legacy.contentType).toBe('application/msword')
    expect(sheet.contentType).toBe('application/vnd.oasis.opendocument.spreadsheet')
    expect(notes.contentType).toBe('text/markdown')
    // An SVG counts as an image, so the picker offers it for a cover.
    expect(logo).toMatchObject({ kind: 'image', contentType: 'image/svg+xml', width: 240 })
  })

  it('refuses an unsupported file with a stable code and stores nothing', async () => {
    const result = await upload('page.html', textBytes('<html><script>x</script></html>'))

    expect(result.status).toBe(422)
    expect(result.body.code).toBe('UNSUPPORTED_FILE_TYPE')
    expect(storage.objects.size).toBe(0)

    const list = await call('GET', '/owner/media/files')

    expect(list.body.data.total).toBe(0)
  })

  it('refuses an empty file', async () => {
    const result = await upload('nothing.png', new Uint8Array(0))

    expect(result.status).toBe(400)
    expect(result.body.code).toBe('UPLOAD_FAILED')
  })

  it('refuses a file over its family ceiling before reading the body', async () => {
    const bytes = pngBytes(10, 10)
    const request = new Request('http://localhost:3000/api/v2/owner/media/files', {
      method: 'POST',
      headers: {
        // The claim is what gets it refused; the body is tiny.
        'content-length': String(MAX_BYTES.image + 1),
        'x-media-filename': 'huge.png',
      },
      body: bytes as unknown as BodyInit,
    })

    const response = await runWithDb(database.db, async () => app.fetch(request))

    expect(response.status).toBe(413)
    expect((await response.json()).code).toBe('FILE_TOO_LARGE')
    expect(storage.objects.size).toBe(0)
  })

  it('reports a duplicate rather than silently folding it into the first', async () => {
    const bytes = pngBytes(64, 64)
    const first = await uploadOk('one.png', bytes)
    const second = await upload('two.png', bytes)

    expect(second.body.data.duplicateOf).toEqual([first.id])
    // Two library entries, on purpose: deleting one must not affect the other.
    expect(second.body.data.asset.id).not.toBe(first.id)
    expect(storage.objects.size).toBe(2)
  })

  it('leaves no phantom library item when the row cannot be written', async () => {
    const missing = '11111111-1111-4111-8111-111111111111'
    const result = await upload('x.png', pngBytes(10, 10), { folderId: missing })

    expect(result.status).toBe(404)
    expect(storage.objects.size).toBe(0)

    const list = await call('GET', '/owner/media/files')

    expect(list.body.data.total).toBe(0)
  })

  it('answers 503 when no store is configured, without writing a row', async () => {
    // A deployment with no bucket, without pretending to be production — the
    // owner fence reads NODE_ENV too and would answer 404 first.
    useMediaStoreForTest('none')

    try {
      const result = await upload('x.png', pngBytes(10, 10))

      expect(result.status).toBe(503)
      expect(result.body.code).toBe('STORAGE_UNAVAILABLE')
    } finally {
      useMediaStoreForTest(storage.store)
    }

    const list = await call('GET', '/owner/media/files')

    expect(list.body.data.total).toBe(0)
  })
})

/* --------------------------------------------------------------- folders */

describe('folders', () => {
  it('nests, and allows files at the library root', async () => {
    const projects = await makeFolder('Projects')
    const year = await makeFolder('2026', projects.id)

    expect(year.depth).toBe(1)

    const atRoot = await uploadOk('loose.png', pngBytes(8, 8))
    const inFolder = await uploadOk('inside.png', pngBytes(8, 8), { folderId: year.id })

    expect(atRoot.folderId).toBeNull()
    expect(inFolder.folderId).toBe(year.id)

    const tree = await call('GET', '/owner/media/folders')

    expect(tree.body.data.tree).toHaveLength(1)
    expect(tree.body.data.tree[0].children[0].fileCount).toBe(1)
  })

  it('refuses a duplicate name in the same parent, and allows it in another', async () => {
    const a = await makeFolder('Projects')
    const clash = await call('POST', '/owner/media/folders', { name: 'projects', parentId: null })

    expect(clash.status).toBe(409)
    expect(clash.body.code).toBe('NAME_TAKEN')

    const nested = await call('POST', '/owner/media/folders', { name: 'Projects', parentId: a.id })

    expect(nested.status).toBe(201)
  })

  it('refuses to move a folder inside itself or its own descendant', async () => {
    const root = await makeFolder('Projects')
    const child = await makeFolder('2026', root.id)
    const grandchild = await makeFolder('Q1', child.id)

    const intoSelf = await call('PATCH', `/owner/media/folders/${root.id}`, { parentId: root.id })
    const intoDescendant = await call('PATCH', `/owner/media/folders/${root.id}`, {
      parentId: grandchild.id,
    })

    expect(intoSelf.status).toBe(409)
    expect(intoSelf.body.code).toBe('FOLDER_CYCLE')
    expect(intoDescendant.body.code).toBe('FOLDER_CYCLE')

    // The tree is unchanged: nothing was cut loose by the refusal.
    const tree = await call('GET', '/owner/media/folders')

    expect(tree.body.data.tree).toHaveLength(1)
  })

  it('renumbers the depth of a whole subtree when it moves', async () => {
    const a = await makeFolder('A')
    const b = await makeFolder('B', a.id)
    const c = await makeFolder('C', b.id)
    const target = await makeFolder('Target')

    const moved = await call('PATCH', `/owner/media/folders/${b.id}`, { parentId: target.id })

    expect(moved.status).toBe(200)
    expect(moved.body.data.depth).toBe(1)

    const tree = await call('GET', '/owner/media/folders')
    const flatten = (nodes: Json[]): Json[] =>
      nodes.flatMap((node) => [node, ...flatten(node.children)])
    const found = flatten(tree.body.data.tree).find((node) => node.id === c.id)

    expect(found?.depth).toBe(2)
  })

  it('refuses nesting past the depth limit, counting the whole subtree', async () => {
    let parent: string | null = null

    for (let level = 0; level <= MEDIA_LIMITS.maxFolderDepth; level += 1) {
      const folder: Json = await makeFolder(`L${level}`, parent)

      parent = folder.id
    }

    const tooDeep = await call('POST', '/owner/media/folders', {
      name: 'one more',
      parentId: parent,
    })

    expect(tooDeep.status).toBe(409)
    expect(tooDeep.body.code).toBe('FOLDER_DEPTH_EXCEEDED')
  })

  it('will not delete a folder that still holds anything', async () => {
    const folder = await makeFolder('Projects')

    await uploadOk('inside.png', pngBytes(8, 8), { folderId: folder.id })

    const refused = await call('DELETE', `/owner/media/folders/${folder.id}`)

    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('FOLDER_NOT_EMPTY')
    expect(refused.body.details).toMatchObject({ files: 1, folders: 0 })

    const withChild = await makeFolder('Sub', folder.id)
    const stillRefused = await call('DELETE', `/owner/media/folders/${folder.id}`)

    expect(stillRefused.body.details).toMatchObject({ files: 1, folders: 1 })
    expect(withChild.id).toBeTruthy()
  })

  it('deleting an empty folder never touches a file', async () => {
    const keep = await makeFolder('Keep')
    const empty = await makeFolder('Empty')

    await uploadOk('a.png', pngBytes(8, 8), { folderId: keep.id })

    const deleted = await call('DELETE', `/owner/media/folders/${empty.id}`)

    expect(deleted.status).toBe(200)

    const list = await call('GET', '/owner/media/files')

    expect(list.body.data.total).toBe(1)
    expect(storage.objects.size).toBe(1)
  })

  it('moves a file between folders without changing its identity', async () => {
    const from = await makeFolder('From')
    const to = await makeFolder('To')
    const asset = await uploadOk('a.png', pngBytes(8, 8), { folderId: from.id })
    const key = [...storage.objects.keys()][0]!

    const moved = await call('PATCH', `/owner/media/files/${asset.id}`, { folderId: to.id })

    expect(moved.status).toBe(200)
    expect(moved.body.data.id).toBe(asset.id)
    expect(moved.body.data.folderId).toBe(to.id)
    // The object was not rewritten, so every module that selected it still works.
    expect([...storage.objects.keys()]).toEqual([key])
  })
})

/* ------------------------------------------------------------- the library */

describe('browsing the library', () => {
  it('paginates from the server with a deterministic order', async () => {
    for (let index = 0; index < 7; index += 1) {
      await uploadOk(`file-${index}.png`, pngBytes(10 + index, 10))
    }

    const first = await call('GET', '/owner/media/files?page=1&pageSize=3&sort=name')
    const second = await call('GET', '/owner/media/files?page=2&pageSize=3&sort=name')
    const last = await call('GET', '/owner/media/files?page=3&pageSize=3&sort=name')

    expect(first.body.data).toMatchObject({ total: 7, pageCount: 3, hasMore: true })
    expect(first.body.data.items).toHaveLength(3)
    expect(last.body.data).toMatchObject({ page: 3, hasMore: false })
    expect(last.body.data.items).toHaveLength(1)

    const names = [
      ...first.body.data.items,
      ...second.body.data.items,
      ...last.body.data.items,
    ].map((item: Json) => item.displayName)

    // Every file appears exactly once across the pages.
    expect(new Set(names).size).toBe(7)
    expect(names).toEqual([...names].sort())
  })

  it('caps an unreasonable page size instead of returning the whole vault', async () => {
    await uploadOk('a.png', pngBytes(8, 8))

    const refused = await call('GET', '/owner/media/files?pageSize=100000')

    expect(refused.status).toBe(422)
  })

  it('filters by folder, kind and use', async () => {
    const folder = await makeFolder('Projects')
    const inFolder = await uploadOk('a.png', pngBytes(8, 8), { folderId: folder.id })

    await uploadOk('b.pdf', pdfBytes())
    await uploadOk('c.mp4', mp4Bytes())

    await runWithDb(database.db, () =>
      replaceReferences({
        module: 'projects',
        ownerType: 'project_version',
        ownerId: 'p1',
        scope: 'draft',
        entries: [{ assetId: inFolder.id, usage: 'cover' }],
      }),
    )

    const byFolder = await call('GET', `/owner/media/files?folderId=${folder.id}`)
    const atRoot = await call('GET', '/owner/media/files?folderId=root')
    const documents = await call('GET', '/owner/media/files?kind=document')
    const used = await call('GET', '/owner/media/files?usage=used')
    const unused = await call('GET', '/owner/media/files?usage=unused')

    expect(byFolder.body.data.total).toBe(1)
    expect(atRoot.body.data.total).toBe(2)
    expect(documents.body.data.total).toBe(1)
    expect(used.body.data.total).toBe(1)
    expect(unused.body.data.total).toBe(2)
  })

  it('searches filenames literally, so a wildcard is not a wildcard', async () => {
    await uploadOk('holiday.png', pngBytes(8, 8))
    await uploadOk('100%-done.png', pngBytes(9, 9))

    const literal = await call('GET', '/owner/media/files?q=100%25')
    const everything = await call('GET', '/owner/media/files?q=%25')

    expect(literal.body.data.total).toBe(1)
    // `%` matches the file that actually contains a percent sign, not all of them.
    expect(everything.body.data.total).toBe(1)
  })
})

/* ----------------------------------------------------- uses and deletion */

describe('a file that something uses', () => {
  const useIt = (assetId: string, scope: 'draft' | 'published' | 'record', ownerId = 'p1') =>
    replaceReferences({
      module: 'projects',
      ownerType: 'project_version',
      ownerId,
      scope,
      label: 'Cafe Nour — cover',
      entries: [{ assetId, usage: 'cover' }],
    })

  it('cannot be deleted, and the refusal says where it is used', async () => {
    const asset = await uploadOk('cover.png', pngBytes(40, 40))

    await runWithDb(database.db, () => useIt(asset.id, 'draft'))

    const refused = await call('DELETE', `/owner/media/files/${asset.id}`)

    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('DELETE_BLOCKED_BY_REFERENCES')
    expect(refused.body.details.referenceCount).toBe(1)
    expect(refused.body.details.references[0]).toMatchObject({
      module: 'projects',
      scope: 'draft',
      usage: 'cover',
      label: 'Cafe Nour — cover',
    })

    // The bytes are still there. Nothing was removed before the check.
    expect(storage.objects.size).toBe(1)
    expect((await call('GET', `/owner/media/files/${asset.id}`)).status).toBe(200)
  })

  it('is blocked by an unpublished draft just as firmly as by a live page', async () => {
    const asset = await uploadOk('cover.png', pngBytes(40, 40))

    await runWithDb(database.db, () => useIt(asset.id, 'draft'))

    expect((await call('DELETE', `/owner/media/files/${asset.id}`)).status).toBe(409)
  })

  it('survives one module dropping it while another still uses it', async () => {
    const asset = await uploadOk('shared.png', pngBytes(40, 40))

    await runWithDb(database.db, async () => {
      await useIt(asset.id, 'draft', 'project-a')
      await replaceReferences({
        module: 'blog',
        ownerType: 'blog_post_version',
        ownerId: 'post-1',
        scope: 'published',
        entries: [{ assetId: asset.id, usage: 'inline' }],
      })
    })

    const before = await call('GET', `/owner/media/files/${asset.id}`)

    expect(before.body.data.referenceCount).toBe(2)

    // The project stops using it. The blog article has not changed.
    await runWithDb(database.db, () =>
      releaseReferences({
        module: 'projects',
        ownerType: 'project_version',
        ownerId: 'project-a',
        scope: 'draft',
      }),
    )

    const after = await call('GET', `/owner/media/files/${asset.id}`)

    expect(after.status).toBe(200)
    expect(after.body.data.referenceCount).toBe(1)
    expect(storage.objects.size).toBe(1)
    expect((await call('DELETE', `/owner/media/files/${asset.id}`)).status).toBe(409)
  })

  it('keeps a published use intact when the draft drops the image', async () => {
    const asset = await uploadOk('live.png', pngBytes(40, 40))

    await runWithDb(database.db, async () => {
      await useIt(asset.id, 'published')
      await useIt(asset.id, 'draft')
    })

    // The owner edits the draft and removes the cover. The live page keeps it.
    await runWithDb(database.db, () =>
      replaceReferences({
        module: 'projects',
        ownerType: 'project_version',
        ownerId: 'p1',
        scope: 'draft',
        entries: [],
      }),
    )

    const detail = await call('GET', `/owner/media/files/${asset.id}`)

    expect(detail.body.data.referenceCount).toBe(1)
    expect(detail.body.data.isPublished).toBe(true)
  })

  it('lists its uses, paginated', async () => {
    const asset = await uploadOk('busy.png', pngBytes(40, 40))

    await runWithDb(database.db, async () => {
      for (const id of ['a', 'b', 'c']) await useIt(asset.id, 'draft', id)
    })

    const page = await call('GET', `/owner/media/files/${asset.id}/references?pageSize=2`)

    expect(page.body.data).toMatchObject({ total: 3, pageCount: 2, hasMore: true })
    expect(page.body.data.items).toHaveLength(2)
  })

  it('deletes once nothing points at it, and removes the bytes', async () => {
    const asset = await uploadOk('unused.png', pngBytes(40, 40))

    await runWithDb(database.db, () => useIt(asset.id, 'draft'))
    await runWithDb(database.db, () =>
      releaseReferences({
        module: 'projects',
        ownerType: 'project_version',
        ownerId: 'p1',
        scope: 'draft',
      }),
    )

    const deleted = await call('DELETE', `/owner/media/files/${asset.id}`)

    expect(deleted.status).toBe(200)
    expect(deleted.body.data.storageRemoved).toBe(true)
    expect(storage.objects.size).toBe(0)
    expect((await call('GET', `/owner/media/files/${asset.id}`)).status).toBe(404)
  })

  it('reports honestly when the bytes could not be removed, and queues them', async () => {
    const asset = await uploadOk('stubborn.png', pngBytes(40, 40))

    useMediaStoreForTest({
      ...storage.store,
      remove: async () => {
        throw new Error('bucket unreachable')
      },
    })

    const deleted = await call('DELETE', `/owner/media/files/${asset.id}`)

    expect(deleted.status).toBe(200)
    // Not reported as a clean deletion, because it was not one.
    expect(deleted.body.data.storageRemoved).toBe(false)
    expect(deleted.body.message).toContain('queued for cleanup')

    const pending = await database.db.query('SELECT * FROM v2_media_pending_objects')

    expect(pending.rows).toHaveLength(1)
    expect(pending.rows[0].purpose).toBe('delete')

    // And the sweep finishes it once storage is back.
    useMediaStoreForTest(storage.store)

    const swept = await runWithDb(database.db, () =>
      sweepPendingObjects({ graceHours: 0, store: storage.store }),
    )

    expect(swept.removed).toHaveLength(1)
    expect(storage.objects.size).toBe(0)
    expect(asset.id).toBeTruthy()
  })

  it('the sweep never touches a file the owner simply is not using', async () => {
    await uploadOk('kept.png', pngBytes(40, 40))

    const swept = await runWithDb(database.db, () =>
      sweepPendingObjects({ graceHours: 0, store: storage.store }),
    )

    expect(swept.removed).toHaveLength(0)
    expect(storage.objects.size).toBe(1)
    expect((await call('GET', '/owner/media/files')).body.data.total).toBe(1)
  })
})

/* ---------------------------------------------------------------- serving */

describe('who may have the bytes', () => {
  it('serves any file to the owner, and never lets it be cached', async () => {
    const asset = await uploadOk('private.png', pngBytes(40, 40))
    const request = new Request(
      `http://localhost:3000/api/v2/owner/media/files/${asset.id}/content`,
    )

    const response = await runWithDb(database.db, async () => app.fetch(request))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pngBytes(40, 40))
  })

  it('sends documents as downloads rather than rendering them in this origin', async () => {
    for (const [name, bytes] of [
      ['contract.pdf', pdfBytes()],
      ['angebot.docx', ooxmlBytes('word')],
      ['rows.csv', textBytes('a,b\n1,2')],
    ] as const) {
      const asset = await uploadOk(name, bytes)
      const response = await runWithDb(database.db, async () =>
        app.fetch(new Request(`http://localhost:3000/api/v2/owner/media/files/${asset.id}/content`)),
      )

      expect(response.headers.get('content-disposition'), name).toContain('attachment')
      expect(response.headers.get('x-content-type-options'), name).toBe('nosniff')
    }
  })

  it('serves an SVG inline but sandboxed, so nothing in it can run', async () => {
    const asset = await uploadOk('mark.svg', svgBytes('<script>alert(1)</script>'))
    const response = await runWithDb(database.db, async () =>
      app.fetch(new Request(`http://localhost:3000/api/v2/owner/media/files/${asset.id}/content`)),
    )

    // Inline, because a logo is meant to be looked at.
    expect(response.headers.get('content-disposition')).toContain('inline')
    // And sandboxed, which is the whole reason SVG could be accepted at all:
    // `sandbox` with no `allow-scripts` runs nothing, even on direct navigation.
    const csp = response.headers.get('content-security-policy') ?? ''

    expect(csp).toContain('sandbox')
    expect(csp).not.toContain('allow-scripts')
    expect(csp).toContain("default-src 'none'")
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('gives a visitor nothing until a published snapshot uses the file', async () => {
    const asset = await uploadOk('maybe.png', pngBytes(40, 40))

    const beforeAnyUse = await call('GET', `/media/${asset.id}`)

    expect(beforeAnyUse.status).toBe(404)

    // A private draft is not publication.
    await runWithDb(database.db, () =>
      replaceReferences({
        module: 'projects',
        ownerType: 'project_version',
        ownerId: 'p1',
        scope: 'draft',
        entries: [{ assetId: asset.id, usage: 'cover' }],
      }),
    )

    expect((await call('GET', `/media/${asset.id}`)).status).toBe(404)

    // Neither is a private record, such as an invoice attachment.
    await runWithDb(database.db, () =>
      replaceReferences({
        module: 'invoices',
        ownerType: 'invoice',
        ownerId: 'inv-1',
        scope: 'record',
        entries: [{ assetId: asset.id, usage: 'attachment' }],
      }),
    )

    expect((await call('GET', `/media/${asset.id}`)).status).toBe(404)
  })

  it('serves a published file, with an ETag, and stops the moment it is unpublished', async () => {
    const asset = await uploadOk('published.png', pngBytes(40, 40))

    await runWithDb(database.db, () =>
      replaceReferences({
        module: 'blog',
        ownerType: 'blog_post_version',
        ownerId: 'post-1',
        scope: 'published',
        entries: [{ assetId: asset.id, usage: 'cover' }],
      }),
    )

    const served = await runWithDb(database.db, async () =>
      app.fetch(new Request(`http://localhost:3000/api/v2/media/${asset.id}`)),
    )

    expect(served.status).toBe(200)
    expect(served.headers.get('cache-control')).toBe('public, max-age=3600')

    const etag = served.headers.get('etag')!

    expect(etag).toBe(`"${asset.checksum}"`)

    const cached = await runWithDb(database.db, async () =>
      app.fetch(
        new Request(`http://localhost:3000/api/v2/media/${asset.id}`, {
          headers: { 'if-none-match': etag },
        }),
      ),
    )

    expect(cached.status).toBe(304)

    // Unpublished: the origin refuses immediately.
    await runWithDb(database.db, () =>
      releaseReferences({
        module: 'blog',
        ownerType: 'blog_post_version',
        ownerId: 'post-1',
        scope: 'published',
      }),
    )

    expect((await call('GET', `/media/${asset.id}`)).status).toBe(404)
  })

  it('answers the same 404 for a malformed id as for a private one', async () => {
    const asset = await uploadOk('private.png', pngBytes(40, 40))

    const nonsense = await call('GET', '/media/not-a-uuid')
    const privateFile = await call('GET', `/media/${asset.id}`)

    expect(nonsense.status).toBe(404)
    expect(privateFile.status).toBe(404)
    expect(nonsense.body.code).toBe(privateFile.body.code)
  })
})

/* --------------------------------------------------------------- the fence */

describe('the owner boundary', () => {
  it('is not there at all from a non-local host', async () => {
    const asset = await uploadOk('private.png', pngBytes(40, 40))

    for (const path of [
      '/owner/media/files',
      `/owner/media/files/${asset.id}`,
      `/owner/media/files/${asset.id}/content`,
      '/owner/media/folders',
    ]) {
      const refused = await call('GET', path, undefined, { host: 'yamanwarda.de' })

      // 404, never 401: a 401 would confirm that a private API is there.
      expect(refused.status, path).toBe(404)
      expect(refused.body.code, path).toBe('NOT_FOUND')
    }

    const upstream = await upload('sneaky.png', pngBytes(8, 8), { host: 'yamanwarda.de' })

    expect(upstream.status).toBe(404)
    expect(storage.objects.size).toBe(1)
  })

  it('leaves the public media route reachable from anywhere', async () => {
    const asset = await uploadOk('published.png', pngBytes(40, 40))

    await runWithDb(database.db, () =>
      replaceReferences({
        module: 'blog',
        ownerType: 'blog_post_version',
        ownerId: 'post-1',
        scope: 'published',
        entries: [{ assetId: asset.id, usage: 'cover' }],
      }),
    )

    // Fetched directly: the response is the image, not an envelope to parse.
    const served = await runWithDb(database.db, async () =>
      app.fetch(new Request(`http://yamanwarda.de/api/v2/media/${asset.id}`)),
    )

    expect(served.status).toBe(200)
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(pngBytes(40, 40))
  })

  it('demands a session once V2 owner authentication is switched on', async () => {
    process.env.BACKEND2_OWNER_AUTH = 'required'

    const refused = await call('GET', '/owner/media/files')

    expect(refused.status).toBe(401)
    expect(refused.body.code).toBe('UNAUTHORIZED')
  })
})
