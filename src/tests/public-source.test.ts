import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from './helpers/backend2-db'

/**
 * The public cutover switch (`docs/v2/public-cutover.md`) and the first module
 * behind it: Content, read from Backend2 as "only what the owner saved".
 */
process.env.DATABASE_URL = 'postgres://legacy.invalid/legacy'
process.env.DATABASE_URL_V2 = 'postgres://v2.invalid/v2'

const { publicV2Modules, readsFromV2 } = await import('#/backend2/public-source')
const { runWithDb } = await import('#/backend2/db/client')
const { readPublishedOverrides } = await import('#/backend2/modules/content/content.published')

const database = await createTestDatabase()

beforeEach(async () => {
  await database.reset()
})

afterAll(async () => {
  await database.close()
})

describe('PUBLIC_V2_MODULES', () => {
  it('keeps every page on legacy unless a module is listed', () => {
    expect([...publicV2Modules({})]).toEqual([])
    expect(readsFromV2('content', { DATABASE_URL_V2: 'postgres://x/y' })).toBe(false)
  })

  it('reads a listed module from V2, ignoring unknown names and spacing', () => {
    const env = { PUBLIC_V2_MODULES: ' Content, blog ,nonsense', DATABASE_URL_V2: 'postgres://x/y' }

    expect([...publicV2Modules(env)].sort()).toEqual(['blog', 'content'])
    expect(readsFromV2('content', env)).toBe(true)
    expect(readsFromV2('services', env)).toBe(false)
  })

  it('stays on legacy when no V2 database is configured', () => {
    expect(readsFromV2('content', { PUBLIC_V2_MODULES: 'content' })).toBe(false)
  })
})

describe('Content for the public pages', () => {
  it('is empty when nothing was saved, so the release wording shows unchanged', async () => {
    expect(await runWithDb(database.db, readPublishedOverrides)).toEqual({ de: {}, en: {}, ar: {}, shared: {} })
  })

  it('carries only saved wording, per language, plus shared facts', async () => {
    await database.db.query(
      `INSERT INTO v2_content_values (field_key, language, value, revision)
       VALUES ('home.hero.headline', 'de', '"Neue Zeile"', 1),
              ('home.hero.typed[]', 'en', '["one","two"]', 1),
              ('site.email', 'shared', '"hello@example.test"', 1)`,
    )

    expect(await runWithDb(database.db, readPublishedOverrides)).toEqual({
      de: { 'home.hero.headline': 'Neue Zeile' },
      en: { 'home.hero.typed[]': ['one', 'two'] },
      ar: {},
      shared: { 'site.email': 'hello@example.test' },
    })
  })
})
