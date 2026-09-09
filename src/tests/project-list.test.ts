import { describe, expect, it } from 'vitest'
import { getProjectBatch, getProjectEntries, parseProjectPage } from '#/frontend/features/work/project-list'
import { isProjectSlug, projectOrder } from '#/frontend/content/site'
import { languages } from '#/frontend/i18n/language'

describe('local project collection', () => {
  it.each([0, 1, 3, 6, 10])('renders %i records in cumulative batches of six', count => {
    const records = Array.from({ length: count }, (_, i) => ({ slug: 'fixture-' + i }))
    const first = getProjectBatch(records, 1)
    expect(first.visible).toHaveLength(Math.min(count, 6))
    expect(first.hasMore).toBe(count > 6)
    const second = getProjectBatch(records, 2)
    expect(second.visible).toHaveLength(count)
    expect(second.hasMore).toBe(false)
    expect(new Set(second.visible.map(item => item.slug)).size).toBe(count)
  })
  it.each([undefined, null, '', 'bad', 'NaN', 'Infinity', 0, -1, 1.5, true, {}, [], Number.MAX_SAFE_INTEGER + 1])('resets invalid page %s', value => {
    expect(parseProjectPage(value)).toBe(1)
  })
  it('supports a shared URL batch and clamps pages beyond the end', () => {
    expect(parseProjectPage('2')).toBe(2)
    expect(getProjectBatch(Array.from({ length: 10 }), 999).page).toBe(2)
  })
  it('derives slugs and order from the actual registry', () => {
    expect(projectOrder).toEqual(['prime-estate', 'tech-store', 'inknest'])
    for (const slug of projectOrder) expect(isProjectSlug(slug)).toBe(true)
    expect(isProjectSlug('constructor')).toBe(false)
    expect(isProjectSlug('missing')).toBe(false)
    for (const language of languages) {
      expect(getProjectEntries(language).map(entry => entry.facts.slug)).toEqual(projectOrder)
      expect(getProjectEntries(language).every(entry => entry.copy.name && entry.copy.summary)).toBe(true)
    }
  })
})
