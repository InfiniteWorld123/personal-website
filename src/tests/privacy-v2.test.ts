import { describe, expect, it } from 'vitest'
import { getContent } from '#/frontend/content'
import { applyPrivacyV2 } from '#/frontend/content/privacy-v2'

/** The approved V2 privacy wording (`docs/v2/privacy-v2.md`), per language. */
describe('the V2 privacy page', () => {
  it.each(['de', 'en', 'ar'] as const)('keeps every section today has and adds the V2 ones (%s)', (language) => {
    const today = getContent(language).legal.privacy
    const v2 = applyPrivacyV2(today, language)
    const titles = v2.sections.map((s) => s.title)

    // Controller first, rights and changes still at the end.
    expect(titles[0]).toBe(today.sections[0]!.title)
    expect(titles.at(-1)).toBe(today.sections.at(-1)!.title)
    expect(v2.sections).toHaveLength(today.sections.length + 4)
    // The old contact text (select fields, 5 MB) is gone; the new one says 10 MB.
    expect(JSON.stringify(v2.sections)).toContain('10')
    expect(JSON.stringify(v2.sections)).not.toContain(today.sections[3]!.body!)
    expect(v2.updated).not.toBe(today.updated)
  })

  it('says plainly that the owner reads assistant conversations', () => {
    const en = applyPrivacyV2(getContent('en').legal.privacy, 'en')

    expect(en.sections.find((s) => s.title === 'Website assistant')!.body).toContain('I read them')
  })
})
